import { describe, expect, it } from "vitest";

import { parseFrame, pongMessage, quotesDiffer, subscribeMessage, tickFrameFor } from "@/lib/psxterminal/live";
import { wsTickToQuote } from "@/lib/psxterminal/market";
import type { Quote } from "@/lib/data/types";

/** The tickUpdate frame from the API documentation. */
const TICK_FRAME = {
  type: "tickUpdate",
  symbol: "AIRLINK",
  market: "REG",
  tick: {
    s: "AIRLINK",
    m: "REG",
    st: "OPN",
    c: 143.05,
    ch: 11.78,
    pch: 0.08974,
    v: 1279779,
    tr: 2944,
    val: 181562342.7,
    h: 144,
    l: 137.5,
    bp: 0,
    ap: 0,
    bv: 0,
    av: 0,
    t: 1750762129000,
  },
};

describe("websocket frames", () => {
  it("parses a frame and ignores malformed input", () => {
    expect(parseFrame(JSON.stringify({ type: "welcome" }))?.type).toBe("welcome");
    expect(parseFrame("not json")).toBeNull();
    // A payload without a type is not a frame we can act on.
    expect(parseFrame(JSON.stringify({ hello: 1 }))).toBeNull();
  });

  it("builds the documented subscribe message", () => {
    const message = JSON.parse(subscribeMessage("HUBC", "req-001"));
    expect(message).toEqual({
      type: "subscribe",
      subscriptionType: "marketData",
      params: { marketType: "REG", symbol: "HUBC" },
      requestId: "req-001",
    });
  });

  it("echoes the ping timestamp in the pong", () => {
    // The server pings every 30s and drops sockets that don't answer.
    expect(JSON.parse(pongMessage(1750762129000))).toEqual({ type: "pong", timestamp: 1750762129000 });
    expect(JSON.parse(pongMessage(undefined)).type).toBe("pong");
  });

  it("accepts a tick for the watched symbol", () => {
    expect(tickFrameFor(TICK_FRAME, "AIRLINK")).toMatchObject({ c: 143.05, ch: 11.78 });
    expect(tickFrameFor(TICK_FRAME, "airlink")).not.toBeNull();
  });

  it("ignores ticks for other symbols on the same connection", () => {
    // One socket can carry a market-wide stream; only this symbol's ticks apply.
    expect(tickFrameFor(TICK_FRAME, "HUBC")).toBeNull();
  });

  it("ignores frames that aren't tick updates", () => {
    expect(tickFrameFor({ type: "welcome" }, "AIRLINK")).toBeNull();
    expect(tickFrameFor({ type: "tickUpdate", symbol: "AIRLINK" }, "AIRLINK")).toBeNull();
  });
});

describe("websocket tick mapping", () => {
  it("converts the fractional change to a percentage", () => {
    // pch is a fraction here, as in the REST tick: 0.08974 means 8.974%.
    const quote = wsTickToQuote("AIRLINK", tickFrameFor(TICK_FRAME, "AIRLINK")!);
    expect(quote.changePercent).toBeCloseTo(8.974, 3);
    expect(quote.price).toBe(143.05);
    expect(quote.change).toBe(11.78);
  });

  it("derives the previous close and reads the day range", () => {
    const quote = wsTickToQuote("AIRLINK", tickFrameFor(TICK_FRAME, "AIRLINK")!);
    expect(quote.previousClose).toBeCloseTo(131.27, 2);
    expect(quote.dayHigh).toBe(144);
    expect(quote.dayLow).toBe(137.5);
  });

  it("dates from the millisecond timestamp", () => {
    expect(wsTickToQuote("AIRLINK", { t: 1750762129000, c: 143.05 }).asOf).toBe("2025-06-24");
  });
});

describe("change detection", () => {
  const base: Quote = {
    symbol: "LUCK",
    price: 100,
    previousClose: 99,
    change: 1,
    changePercent: 1.01,
    open: null,
    dayHigh: 101,
    dayLow: 98,
    volume: 500,
    asOf: "2026-09-15",
  };

  it("ignores updates that change nothing a viewer would see", () => {
    // Without this every poll would re-render and reset the "updated" timestamp.
    expect(quotesDiffer(base, { ...base })).toBe(false);
    expect(quotesDiffer(base, { ...base, asOf: "2026-09-16" })).toBe(false);
  });

  it("notices price, change and volume moves", () => {
    expect(quotesDiffer(base, { ...base, price: 100.5 })).toBe(true);
    expect(quotesDiffer(base, { ...base, changePercent: 1.5 })).toBe(true);
    expect(quotesDiffer(base, { ...base, volume: 600 })).toBe(true);
  });
});
