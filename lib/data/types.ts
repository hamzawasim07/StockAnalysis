/**
 * Normalised shapes every data source is mapped into. Scrapers in `lib/psx/` and
 * `lib/khistocks/` are the only code allowed to know about raw HTML/JSON layouts;
 * everything above this line works with these types.
 */

export type SourceId = "psxterminal" | "psx" | "khistocks" | "sample";

export interface SourceNote {
  source: SourceId;
  /** Human readable origin, e.g. "dps.psx.com.pk/historical". */
  endpoint: string;
  ok: boolean;
  /** Present when a source failed or returned nothing usable. */
  message?: string;
  fetchedAt: string;
}

/** A result plus provenance, so the UI can always say where a number came from. */
export interface Sourced<T> {
  data: T;
  notes: SourceNote[];
}

export interface SymbolInfo {
  symbol: string;
  name: string;
  sector: string;
  isETF: boolean;
  isDebt: boolean;
}

/** One daily OHLCV bar. */
export interface Bar {
  date: string; // ISO yyyy-mm-dd
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Quote {
  symbol: string;
  name?: string;
  sector?: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  /** Traded value in PKR, when the source reports it. */
  turnover?: number | null;
  asOf: string | null;
}

/** Statistics derived from the loaded bar series rather than a live feed. */
export interface PriceStats {
  periodHigh: number | null;
  periodLow: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  averageVolume: number | null;
  periodReturnPercent: number | null;
  /** Annualised standard deviation of daily log returns, in percent. */
  volatilityPercent: number | null;
  barCount: number;
}

export type PeriodKind = "annual" | "quarterly";

/** A reporting period label, e.g. FY 2025 or Q3 2025. */
export interface PeriodRef {
  /** Display label: "FY2025", "Q1 2026". */
  label: string;
  kind: PeriodKind;
  /** Calendar year the period ends in. */
  year: number;
  /** 1-4 for quarterly rows, null for annual. */
  quarter: number | null;
  /** Period end date when the source publishes one. */
  endDate: string | null;
}

export interface IncomeStatement extends PeriodRef {
  revenue: number | null;
  costOfSales: number | null;
  grossProfit: number | null;
  operatingProfit: number | null;
  financeCost: number | null;
  otherIncome: number | null;
  profitBeforeTax: number | null;
  taxation: number | null;
  netProfit: number | null;
  eps: number | null;
}

export interface BalanceSheet extends PeriodRef {
  totalAssets: number | null;
  currentAssets: number | null;
  nonCurrentAssets: number | null;
  totalLiabilities: number | null;
  currentLiabilities: number | null;
  nonCurrentLiabilities: number | null;
  shareCapital: number | null;
  reserves: number | null;
  totalEquity: number | null;
}

export interface CashFlow extends PeriodRef {
  operating: number | null;
  investing: number | null;
  financing: number | null;
  netChange: number | null;
  closingCash: number | null;
}

export interface Ratios extends PeriodRef {
  grossMarginPercent: number | null;
  operatingMarginPercent: number | null;
  netMarginPercent: number | null;
  returnOnEquityPercent: number | null;
  returnOnAssetsPercent: number | null;
  currentRatio: number | null;
  debtToEquity: number | null;
  eps: number | null;
  bookValuePerShare: number | null;
}

export interface Financials {
  currency: string;
  /** Multiplier applied to statement figures to reach absolute PKR (1_000 for `Rs '000`). */
  unitScale: number;
  unitLabel: string;
  income: IncomeStatement[];
  balance: BalanceSheet[];
  cashFlow: CashFlow[];
  ratios: Ratios[];
}

export type DividendKind = "cash" | "bonus" | "right" | "other";

export interface Dividend {
  announcedOn: string | null;
  period: string | null;
  kind: DividendKind;
  /** Percentage of face value, the way PSX announces payouts (e.g. 150%). */
  percent: number | null;
  /** Rupees per share, derived from `percent` against the Rs 10 face value when absent. */
  perShare: number | null;
  bookClosureFrom: string | null;
  bookClosureTo: string | null;
  paymentDate: string | null;
}

export interface CompanyProfile {
  symbol: string;
  name: string;
  sector: string | null;
  isETF: boolean;
  listedShares: number | null;
  freeFloat: number | null;
  marketCap: number | null;
  website: string | null;
  address: string | null;
  ceo: string | null;
}

/**
 * Which source each block of the page actually came from. Sources fail
 * independently, so a page can legitimately carry real prices beside placeholder
 * financials — the UI marks each section rather than relying on one page banner.
 */
export interface SectionProvenance {
  prices: SourceId;
  profile: SourceId;
  financials: SourceId;
  dividends: SourceId;
}

/** Everything the stock page needs, assembled from all sources. */
export interface StockSnapshot {
  profile: CompanyProfile;
  quote: Quote;
  bars: Bar[];
  stats: PriceStats;
  financials: Financials;
  dividends: Dividend[];
  provenance: SectionProvenance;
  notes: SourceNote[];
}

export const HISTORY_RANGES = ["1M", "3M", "6M", "1Y", "3Y", "5Y", "MAX"] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];

export const RANGE_MONTHS: Record<HistoryRange, number> = {
  "1M": 1,
  "3M": 3,
  "6M": 6,
  "1Y": 12,
  "3Y": 36,
  "5Y": 60,
  MAX: 120,
};

export function isHistoryRange(value: string): value is HistoryRange {
  return (HISTORY_RANGES as readonly string[]).includes(value);
}
