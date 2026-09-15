import { NextResponse } from "next/server";

import { getLiveTick, tickToQuote } from "@/lib/psxterminal/market";
import { errorMessage } from "@/lib/data/http";
import { normalizeSymbol } from "@/lib/utils";

/**
 * Current quote, polled by the browser for live price updates.
 *
 * Dynamic so every poll runs, but the upstream call behind it is cached for five
 * seconds, which coalesces all viewers of a symbol into at most twelve upstream
 * requests a minute — the whole page shares one server IP against PSX Terminal's
 * 100-per-minute limit.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await context.params;
  const symbol = normalizeSymbol(raw);
  if (!symbol) {
    return NextResponse.json({ error: "A symbol is required" }, { status: 400 });
  }

  try {
    const quote = tickToQuote(symbol, await getLiveTick(symbol));
    return NextResponse.json(
      { symbol, quote, source: "psxterminal", fetchedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { symbol, quote: null, source: "psxterminal", error: errorMessage(error) },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
