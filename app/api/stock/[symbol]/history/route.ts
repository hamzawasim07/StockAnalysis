import { NextResponse } from "next/server";

import { isHistoryRange } from "@/lib/data/types";
import { getPrices } from "@/lib/data/sources";
import { statsFromBars } from "@/lib/psx/stats";
import { normalizeSymbol } from "@/lib/utils";

// A 5Y pull is 60 sequential-ish month scrapes against PSX; give it room.
export const maxDuration = 60;

/** GET /api/stock/LUCK/history?range=1Y */
export async function GET(request: Request, context: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await context.params;
  const symbol = normalizeSymbol(raw);
  if (!symbol) {
    return NextResponse.json({ error: "A symbol is required" }, { status: 400 });
  }

  const rangeParam = new URL(request.url).searchParams.get("range") ?? "1Y";
  if (!isHistoryRange(rangeParam)) {
    return NextResponse.json({ error: `Unsupported range "${rangeParam}"` }, { status: 400 });
  }

  const { data, notes } = await getPrices(symbol, rangeParam);
  return NextResponse.json({
    symbol,
    range: rangeParam,
    bars: data,
    stats: statsFromBars(data),
    notes,
  });
}
