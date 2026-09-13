import "server-only";

import { unstable_cache } from "next/cache";

import { cleanText, parseTables } from "@/lib/data/html";
import { errorMessage, fetchJson, fetchUpstream, note } from "@/lib/data/http";
import { sampleBars } from "@/lib/data/sample";
import type { Bar, HistoryRange, SourceNote, Sourced } from "@/lib/data/types";
import { RANGE_MONTHS } from "@/lib/data/types";
import { parseLooseNumber } from "@/lib/format";
import { mapWithConcurrency, normalizeSymbol } from "@/lib/utils";

import { PSX_ENDPOINTS, PSX_TTL } from "./endpoints";

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

/**
 * PSX prints dates as `Sep 12, 2025` on the historical table and as a unix
 * timestamp on the EOD series. Returns ISO `yyyy-mm-dd` or null.
 */
function parsePsxDate(raw: string): string | null {
  const text = cleanText(raw);
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const named = text.match(/([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})/);
  if (named) {
    const monthIndex = MONTHS.indexOf(named[1].slice(0, 3).toLowerCase());
    if (monthIndex >= 0) {
      return `${named[3]}-${String(monthIndex + 1).padStart(2, "0")}-${named[2].padStart(2, "0")}`;
    }
  }

  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

/**
 * Parse the HTML fragment returned by POST /historical. The table is
 * date | open | high | low | close | volume, sometimes with a change column
 * inserted after close — so columns are located by counting from the ends rather
 * than by fixed index.
 */
export function parseHistoricalHtml(html: string): Bar[] {
  const bars: Bar[] = [];

  for (const table of parseTables(html)) {
    for (const row of table.rows) {
      if (row.length < 5) continue;
      const date = parsePsxDate(row[0]);
      if (!date) continue;

      const numbers = row.slice(1).map(parseLooseNumber);
      const volume = numbers[numbers.length - 1];
      const [open, high, low, close] = numbers;
      if ([open, high, low, close].some((value) => value == null)) continue;

      bars.push({
        date,
        open: open as number,
        high: high as number,
        low: low as number,
        close: close as number,
        volume: volume ?? 0,
      });
    }
  }

  return dedupeBars(bars);
}

function dedupeBars(bars: Bar[]): Bar[] {
  const byDate = new Map<string, Bar>();
  for (const bar of bars) byDate.set(bar.date, bar);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** One month of OHLCV. Cached per symbol/month so overlapping ranges reuse work. */
const loadMonth = unstable_cache(
  async (symbol: string, year: number, month: number): Promise<Bar[]> => {
    const html = await fetchUpstream(PSX_ENDPOINTS.historical, {
      method: "POST",
      form: { month: String(month), year: String(year), symbol },
      revalidate: PSX_TTL.history,
      tags: [`psx-history-${symbol}`],
      timeoutMs: 12_000,
    });
    return parseHistoricalHtml(html);
  },
  ["psx-history-month-v1"],
  { revalidate: PSX_TTL.history },
);

interface EodResponse {
  status?: number;
  data?: [number, number, number][];
}

/**
 * Fallback close/volume series. Cheaper than the per-month scrape but carries no
 * open/high/low, so those are filled from the close and the table marks them as
 * approximate.
 */
async function loadEodSeries(symbol: string): Promise<Bar[]> {
  const payload = await fetchJson<EodResponse>(PSX_ENDPOINTS.eod(symbol), {
    revalidate: PSX_TTL.history,
    tags: [`psx-history-${symbol}`],
  });
  if (!Array.isArray(payload?.data)) return [];

  return dedupeBars(
    payload.data
      .map(([timestamp, close, volume]) => {
        const date = new Date(timestamp * 1000);
        if (Number.isNaN(date.getTime()) || !Number.isFinite(close)) return null;
        return {
          date: date.toISOString().slice(0, 10),
          open: close,
          high: close,
          low: close,
          close,
          volume: Number.isFinite(volume) ? volume : 0,
        } satisfies Bar;
      })
      .filter((bar): bar is Bar => bar !== null),
  );
}

/** The (year, month) pairs covering the last `months` months, oldest first. */
function monthsInRange(months: number): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  const cursor = new Date();
  cursor.setUTCDate(1);
  for (let i = 0; i < months; i++) {
    out.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1 });
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }
  return out.reverse();
}

export async function getHistory(symbolInput: string, range: HistoryRange): Promise<Sourced<Bar[]>> {
  const symbol = normalizeSymbol(symbolInput);
  const months = RANGE_MONTHS[range];
  const notes: SourceNote[] = [];

  try {
    const windows = monthsInRange(months);
    // PSX serves one month per request; six in flight keeps a 5Y pull under the
    // route's maxDuration without tripping rate limits.
    const results = await mapWithConcurrency(windows, 6, async ({ year, month }) => {
      try {
        return await loadMonth(symbol, year, month);
      } catch {
        return [] as Bar[];
      }
    });

    const bars = dedupeBars(results.flat());
    if (bars.length > 0) {
      notes.push(note("psx", "dps.psx.com.pk/historical", true, `${windows.length} month requests`));
      return { data: bars, notes };
    }
    notes.push(note("psx", "dps.psx.com.pk/historical", false, "no rows parsed"));
  } catch (error) {
    notes.push(note("psx", "dps.psx.com.pk/historical", false, errorMessage(error)));
  }

  try {
    const bars = await loadEodSeries(symbol);
    if (bars.length > 0) {
      notes.push(note("psx", "dps.psx.com.pk/timeseries/eod", true, "close/volume only"));
      return { data: trimToMonths(bars, months), notes };
    }
    notes.push(note("psx", "dps.psx.com.pk/timeseries/eod", false, "empty series"));
  } catch (error) {
    notes.push(note("psx", "dps.psx.com.pk/timeseries/eod", false, errorMessage(error)));
  }

  notes.push(note("sample", "bundled series", true, "PSX unreachable — showing generated sample prices"));
  return { data: sampleBars(symbol, months), notes };
}

function trimToMonths(bars: Bar[], months: number): Bar[] {
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  const iso = cutoff.toISOString().slice(0, 10);
  const trimmed = bars.filter((bar) => bar.date >= iso);
  return trimmed.length > 0 ? trimmed : bars;
}
