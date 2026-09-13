import "server-only";

import { unstable_cache } from "next/cache";

import { parseTables } from "@/lib/data/html";
import { errorMessage, note, UpstreamError } from "@/lib/data/http";
import { deriveRatios } from "@/lib/data/ratios";
import { sampleFinancials } from "@/lib/data/sample";
import type {
  BalanceSheet,
  CashFlow,
  Financials,
  IncomeStatement,
  PeriodRef,
  Sourced,
} from "@/lib/data/types";
import { normalizeSymbol } from "@/lib/utils";

import { fetchKhistocksPage, KHISTOCKS_TTL, summariseAttempts } from "./client";
import { LINE_ITEMS, readRow, type StatementGrid, toStatementGrid } from "./parse";

/**
 * Pick the grid that best matches a statement, scored by how many of its
 * characteristic line items are present. A page usually carries the income
 * statement, balance sheet and cash-flow statement as three separate tables with
 * no reliable headings, so identification is by content.
 */
function bestGrid(grids: StatementGrid[], markers: readonly (readonly string[])[]): StatementGrid | null {
  let best: { grid: StatementGrid; score: number } | null = null;

  for (const grid of grids) {
    let score = 0;
    for (const candidates of markers) {
      if (readRow(grid, ...candidates).some((value) => value != null)) score++;
    }
    if (score >= 2 && (!best || score > best.score)) best = { grid, score };
  }

  return best?.grid ?? null;
}

function column<T extends PeriodRef>(
  grid: StatementGrid,
  build: (index: number, period: PeriodRef) => T,
): T[] {
  return grid.periods
    .map((period, index) => build(index, period))
    // Oldest first, so charts read left to right.
    .sort((a, b) => a.year - b.year || (a.quarter ?? 0) - (b.quarter ?? 0));
}

function scaled(values: (number | null)[], index: number, scale: number) {
  const value = values[index];
  return value == null ? null : value * scale;
}

function buildIncome(grid: StatementGrid): IncomeStatement[] {
  const scale = grid.unitScale;
  const revenue = readRow(grid, ...LINE_ITEMS.revenue);
  const costOfSales = readRow(grid, ...LINE_ITEMS.costOfSales);
  const grossProfit = readRow(grid, ...LINE_ITEMS.grossProfit);
  const operatingProfit = readRow(grid, ...LINE_ITEMS.operatingProfit);
  const financeCost = readRow(grid, ...LINE_ITEMS.financeCost);
  const otherIncome = readRow(grid, ...LINE_ITEMS.otherIncome);
  const profitBeforeTax = readRow(grid, ...LINE_ITEMS.profitBeforeTax);
  const taxation = readRow(grid, ...LINE_ITEMS.taxation);
  const netProfit = readRow(grid, ...LINE_ITEMS.netProfit);
  // EPS is already per-share rupees, so it is never scaled.
  const eps = readRow(grid, ...LINE_ITEMS.eps);

  return column(grid, (index, period) => ({
    ...period,
    revenue: scaled(revenue, index, scale),
    costOfSales: scaled(costOfSales, index, scale),
    grossProfit: scaled(grossProfit, index, scale),
    operatingProfit: scaled(operatingProfit, index, scale),
    financeCost: scaled(financeCost, index, scale),
    otherIncome: scaled(otherIncome, index, scale),
    profitBeforeTax: scaled(profitBeforeTax, index, scale),
    taxation: scaled(taxation, index, scale),
    netProfit: scaled(netProfit, index, scale),
    eps: eps[index] ?? null,
  }));
}

function buildBalance(grid: StatementGrid): BalanceSheet[] {
  const scale = grid.unitScale;
  const read = (key: keyof typeof LINE_ITEMS) => readRow(grid, ...LINE_ITEMS[key]);
  const totalAssets = read("totalAssets");
  const currentAssets = read("currentAssets");
  const nonCurrentAssets = read("nonCurrentAssets");
  const totalLiabilities = read("totalLiabilities");
  const currentLiabilities = read("currentLiabilities");
  const nonCurrentLiabilities = read("nonCurrentLiabilities");
  const shareCapital = read("shareCapital");
  const reserves = read("reserves");
  const totalEquity = read("totalEquity");

  return column(grid, (index, period) => {
    const assets = scaled(totalAssets, index, scale);
    const equity = scaled(totalEquity, index, scale);
    const liabilities = scaled(totalLiabilities, index, scale);
    return {
      ...period,
      totalAssets: assets,
      currentAssets: scaled(currentAssets, index, scale),
      nonCurrentAssets: scaled(nonCurrentAssets, index, scale),
      // Balance sheets balance: fill whichever of the three is missing.
      totalLiabilities: liabilities ?? (assets != null && equity != null ? assets - equity : null),
      currentLiabilities: scaled(currentLiabilities, index, scale),
      nonCurrentLiabilities: scaled(nonCurrentLiabilities, index, scale),
      shareCapital: scaled(shareCapital, index, scale),
      reserves: scaled(reserves, index, scale),
      totalEquity: equity ?? (assets != null && liabilities != null ? assets - liabilities : null),
    };
  });
}

