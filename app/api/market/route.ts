import { NextResponse } from "next/server";

import { getMarketBoard, getMarketMovers } from "@/lib/psx/market";

export const maxDuration = 30;

/** GET /api/market?view=movers|board */
export async function GET(request: Request) {
  const view = new URL(request.url).searchParams.get("view") ?? "movers";

  if (view === "board") {
    const { data, notes } = await getMarketBoard();
    return NextResponse.json({ count: data.length, rows: data, notes });
  }

  const { data, notes } = await getMarketMovers();
  return NextResponse.json({ ...data, notes });
}
