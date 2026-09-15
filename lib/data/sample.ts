/**
 * Bundled fallback data.
 *
 * Both upstream sites are scraped, unauthenticated and occasionally unreachable
 * (and outbound access to them is blocked in some build/CI environments). Rather
 * than render an empty shell, the app falls back to this deterministic dataset and
 * flags every screen that is showing it. Nothing here is real market data — it is
 * generated from a fixed seed so the UI is stable across reloads and deploys.
 */

import { deriveRatios } from "./ratios";
import type {
  BalanceSheet,
  Bar,
  CashFlow,
  Dividend,
  Financials,
  IncomeStatement,
  SymbolInfo,
} from "./types";

interface SampleCompany {
  symbol: string;
  name: string;
  sector: string;
  /** Seed price, roughly in the right order of magnitude for the scrip. */
  price: number;
  /** Annual revenue in PKR for the most recent full year. */
  revenue: number;
  netMargin: number;
  shares: number;
}

const COMPANIES: SampleCompany[] = [
  { symbol: "OGDC", name: "Oil & Gas Development Company Limited", sector: "Oil & Gas Exploration Companies", price: 238.4, revenue: 4.5e11, netMargin: 0.44, shares: 4.3e9 },
  { symbol: "PPL", name: "Pakistan Petroleum Limited", sector: "Oil & Gas Exploration Companies", price: 178.9, revenue: 3.1e11, netMargin: 0.38, shares: 2.72e9 },
  { symbol: "PSO", name: "Pakistan State Oil Company Limited", sector: "Oil & Gas Marketing Companies", price: 415.6, revenue: 3.6e12, netMargin: 0.02, shares: 4.69e8 },
  { symbol: "MARI", name: "Mari Petroleum Company Limited", sector: "Oil & Gas Exploration Companies", price: 612.3, revenue: 1.9e11, netMargin: 0.41, shares: 1.2e9 },
  { symbol: "LUCK", name: "Lucky Cement Limited", sector: "Cement", price: 1085.2, revenue: 4.2e11, netMargin: 0.13, shares: 2.93e8 },
  { symbol: "DGKC", name: "D.G. Khan Cement Company Limited", sector: "Cement", price: 152.7, revenue: 8.4e10, netMargin: 0.05, shares: 4.38e8 },
  { symbol: "MLCF", name: "Maple Leaf Cement Factory Limited", sector: "Cement", price: 68.4, revenue: 6.1e10, netMargin: 0.09, shares: 1.05e9 },
  { symbol: "FFC", name: "Fauji Fertilizer Company Limited", sector: "Fertilizer", price: 402.1, revenue: 2.3e11, netMargin: 0.17, shares: 1.42e9 },
  { symbol: "EFERT", name: "Engro Fertilizers Limited", sector: "Fertilizer", price: 198.5, revenue: 1.8e11, netMargin: 0.15, shares: 1.33e9 },
  { symbol: "ENGRO", name: "Engro Corporation Limited", sector: "Fertilizer", price: 312.8, revenue: 4.1e11, netMargin: 0.08, shares: 5.76e8 },
  { symbol: "HBL", name: "Habib Bank Limited", sector: "Commercial Banks", price: 172.3, revenue: 5.2e11, netMargin: 0.21, shares: 1.47e9 },
  { symbol: "UBL", name: "United Bank Limited", sector: "Commercial Banks", price: 345.9, revenue: 4.4e11, netMargin: 0.24, shares: 1.22e9 },
  { symbol: "MCB", name: "MCB Bank Limited", sector: "Commercial Banks", price: 268.4, revenue: 3.2e11, netMargin: 0.28, shares: 1.18e9 },
  { symbol: "MEBL", name: "Meezan Bank Limited", sector: "Commercial Banks", price: 258.6, revenue: 3.8e11, netMargin: 0.29, shares: 1.79e9 },
  { symbol: "BAHL", name: "Bank AL Habib Limited", sector: "Commercial Banks", price: 142.7, revenue: 2.6e11, netMargin: 0.22, shares: 1.11e9 },
  { symbol: "SYS", name: "Systems Limited", sector: "Technology & Communication", price: 128.9, revenue: 5.9e10, netMargin: 0.18, shares: 2.92e8 },
  { symbol: "TRG", name: "TRG Pakistan Limited", sector: "Technology & Communication", price: 62.4, revenue: 1.1e10, netMargin: -0.04, shares: 5.45e8 },
  { symbol: "AVN", name: "Avanceon Limited", sector: "Technology & Communication", price: 58.2, revenue: 1.4e10, netMargin: 0.11, shares: 2.71e8 },
  { symbol: "NESTLE", name: "Nestle Pakistan Limited", sector: "Food & Personal Care Products", price: 7250.0, revenue: 2.4e11, netMargin: 0.11, shares: 4.53e7 },
  { symbol: "UNITY", name: "Unity Foods Limited", sector: "Food & Personal Care Products", price: 24.8, revenue: 1.2e11, netMargin: 0.01, shares: 1.19e9 },
  { symbol: "PKGS", name: "Packages Limited", sector: "Paper & Board", price: 892.4, revenue: 8.7e10, netMargin: 0.07, shares: 8.94e7 },
  { symbol: "INDU", name: "Indus Motor Company Limited", sector: "Automobile Assembler", price: 1985.0, revenue: 2.1e11, netMargin: 0.09, shares: 7.86e7 },
  { symbol: "HCAR", name: "Honda Atlas Cars (Pakistan) Limited", sector: "Automobile Assembler", price: 318.7, revenue: 6.4e10, netMargin: 0.03, shares: 1.43e8 },
  { symbol: "MTL", name: "Millat Tractors Limited", sector: "Automobile Assembler", price: 745.3, revenue: 5.8e10, netMargin: 0.12, shares: 8.17e7 },
  { symbol: "HUBC", name: "Hub Power Company Limited", sector: "Power Generation & Distribution", price: 148.6, revenue: 1.6e11, netMargin: 0.25, shares: 1.3e9 },
  { symbol: "KAPCO", name: "Kot Addu Power Company Limited", sector: "Power Generation & Distribution", price: 42.9, revenue: 7.2e10, netMargin: 0.14, shares: 8.81e8 },
  { symbol: "SEARL", name: "The Searle Company Limited", sector: "Pharmaceuticals", price: 82.4, revenue: 3.8e10, netMargin: 0.06, shares: 3.42e8 },
  { symbol: "GLAXO", name: "GlaxoSmithKline Pakistan Limited", sector: "Pharmaceuticals", price: 358.2, revenue: 5.2e10, netMargin: 0.08, shares: 3.18e8 },
  { symbol: "ILP", name: "Interloop Limited", sector: "Textile Composite", price: 88.6, revenue: 1.4e11, netMargin: 0.1, shares: 1.4e9 },
  { symbol: "NML", name: "Nishat Mills Limited", sector: "Textile Composite", price: 92.1, revenue: 1.3e11, netMargin: 0.07, shares: 3.51e8 },
  { symbol: "GATM", name: "Gul Ahmed Textile Mills Limited", sector: "Textile Composite", price: 46.3, revenue: 1.1e11, netMargin: 0.03, shares: 7.63e8 },
  { symbol: "FCCL", name: "Fauji Cement Company Limited", sector: "Cement", price: 34.8, revenue: 7.6e10, netMargin: 0.08, shares: 2.45e9 },
];

