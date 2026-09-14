import "server-only";

import * as cheerio from "cheerio";
import { unstable_cache } from "next/cache";

import { errorMessage, fetchUpstream } from "@/lib/data/http";

/**
 * khistocks.com publishes no API and no documented URL scheme, so hard-coding
 * per-symbol URL patterns means guessing — and a wrong guess fails everything
 * downstream no matter how good the parser is.
 *
 * Instead, crawl the site's own navigation: fetch a few entry pages, collect every
 * link, and score the ones that look like they lead to this symbol's financials,
 * payouts or profile. Whatever the real scheme is, the site links to it.
 */

export const KHISTOCKS_BASE = "https://www.khistocks.com";

/**
 * Pages known to exist that link onward to per-company pages. Discovery only runs
 * after every known URL has already failed, so these are kept few and real —
 * guessed entry paths would just add 404s to the attempt list.
 */
const ENTRY_PAGES = [
  "/",
  "/company-information/company-profile/{SYMBOL}.html",
  "/company-information/annual-reports.html",
];

export type PageKind = "financials" | "ratios" | "dividends" | "profile";

/** Words that mark a link as belonging to each kind of page. */
const KIND_WORDS: Record<PageKind, string[]> = {
  financials: ["financial", "statement", "highlight", "income", "balance", "profit-loss", "pnl", "accounts"],
  ratios: ["ratio", "valuation", "fundamental"],
  dividends: ["dividend", "payout", "bonus", "book-closure", "announcement"],
  profile: ["profile", "company", "about", "scrip"],
};

export interface DiscoveredLink {
  url: string;
  kind: PageKind;
  /** Higher is a better match. */
  score: number;
  text: string;
}

function absolute(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    if (!/^https?:$/.test(url.protocol)) return null;
    // Stay on khistocks; the crawl must not wander off-site.
    if (!url.hostname.endsWith("khistocks.com")) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/** True when `symbol` appears as a whole token, not as a substring of another word. */
function mentionsSymbol(text: string, symbol: string) {
  return new RegExp(`(^|[^a-z0-9])${symbol.toLowerCase()}([^a-z0-9]|$)`, "i").test(text);
}

/**
 * Score and classify the links on one page. Exported so it can be tested against
 * fixture markup without any network access.
 */
export function scoreLinks(html: string, pageUrl: string, symbol: string): DiscoveredLink[] {
  const $ = cheerio.load(html);
  const target = symbol.toLowerCase();
  const found = new Map<string, DiscoveredLink>();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href") ?? "";
    const url = absolute(href, pageUrl);
    if (!url) return;

    const text = $(element).text().replace(/\s+/g, " ").trim();
    const path = new URL(url).pathname + new URL(url).search;
    const haystack = `${path} ${text}`.toLowerCase();

    // A link must be about this symbol to be worth following at all.
    const symbolInPath = mentionsSymbol(path, target);
    const symbolInText = mentionsSymbol(text, target);
    if (!symbolInPath && !symbolInText) return;

    for (const [kind, words] of Object.entries(KIND_WORDS) as [PageKind, string[]][]) {
      const matches = words.filter((word) => haystack.includes(word)).length;
      if (matches === 0) continue;

      // Prefer the symbol in the path (a real per-company URL) over link text.
      const score = matches * 10 + (symbolInPath ? 5 : 0) + (symbolInText ? 2 : 0);
      const existing = found.get(`${kind}:${url}`);
      if (!existing || existing.score < score) {
        found.set(`${kind}:${url}`, { url, kind, score, text });
      }
    }
  });

  return [...found.values()].sort((a, b) => b.score - a.score);
}

/**
 * Walk the entry pages and collect per-symbol links. Stops as soon as it has a
 * candidate for every kind, so the common case costs one request.
 */
const crawl = unstable_cache(
  async (symbol: string): Promise<{ links: DiscoveredLink[]; attempts: { url: string; error: string }[] }> => {
    const links: DiscoveredLink[] = [];
    const attempts: { url: string; error: string }[] = [];

    for (const template of ENTRY_PAGES) {
      const pageUrl = `${KHISTOCKS_BASE}${template.replace("{SYMBOL}", symbol)}`;
      try {
        const html = await fetchUpstream(pageUrl, {
          revalidate: 60 * 60 * 24,
          tags: [`khistocks-discover-${symbol}`],
          timeoutMs: 10_000,
          retries: 0,
        });
        links.push(...scoreLinks(html, pageUrl, symbol));
      } catch (error) {
        attempts.push({ url: pageUrl, error: errorMessage(error) });
        continue;
      }

      const kinds = new Set(links.map((link) => link.kind));
      if (kinds.has("financials") && kinds.has("dividends")) break;
    }

    // A company/profile page usually links on to its own statements and payouts,
    // so follow the best one and harvest a second level of links.
    const profile = links.filter((link) => link.kind === "profile").sort((a, b) => b.score - a.score)[0];
    if (profile && !links.some((link) => link.kind === "financials")) {
      try {
        const html = await fetchUpstream(profile.url, {
          revalidate: 60 * 60 * 24,
          tags: [`khistocks-discover-${symbol}`],
          timeoutMs: 10_000,
          retries: 0,
        });
        links.push(...scoreLinks(html, profile.url, symbol));
      } catch (error) {
        attempts.push({ url: profile.url, error: errorMessage(error) });
      }
    }

    return { links: dedupe(links), attempts };
  },
  ["khistocks-discover-v1"],
  { revalidate: 60 * 60 * 24 },
);

function dedupe(links: DiscoveredLink[]) {
  const best = new Map<string, DiscoveredLink>();
  for (const link of links) {
    const key = `${link.kind}:${link.url}`;
    const existing = best.get(key);
    if (!existing || existing.score < link.score) best.set(key, link);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/** URLs to try for `kind`, best first. Empty when discovery found nothing. */
export async function discoverUrls(symbol: string, kind: PageKind): Promise<string[]> {
  try {
    const { links } = await crawl(symbol);
    return links
      .filter((link) => link.kind === kind || (kind === "ratios" && link.kind === "financials"))
      .map((link) => link.url);
  } catch {
    return [];
  }
}

/** Everything discovery found, for the diagnostics route. */
export async function discoveryReport(symbol: string) {
  try {
    return await crawl(symbol);
  } catch (error) {
    return { links: [], attempts: [{ url: KHISTOCKS_BASE, error: errorMessage(error) }] };
  }
}
