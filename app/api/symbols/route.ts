import { NextResponse } from "next/server";

import { getDirectory, searchDirectory } from "@/lib/data/sources";

/** GET /api/symbols?q=luck&limit=10 — symbol directory / typeahead. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const limit = Math.min(Number(searchParams.get("limit") ?? 12) || 12, 100);

  if (query) {
    return NextResponse.json({ query, results: await searchDirectory(query, limit) });
  }

  const { data, notes } = await getDirectory();
  return NextResponse.json({ count: data.length, results: data, notes });
}
