"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Dividend } from "@/lib/data/types";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";

const chartConfig = {
  perShare: { label: "Payout / share", color: "var(--chart-2)" },
} satisfies ChartConfig;

const KIND_LABEL: Record<Dividend["kind"], string> = {
  cash: "Cash dividend",
  bonus: "Bonus shares",
  right: "Right shares",
  other: "Other",
};

/** Total cash paid per calendar year, which is how payout history is usually read. */
function byYear(dividends: Dividend[]) {
  const totals = new Map<string, number>();
  for (const dividend of dividends) {
    if (dividend.kind !== "cash" || dividend.perShare == null) continue;
    const year = dividend.announcedOn?.slice(0, 4);
    if (!year) continue;
    totals.set(year, (totals.get(year) ?? 0) + dividend.perShare);
  }
  return [...totals.entries()]
    .map(([label, perShare]) => ({ label, perShare }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function DividendHistory({ dividends, price }: { dividends: Dividend[]; price: number | null }) {
  const yearly = React.useMemo(() => byYear(dividends), [dividends]);

  const trailing = React.useMemo(() => {
    const cutoff = new Date();
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
    const iso = cutoff.toISOString().slice(0, 10);
    return dividends
      .filter((item) => item.kind === "cash" && (item.announcedOn ?? "") >= iso)
      .reduce((sum, item) => sum + (item.perShare ?? 0), 0);
  }, [dividends]);

  const yieldPercent = price && trailing > 0 ? (trailing / price) * 100 : null;

  if (dividends.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payout history</CardTitle>
          <CardDescription>
            No payout records were returned by either source for this scrip. That can mean the company has not
            declared a dividend, or that the upstream payout table could not be read.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cash paid per year</CardTitle>
          <CardDescription>
            {yieldPercent != null
              ? `Trailing 12 months: Rs ${formatNumber(trailing)} per share — a ${formatPercent(yieldPercent, 2)} yield at the current price.`
              : "Rupees per share, summed by announcement year."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {yearly.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">No cash payouts on record.</p>
          ) : (
            <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-full">
              <BarChart data={yearly} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={(value: number) => formatNumber(value, 0)}
                />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => `Rs ${formatNumber(Number(value))}`} />} />
                <Bar dataKey="perShare" fill="var(--color-perShare)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Announcements</CardTitle>
          <CardDescription>Percentages are of the Rs 10 face value, as announced.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Announced</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Per share</TableHead>
                <TableHead>Book closure</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dividends.slice(0, 40).map((dividend, index) => (
                <TableRow key={`${dividend.announcedOn}-${index}`}>
                  <TableCell className="tnum">{formatDate(dividend.announcedOn)}</TableCell>
                  <TableCell className="text-muted-foreground">{dividend.period ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={dividend.kind === "cash" ? "muted" : "secondary"} className="text-[10px]">
                      {KIND_LABEL[dividend.kind]}
                    </Badge>
                  </TableCell>
                  <TableCell className="tnum text-right">{formatPercent(dividend.percent, 1)}</TableCell>
                  <TableCell className="tnum text-right">
                    {dividend.perShare != null ? `Rs ${formatNumber(dividend.perShare)}` : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground tnum text-xs">
                    {dividend.bookClosureFrom
                      ? `${formatDate(dividend.bookClosureFrom)} – ${formatDate(dividend.bookClosureTo)}`
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
