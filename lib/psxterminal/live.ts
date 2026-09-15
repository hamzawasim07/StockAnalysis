/**
 * Browser-side live quote plumbing. No "server-only" here: this module runs in the
 * page, which is the point — a WebSocket opened by the browser uses the viewer's own
 * connection rather than the one server IP every visitor otherwise shares.
 */

import type { Quote } from "@/lib/data/types";

function numberOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export const PSXTERMINAL_WS = "wss://psxterminal.com/";

/** How often the polling fallback refreshes. */
export const LIVE_POLL_MS = 5_000;

export type LiveStatus = "connecting" | "live" | "polling" | "offline";

interface WelcomeFrame {
  type: "welcome";
}
interface PingFrame {
  type: "ping";
  timestamp?: number;
}
interface SubscribeResponseFrame {
  type: "subscribeResponse";
  status?: string;
  subscriptionKey?: string;
}
interface TickUpdateFrame {
  type: "tickUpdate";
  symbol?: string;
  market?: string;
  tick?: Record<string, number | string | undefined>;
}
interface ErrorFrame {
  type: "error";
  message?: string;
}

export type ServerFrame =
  | WelcomeFrame
  | PingFrame
  | SubscribeResponseFrame
  | TickUpdateFrame
  | ErrorFrame
  | { type: string };

export function parseFrame(raw: string): ServerFrame | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof (parsed as { type?: unknown }).type === "string") {
      return parsed as ServerFrame;
    }
  } catch {
    // A frame we can't read is not worth tearing the connection down for.
  }
  return null;
}

export function subscribeMessage(symbol: string, requestId: string) {
  return JSON.stringify({
    type: "subscribe",
    subscriptionType: "marketData",
    params: { marketType: "REG", symbol },
    requestId,
  });
}

/** The server pings every 30s and expects a pong; a missed pong drops the socket. */
export function pongMessage(timestamp: number | undefined) {
  return JSON.stringify({ type: "pong", timestamp: timestamp ?? Date.now() });
}

/**
 * A tick frame only counts when it names the symbol being watched — one connection
 * can carry several subscriptions, and a market-wide stream carries all of them.
 */
export function tickFrameFor(frame: ServerFrame, symbol: string): Record<string, number> | null {
  if (frame.type !== "tickUpdate") return null;
  const update = frame as TickUpdateFrame;

  const named = (update.symbol ?? (update.tick?.s as string | undefined) ?? "").toUpperCase();
  if (named !== symbol.toUpperCase()) return null;

  const tick = update.tick;
  if (!tick || typeof tick !== "object") return null;

  const numeric: Record<string, number> = {};
  for (const [key, value] of Object.entries(tick)) {
    if (typeof value === "number" && Number.isFinite(value)) numeric[key] = value;
  }
  return Object.keys(numeric).length > 0 ? numeric : null;
}

/** Has anything a viewer would notice actually changed? */
export function quotesDiffer(a: Quote | null, b: Quote | null) {
  if (!a || !b) return a !== b;
  return (
    a.price !== b.price ||
    a.change !== b.change ||
    a.changePercent !== b.changePercent ||
    a.volume !== b.volume
  );
}

/**
 * The WebSocket `tickUpdate` frame uses abbreviated keys for the same quantities the
 * REST tick returns. `pch` is a fraction here too (0.08974 means 8.974%), so it gets
 * the same conversion — reading it raw would show a 9% move as 0.09%.
 */
export interface WsTick {
  s?: string;
  m?: string;
  st?: string;
  /** Current price. */
  c?: number;
  /** Change. */
  ch?: number;
  /** Change as a fraction of the previous close. */
  pch?: number;
  v?: number;
  tr?: number;
  val?: number;
  h?: number;
  l?: number;
  /** Unix milliseconds. */
  t?: number;
}

export function wsTickToQuote(symbol: string, tick: WsTick): Quote {
  const price = numberOrNull(tick.c);
  const change = numberOrNull(tick.ch);

  return {
    symbol,
    price,
    previousClose: price != null && change != null ? price - change : null,
    change,
    changePercent: tick.pch == null ? null : tick.pch * 100,
    open: null,
    dayHigh: numberOrNull(tick.h),
    dayLow: numberOrNull(tick.l),
    volume: numberOrNull(tick.v),
    turnover: numberOrNull(tick.val),
    asOf: tick.t ? new Date(tick.t).toISOString().slice(0, 10) : null,
  };
}
