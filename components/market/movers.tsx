import Link from "next/link";

import { DeltaText } from "@/components/stock/change";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MarketRow } from "@/lib/psx/market";
import { formatCompact, formatNumber } from "@/lib/format";

/** Compact leaderboard used for gainers / losers / most active. */
export function MoversCard({
  title,
  description,
  rows,
  metric = "change",
}: {
  title: string;
  description: string;
  rows: MarketRow[];
  metric?: "change" | "volume";
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">No data.</p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.symbol}>
                <Link
                  href={`/stock/${row.symbol}`}
                  className="hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors"
                >
                  <span className="tnum w-16 shrink-0 font-mono text-sm font-semibold">{row.symbol}</span>
                  <span className="text-muted-foreground hidden flex-1 truncate text-xs sm:inline">
                    {row.sector ?? ""}
                  </span>
                  <span className="tnum ml-auto text-sm">{formatNumber(row.current)}</span>
                  <span className="w-20 text-right">
                    {metric === "volume" ? (
                      <span className="text-muted-foreground tnum text-sm">{formatCompact(row.volume)}</span>
                    ) : (
                      <DeltaText value={row.changePercent} className="text-sm" />
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
