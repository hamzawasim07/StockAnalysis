import "server-only";

import { errorMessage, fetchUpstream } from "@/lib/data/http";

import { discoverUrls } from "./discover";

/**
 * khistocks.com publishes no API and no stable URL scheme for per-symbol pages, so
 * each lookup tries a list of candidate URLs and keeps the first that comes back
 * with real content. When the site changes, add the new pattern here rather than
 * touching the parsers.
 */
export { KHISTOCKS_BASE } from "./discover";

export const KHISTOCKS_TTL = {
  financials: 60 * 60 * 24,
  dividends: 60 * 60 * 12,
} as const;

export type { PageKind } from "./discover";

import type { PageKind } from "./discover";

/**
 * khistocks.com's real URL scheme, confirmed against the site's own indexed pages:
 *
 *   /market-live/companies-live/detailed-view/{SYMBOL}.html   per-company hub
 *   /company-information/financial-highlights/{SYMBOL}.html   statements
 *   /company-information/company-profile/{SYMBOL}.html        profile
 *   /company-information/dividend-data.html                   payouts (one shared page)
 *   /company/getcompinfo/{SYMBOL}                             company info endpoint (JSON)
 *
 * The detailed view is the page a reader lands on for a scrip and is tried first
 * for every kind of data; the section pages follow.
 *
 * The site also serves every page under an `/index.php` prefix and on the apex
 * domain, so both are listed as fallbacks. Link discovery still runs first and
 * takes priority — these are the known-good starting points.
 */
const HOSTS = ["https://www.khistocks.com", "https://khistocks.com"];

/** Every host, with and without the index.php prefix. */
function variants(path: string): string[] {
  return HOSTS.flatMap((host) => [`${host}${path}`, `${host}/index.php${path}`]);
}

/**
 * The per-company hub. This is the page a reader actually lands on for a scrip, and
 * it carries the company's figures alongside the live quote — so it is tried first
 * for every kind of data, ahead of the dedicated section pages.
 */
function detailedView(symbol: string): string[] {
  return variants(`/market-live/companies-live/detailed-view/${symbol}.html`);
}

/**
 * The financial-highlights page offers a year range (1999 onwards) and separate
 * balance sheet / income statement / cash flow sections. If it renders a shell
 * until those are chosen, a bare request returns empty tables — so the plain URL is
 * tried first and these parameterised forms follow only if it yields nothing.
 */
function financialsUrls(symbol: string): string[] {
  const path = `/company-information/financial-highlights/${symbol}.html`;
  const thisYear = new Date().getUTCFullYear();
  return [
    ...detailedView(symbol),
    ...variants(path),
    `${HOSTS[0]}${path}?from=1999&to=${thisYear}`,
    `${HOSTS[0]}${path}?year_from=1999&year_to=${thisYear}`,
    `${HOSTS[0]}${path}?start=1999&end=${thisYear}`,
    `${HOSTS[0]}${path}?period=annual`,
  ];
}

const CANDIDATES: Record<PageKind, (symbol: string) => string[]> = {
  financials: financialsUrls,
  // Ratios live alongside the statements.
  ratios: financialsUrls,
  dividends: (symbol) => [
    ...detailedView(symbol),
    // One page carries every company's payout history, so it is fetched whole and
    // filtered by symbol during parsing.
    ...variants("/company-information/dividend-data.html"),
  ],
  profile: (symbol) => [
    ...detailedView(symbol),
    ...variants(`/company-information/company-profile/${symbol}.html`),
    `https://www.khistocks.com/company/getcompinfo/${symbol}`,
  ],
};

export interface PageResult {
  html: string | null;
  url: string | null;
  /** Every URL that was tried, with why it didn't work, for the sources panel. */
  attempts: { url: string; error: string }[];
}

/**
 * Is this response worth parsing?
 *
 * khistocks serves data both as rendered HTML and as JSON under `/company/`, so
 * requiring a `<table>` discarded every JSON response outright — including the
 * company endpoint, which is the one confirmed data API on the site. A short JSON
 * body is perfectly useful; a short HTML body with no table is not.
 */
export function looksUseful(body: string) {
  const trimmed = body.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(body);
      if (Array.isArray(parsed)) return parsed.length > 0;
      return parsed !== null && typeof parsed === "object" && Object.keys(parsed).length > 0;
    } catch {
      return false;
    }
  }
  return body.length > 2_000 && /<t(able|body)/i.test(body);
}

/**
 * @param validate decides whether a fetched page actually carries what the caller
 * needs. Without it, a page of empty table shells counts as "useful" and stops the
 * search — so a symbol whose first candidate URL returns a JavaScript-rendered
 * skeleton would never reach the remaining candidates, or discovery, at all.
 */
export async function fetchKhistocksPage(
  kind: PageKind,
  symbol: string,
  validate?: (body: string) => boolean,
): Promise<PageResult> {
  const attempts: PageResult["attempts"] = [];
  const ttl = KHISTOCKS_TTL[kind === "financials" || kind === "ratios" || kind === "profile" ? "financials" : kind];

  const tryUrl = async (url: string): Promise<string | null> => {
    try {
      const html = await fetchUpstream(url, {
        revalidate: ttl,
        tags: [`khistocks-${symbol}`],
        timeoutMs: 12_000,
        retries: 0,
      });
      if (!looksUseful(html)) {
        attempts.push({ url, error: "response had no tables and no JSON body" });
        return null;
      }
      if (validate && !validate(html)) {
        attempts.push({ url, error: "reached, but carried no usable rows — trying the next candidate" });
        return null;
      }
      return html;
    } catch (error) {
      attempts.push({ url, error: errorMessage(error) });
    }
    return null;
  };

  // The known scheme first. Crawling the site to rediscover a URL we already know
  // costs several requests before the first real attempt — and those speculative
  // requests are what the discovery step is for when the scheme *has* changed.
  for (const url of CANDIDATES[kind](symbol)) {
    const html = await tryUrl(url);
    if (html) return { html, url, attempts };
  }

  // Only once every known URL has failed is it worth asking the site where its
  // pages have moved to.
  const discovered = await discoverUrls(symbol, kind);
  for (const url of discovered) {
    if (attempts.some((attempt) => attempt.url === url)) continue;
    const html = await tryUrl(url);
    if (html) return { html, url, attempts };
  }

  return { html: null, url: null, attempts };
}

/** Condense attempt failures into one line for a SourceNote message. */
export function summariseAttempts(attempts: PageResult["attempts"]) {
  if (attempts.length === 0) return "no candidate URLs";
  const reasons = [...new Set(attempts.map((attempt) => attempt.error))];
  return `${attempts.length} URL patterns tried (${reasons.slice(0, 2).join("; ")})`;
}
