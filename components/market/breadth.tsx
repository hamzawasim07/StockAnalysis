import { Card, CardContent } from "@/components/ui/card";
import { formatCompact, formatInt } from "@/lib/format";

/**
 * Market breadth — how many scrips advanced vs declined. A simple, honest summary
 * of the session that doesn't require an index feed (PSX doesn't expose one with a
 * documented shape).
 */
export function BreadthCard({
  advancing,
  declining,
  unchanged,
  totalVolume,
}: {
  advancing: number;
  declining: number;
  unchanged: number;
  totalVolume: number;
}) {
  const total = advancing + declining + unchanged || 1;
  const advancingPercent = (advancing / total) * 100;
  const decliningPercent = (declining / total) * 100;

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">Market breadth</p>
            <p className="tnum text-2xl font-semibold">
              <span className="text-[var(--gain)]">{formatInt(advancing)}</span>
              <span className="text-muted-foreground mx-1.5 text-base">/</span>
              <span className="text-[var(--loss)]">{formatInt(declining)}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">Volume traded</p>
            <p className="tnum text-lg font-semibold">{formatCompact(totalVolume)}</p>
          </div>
        </div>

        <div className="bg-muted flex h-2 w-full overflow-hidden rounded-full">
          <div className="bg-[var(--gain)]" style={{ width: `${advancingPercent}%` }} />
          <div className="bg-[var(--loss)]" style={{ width: `${decliningPercent}%` }} />
        </div>

        <p className="text-muted-foreground text-xs">
          {formatInt(advancing)} advancing · {formatInt(declining)} declining · {formatInt(unchanged)} unchanged
          across {formatInt(total)} scrips.
        </p>
      </CardContent>
    </Card>
  );
}