export const SAMPLE_SYMBOLS: SymbolInfo[] = COMPANIES.map((company) => ({
  symbol: company.symbol,
  name: company.name,
  sector: company.sector,
  isETF: false,
  isDebt: false,
}));

export const SAMPLE_SYMBOL_SET = new Set(COMPANIES.map((company) => company.symbol));

/** Deterministic hash so every symbol gets its own stable series. */
function seedFrom(symbol: string) {
  let hash = 2166136261;
  for (let i = 0; i < symbol.length; i++) {
    hash ^= symbol.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** mulberry32 — small, fast, deterministic. */
function rng(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function companyFor(symbol: string): SampleCompany {
  const found = COMPANIES.find((company) => company.symbol === symbol);
  if (found) return found;
  const seed = seedFrom(symbol);
  const random = rng(seed);
  return {
    symbol,
    name: `${symbol} Limited`,
    sector: "Unclassified",
    price: 20 + random() * 300,
    revenue: 1e10 + random() * 9e10,
    netMargin: 0.02 + random() * 0.18,
    shares: 1e8 + random() * 9e8,
  };
}

/** A random-walk OHLCV series ending today, skipping weekends. */
export function sampleBars(symbol: string, months: number): Bar[] {
  const company = companyFor(symbol);
  const random = rng(seedFrom(symbol));
  const tradingDays = Math.max(20, Math.round(months * 21));

  // Walk backwards from today to find the start date, then forwards to build bars.
  const dates: string[] = [];
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  while (dates.length < tradingDays) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  dates.reverse();

  // Start below today's price so the series trends toward `company.price`.
  let price = company.price * (0.6 + random() * 0.3);
  const drift = Math.pow(company.price / price, 1 / dates.length);

  return dates.map((date) => {
    const shock = (random() - 0.5) * 0.045;
    const open = price;
    price = Math.max(1, price * drift * (1 + shock));
    const close = price;
    const spread = Math.abs(close - open) + close * (0.004 + random() * 0.012);
    const high = Math.max(open, close) + spread * random();
    const low = Math.max(0.5, Math.min(open, close) - spread * random());
    const volume = Math.round((0.4 + random()) * (company.shares / 900));
    return {
      date,
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume,
    };
  });
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

const CURRENT_FY = new Date().getUTCFullYear() - 1;

export function sampleFinancials(symbol: string): Financials {
  const company = companyFor(symbol);
  const random = rng(seedFrom(`${symbol}-fin`));
  const years = 6;

  const income: IncomeStatement[] = [];
  const balance: BalanceSheet[] = [];
  const cashFlow: CashFlow[] = [];

  for (let i = years - 1; i >= 0; i--) {
    const year = CURRENT_FY - i;
    const label = `FY${year}`;
    const base = { label, kind: "annual" as const, year, quarter: null, endDate: `${year}-06-30` };

    // Compound backwards from the latest revenue at 8-22% a year.
    const revenue = company.revenue * Math.pow(1 + 0.08 + random() * 0.14, -i);

    // The statement is built by back-solving from a target net margin, then derived
    // strictly downwards, so every subtotal reconciles: gross - opex = operating,
    // operating - finance + other = PBT, PBT - tax = PAT. Generating PAT
    // independently of the chain (as an earlier version did) produced placeholder
    // statements that failed to add up.
    const netMargin = company.netMargin * (0.85 + random() * 0.3);
    const taxRate = 0.26 + random() * 0.08;

    const netProfit = revenue * netMargin;
    const profitBeforeTax = netProfit / (1 - taxRate);
    const taxation = netProfit - profitBeforeTax; // negative

    const financeCost = revenue * (0.01 + random() * 0.03);
    const otherIncome = revenue * random() * 0.02;
    const operatingProfit = profitBeforeTax + financeCost - otherIncome;

    // Operating expenses sit between gross and operating profit.
    const operatingExpenses = revenue * (0.04 + random() * 0.06);
    const grossProfit = operatingProfit + operatingExpenses;
    const costOfSales = grossProfit - revenue; // negative

    const eps = netProfit / company.shares;

    income.push({
      ...base,
      revenue,
      costOfSales,
      grossProfit,
      operatingProfit,
      financeCost: -financeCost,
      otherIncome,
      profitBeforeTax,
      taxation,
      netProfit,
      eps,
    });

    // Balance sheet: assets split into current / non-current, and funded by equity
    // plus liabilities, so both sides total to the same figure.
    const totalAssets = revenue * (0.9 + random() * 0.8);
    const currentAssets = totalAssets * (0.35 + random() * 0.2);
    const totalEquity = totalAssets * (0.4 + random() * 0.2);
    const totalLiabilities = totalAssets - totalEquity;
    const currentLiabilities = totalLiabilities * (0.5 + random() * 0.3);
    // Paid-up capital can't exceed equity, or reserves would come out negative.
    const shareCapital = Math.min(company.shares * 10, totalEquity * (0.1 + random() * 0.3));

    balance.push({
      ...base,
      totalAssets,
      currentAssets,
      nonCurrentAssets: totalAssets - currentAssets,
      totalLiabilities,
      currentLiabilities,
      nonCurrentLiabilities: totalLiabilities - currentLiabilities,
      shareCapital,
      reserves: totalEquity - shareCapital,
      totalEquity,
    });

    const operating = netProfit * (1.1 + random() * 0.5);
    const investing = -operating * (0.4 + random() * 0.5);
    const financing = -operating * (0.2 + random() * 0.4);

    cashFlow.push({
      ...base,
      operating,
      investing,
      financing,
      netChange: operating + investing + financing,
      closingCash: Math.abs(operating + investing + financing) * (1.5 + random()),
    });
  }

  return {
    currency: "PKR",
    unitScale: 1,
    unitLabel: "PKR",
    income,
    balance,
    cashFlow,
    // Same derivation the real adapter uses, so sample ratios reconcile too.
    ratios: deriveRatios(income, balance),
  };
}

export function sampleDividends(symbol: string): Dividend[] {
  const random = rng(seedFrom(`${symbol}-div`));
  const out: Dividend[] = [];
  for (let year = CURRENT_FY; year > CURRENT_FY - 5; year--) {
    for (const quarter of [1, 2, 3, 4]) {
      if (random() < 0.25) continue;
      const percent = Math.round((15 + random() * 60) * 10) / 10;
      const month = String(quarter * 3).padStart(2, "0");
      out.push({
        announcedOn: `${year}-${month}-18`,
        period: `Q${quarter} ${year}`,
        kind: random() < 0.12 ? "bonus" : "cash",
        percent,
        perShare: Math.round(percent) / 10,
        bookClosureFrom: `${year}-${month}-24`,
        bookClosureTo: `${year}-${month}-28`,
        paymentDate: `${year}-${month}-30`,
      });
    }
  }
  return out.sort((a, b) => (b.announcedOn ?? "").localeCompare(a.announcedOn ?? ""));
}

export function sampleShares(symbol: string) {
  return companyFor(symbol).shares;
}

export function sampleCompanyName(symbol: string) {
  return companyFor(symbol).name;
}

export function sampleSector(symbol: string) {
  return companyFor(symbol).sector;
}
