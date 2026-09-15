import { describe, expect, it } from "vitest";

import { parseAbbreviated } from "@/lib/psxterminal/client";
import { nameFromDescription, reconcileMarketCap, toDividend } from "@/lib/psxterminal/company";
import { klinesToBars, klineToBar } from "@/lib/psxterminal/klines";
import { sectorIndex, tickToQuote } from "@/lib/psxterminal/market";

/**
 * Payloads below are the examples from the PSX Terminal API documentation, so these
 * tests pin the app to the published contract rather than to a guess at it.
 */

describe("ticks", () => {
  // From the docs: GET /api/ticks/REG/HUBC
  const tick = {
    market: "REG",
    st: "SUS",
    symbol: "HUBC",
    price: 164.42,
    change: 3.11,
    changePercent: 0.01928,
    volume: 12573014,
    trades: 8460,
    value: 2082312049.64,
    high: 167.84,
    low: 162.11,
    timestamp: 1756205291,
  };

  it("converts the fractional change to a percentage", () => {
    // The tick endpoint reports 0.01928 for what the stats endpoints call 1.928.
    // Rendering the raw value would show "+0.02%" on a day the stock moved ~2%.
    const quote = tickToQuote("HUBC", tick);
    expect(quote.changePercent).toBeCloseTo(1.928, 3);
    expect(quote.change).toBe(3.11);
  });

  it("derives the previous close from price and change", () => {
    expect(tickToQuote("HUBC", tick).previousClose).toBeCloseTo(161.31, 2);
  });

  it("keeps the reported day range and turnover", () => {
    const quote = tickToQuote("HUBC", tick);
    expect(quote.dayHigh).toBe(167.84);
    expect(quote.dayLow).toBe(162.11);
    expect(quote.turnover).toBe(2082312049.64);
  });

  it("dates the quote from the unix-seconds timestamp", () => {
    expect(tickToQuote("HUBC", tick).asOf).toBe("2025-08-26");
  });

  it("returns nulls rather than zeros for missing fields", () => {
    const quote = tickToQuote("HUBC", {});
    expect(quote.price).toBeNull();
    expect(quote.changePercent).toBeNull();
    expect(quote.asOf).toBeNull();
  });
});

describe("klines", () => {
  // From the docs: GET /api/klines/HUBC/1h
  const row = {
    symbol: "HUBC",
    timeframe: "1h",
    timestamp: 1755237600000,
    open: 160.2,
    high: 160.89,
    low: 158.4,
    close: 159,
    volume: 995047,
  };

  it("maps a candle to a bar, converting milliseconds to a date", () => {
    expect(klineToBar(row)).toEqual({
      date: "2025-08-15",
      open: 160.2,
      high: 160.89,
      low: 158.4,
      close: 159,
      volume: 995047,
    });
  });

  it("falls back to the close when OHLC fields are absent", () => {
    const bar = klineToBar({ timestamp: 1755237600000, close: 159 })!;
    expect(bar.open).toBe(159);
    expect(bar.high).toBe(159);
    expect(bar.volume).toBe(0);
  });

  it("drops rows with no close or no timestamp", () => {
    expect(klineToBar({ timestamp: 1755237600000 })).toBeNull();
    expect(klineToBar({ close: 159 })).toBeNull();
  });

  it("sorts oldest first and de-duplicates repeated days", () => {
    const bars = klinesToBars([
      { timestamp: Date.UTC(2025, 7, 15), close: 159 },
      { timestamp: Date.UTC(2025, 7, 13), close: 155 },
      // Paging overlap: the same day fetched twice, later value wins.
      { timestamp: Date.UTC(2025, 7, 15), close: 160 },
    ]);
    expect(bars.map((bar) => bar.date)).toEqual(["2025-08-13", "2025-08-15"]);
    expect(bars.at(-1)!.close).toBe(160);
  });
});

describe("abbreviated figures", () => {
  it("expands the suffixes the fundamentals endpoint uses", () => {
    expect(parseAbbreviated("213.3B")).toBeCloseTo(213_300_000_000);
    expect(parseAbbreviated("908.0M")).toBeCloseTo(908_000_000);
    expect(parseAbbreviated("1.5K")).toBeCloseTo(1500);
  });

  it("passes plain numbers through and rejects junk", () => {
    expect(parseAbbreviated(1234)).toBe(1234);
    expect(parseAbbreviated("1,423,108,696")).toBe(1_423_108_696);
    expect(parseAbbreviated("n/a")).toBeNull();
    expect(parseAbbreviated(null)).toBeNull();
  });
});

describe("market cap", () => {
  it("prefers shares x price, which is unambiguous", () => {
    // The two endpoints quote market cap in different units, so the product of two
    // plainly-scaled figures is trusted over either reported value.
    expect(reconcileMarketCap(538_077_397.96, 1_423_108_696, 378)).toBeCloseTo(1_423_108_696 * 378);
  });

  it("falls back to the reported figure when shares or price are missing", () => {
    expect(reconcileMarketCap(213_300_000_000, null, null)).toBe(213_300_000_000);
    expect(reconcileMarketCap(null, null, 378)).toBeNull();
  });
});

describe("company name", () => {
  it("takes the legal name from the opening of the description", () => {
    const description =
      "Fauji Fertilizer Company Limited is a public company incorporated in Pakistan under the Companies Act, 1913.";
    expect(nameFromDescription(description)).toBe("Fauji Fertilizer Company Limited");
  });

  it("declines prose that doesn't read as a company name", () => {
    expect(nameFromDescription("The principal activity is manufacturing fertilizers.")).toBeNull();
    expect(nameFromDescription("")).toBeNull();
    expect(nameFromDescription(null)).toBeNull();
  });
});

describe("dividends", () => {
  // From the docs: GET /api/dividends/MARI
  const raw = {
    symbol: "MARI",
    ex_date: "2025-09-18",
    payment_date: "2025-10-17",
    record_date: "2025-09-19",
    amount: 21.7,
    year: 2025,
  };

  it("maps rupees per share straight through", () => {
    const dividend = toDividend(raw, null)!;
    expect(dividend.perShare).toBe(21.7);
    expect(dividend.announcedOn).toBe("2025-09-18");
    expect(dividend.paymentDate).toBe("2025-10-17");
    expect(dividend.kind).toBe("cash");
  });

  it("leaves the percentage null rather than assuming a face value", () => {
    // This endpoint quotes rupees, not a percentage of paid-up value.
    expect(toDividend(raw, null)!.percent).toBeNull();
  });

  it("derives the percentage once the face value is known", () => {
    expect(toDividend(raw, 10)!.percent).toBeCloseTo(217);
  });
});

describe("sector index", () => {
  it("inverts the sector statistics into symbol lookups", () => {
    const index = sectorIndex({
      BANKING: { symbols: ["HBL", "UBL", "MCB"] },
      CEMENT: { symbols: ["LUCK"] },
    });
    expect(index.get("HBL")).toBe("BANKING");
    expect(index.get("LUCK")).toBe("CEMENT");
    expect(index.get("NOPE")).toBeUndefined();
  });

  it("tolerates a missing or empty payload", () => {
    expect(sectorIndex({}).size).toBe(0);
  });
});
