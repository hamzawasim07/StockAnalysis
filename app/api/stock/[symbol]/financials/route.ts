import { NextResponse } from "next/server";

import { getFinancials } from "@/lib/khistocks/financials";
import { normalizeSymbol } from "@/lib/utils";

export const maxDuration = 30;

/** GET /api/stock/LUCK/financials */
export async function GET(_request: Request, context: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await context.params;
  const symbol = normalizeSymbol(raw);
  if (!symbol) {
    return NextResponse.json({ error: "A symbol is required" }, { status: 400 });
  }

  const { data, notes } = await getFinancials(symbol);
  return NextResponse.json({ symbol, ...data, notes });
}
