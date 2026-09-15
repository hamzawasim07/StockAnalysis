"use client";

import * as React from "react";

import type { Quote } from "@/lib/data/types";
import {
  LIVE_POLL_MS,
  parseFrame,
  pongMessage,
  PSXTERMINAL_WS,
  quotesDiffer,
  subscribeMessage,
  tickFrameFor,
  wsTickToQuote,
  type LiveStatus,
} from "@/lib/psxterminal/live";

/**
 * Keeps a quote current.
 *
 * The WebSocket is preferred: it pushes as trades happen and, because the browser
 * opens it, it uses the viewer's own connection instead of the single server IP that
 * every visitor shares against the API's rate limit. Polling every five seconds is
 * the fallback for when the socket can't be established — behind a proxy that blocks
 * it, or if the server rejects the origin.
 *
 * Either way this runs client-side, so a viewer whose network can reach the API gets
 * real prices even when the server rendering the page could not.
 */
export function useLiveQuote(symbol: string, initial: Quote) {
  /**
   * One state object rather than three: the quote, when it last actually changed,
   * and the server snapshot it was seeded from. Keeping them together means an
   * update can set the price and its timestamp in a single transition, and lets the
   * seed be compared without a ref (which cannot be written during render).
   */
  const [state, setState] = React.useState(() => ({
    quote: initial,
    updatedAt: null as number | null,
    seed: initial,
  }));
  const [status, setStatus] = React.useState<LiveStatus>("connecting");

  // A fresh server snapshot (navigation, or a new range) is adopted — but only
  // before live data starts arriving, which is newer than any render.
  if (state.seed !== initial && state.updatedAt === null) {
    setState({ quote: initial, updatedAt: null, seed: initial });
  }

  const apply = React.useCallback((next: Quote) => {
    if (next.price == null) return;
    setState((current) =>
      quotesDiffer(current.quote, next) ? { ...current, quote: next, updatedAt: Date.now() } : current,
    );
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const response = await fetch(`/api/stock/${symbol}/quote`, { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const payload = (await response.json()) as { quote: Quote | null };
        if (cancelled || !payload.quote) return;
        apply(payload.quote);
        setStatus((current) => (current === "live" ? current : "polling"));
      } catch {
        if (!cancelled) setStatus((current) => (current === "live" ? current : "offline"));
      }
    };

    const startPolling = () => {
      if (pollTimer || cancelled) return;
      void poll();
      pollTimer = setInterval(poll, LIVE_POLL_MS);
    };

    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    };

    try {
      socket = new WebSocket(PSXTERMINAL_WS);
    } catch {
      socket = null;
      startPolling();
    }

    if (socket) {
      // Don't wait indefinitely on a socket that never opens.
      const openTimeout = setTimeout(() => {
        if (socket?.readyState !== WebSocket.OPEN) startPolling();
      }, 4_000);

      socket.onopen = () => {
        socket?.send(subscribeMessage(symbol, `live-${symbol}`));
      };

      socket.onmessage = (event) => {
        const frame = parseFrame(String(event.data));
        if (!frame || cancelled) return;

        if (frame.type === "ping") {
          socket?.send(pongMessage((frame as { timestamp?: number }).timestamp));
          return;
        }

        if (frame.type === "subscribeResponse") {
          const ok = (frame as { status?: string }).status === "success";
          if (ok) {
            clearTimeout(openTimeout);
            stopPolling();
            setStatus("live");
          } else {
            startPolling();
          }
          return;
        }

        const tick = tickFrameFor(frame, symbol);
        if (tick) apply(wsTickToQuote(symbol, tick));
      };

      // A socket that closes or errors falls back rather than leaving prices frozen.
      socket.onerror = () => startPolling();
      socket.onclose = () => {
        if (!cancelled) {
          setStatus((current) => (current === "live" ? "polling" : current));
          startPolling();
        }
      };
    }

    return () => {
      cancelled = true;
      stopPolling();
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [symbol, apply]);

  return { quote: state.quote, status, updatedAt: state.updatedAt };
}
