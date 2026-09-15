import "server-only";

import { errorMessage, note } from "@/lib/data/http";
import type { Bar, HistoryRange, Quote, SourceNote, SymbolInfo } from "@/lib/data/types";
import { getHistory as getScrapedHistory } from "@/lib/psx/historical";
import { getScrapedSymbols } from "@/lib/psx/symbols";
import { getDailyBars } from "@/lib/psxterminal/klines";
import { getSectors, getTerminalSymbols, getTick, sectorIndex, tickToQuote } from "@/lib/psxterminal/market";
import { getTerminalCompany } from "@/lib/psxterminal/company";
import { normalizeSymbol } from "@/lib/utils";

/**
 * Source precedence.
 *
 * PSX Terminal publishes a documented JSON API, so it is tried first for everything
 * it covers. The HTML scrapers stay as fallbacks: they are best-effort against
 * pages that can change shape without notice, and they exist for the one thing the
 * API does not serve — full financial statements, which remain khistocks' job.
 */

export interface Sourced<T> {
  data: T;
  notes: SourceNote[];
}

export async function getPrices(
  symbolInput: string,
  range: HistoryRange,
): Promise<Sourced<Bar[]>> {
  const symbol = normalizeSymbol(symbolInput);
  const notes: SourceNote[] = [];

  try {
    const bars = await getDailyBars(symbol, range);
    if (bars.length > 0) {
      notes.push(note("psxterminal", `psxterminal.com/api/klines/${symbol}/1d`, true, `${bars.length} daily bars`));
      return { data: bars, notes };
    }
    notes.push(note("psxterminal", `psxterminal.com/api/klines/${symbol}/1d`, false, "no candles returned"));
  } catch (error) {
    notes.push(note("psxterminal", `psxterminal.com/api/klines/${symbol}/1d`, false, errorMessage(error)));
  }

  // Fall back to scraping the PSX data portal.
  const scraped = await getScrapedHistory(symbol, range);
  return { data: scraped.data, notes: [...notes, ...scraped.notes] };
}

export async function getQuote(symbolInput: string): Promise<Sourced<Quote | null>> {
  const symbol = normalizeSymbol(symbolInput);
  try {
    const tick = await getTick(symbol);
    return {
      data: tickToQuote(symbol, tick),
      notes: [note("psxterminal", `psxterminal.com/api/ticks/REG/${symbol}`, true)],
    };
  } catch (error) {
    return {
      data: null,
      notes: [note("psxterminal", `psxterminal.com/api/ticks/REG/${symbol}`, false, errorMessage(error))],
    };
  }
}

/**
 * The directory needs symbol, name and sector, and no single endpoint carries all
 * three: `/api/symbols` lists tickers, `/api/stats/sectors` maps tickers to sectors,
 * and names are per-company. Tickers and sectors come from the API; names are filled
 * in lazily on the pages that need them.
 */
export async function getDirectory(): Promise<Sourced<SymbolInfo[]>> {
  const notes: SourceNote[] = [];

  try {
    const [symbols, sectors] = await Promise.all([
      getTerminalSymbols(),
      getSectors().catch(() => ({})),
    ]);

    const bySymbol = sectorIndex(sectors);
    const list: SymbolInfo[] = symbols.map((symbol) => ({
      symbol,
      name: symbol,
      sector: bySymbol.get(symbol) ?? "Unclassified",
      isETF: false,
      isDebt: false,
    }));

    if (list.length > 0) {
      notes.push(
        note("psxterminal", "psxterminal.com/api/symbols", true, `${list.length} symbols, ${bySymbol.size} sector-mapped`),
      );
      return { data: list, notes };
    }
  } catch (error) {
    notes.push(note("psxterminal", "psxterminal.com/api/symbols", false, errorMessage(error)));
  }

  const scraped = await getScrapedSymbols();
  return { data: scraped.data, notes: [...notes, ...scraped.notes] };
}

/** Company name, resolved from whichever source knows it. */
export async function getCompanyName(symbolInput: string): Promise<string | null> {
  const symbol = normalizeSymbol(symbolInput);
  try {
    const company = await getTerminalCompany(symbol);
    if (company.name) return company.name;
  } catch {
    // Falls through to the directory below.
  }

  const directory = await getDirectory();
  const found = directory.data.find((item) => item.symbol === symbol);
  return found && found.name !== found.symbol ? found.name : null;
}

/** Ranked symbol/name search over whichever directory is available. */
export async function searchDirectory(query: string, limit = 12): Promise<SymbolInfo[]> {
  const term = query.trim().toLowerCase();
  const { data } = await getDirectory();
  if (!term) return data.slice(0, limit);

  const scored = data
    .map((item) => {
      const symbol = item.symbol.toLowerCase();
      const name = item.name.toLowerCase();
      let score = -1;
      if (symbol === term) score = 0;
      else if (symbol.startsWith(term)) score = 1;
      else if (name.startsWith(term)) score = 2;
      else if (symbol.includes(term)) score = 3;
      else if (name.includes(term)) score = 4;
      else if (item.sector.toLowerCase().includes(term)) score = 5;
      return { item, score };
    })
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => a.score - b.score || a.item.symbol.localeCompare(b.item.symbol));

  return scored.slice(0, limit).map((entry) => entry.item);
}

/** Sector directory with listing counts. */
export async function getSectorCounts(): Promise<{ sector: string; count: number }[]> {
  const { data } = await getDirectory();
  const counts = new Map<string, number>();
  for (const item of data) {
    if (item.isDebt) continue;
    counts.set(item.sector, (counts.get(item.sector) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([sector, count]) => ({ sector, count }))
    .sort((a, b) => b.count - a.count || a.sector.localeCompare(b.sector));
}

export async function findSymbol(symbolInput: string): Promise<SymbolInfo | null> {
  const target = normalizeSymbol(symbolInput);
  const { data } = await getDirectory();
  return data.find((item) => item.symbol === target) ?? null;
}
