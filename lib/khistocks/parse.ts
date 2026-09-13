import "server-only";

import type { ParsedTable } from "@/lib/data/html";
import { labelKey } from "@/lib/data/html";
import type { PeriodKind, PeriodRef } from "@/lib/data/types";
import { parseLooseNumber } from "@/lib/format";

/**
 * Financial statements are published as label-per-row / period-per-column tables.
 * Column headers vary a lot between sources and years ("FY2024", "Jun-24",
 * "31-Dec-2023", "Q3 2025"), so headers are parsed into a common `PeriodRef`.
 */

const MONTH_NAMES = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

export function parsePeriodHeader(raw: string): PeriodRef | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;

  // Q1 2025 / 1Q25 / 3QFY24
  const quarter = text.match(/(?:^|\b)(?:q\s?([1-4])|([1-4])\s?q)\s*(?:fy)?\s*'?(\d{2,4})/i);
  if (quarter) {
    const q = Number(quarter[1] ?? quarter[2]);
    const year = normaliseYear(quarter[3]);
    if (year) return ref(`Q${q} ${year}`, "quarterly", year, q, null);
  }

  // 31-Dec-2023 / Dec-24 / June 2025
  const named = text.match(/(?:(\d{1,2})[\s-])?([A-Za-z]{3,})[\s'-]*(\d{2,4})/);
  if (named) {
    const monthIndex = MONTH_NAMES.indexOf(named[2].slice(0, 3).toLowerCase());
    const year = normaliseYear(named[3]);
    if (monthIndex >= 0 && year) {
      const day = named[1] ?? String(daysInMonth(year, monthIndex + 1));
      const endDate = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
      // A December or June year-end is the usual annual close on PSX.
      return ref(`${named[2].slice(0, 3)} ${year}`, "annual", year, null, endDate);
    }
  }

  // FY2024 / FY24 / 2024
  const annual = text.match(/(?:fy)?\s*'?(\d{4}|\d{2})(?!\d)/i);
  if (annual) {
    const year = normaliseYear(annual[1]);
    if (year) return ref(`FY${year}`, "annual", year, null, null);
  }

  return null;
}

function ref(
  label: string,
  kind: PeriodKind,
  year: number,
  quarter: number | null,
  endDate: string | null,
): PeriodRef {
  return { label, kind, year, quarter, endDate };
}

function normaliseYear(raw: string): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (raw.length === 2) return value > 70 ? 1900 + value : 2000 + value;
  if (value < 1990 || value > 2100) return null;
  return value;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export interface StatementGrid {
  periods: PeriodRef[];
  /** Normalised row label -> one value per period (index-aligned with `periods`). */
  rows: Map<string, (number | null)[]>;
  /** Multiplier taking the printed figures to absolute rupees. */
  unitScale: number;
  unitLabel: string;
}

/**
 * Turn a statement table into a grid. Periods come from the header row; if the
 * header has no parseable periods the table is rejected, which is how non-financial
 * tables (navigation, related links) get filtered out.
 */
export function toStatementGrid(table: ParsedTable): StatementGrid | null {
  const headerCells = table.headers.length > 0 ? table.headers : table.rows[0];
  if (!headerCells || headerCells.length < 2) return null;

  const periods: PeriodRef[] = [];
  const columnIndexes: number[] = [];
  headerCells.forEach((cell, index) => {
    if (index === 0) return;
    const period = parsePeriodHeader(cell);
    if (period) {
      periods.push(period);
      columnIndexes.push(index);
    }
  });
  if (periods.length === 0) return null;

  const body = table.headers.length > 0 ? table.rows : table.rows.slice(1);
  const rows = new Map<string, (number | null)[]>();
  for (const row of body) {
    const key = labelKey(row[0] ?? "");
    if (!key || rows.has(key)) continue;
    rows.set(
      key,
      columnIndexes.map((index) => parseLooseNumber(row[index] ?? "")),
    );
  }
  if (rows.size === 0) return null;

  const { unitScale, unitLabel } = detectUnits(`${table.title} ${headerCells.join(" ")}`);
  return { periods, rows, unitScale, unitLabel };
}

/** PSX filings are usually in `Rs '000`; some pages print millions. */
export function detectUnits(text: string): { unitScale: number; unitLabel: string } {
  const haystack = text.toLowerCase();
  if (/\b(rs\.?|pkr)?\s*'?\s*000\b|thousand/.test(haystack)) {
    return { unitScale: 1_000, unitLabel: "PKR '000" };
  }
  if (/million|\bmn\b/.test(haystack)) return { unitScale: 1_000_000, unitLabel: "PKR mn" };
  if (/billion|\bbn\b/.test(haystack)) return { unitScale: 1_000_000_000, unitLabel: "PKR bn" };
  return { unitScale: 1, unitLabel: "PKR" };
}

/**
 * Words that mark a row as a computed ratio rather than a reported amount. These
 * pages publish both — "Net Profit after tax" and "Net Profit after tax Ratio" sit
 * in the same table — and a substring match for an amount would happily return the
 * percentage, putting 14.96 where Rs 5.8bn belongs.
 */
const DERIVED_ROW_WORDS = ["ratio", "margin", "percent", "growth", "yield", "per share", "times"];

function looksDerived(rowKey: string) {
  return DERIVED_ROW_WORDS.some((word) => rowKey.includes(word));
}

/**
 * Read one logical line item out of a grid. Candidates are tried in order: exact
 * label first, then substring, so "sales" finds "net sales" and "turnover - net"
 * alike. Rows that are ratios rather than amounts are skipped unless the caller is
 * explicitly asking for one (EPS, for example, is a per-share figure).
 */
export function readRow(grid: StatementGrid, ...candidates: string[]): (number | null)[] {
  const wantsDerived = candidates.some((candidate) => looksDerived(labelKey(candidate)));

  for (const candidate of candidates) {
    const key = labelKey(candidate);
    const exact = grid.rows.get(key);
    if (exact) return exact;
  }

  // Prefer the shortest matching label: "net sales" beats "net sales of goods
  // including related party transactions" as the intended line item.
  let best: { key: string; values: (number | null)[] } | null = null;
  for (const candidate of candidates) {
    const key = labelKey(candidate);
    for (const [rowKey, values] of grid.rows) {
      if (!rowKey.includes(key)) continue;
      if (!wantsDerived && looksDerived(rowKey)) continue;
      if (!best || rowKey.length < best.key.length) best = { key: rowKey, values };
    }
    if (best) return best.values;
  }

  return grid.periods.map(() => null);
}

/** Row labels used across PSX filings for each normalised line item. */
export const LINE_ITEMS = {
  revenue: ["revenue", "net sales", "sales net", "turnover", "sales", "total revenue", "net revenue"],
  costOfSales: ["cost of sales", "cost of goods sold", "cost of revenue"],
  grossProfit: ["gross profit", "gross income"],
  operatingProfit: ["operating profit", "profit from operations", "operating income", "ebit"],
  financeCost: ["finance cost", "financial charges", "finance charges", "interest expense"],
  otherIncome: ["other income", "other operating income"],
  profitBeforeTax: ["profit before tax", "profit before taxation", "pbt"],
  taxation: ["taxation", "income tax", "tax expense", "provision for taxation"],
  netProfit: ["profit after tax", "profit for the year", "net profit", "profit after taxation", "pat"],
  eps: ["earnings per share", "eps", "basic eps"],

  totalAssets: ["total assets"],
  currentAssets: ["current assets", "total current assets"],
  nonCurrentAssets: ["non current assets", "fixed assets", "total non current assets"],
  totalLiabilities: ["total liabilities"],
  currentLiabilities: ["current liabilities", "total current liabilities"],
  nonCurrentLiabilities: ["non current liabilities", "long term liabilities"],
  shareCapital: ["share capital", "issued subscribed and paid up capital", "paid up capital"],
  reserves: ["reserves", "unappropriated profit", "retained earnings"],
  totalEquity: ["total equity", "shareholders equity", "equity", "net worth"],

  operating: ["cash flow from operating", "net cash from operating", "operating activities"],
  investing: ["cash flow from investing", "net cash used in investing", "investing activities"],
  financing: ["cash flow from financing", "net cash from financing", "financing activities"],
  netChange: ["net increase decrease in cash", "net change in cash"],
  closingCash: ["cash and cash equivalents at the end", "closing cash", "cash at end"],
} as const;
