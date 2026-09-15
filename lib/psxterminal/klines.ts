import "server-only";

import { unstable_cache } from "next/cache";

import type { Bar, HistoryRange } from "@/lib/data/types";
import { RANGE_MONTHS } from "@/lib/data/types";
import { normalizeSymbol } from "@/lib/utils";

import { getFromTerminal, PSXTERMINAL_TTL, type Timeframe } from "./client";

export interface RawKline {
  symbol?: string;
  timeframe?: string;
  /** Unix milliseconds. */
  timestamp?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
}

/** The documented per-request cap. */
const MAX_LIMIT = 100;

/**
 * Enough pages to cover ten years of daily candles (~2,500 bars) while staying well
 * inside the 100-requests-per-minute budget. Each page is cached separately.
 */
const MAX_PAGES = 26;

export function klineToBar(row: RawKline): Bar | null {
  const { timestamp, open, high, low, close } = row;
  if (typeof timestamp !== "number" || typeof close !== "number" || !Number.isFinite(close)) return null;

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;

  const num = (value: number | undefined, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

  return {
    date: date.toISOString().slice(0, 10),
    open: num(open, close),
    high: num(high, close),
    low: num(low, close),
    close,
    volume: num(row.volume, 0),
  };
}

export function klinesToBars(rows: RawKline[]): Bar[] {
  const byDate = new Map<string, Bar>();
  for (const row of rows ?? []) {
    const bar = klineToBar(row);
    // Later rows win, so a re-fetched day replaces the earlier copy of itself.
    if (bar) byDate.set(bar.date, bar);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** One page, cached on its own so overlapping ranges reuse work. */
const loadPage = unstable_cache(
  async (symbol: string, timeframe: Timeframe, end: number): Promise<RawKline[]> => {
    const query = new URLSearchParams({ limit: String(MAX_LIMIT), end: String(end) });
    const data = await getFromTerminal<RawKline[]>(
      `/api/klines/${encodeURIComponent(symbol)}/${timeframe}?${query}`,
      {
        revalidate: PSXTERMINAL_TTL.klinesDaily,
        tags: [`psxterminal-klines-${symbol}`],
      },
    );
    return Array.isArray(data) ? data : [];
  },
  ["psxterminal-klines-v2"],
  { revalidate: PSXTERMINAL_TTL.klinesDaily },
);

/**
 * Walk backwards from now in pages of 100 until the range is covered. Paging is
 * anchored to the oldest bar seen so far; a page that returns nothing, or nothing
 * older than what we already have, ends the walk rather than looping.
 */
export async function getDailyBars(symbolInput: string, range: HistoryRange): Promise<Bar[]> {
  const symbol = normalizeSymbol(symbolInput);
  const months = RANGE_MONTHS[range];

  const from = new Date();
  from.setUTCMonth(from.getUTCMonth() - months);
  const fromMs = from.getTime();

  const collected: RawKline[] = [];
  let end = Date.now();

  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await loadPage(symbol, "1d", end);
    if (rows.length === 0) break;

    collected.push(...rows);

    const oldest = Math.min(...rows.map((row) => row.timestamp ?? Number.POSITIVE_INFINITY));
    if (!Number.isFinite(oldest) || oldest <= fromMs) break;
    // Step strictly past the oldest bar, or the next page repeats this one.
    if (oldest >= end) break;
    end = oldest - 1;
  }

  const bars = klinesToBars(collected);
  const fromIso = from.toISOString().slice(0, 10);
  const trimmed = bars.filter((bar) => bar.date >= fromIso);
  // If the series is shorter than the requested window, show what exists.
  return trimmed.length > 0 ? trimmed : bars;
}
