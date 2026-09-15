import "server-only";

import { unstable_cache } from "next/cache";

import type { Bar, Quote } from "@/lib/data/types";
import { normalizeSymbol } from "@/lib/utils";

import { getFromTerminal, PSXTERMINAL_TTL, type MarketType } from "./client";

/** `/api/ticks/{type}/{symbol}` */
export interface RawTick {
  market?: string;
  st?: string;
  symbol?: string;
  price?: number;
  change?: number;
  /** A FRACTION here (0.01928 means 1.928%) — unlike the stats endpoints. */
  changePercent?: number;
  volume?: number;
  trades?: number;
  value?: number;
  high?: number;
  low?: number;
  bid?: number;
  ask?: number;
  bidVol?: number;
  askVol?: number;
  /** Unix seconds. */
  timestamp?: number;
}

/**
 * The tick endpoint reports change as a fraction of the previous close while the
 * statistics endpoints report the same quantity as a percentage. Mixing them up
 * puts 1.93% where 0.02% belongs — a wrong number that still looks plausible — so
 * the conversion happens here, once, at the boundary.
 */
export function tickToQuote(symbol: string, tick: RawTick): Quote {
  const price = numberOrNull(tick.price);
  const change = numberOrNull(tick.change);
  const changePercent = tick.changePercent == null ? null : tick.changePercent * 100;

  return {
    symbol,
    price,
    previousClose: price != null && change != null ? price - change : null,
    change,
    changePercent,
    // The tick carries no open; the day's range is what it reports.
    open: null,
    dayHigh: numberOrNull(tick.high),
    dayLow: numberOrNull(tick.low),
    volume: numberOrNull(tick.volume),
    turnover: numberOrNull(tick.value),
    asOf: tick.timestamp ? new Date(tick.timestamp * 1000).toISOString().slice(0, 10) : null,
  };
}

function numberOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const loadTick = unstable_cache(
  async (market: MarketType, symbol: string): Promise<RawTick> =>
    getFromTerminal<RawTick>(`/api/ticks/${market}/${encodeURIComponent(symbol)}`, {
      revalidate: PSXTERMINAL_TTL.ticks,
      tags: [`psxterminal-tick-${symbol}`],
    }),
  ["psxterminal-tick-v2"],
  { revalidate: PSXTERMINAL_TTL.ticks },
);

export async function getTick(symbol: string, market: MarketType = "REG") {
  return loadTick(market, normalizeSymbol(symbol));
}

/** `/api/symbols` returns bare ticker strings — no names or sectors. */
const loadSymbols = unstable_cache(
  async (): Promise<string[]> => {
    const data = await getFromTerminal<string[]>("/api/symbols", {
      revalidate: PSXTERMINAL_TTL.symbols,
      tags: ["psxterminal-symbols"],
    });
    const list = Array.isArray(data) ? data.map(normalizeSymbol).filter(Boolean) : [];
    if (list.length === 0) throw new Error("symbol list was empty");
    return list.sort((a, b) => a.localeCompare(b));
  },
  ["psxterminal-symbols-v2"],
  { revalidate: PSXTERMINAL_TTL.symbols, tags: ["psxterminal-symbols"] },
);

export async function getTerminalSymbols() {
  return loadSymbols();
}

/** One row of `/api/stats/{REG}`'s topGainers / topLosers. */
export interface RawMover {
  symbol?: string;
  change?: number;
  /** A PERCENTAGE here (10.5 means 10.5%) — unlike the tick endpoint. */
  changePercent?: number;
  price?: number;
  volume?: number;
  value?: number;
}

export interface RawMarketStats {
  totalVolume?: number;
  totalValue?: number;
  totalTrades?: number;
  symbolCount?: number;
  gainers?: number;
  losers?: number;
  unchanged?: number;
  topGainers?: RawMover[];
  topLosers?: RawMover[];
}

export interface RawBreadth {
  advances?: number;
  declines?: number;
  unchanged?: number;
  advanceDeclineRatio?: number;
  upVolume?: number;
  downVolume?: number;
}

export interface RawSector {
  totalVolume?: number;
  totalValue?: number;
  totalTrades?: number;
  gainers?: number;
  losers?: number;
  unchanged?: number;
  avgChangePercent?: number;
  symbols?: string[];
}

const loadStats = unstable_cache(
  async (type: string): Promise<unknown> =>
    getFromTerminal<unknown>(`/api/stats/${type}`, {
      revalidate: PSXTERMINAL_TTL.stats,
      tags: ["psxterminal-stats"],
    }),
  ["psxterminal-stats-v2"],
  { revalidate: PSXTERMINAL_TTL.stats, tags: ["psxterminal-stats"] },
);

export async function getMarketStats() {
  return (await loadStats("REG")) as RawMarketStats;
}

export async function getBreadth() {
  return (await loadStats("breadth")) as RawBreadth;
}

export async function getSectors() {
  return (await loadStats("sectors")) as Record<string, RawSector>;
}

/** Symbol → sector name, inverted from the sectors statistics. */
export function sectorIndex(sectors: Record<string, RawSector>): Map<string, string> {
  const index = new Map<string, string>();
  for (const [sector, detail] of Object.entries(sectors ?? {})) {
    for (const symbol of detail?.symbols ?? []) {
      index.set(normalizeSymbol(symbol), sector);
    }
  }
  return index;
}

/** A tick is enough to synthesise today's bar when candles are unavailable. */
export function tickToBar(tick: RawTick): Bar | null {
  const close = numberOrNull(tick.price);
  if (close == null || !tick.timestamp) return null;
  return {
    date: new Date(tick.timestamp * 1000).toISOString().slice(0, 10),
    open: numberOrNull(tick.high) != null && numberOrNull(tick.low) != null ? close : close,
    high: numberOrNull(tick.high) ?? close,
    low: numberOrNull(tick.low) ?? close,
    close,
    volume: numberOrNull(tick.volume) ?? 0,
  };
}
