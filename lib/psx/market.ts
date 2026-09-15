import "server-only";

import { unstable_cache } from "next/cache";

import { parseTables } from "@/lib/data/html";
import { errorMessage, fetchUpstream, note, UpstreamError } from "@/lib/data/http";
import { getBreadth, getMarketStats, type RawMover } from "@/lib/psxterminal/market";
import { sampleBars, SAMPLE_SYMBOLS } from "@/lib/data/sample";
import type { Sourced } from "@/lib/data/types";
import { parseLooseNumber } from "@/lib/format";
import { normalizeSymbol } from "@/lib/utils";

import { PSX_ENDPOINTS, PSX_TTL } from "./endpoints";

/** One row of the market-watch board. */
export interface MarketRow {
  symbol: string;
  sector: string | null;
  ldcp: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  current: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
}

/**
 * The market-watch board is a wide HTML table. Its exact column order has changed
 * before, so columns are matched by header text and only the ones we recognise are
 * read — an unknown extra column is simply ignored.
 */
export function parseMarketWatchHtml(html: string): MarketRow[] {
  const tables = parseTables(html);
  const table = tables
    .filter((candidate) => candidate.rows.length > 5)
    .sort((a, b) => b.rows.length - a.rows.length)[0];
  if (!table) return [];

  const headers = table.headers.map((header) => header.toLowerCase());
  const indexOf = (...terms: string[]) =>
    headers.findIndex((header) => terms.some((term) => header.includes(term)));

  const columns = {
    symbol: Math.max(indexOf("symbol", "scrip"), 0),
    sector: indexOf("sector"),
    ldcp: indexOf("ldcp", "prev"),
    open: indexOf("open"),
    high: indexOf("high"),
    low: indexOf("low"),
    current: indexOf("current", "close", "last"),
    change: indexOf("change"),
    changePercent: indexOf("%", "pct"),
    volume: indexOf("volume", "turnover"),
  };

  const at = (row: string[], index: number) =>
    index >= 0 && index < row.length ? parseLooseNumber(row[index]) : null;

  return table.rows
    .map((row): MarketRow | null => {
      const symbol = normalizeSymbol(row[columns.symbol] ?? "");
      if (!symbol || symbol.length > 12) return null;

      const current = at(row, columns.current);
      const ldcp = at(row, columns.ldcp);
      const change = at(row, columns.change) ?? (current != null && ldcp != null ? current - ldcp : null);

      return {
        symbol,
        sector: columns.sector >= 0 ? (row[columns.sector] ?? null) : null,
        ldcp,
        open: at(row, columns.open),
        high: at(row, columns.high),
        low: at(row, columns.low),
        current,
        change,
        changePercent:
          at(row, columns.changePercent) ?? (ldcp && change != null ? (change / ldcp) * 100 : null),
        volume: at(row, columns.volume),
      };
    })
    .filter((row): row is MarketRow => row !== null && row.current != null);
}

/** Board built from the bundled sample series, used when PSX is unreachable. */
function sampleBoard(): MarketRow[] {
  return SAMPLE_SYMBOLS.map((info): MarketRow | null => {
    const bars = sampleBars(info.symbol, 2);
    const last = bars.at(-1);
    const previous = bars.at(-2);
    if (!last) return null;
    const ldcp = previous?.close ?? last.open;
    const change = last.close - ldcp;
    return {
      symbol: info.symbol,
      sector: info.sector,
      ldcp,
      open: last.open,
      high: last.high,
      low: last.low,
      current: last.close,
      change,
      changePercent: ldcp ? (change / ldcp) * 100 : null,
      volume: last.volume,
    } satisfies MarketRow;
  }).filter((row): row is MarketRow => row !== null);
}

/** Throws rather than returning the sample board, so a failure is never cached. */
const loadBoard = unstable_cache(
  async (): Promise<MarketRow[]> => {
    const html = await fetchUpstream(PSX_ENDPOINTS.marketWatch, {
      revalidate: PSX_TTL.marketWatch,
      tags: ["psx-market-watch"],
    });
    const rows = parseMarketWatchHtml(html);
    if (rows.length === 0) {
      throw new UpstreamError("market-watch page reached, but no rows could be parsed");
    }
    return rows;
  },
  ["psx-market-watch-v2"],
  { revalidate: PSX_TTL.marketWatch, tags: ["psx-market-watch"] },
);

