import { NextResponse } from "next/server";

import { getSymbols, searchSymbols } from "@/lib/psx/symbols";

/** GET /api/symbols?q=luck&limit=10 — symbol directory / typeahead. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const limit = Math.min(Number(searchParams.get("limit") ?? 12) || 12, 100);

  if (query) {
    return NextResponse.json({ query, results: await searchSymbols(query, limit) });
  }

  const { data, notes } = await getSymbols();
  return NextResponse.json({ count: data.length, results: data, notes });
}