function buildCashFlow(grid: StatementGrid): CashFlow[] {
  const scale = grid.unitScale;
  const operating = readRow(grid, ...LINE_ITEMS.operating);
  const investing = readRow(grid, ...LINE_ITEMS.investing);
  const financing = readRow(grid, ...LINE_ITEMS.financing);
  const netChange = readRow(grid, ...LINE_ITEMS.netChange);
  const closingCash = readRow(grid, ...LINE_ITEMS.closingCash);

  return column(grid, (index, period) => {
    const o = scaled(operating, index, scale);
    const i = scaled(investing, index, scale);
    const f = scaled(financing, index, scale);
    return {
      ...period,
      operating: o,
      investing: i,
      financing: f,
      netChange:
        scaled(netChange, index, scale) ??
        (o != null && i != null && f != null ? o + i + f : null),
      closingCash: scaled(closingCash, index, scale),
    };
  });
}

const INCOME_MARKERS = [LINE_ITEMS.revenue, LINE_ITEMS.netProfit, LINE_ITEMS.grossProfit, LINE_ITEMS.eps];
const BALANCE_MARKERS = [LINE_ITEMS.totalAssets, LINE_ITEMS.totalEquity, LINE_ITEMS.currentAssets, LINE_ITEMS.shareCapital];
const CASHFLOW_MARKERS = [LINE_ITEMS.operating, LINE_ITEMS.investing, LINE_ITEMS.financing];

interface ParsedFinancials {
  financials: Financials;
  endpoint: string;
  summary: string;
}

export interface AssembledFinancials {
  financials: Financials;
  counts: { income: number; balance: number; cashFlow: number };
}

/**
 * HTML in, normalised statements out — the whole extraction pipeline with no
 * fetching, so it can be exercised against fixture markup. Returns null when
 * nothing usable was recognised.
 */
export function assembleFinancials(html: string): AssembledFinancials | null {
  const grids = parseTables(html)
    .map(toStatementGrid)
    .filter((grid): grid is StatementGrid => grid !== null);

  const incomeGrid = bestGrid(grids, INCOME_MARKERS);
  const balanceGrid = bestGrid(grids, BALANCE_MARKERS);
  const cashGrid = bestGrid(grids, CASHFLOW_MARKERS);

  const income = incomeGrid ? buildIncome(incomeGrid) : [];
  const balance = balanceGrid ? buildBalance(balanceGrid) : [];
  const cashFlow = cashGrid ? buildCashFlow(cashGrid) : [];

  if (income.length === 0 && balance.length === 0) return null;

  const unit = incomeGrid ?? balanceGrid ?? cashGrid;
  return {
    financials: {
      currency: "PKR",
      unitScale: unit?.unitScale ?? 1,
      unitLabel: "PKR",
      income,
      balance,
      cashFlow,
      ratios: deriveRatios(income, balance),
    },
    counts: { income: income.length, balance: balance.length, cashFlow: cashFlow.length },
  };
}

/**
 * Throws when nothing usable was parsed, so a failure is never cached — the sample
 * statements are substituted outside the cache instead.
 */
const loadFinancials = unstable_cache(
  async (symbol: string): Promise<ParsedFinancials> => {
    const page = await fetchKhistocksPage("financials", symbol);
    if (!page.html || !page.url) {
      throw new UpstreamError(summariseAttempts(page.attempts));
    }

    const endpoint = page.url.replace(/^https?:\/\//, "");
    const assembled = assembleFinancials(page.html);
    if (!assembled) {
      throw new UpstreamError(`${endpoint} reached, but no statement tables were recognised`);
    }

    return {
      financials: assembled.financials,
      endpoint,
      summary: `${assembled.counts.income} income / ${assembled.counts.balance} balance / ${assembled.counts.cashFlow} cash-flow periods`,
    };
  },
  ["khistocks-financials-v1"],
  { revalidate: KHISTOCKS_TTL.financials },
);

export async function getFinancials(symbolInput: string): Promise<Sourced<Financials>> {
  const symbol = normalizeSymbol(symbolInput);
  try {
    const result = await loadFinancials(symbol);
    return {
      data: result.financials,
      notes: [note("khistocks", result.endpoint, true, result.summary)],
    };
  } catch (error) {
    return {
      data: sampleFinancials(symbol),
      notes: [
        note("khistocks", "khistocks.com", false, errorMessage(error)),
        note("sample", "bundled statements", true, "khistocks unreachable — showing generated sample financials"),
      ],
    };
  }
}