export async function getMarketBoard(): Promise<Sourced<MarketRow[]>> {
  try {
    const rows = await loadBoard();
    return {
      data: rows,
      notes: [note("psx", "dps.psx.com.pk/market-watch", true, `${rows.length} scrips`)],
    };
  } catch (error) {
    return {
      data: sampleBoard(),
      notes: [
        note("psx", "dps.psx.com.pk/market-watch", false, errorMessage(error)),
        note("sample", "bundled board", true, "PSX unreachable — showing generated sample board"),
      ],
    };
  }
}

export interface MarketMovers {
  gainers: MarketRow[];
  losers: MarketRow[];
  mostActive: MarketRow[];
  advancing: number;
  declining: number;
  unchanged: number;
  totalVolume: number;
}

export async function getMarketMovers(limit = 6): Promise<Sourced<MarketMovers>> {
  // The documented statistics endpoint already computes breadth and movers; it is
  // tried first, with the scraped board as the fallback.
  try {
    const movers = await terminalMovers(limit);
    if (movers) return movers;
  } catch {
    // Fall through to the board below.
  }

  const { data: rows, notes } = await getMarketBoard();

  // Thinly traded scrips produce enormous percentage moves on a handful of shares;
  // the movers lists exclude them so the board reflects real activity.
  const liquid = rows.filter((row) => (row.volume ?? 0) >= 5_000);
  const ranked = (liquid.length >= limit * 2 ? liquid : rows).filter(
    (row) => row.changePercent != null,
  );

  const byChange = [...ranked].sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
  const byVolume = [...rows].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));

  return {
    data: {
      gainers: byChange.slice(0, limit),
      losers: byChange.slice(-limit).reverse(),
      mostActive: byVolume.slice(0, limit),
      advancing: rows.filter((row) => (row.change ?? 0) > 0).length,
      declining: rows.filter((row) => (row.change ?? 0) < 0).length,
      unchanged: rows.filter((row) => (row.change ?? 0) === 0).length,
      totalVolume: rows.reduce((sum, row) => sum + (row.volume ?? 0), 0),
    },
    notes,
  };
}

/** Breadth and movers straight from `/api/stats`, when it answers. */
async function terminalMovers(limit: number): Promise<Sourced<MarketMovers> | null> {
  const [stats, breadth] = await Promise.all([getMarketStats(), getBreadth().catch(() => null)]);

  const toRow = (mover: RawMover): MarketRow => ({
    symbol: normalizeSymbol(mover.symbol ?? ""),
    sector: null,
    ldcp: mover.price != null && mover.change != null ? mover.price - mover.change : null,
    open: null,
    high: null,
    low: null,
    current: mover.price ?? null,
    change: mover.change ?? null,
    // These are already percentages, unlike the tick endpoint's fractions.
    changePercent: mover.changePercent ?? null,
    volume: mover.volume ?? null,
  });

  const gainers = (stats.topGainers ?? []).slice(0, limit).map(toRow);
  const losers = (stats.topLosers ?? []).slice(0, limit).map(toRow);
  if (gainers.length === 0 && losers.length === 0) return null;

  return {
    data: {
      gainers,
      losers,
      // The statistics endpoint ranks by change, not volume; the most-active list
      // needs the full board, so it is left to the caller's fallback.
      mostActive: [],
      advancing: breadth?.advances ?? stats.gainers ?? 0,
      declining: breadth?.declines ?? stats.losers ?? 0,
      unchanged: breadth?.unchanged ?? stats.unchanged ?? 0,
      totalVolume: stats.totalVolume ?? 0,
    },
    notes: [note("psxterminal", "psxterminal.com/api/stats", true, `${gainers.length} gainers, ${losers.length} losers`)],
  };
}

export async function getMarketRow(symbol: string): Promise<MarketRow | null> {
  const target = normalizeSymbol(symbol);
  const { data } = await getMarketBoard();
  return data.find((row) => row.symbol === target) ?? null;
}

