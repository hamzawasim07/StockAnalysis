import { describe, expect, it } from "vitest";

import { sampleFinancials, SAMPLE_SYMBOLS } from "@/lib/data/sample";
import { assembleFinancials, describeMiss } from "@/lib/khistocks/financials";
import { FINANCIALS_MILLIONS, FINANCIALS_PAGE } from "./fixtures/khistocks";

describe("end-to-end statement extraction", () => {
  const result = assembleFinancials(FINANCIALS_PAGE);

  it("recognises all three statements on one page", () => {
    expect(result).not.toBeNull();
    expect(result!.counts).toEqual({ income: 3, balance: 3, cashFlow: 3 });
  });

  it("scales Rs '000 figures up to absolute rupees", () => {
    const latest = result!.financials.income.at(-1)!;
    expect(latest.label).toBe("FY2025");
    // 420,116,500 printed in thousands is Rs 420.1bn.
    expect(latest.revenue).toBe(420_116_500_000);
    expect(latest.netProfit).toBe(61_847_500_000);
  });

  it("leaves EPS in rupees per share, unscaled", () => {
    // EPS is already per-share; multiplying it by the statement unit is a classic
    // scraping bug and would make every P/E wrong by 1000x.
    expect(result!.financials.income.at(-1)!.eps).toBe(211.08);
  });

  it("produces an income statement that reconciles", () => {
    for (const row of result!.financials.income) {
      expect(row.revenue! + row.costOfSales!).toBeCloseTo(row.grossProfit!, 0);
      expect(row.operatingProfit! + row.financeCost! + row.otherIncome!).toBeCloseTo(row.profitBeforeTax!, 0);
      expect(row.profitBeforeTax! + row.taxation!).toBeCloseTo(row.netProfit!, 0);
    }
  });

  it("derives ratios consistent with the parsed statements", () => {
    const ratios = result!.financials.ratios.at(-1)!;
    // 61.85bn / 420.12bn
    expect(ratios.netMarginPercent).toBeCloseTo(14.72, 1);
    expect(ratios.grossMarginPercent).toBeCloseTo(30.36, 1);
  });

  it("handles a page printed in millions with Mon-YY headers", () => {
    const millions = assembleFinancials(FINANCIALS_MILLIONS);
    expect(millions).not.toBeNull();
    const latest = millions!.financials.income.at(-1)!;
    expect(latest.revenue).toBe(420_116_000_000);
    expect(latest.eps).toBe(211.08);
  });

  it("returns null for a page with no statements rather than empty rows", () => {
    expect(assembleFinancials("<html><body><h1>Page not found</h1></body></html>")).toBeNull();
  });
});

describe("bundled sample statements", () => {
  // Regression guard: an earlier version generated net profit independently of the
  // profit-before-tax chain, so the placeholder statements did not add up.
  const symbols = SAMPLE_SYMBOLS.slice(0, 12).map((info) => info.symbol);

  it.each(symbols)("%s reconciles on every line", (symbol) => {
    const financials = sampleFinancials(symbol);
    const balanceByLabel = new Map(financials.balance.map((row) => [row.label, row]));

    for (const row of financials.income) {
      const tolerance = Math.abs(row.revenue!) * 1e-9;
      expect(row.revenue! + row.costOfSales!).toBeCloseTo(row.grossProfit!, -Math.log10(tolerance));
      expect(row.profitBeforeTax! + row.taxation!).toBeCloseTo(row.netProfit!, -Math.log10(tolerance));

      const sheet = balanceByLabel.get(row.label)!;
      expect(sheet.totalEquity! + sheet.totalLiabilities!).toBeCloseTo(sheet.totalAssets!, -Math.log10(tolerance));
      expect(sheet.currentAssets! + sheet.nonCurrentAssets!).toBeCloseTo(sheet.totalAssets!, -Math.log10(tolerance));
      expect(sheet.shareCapital! + sheet.reserves!).toBeCloseTo(sheet.totalEquity!, -Math.log10(tolerance));
      // Paid-up capital above equity would imply negative reserves.
      expect(sheet.reserves!).toBeGreaterThanOrEqual(0);
    }

    for (const flow of financials.cashFlow) {
      expect(flow.operating! + flow.investing! + flow.financing!).toBeCloseTo(flow.netChange!, 2);
    }
  });

  it("is deterministic across calls", () => {
    // The UI would flicker between renders if the seed weren't stable.
    expect(sampleFinancials("LUCK")).toEqual(sampleFinancials("LUCK"));
  });
});

describe("diagnosing a reached-but-unparsed page", () => {
  it("identifies a page with no tables", () => {
    expect(describeMiss("<html><body><p>Redirecting…</p></body></html>")).toMatch(/no tables at all/);
  });

  it("identifies client-side rendering from empty table shells", () => {
    // The case that no parser change can fix: markup present, figures injected by JS.
    const shell = `<html><body><table><thead><tr><th>Particulars</th></tr></thead><tbody></tbody></table></body></html>`;
    expect(describeMiss(shell)).toMatch(/injected client-side/);
  });

  it("reports the headers it saw when periods can't be parsed", () => {
    const odd = `<table><tr><th>Item</th><th>Latest</th><th>Prior</th></tr><tr><td>Net Sales</td><td>1</td><td>2</td></tr></table>`;
    expect(describeMiss(odd)).toMatch(/no parseable period headers/);
    expect(describeMiss(odd)).toMatch(/Latest/);
  });

  it("reports the row labels it saw when line items don't match", () => {
    const unknown = `<table><tr><th>Particulars</th><th>FY2025</th></tr><tr><td>Widgets Shipped</td><td>42</td></tr></table>`;
    expect(describeMiss(unknown)).toMatch(/Widgets Shipped/);
  });
});
