import { NextResponse } from "next/server";

import { getKhistocksDividends } from "@/lib/khistocks/dividends";
import { getCompanyPage } from "@/lib/psx/company";
import { normalizeSymbol } from "@/lib/utils";

export const maxDuration = 30;

/** GET /api/stock/LUCK/dividends — khistocks payouts, falling back to the PSX page. */
export async function GET(_request: Request, context: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await context.params;
  const symbol = normalizeSymbol(raw);
  if (!symbol) {
    return NextResponse.json({ error: "A symbol is required" }, { status: 400 });
  }

  const [khistocks, company] = await Promise.all([
    getKhistocksDividends(symbol),
    getCompanyPage(symbol),
  ]);

  const dividends = khistocks.data.length > 0 ? khistocks.data : company.data.dividends;
  return NextResponse.json({
    symbol,
    dividends,
    notes: [...khistocks.notes, ...company.notes],
  });
}
