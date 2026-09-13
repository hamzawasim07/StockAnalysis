import { describe, expect, it } from "vitest";

import { parseTables } from "@/lib/data/html";
import { deriveRatios } from "@/lib/data/ratios";
import { parseDividendTables } from "@/lib/khistocks/dividends";
import { scoreLinks } from "@/lib/khistocks/discover";
import { detectUnits, parsePeriodHeader, readRow, toStatementGrid, LINE_ITEMS } from "@/lib/khistocks/parse";
import { DIVIDENDS_PAGE, FINANCIALS_PAGE, INDEX_PAGE } from "./fixtures/khistocks";

describe("period headers", () => {
  it("reads the formats PSX filings use", () => {
    expect(parsePeriodHeader("FY2025")).toMatchObject({ kind: "annual", year: 2025 });
    expect(parsePeriodHeader("FY25")).toMatchObject({ kind: "annual", year: 2025 });
    expect(parsePeriodHeader("2024")).toMatchObject({ kind: "annual", year: 2024 });
    expect(parsePeriodHeader("Jun-24")).toMatchObject({ kind: "annual", year: 2024, endDate: "2024-06-30" });
    expect(parsePeriodHeader("31-Dec-2023")).toMatchObject({ kind: "annual", year: 2023, endDate: "2023-12-31" });
  });

  it("distinguishes quarters from full years", () => {
    expect(parsePeriodHeader("Q3 2025")).toMatchObject({ kind: "quarterly", year: 2025, quarter: 3 });
    expect(parsePeriodHeader("1Q26")).toMatchObject({ kind: "quarterly", year: 2026, quarter: 1 });
  });

  it("rejects headers that aren't periods", () => {
    expect(parsePeriodHeader("Particulars")).toBeNull();
    expect(parsePeriodHeader("")).toBeNull();
  });
});

describe("unit detection", () => {
  it("scales Rs '000 and millions to absolute rupees", () => {
    expect(detectUnits("Income Statement (Rs '000)").unitScale).toBe(1_000);
    expect(detectUnits("Profit & Loss (Rs mn)").unitScale).toBe(1_000_000);
    expect(detectUnits("Figures in billions").unitScale).toBe(1_000_000_000);
    expect(detectUnits("Income Statement").unitScale).toBe(1);
  });
});

describe("statement grids", () => {
  const grids = parseTables(FINANCIALS_PAGE)
    .map(toStatementGrid)
    .filter((grid) => grid !== null);

  it("ignores tables with no period columns", () => {
    // The page also contains a navigation table, which must not become a grid.
    expect(grids).toHaveLength(3);
  });

  it("matches line items by substring, across wording variants", () => {
    const income = grids[0]!;
    // The fixture says "Net Sales"; the app asks for "revenue".
    expect(readRow(income, ...LINE_ITEMS.revenue)[0]).toBe(420_116_500);
    expect(readRow(income, ...LINE_ITEMS.netProfit)[0]).toBe(61_847_500);
    // "Issued, Subscribed and Paid up Capital" -> share capital.
    expect(readRow(grids[1]!, ...LINE_ITEMS.shareCapital)[0]).toBe(2_930_000);
  });

  it("carries parenthesised figures through as negatives", () => {
    expect(readRow(grids[0]!, ...LINE_ITEMS.costOfSales)[0]).toBe(-292_560_300);
  });

  it("orders periods newest-last so charts read left to right", () => {
    expect(grids[0]!.periods.map((period) => period.label)).toEqual(["FY2025", "FY2024", "FY2023"]);
  });
});

describe("dividend tables", () => {
  const dividends = parseDividendTables(DIVIDENDS_PAGE);

  it("parses announcements newest first", () => {
    expect(dividends).toHaveLength(3);
    expect(dividends[0].announcedOn).toBe("2025-09-18");
  });

  it("classifies payout type and converts rate to rupees per share", () => {
    expect(dividends[0]).toMatchObject({ kind: "cash", percent: 160, perShare: 16 });
    expect(dividends[1].kind).toBe("bonus");
  });

  it("captures book-closure dates", () => {
    expect(dividends[0]).toMatchObject({ bookClosureFrom: "2025-09-24", bookClosureTo: "2025-09-28" });
  });
});

describe("ratio derivation", () => {
  it("computes margins and leverage from the statements", () => {
    const income = [
      {
        label: "FY2025", kind: "annual" as const, year: 2025, quarter: null, endDate: null,
        revenue: 1000, costOfSales: -700, grossProfit: 300, operatingProfit: 200,
        financeCost: -20, otherIncome: 10, profitBeforeTax: 190, taxation: -50,
        netProfit: 140, eps: 14,
      },
    ];
    const balance = [
      {
        label: "FY2025", kind: "annual" as const, year: 2025, quarter: null, endDate: null,
        totalAssets: 2000, currentAssets: 800, nonCurrentAssets: 1200,
        totalLiabilities: 1200, currentLiabilities: 400, nonCurrentLiabilities: 800,
        shareCapital: 100, reserves: 700, totalEquity: 800,
      },
    ];

    const [ratios] = deriveRatios(income, balance);
    expect(ratios.grossMarginPercent).toBeCloseTo(30);
    expect(ratios.netMarginPercent).toBeCloseTo(14);
    expect(ratios.returnOnEquityPercent).toBeCloseTo(17.5);
    expect(ratios.currentRatio).toBeCloseTo(2);
    expect(ratios.debtToEquity).toBeCloseTo(1.5);
    // 140 profit / 14 EPS => 10 shares; 800 equity / 10 => 80 per share.
    expect(ratios.bookValuePerShare).toBeCloseTo(80);
  });

  it("returns null instead of dividing by zero or missing data", () => {
    const period = { label: "FY2025", kind: "annual" as const, year: 2025, quarter: null, endDate: null };
    const [ratios] = deriveRatios(
      [{ ...period, revenue: 0, costOfSales: null, grossProfit: null, operatingProfit: null,
         financeCost: null, otherIncome: null, profitBeforeTax: null, taxation: null,
         netProfit: 100, eps: null }],
      [],
    );
    expect(ratios.netMarginPercent).toBeNull();
    expect(ratios.returnOnEquityPercent).toBeNull();
    expect(ratios.bookValuePerShare).toBeNull();
  });
});

describe("link discovery", () => {
  const links = scoreLinks(INDEX_PAGE, "https://www.khistocks.com/", "LUCK");

  it("finds this symbol's financial and dividend pages", () => {
    const financials = links.find((link) => link.kind === "financials");
    const dividends = links.find((link) => link.kind === "dividends");
    expect(financials?.url).toBe("https://www.khistocks.com/reports/financial-statements/LUCK");
    expect(dividends?.url).toBe("https://www.khistocks.com/reports/dividend-data/LUCK");
  });

  it("ignores other symbols and off-site links", () => {
    const urls = links.map((link) => link.url);
    expect(urls.some((url) => url.includes("DGKC"))).toBe(false);
    expect(urls.some((url) => url.startsWith("https://example.com"))).toBe(false);
  });

  it("does not match a symbol inside a longer word", () => {
    // "LUCKY-STAR" must not be treated as a link about LUCK.
    expect(links.some((link) => link.url.includes("LUCKY-STAR"))).toBe(false);
  });
});
