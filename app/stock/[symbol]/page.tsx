import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { QuoteHeader } from "@/components/stock/quote-header";
import { SampleDataBanner, SourcesPanel } from "@/components/stock/sources-panel";
import { StockTabs } from "@/components/stock/stock-tabs";
import { getStockSnapshot } from "@/lib/data/snapshot";
import { isHistoryRange, type HistoryRange } from "@/lib/data/types";
import { normalizeSymbol } from "@/lib/utils";

export const revalidate = 1800;

interface PageProps {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ range?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { symbol } = await params;
  const clean = normalizeSymbol(symbol);
  return {
    title: `${clean} — price, financials & payouts`,
    description: `Historical prices, income statement, balance sheet, cash flow, ratios and dividend history for ${clean} on the Pakistan Stock Exchange.`,
  };
}

export default async function StockPage({ params, searchParams }: PageProps) {
  const [{ symbol: raw }, query] = await Promise.all([params, searchParams]);
  const symbol = normalizeSymbol(raw);
  if (!symbol) notFound();

  const range: HistoryRange = isHistoryRange(query.range ?? "") ? (query.range as HistoryRange) : "1Y";
  const snapshot = await getStockSnapshot(symbol, range);

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 sm:px-6">
      <SampleDataBanner notes={snapshot.notes} symbol={symbol} />
      <QuoteHeader
        profile={snapshot.profile}
        quote={snapshot.quote}
        stats={snapshot.stats}
        priceSource={snapshot.provenance.prices}
      />
      <StockTabs snapshot={snapshot} range={range} />
      <SourcesPanel notes={snapshot.notes} />
    </div>
  );
}
