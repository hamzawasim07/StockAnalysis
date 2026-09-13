import { describe, expect, it } from "vitest";

import { parseEodPayload, parseHistoricalHtml } from "@/lib/psx/historical";
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

describe("PSX EOD timeseries", () => {
  it("reads the positional row form", () => {
    const bars = parseEodPayload({
      status: 1,
      data: [
        [1757548800, 992.15, 395500],
        [1757462400, 970.5, 288140],
      ],
    });
    expect(bars).toHaveLength(2);
    expect(bars.at(-1)).toMatchObject({ close: 992.15, volume: 395500 });
    // No OHLC on this endpoint, so the close stands in for all four.
    expect(bars.at(-1)!.open).toBe(bars.at(-1)!.close);
  });

  it("reads an object row form and ISO dates", () => {
    const bars = parseEodPayload({
      data: [{ date: "2026-09-11", close: 992.15, volume: 395500 }],
    });
    expect(bars[0]).toMatchObject({ date: "2026-09-11", close: 992.15 });
  });

  it("accepts millisecond timestamps", () => {
    // Same instant as 1757548800 seconds, so both forms must agree.
    const seconds = parseEodPayload({ data: [[1757548800, 100, 5]] });
    const millis = parseEodPayload({ data: [[1757548800000, 100, 5]] });
    expect(millis[0].date).toBe(seconds[0].date);
    expect(millis[0].date).toBe("2025-09-11");
  });

  it("drops unusable rows instead of emitting NaN bars", () => {
    const bars = parseEodPayload({
      data: [["not-a-date", "not-a-price"], null, [1757548800, 992.15, 395500]],
    });
    expect(bars).toHaveLength(1);
  });

  it("returns an empty series when the payload shape changes", () => {
    expect(parseEodPayload({} as never)).toEqual([]);
    expect(parseEodPayload({ data: undefined })).toEqual([]);
  });
});
