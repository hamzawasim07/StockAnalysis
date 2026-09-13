import "server-only";

import { getKhistocksDividends } from "@/lib/khistocks/dividends";
import { getFinancials } from "@/lib/khistocks/financials";
import { getCompanyPage } from "@/lib/psx/company";
import { getHistory } from "@/lib/psx/historical";
import { getMarketRow } from "@/lib/psx/market";
import { quoteFromBars, statsFromBars } from "@/lib/psx/stats";
import { getSymbolInfo } from "@/lib/psx/symbols";
import { sampleDividends, SAMPLE_SYMBOL_SET, sampleShares } from "@/lib/data/sample";
import { normalizeSymbol } from "@/lib/utils";

import type { Dividend, HistoryRange, SectionProvenance, SourceId, SourceNote, StockSnapshot } from "./types";

/**
 * Assembles one company view out of every source:
 *
 *   prices & profile  -> dps.psx.com.pk
 *   statements        -> khistocks.com (ratios derived from them)
 *   payouts           -> khistocks.com, falling back to the PSX company page
 *
 * Each source is fetched independently and its failure is recorded as a note
 * instead of failing the page — a company with unreachable financials still gets
 * its price history.
 */
export async function getStockSnapshot(
  symbolInput: string,
  range: HistoryRange = "1Y",
): Promise<StockSnapshot> {
  const symbol = normalizeSymbol(symbolInput);

  const [info, history, company, financials, khiDividends, boardRow] = await Promise.all([
    getSymbolInfo(symbol),
    getHistory(symbol, range),
    getCompanyPage(symbol),
    getFinancials(symbol),
    getKhistocksDividends(symbol),
    getMarketRow(symbol),
  ]);

  const notes: SourceNote[] = [
    ...history.notes,
    ...company.notes,
    ...financials.notes,
    ...khiDividends.notes,
  ];

  const bars = history.data;
  const derived = quoteFromBars(symbol, bars);

  // The market-watch board is fresher than the last historical bar when the
  // market is open, so it wins where it has a value.
  const quote = boardRow
    ? {
        ...derived,
        price: boardRow.current ?? derived.price,
        previousClose: boardRow.ldcp ?? derived.previousClose,
        change: boardRow.change ?? derived.change,
        changePercent: boardRow.changePercent ?? derived.changePercent,
        open: boardRow.open ?? derived.open,
        dayHigh: boardRow.high ?? derived.dayHigh,
        dayLow: boardRow.low ?? derived.dayLow,
        volume: boardRow.volume ?? derived.volume,
      }
    : derived;

  const profile = company.data.profile;
  const name = info?.name ?? profile.name;
  const sector = info?.sector ?? profile.sector ?? null;

  // PSX's company page doesn't always print the share count; the statements do,
  // via net profit / EPS.
  const latestIncome = financials.data.income.at(-1);
  const impliedShares =
    latestIncome?.eps != null && latestIncome.eps !== 0 && latestIncome.netProfit != null
      ? latestIncome.netProfit / latestIncome.eps
      : null;
  const listedShares =
    profile.listedShares ?? impliedShares ?? (SAMPLE_SYMBOL_SET.has(symbol) ? sampleShares(symbol) : null);

  const marketCap =
    profile.marketCap ?? (listedShares != null && quote.price != null ? listedShares * quote.price : null);

  const sourceOf = (sectionNotes: SourceNote[]): SourceId => {
    const succeeded = sectionNotes.find((item) => item.ok);
    return succeeded?.source ?? "sample";
  };

  const provenance: SectionProvenance = {
    prices: sourceOf(history.notes),
    profile: sourceOf(company.notes),
    financials: sourceOf(financials.notes),
    dividends: khiDividends.data.length > 0 ? sourceOf(khiDividends.notes) : sourceOf(company.notes),
  };

  return {
    profile: {
      ...profile,
      name,
      sector,
      isETF: info?.isETF ?? profile.isETF,
      listedShares,
      marketCap,
    },
    quote: { ...quote, name, sector: sector ?? undefined },
    bars,
    stats: statsFromBars(bars),
    financials: financials.data,
    dividends: mergeDividends(khiDividends.data, company.data.dividends, symbol, notes),
    provenance,
    notes,
  };
}

/**
 * Prefer whichever source returned more payout history; if both are empty and the
 * rest of the page is running on sample data, fill in the sample payouts so the
 * tab isn't blank for no visible reason.
 */
function mergeDividends(
  fromKhistocks: Dividend[],
  fromPsx: Dividend[],
  symbol: string,
  notes: SourceNote[],
): Dividend[] {
  if (fromKhistocks.length === 0 && fromPsx.length === 0) {
    const usingSample = notes.some((item) => item.source === "sample");
    if (usingSample && SAMPLE_SYMBOL_SET.has(symbol)) return sampleDividends(symbol);
    return [];
  }

  const primary = fromKhistocks.length >= fromPsx.length ? fromKhistocks : fromPsx;
  const secondary = primary === fromKhistocks ? fromPsx : fromKhistocks;

  const seen = new Set(primary.map((item) => `${item.announcedOn}|${item.kind}|${item.percent}`));
  const merged = [...primary];
  for (const item of secondary) {
    const key = `${item.announcedOn}|${item.kind}|${item.percent}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }

  return merged.sort((a, b) => (b.announcedOn ?? "").localeCompare(a.announcedOn ?? ""));
}

/** True when any part of the snapshot fell back to bundled data. */
export function isSampleBacked(notes: SourceNote[]) {
  return notes.some((note) => note.source === "sample");
}
