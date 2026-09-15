import type { Metadata } from "next";

import { ScreenerTable } from "@/components/market/screener-table";
import { SampleDataBanner, SourcesPanel } from "@/components/stock/sources-panel";
import { getMarketBoard } from "@/lib/psx/market";
import { getDirectory } from "@/lib/data/sources";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Screener",
  description: "Sort and filter every scrip listed on the Pakistan Stock Exchange by price, day move and volume.",
};

export default async function ScreenerPage() {
  const [board, symbols] = await Promise.all([getMarketBoard(), getDirectory()]);

  // The board doesn't always carry a sector; backfill it from the symbol directory.
  const sectorBySymbol = new Map(symbols.data.map((item) => [item.symbol, item.sector]));
  const rows = board.data.map((row) => ({
    ...row,
    sector: row.sector ?? sectorBySymbol.get(row.symbol) ?? null,
  }));

  const sectors = [...new Set(rows.map((row) => row.sector).filter((value): value is string => Boolean(value)))].sort();

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Screener</h1>
        <p className="text-muted-foreground text-sm">
          The full market-watch board. Click any column heading to sort, or filter by sector.
        </p>
      </div>

      <SampleDataBanner notes={board.notes} />
      <ScreenerTable rows={rows} sectors={sectors} />
      <SourcesPanel notes={board.notes} />
    </div>
  );
}
