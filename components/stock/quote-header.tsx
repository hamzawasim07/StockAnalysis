import Link from "next/link";

import { ChangeBadge } from "@/components/stock/change";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { CompanyProfile, PriceStats, Quote } from "@/lib/data/types";
import { formatCompact, formatCompactPKR, formatDate, formatNumber, formatPKR } from "@/lib/format";

/** Range bar showing where the last price sits between the period low and high. */
function RangeBar({ low, high, current }: { low: number | null; high: number | null; current: number | null }) {
  if (low == null || high == null || current == null || high <= low) return null;
  const position = Math.min(100, Math.max(0, ((current - low) / (high - low)) * 100));

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">52-week range</span>
      <div className="bg-muted relative h-1.5 w-full rounded-full">
        <div
          className="bg-primary absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--card)]"
          style={{ left: `${position}%` }}
        />
      </div>
      <div className="text-muted-foreground tnum flex justify-between text-[11px]">
        <span>{formatNumber(low)}</span>
        <span>{formatNumber(high)}</span>
      </div>
    </div>
  );
}

export function QuoteHeader({
  profile,
  quote,
  stats,
}: {
  profile: CompanyProfile;
  quote: Quote;
  stats: PriceStats;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-bold tracking-tight">{profile.symbol}</h1>
            {profile.sector ? (
              <Badge asChild variant="secondary" className="text-xs">
                <Link href={`/sectors/${encodeURIComponent(profile.sector)}`}>{profile.sector}</Link>
              </Badge>
            ) : null}
            {profile.isETF ? <Badge variant="outline">ETF</Badge> : null}
          </div>

          <p className="text-muted-foreground text-sm">{profile.name}</p>

          <div className="flex flex-wrap items-end gap-3">
            <span className="tnum text-4xl font-semibold tracking-tight">{formatPKR(quote.price)}</span>
            <ChangeBadge change={quote.change} changePercent={quote.changePercent} className="mb-1.5" />
          </div>

          <p className="text-muted-foreground text-xs">
            Last close {formatDate(quote.asOf)} · end-of-day figures, not a live feed
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:border-l lg:pl-6">
          <Figure label="Open" value={formatNumber(quote.open)} />
          <Figure label="Prev close" value={formatNumber(quote.previousClose)} />
          <Figure label="Day high" value={formatNumber(quote.dayHigh)} />
          <Figure label="Day low" value={formatNumber(quote.dayLow)} />
          <Figure label="Volume" value={formatCompact(quote.volume)} />
          <Figure label="Market cap" value={formatCompactPKR(profile.marketCap)} />
          <div className="col-span-2">
            <RangeBar low={stats.fiftyTwoWeekLow} high={stats.fiftyTwoWeekHigh} current={quote.price} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{label}</span>
      <span className="tnum text-sm font-semibold">{value}</span>
    </div>
  );
}
