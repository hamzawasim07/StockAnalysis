import { describe, expect, it } from "vitest";

import { parseHistoricalHtml } from "@/lib/psx/historical";
import { parseMarketWatchHtml } from "@/lib/psx/market";
import { quoteFromBars, statsFromBars } from "@/lib/psx/stats";
import { HISTORICAL_TABLE, HISTORICAL_WITH_CHANGE, MARKET_WATCH } from "./fixtures/psx";

describe("PSX historical table", () => {
  it("parses OHLCV bars and normalises the date", () => {
    const bars = parseHistoricalHtml(HISTORICAL_TABLE);
    expect(bars).toHaveLength(3);
    // Sorted oldest-first regardless of the order the source printed.
    expect(bars.map((bar) => bar.date)).toEqual(["2026-09-09", "2026-09-10", "2026-09-11"]);
    expect(bars.at(-1)).toMatchObject({
      open: 970.5,
      high: 1014.53,
      low: 965.81,
      close: 992.15,
      volume: 395500,
    });
  });

  it("locates volume from the end when an extra change column is present", () => {
    const bars = parseHistoricalHtml(HISTORICAL_WITH_CHANGE);
    expect(bars.at(-1)).toMatchObject({ close: 992.15, volume: 395500 });
  });

  it("returns nothing rather than guessing when the markup is unrecognisable", () => {
    expect(parseHistoricalHtml("<html><body><p>Service unavailable</p></body></html>")).toEqual([]);
  });
});

describe("PSX market watch", () => {
  const rows = parseMarketWatchHtml(MARKET_WATCH);

  it("picks the board table and skips unrelated ones", () => {
    expect(rows).toHaveLength(6);
    expect(rows.map((row) => row.symbol)).toContain("OGDC");
  });

  it("reads columns by header, not position", () => {
    const luck = rows.find((row) => row.symbol === "LUCK");
    expect(luck).toMatchObject({ current: 992.15, ldcp: 970.5, changePercent: 2.23, volume: 395500 });
  });

  it("keeps declines negative", () => {
    const mlcf = rows.find((row) => row.symbol === "MLCF");
    expect(mlcf?.change).toBe(-0.98);
    expect(mlcf?.changePercent).toBe(-1.57);
  });
});

describe("derived price statistics", () => {
  const bars = parseHistoricalHtml(HISTORICAL_TABLE);

  it("derives the quote from the last two bars", () => {
    const quote = quoteFromBars("LUCK", bars);
    expect(quote.price).toBe(992.15);
    expect(quote.previousClose).toBe(970.5);
    expect(quote.change).toBeCloseTo(21.65, 2);
    expect(quote.changePercent).toBeCloseTo(2.231, 2);
  });

  it("reports period high and low across the series", () => {
    const stats = statsFromBars(bars);
    expect(stats.periodHigh).toBe(1014.53);
    expect(stats.periodLow).toBe(948);
    expect(stats.barCount).toBe(3);
  });

  it("returns nulls, not zeros, for an empty series", () => {
    const stats = statsFromBars([]);
    expect(stats.periodHigh).toBeNull();
    expect(stats.averageVolume).toBeNull();
  });
});
