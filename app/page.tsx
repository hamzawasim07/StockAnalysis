import Link from "next/link";
import { ArrowRightIcon, BarChart3Icon, LineChartIcon, WalletIcon } from "lucide-react";

import { BreadthCard } from "@/components/market/breadth";
import { MoversCard } from "@/components/market/movers";
import { SampleDataBanner } from "@/components/stock/sources-panel";
import { SymbolSearch } from "@/components/symbol-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMarketMovers } from "@/lib/psx/market";
import { getSectors } from "@/lib/psx/symbols";

// The board moves during the session; re-render the dashboard every five minutes.
export const revalidate = 300;

const FEATURED = ["OGDC", "LUCK", "HBL", "ENGRO", "PSO", "MEBL", "SYS", "FFC"];

export default async function DashboardPage() {
  const [movers, sectors] = await Promise.all([getMarketMovers(6), getSectors()]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <section className="grid-bg -mx-4 mb-8 rounded-none border-y px-4 py-12 sm:mx-0 sm:rounded-2xl sm:border sm:px-10">
        <div className="max-w-2xl space-y-5">
          <Badge variant="secondary" className="gap-1.5">
            <LineChartIcon className="size-3" />
            Pakistan Stock Exchange
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Every PSX listing, with the financials behind the price.
          </h1>
          <p className="text-muted-foreground text-base text-pretty">
            Historical prices, income statements, balance sheets, cash flows, ratios and payout history — pulled
            from the PSX data portal and khistocks.com, normalised into one view per company.
          </p>
          <div className="max-w-lg">
            <SymbolSearch variant="inline" />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {FEATURED.map((symbol) => (
              <Button key={symbol} asChild variant="outline" size="sm" className="font-mono text-xs">
                <Link href={`/stock/${symbol}`}>{symbol}</Link>
              </Button>
            ))}
          </div>
        </div>
      </section>

      <div className="space-y-6">
        <SampleDataBanner notes={movers.notes} />

        <div className="grid gap-4 lg:grid-cols-3">
          <BreadthCard
            advancing={movers.data.advancing}
            declining={movers.data.declining}
            unchanged={movers.data.unchanged}
            totalVolume={movers.data.totalVolume}
          />
          <FeatureCard
            icon={<BarChart3Icon className="size-4" />}
            title="Screen the whole board"
            description="Sort and filter every listed scrip by price, day move, volume or sector."
            href="/screener"
            cta="Open screener"
          />
          <FeatureCard
            icon={<WalletIcon className="size-4" />}
            title="Browse by sector"
            description={`${sectors.length} sectors across the exchange, from Commercial Banks to Textile Composite.`}
            href="/sectors"
            cta="Browse sectors"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <MoversCard title="Top gainers" description="Largest percentage gains this session." rows={movers.data.gainers} />
          <MoversCard title="Top losers" description="Largest percentage falls this session." rows={movers.data.losers} />
          <MoversCard
            title="Most active"
            description="Highest traded volume this session."
            rows={movers.data.mostActive}
            metric="volume"
          />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sectors</CardTitle>
            <CardDescription>Listed companies grouped by PSX sector classification.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sectors.slice(0, 18).map((item) => (
              <Link
                key={item.sector}
                href={`/sectors/${encodeURIComponent(item.sector)}`}
                className="hover:bg-muted/60 flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-colors"
              >
                <span className="truncate">{item.sector}</span>
                <span className="text-muted-foreground tnum shrink-0 text-xs">{item.count}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  href,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <Card className="justify-between">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="bg-accent text-accent-foreground flex size-7 items-center justify-center rounded-md">
            {icon}
          </span>
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <Button asChild variant="ghost" size="sm" className="px-0 text-sm">
          <Link href={href}>
            {cta}
            <ArrowRightIcon />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
