import type { BalanceSheet, IncomeStatement, Ratios } from "./types";

/**
 * Ratios are always derived from the statements rather than read from a source, so
 * every figure on the Ratios tab reconciles with the Financials tab. Shared by the
 * khistocks adapter and the bundled sample data so both go through one definition.
 */
export function deriveRatios(income: IncomeStatement[], balance: BalanceSheet[]): Ratios[] {
  const balanceByLabel = new Map(balance.map((row) => [row.label, row]));

  return income.map((row) => {
    const sheet = balanceByLabel.get(row.label);

    const ratio = (numerator: number | null | undefined, denominator: number | null | undefined) =>
      numerator != null && denominator != null && denominator !== 0 ? numerator / denominator : null;
    const percent = (numerator: number | null | undefined, denominator: number | null | undefined) => {
      const value = ratio(numerator, denominator);
      return value == null ? null : value * 100;
    };

    // Share count implied by the reported EPS, used for per-share book value.
    const shares =
      row.eps != null && row.eps !== 0 && row.netProfit != null ? row.netProfit / row.eps : null;

    return {
      label: row.label,
      kind: row.kind,
      year: row.year,
      quarter: row.quarter,
      endDate: row.endDate,
      grossMarginPercent: percent(row.grossProfit, row.revenue),
      operatingMarginPercent: percent(row.operatingProfit, row.revenue),
      netMarginPercent: percent(row.netProfit, row.revenue),
      returnOnEquityPercent: percent(row.netProfit, sheet?.totalEquity),
      returnOnAssetsPercent: percent(row.netProfit, sheet?.totalAssets),
      currentRatio: ratio(sheet?.currentAssets, sheet?.currentLiabilities),
      debtToEquity: ratio(sheet?.totalLiabilities, sheet?.totalEquity),
      eps: row.eps,
      bookValuePerShare: shares ? ratio(sheet?.totalEquity, shares) : null,
    };
  });
}
