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

import { KHISTOCKS_BASE } from "./discover";

export const KHISTOCKS_TTL = {
  financials: 60 * 60 * 24,
  dividends: 60 * 60 * 12,
} as const;

export type { PageKind } from "./discover";

import type { PageKind } from "./discover";

const CANDIDATES: Record<PageKind, (symbol: string) => string[]> = {
  financials: (symbol) => [
    `${KHISTOCKS_BASE}/financial-statements/${symbol}.html`,
    `${KHISTOCKS_BASE}/company/financials/${symbol}`,
    `${KHISTOCKS_BASE}/financial-highlights.html?symbol=${symbol}`,
    `${KHISTOCKS_BASE}/financial-highlights.php?symbol=${symbol}`,
    `${KHISTOCKS_BASE}/financials?scrip=${symbol}`,
  ],
  ratios: (symbol) => [
    `${KHISTOCKS_BASE}/financial-ratios/${symbol}.html`,
    `${KHISTOCKS_BASE}/ratios.html?symbol=${symbol}`,
    `${KHISTOCKS_BASE}/ratios?scrip=${symbol}`,
  ],
  dividends: (symbol) => [
    `${KHISTOCKS_BASE}/dividend-data/${symbol}.html`,
    `${KHISTOCKS_BASE}/dividend-data.html?symbol=${symbol}`,
    `${KHISTOCKS_BASE}/dividends?scrip=${symbol}`,
    `${KHISTOCKS_BASE}/payouts.php?symbol=${symbol}`,
  ],
  profile: (symbol) => [
    `${KHISTOCKS_BASE}/company-profile/${symbol}.html`,
    `${KHISTOCKS_BASE}/company.html?symbol=${symbol}`,
  ],
};

export interface PageResult {
  html: string | null;
  url: string | null;
  /** Every URL that was tried, with why it didn't work, for the sources panel. */
  attempts: { url: string; error: string }[];
}

/** A page that came back as a shell (nav only, no tables) isn't worth parsing. */
function looksUseful(html: string) {
  return html.length > 2_000 && /<t(able|body)/i.test(html);
}

export async function fetchKhistocksPage(kind: PageKind, symbol: string): Promise<PageResult> {
  const attempts: PageResult["attempts"] = [];

  // Links the site itself published come first — they are the real scheme, whatever
  // it is. The hard-coded patterns below are only a fallback for when the crawl
  // finds nothing (site down, markup changed, navigation rendered client-side).
  const discovered = await discoverUrls(symbol, kind);
  const candidates = [...new Set([...discovered, ...CANDIDATES[kind](symbol)])];

  for (const url of candidates) {
    try {
      const html = await fetchUpstream(url, {
        revalidate: KHISTOCKS_TTL[kind === "ratios" ? "financials" : kind === "profile" ? "financials" : kind],
        tags: [`khistocks-${symbol}`],
        timeoutMs: 12_000,
        retries: 0,
      });
      if (looksUseful(html)) return { html, url, attempts };
      attempts.push({ url, error: "no tables in response" });
    } catch (error) {
      attempts.push({ url, error: errorMessage(error) });
    }
  }

  return { html: null, url: null, attempts };
}

/** Condense attempt failures into one line for a SourceNote message. */
export function summariseAttempts(attempts: PageResult["attempts"]) {
  if (attempts.length === 0) return "no candidate URLs";
  const reasons = [...new Set(attempts.map((attempt) => attempt.error))];
  return `${attempts.length} URL patterns tried (${reasons.slice(0, 2).join("; ")})`;
}
