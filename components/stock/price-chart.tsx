"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import { ChangeBadge } from "@/components/stock/change";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Bar as PriceBar, HistoryRange, PriceStats, SourceNote } from "@/lib/data/types";
import { HISTORY_RANGES } from "@/lib/data/types";
import { formatAxisCompact, formatAxisDate, formatCompact, formatDate, formatNumber, formatPKR } from "@/lib/format";
import { downsample, movingAverage } from "@/lib/psx/stats";
import { cn } from "@/lib/utils";

const chartConfig = {
  close: { label: "Close", color: "var(--chart-1)" },
  ma30: { label: "30-day avg", color: "var(--chart-3)" },
  ma90: { label: "90-day avg", color: "var(--chart-4)" },
  volume: { label: "Volume", color: "var(--chart-2)" },
} satisfies ChartConfig;

interface ChartPoint {
  date: string;
  close: number;
  volume: number;
  ma30: number | null;
  ma90: number | null;
}

function toPoints(bars: PriceBar[]): ChartPoint[] {
  const sampled = downsample(bars);
  const ma30 = movingAverage(sampled, 30);
  const ma90 = movingAverage(sampled, 90);
  return sampled.map((bar, index) => ({
    date: bar.date,
    close: bar.close,
    volume: bar.volume,
    ma30: ma30[index],
    ma90: ma90[index],
  }));
}

export function PriceChart({
  symbol,
  initialBars,
  initialRange,
  initialStats,
}: {
  symbol: string;
  initialBars: PriceBar[];
  initialRange: HistoryRange;
  initialStats: PriceStats;
}) {
  const [range, setRange] = React.useState<HistoryRange>(initialRange);
  const [bars, setBars] = React.useState(initialBars);
  const [stats, setStats] = React.useState(initialStats);
  const [loading, setLoading] = React.useState(false);
  const [showAverages, setShowAverages] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Ranges already fetched this session, so flipping back and forth is instant.
  const cache = React.useRef(new Map<HistoryRange, { bars: PriceBar[]; stats: PriceStats }>());
  React.useEffect(() => {
    cache.current.set(initialRange, { bars: initialBars, stats: initialStats });
  }, [initialRange, initialBars, initialStats]);

  const selectRange = React.useCallback(
    async (next: HistoryRange) => {
      setRange(next);
      setError(null);

      const cached = cache.current.get(next);
      if (cached) {
        setBars(cached.bars);
        setStats(cached.stats);
        return;
      }

      setLoading(true);
      try {
        const response = await fetch(`/api/stock/${symbol}/history?range=${next}`);
        if (!response.ok) throw new Error(`History request failed (${response.status})`);
        const payload = (await response.json()) as {
          bars: PriceBar[];
          stats: PriceStats;
          notes?: SourceNote[];
        };
        cache.current.set(next, { bars: payload.bars, stats: payload.stats });
        setBars(payload.bars);
        setStats(payload.stats);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load that range");
      } finally {
        setLoading(false);
      }
    },
    [symbol],
  );

  const points = React.useMemo(() => toPoints(bars), [bars]);
  const longRange = range === "3Y" || range === "5Y" || range === "MAX";
  const first = points[0]?.close ?? null;
  const last = points[points.length - 1]?.close ?? null;
  const periodChange = first != null && last != null ? last - first : null;

  // Pad the price axis so the series doesn't sit flush against the frame.
  const domain = React.useMemo<[number, number]>(() => {
    if (points.length === 0) return [0, 1];
    const values = points.map((point) => point.close);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min || max * 0.1) * 0.12;
    return [Math.max(0, min - pad), max + pad];
  }, [points]);

  return (
    <Card>
      <CardHeader className="gap-3 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <CardTitle className="text-base">Price history</CardTitle>
            {periodChange != null && (
              <ChangeBadge change={periodChange} changePercent={stats.periodReturnPercent} />
            )}
          </div>

          <div className="flex max-w-full flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className={cn("text-xs", showAverages && "text-foreground bg-accent")}
              onClick={() => setShowAverages((value) => !value)}
            >
              Moving averages
            </Button>
            <ToggleGroup
              type="single"
              className="max-w-full overflow-x-auto scrollbar-thin"
              value={range}
              onValueChange={(value) => value && selectRange(value as HistoryRange)}
            >
              {HISTORY_RANGES.map((option) => (
                <ToggleGroupItem key={option} value={option} aria-label={`Show ${option}`}>
                  {option}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {error ? (
          <p className="text-[var(--loss)] py-10 text-center text-sm">{error}</p>
        ) : loading ? (
          <div className="space-y-3">
            <Skeleton className="h-[280px] w-full" />
            <Skeleton className="h-[70px] w-full" />
          </div>
        ) : points.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            No price history available for {symbol} over this range.
          </p>
        ) : (
          <>
            <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
              <AreaChart data={points} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="fill-close" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-close)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--color-close)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={44}
                  tickMargin={8}
                  tickFormatter={(value: string) => formatAxisDate(value, longRange)}
                />
                <YAxis
                  domain={domain}
                  tickLine={false}
                  axisLine={false}
                  width={58}
                  tickMargin={4}
                  tickFormatter={(value: number) => formatNumber(value, value >= 100 ? 0 : 2)}
                />
                {first != null && (
                  <ReferenceLine y={first} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeOpacity={0.5} />
                )}
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) => formatDate(String(value))}
                      formatter={(value, name) =>
                        name.toLowerCase().includes("volume")
                          ? formatCompact(Number(value))
                          : formatPKR(Number(value))
                      }
                    />
                  }
                />
                <Area
                  dataKey="close"
                  type="monotone"
                  stroke="var(--color-close)"
                  strokeWidth={2}
                  fill="url(#fill-close)"
                  dot={false}
                  isAnimationActive={false}
                />
                {showAverages && (
                  <>
                    <Line
                      dataKey="ma30"
                      type="monotone"
                      stroke="var(--color-ma30)"
                      strokeWidth={1.5}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      dataKey="ma90"
                      type="monotone"
                      stroke="var(--color-ma90)"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                  </>
                )}
              </AreaChart>
            </ChartContainer>

            <ChartContainer config={chartConfig} className="mt-1 aspect-auto h-[72px] w-full">
              <BarChart data={points} margin={{ left: 4, right: 8, top: 4, bottom: 0 }}>
                <XAxis dataKey="date" hide />
                <YAxis
                  dataKey="volume"
                  tickLine={false}
                  axisLine={false}
                  width={58}
                  tickCount={3}
                  tickFormatter={(value: number) => formatAxisCompact(value)}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      hideIndicator
                      labelFormatter={(value) => formatDate(String(value))}
                      formatter={(value) => formatCompact(Number(value))}
                    />
                  }
                />
                <Bar dataKey="volume" fill="var(--color-volume)" opacity={0.55} isAnimationActive={false} />
              </BarChart>
            </ChartContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
}
