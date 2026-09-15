import "server-only";

import { errorMessage, fetchJson, UpstreamError } from "@/lib/data/http";

/**
 * PSX Terminal — a documented JSON API for Pakistan Stock Exchange data.
 *
 * This is a real API with a published contract, unlike the HTML scraping the other
 * adapters do, so it is the primary source for everything it covers: symbols,
 * quotes, candles, market statistics, company details, fundamentals and payouts.
 * It does not publish full financial statements (revenue, income statement, balance
 * sheet), which is what khistocks remains responsible for.
 *
 * Rate limit: 100 requests per minute per IP. Every call goes through the shared
 * Next.js data cache, and the candle loader pages deliberately rather than fanning
 * out, to stay well inside that.
 */
export const PSXTERMINAL_BASE = "https://psxterminal.com";

export const PSXTERMINAL_TTL = {
  /** Quotes move during the session. */
  ticks: 60,
  stats: 120,
  symbols: 60 * 60 * 12,
  /** Daily candles are settled once a day; intraday ones are not. */
  klinesDaily: 60 * 60 * 6,
  company: 60 * 60 * 24,
  fundamentals: 60 * 60 * 3,
  dividends: 60 * 60 * 12,
} as const;

/** Every endpoint wraps its payload in this envelope. */
export interface Envelope<T> {
  success?: boolean;
  data?: T;
  timestamp?: number;
  count?: number;
}

export type MarketType = "REG" | "FUT" | "IDX" | "ODL" | "BNB";
export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

/**
 * Unwrap the envelope, treating `success: false` and a missing payload as failures
 * so a shape change surfaces as a source error rather than as empty data.
 */
export async function getFromTerminal<T>(
  path: string,
  options: { revalidate: number; tags?: string[]; timeoutMs?: number },
): Promise<T> {
  const url = `${PSXTERMINAL_BASE}${path}`;
  const payload = await fetchJson<Envelope<T>>(url, {
    revalidate: options.revalidate,
    tags: options.tags,
    timeoutMs: options.timeoutMs ?? 12_000,
    retries: 1,
  });

  if (payload?.success === false) {
    throw new UpstreamError(`${path} returned success: false`);
  }
  if (payload?.data == null) {
    throw new UpstreamError(`${path} returned no data field`);
  }
  return payload.data;
}

export { errorMessage };

/**
 * Parse the abbreviated figures the fundamentals endpoint returns as strings
 * ("213.3B", "908.0M"). Returns absolute rupees or share counts.
 */
export function parseAbbreviated(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (!raw) return null;

  const match = String(raw).trim().replace(/,/g, "").match(/^(-?\d*\.?\d+)\s*([KMBT])?$/i);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;

  const scale = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[(match[2] ?? "").toUpperCase()] ?? 1;
  return value * scale;
}
