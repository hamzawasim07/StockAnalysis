"use client";

import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { BalanceSheet, IncomeStatement, Ratios } from "@/lib/data/types";
import { formatAxisCompact, formatCompactPKR, formatPercent } from "@/lib/format";

const revenueConfig = {
  revenue: { label: "Revenue", color: "var(--chart-1)" },
  netProfit: { label: "Net profit", color: "var(--chart-2)" },
  netMargin: { label: "Net margin", color: "var(--chart-3)" },
} satisfies ChartConfig;

/** Revenue and net profit as bars with the net margin overlaid as a line. */
export function RevenueProfitChart({ income }: { income: IncomeStatement[] }) {
  const data = income
    .filter((row) => row.revenue != null || row.netProfit != null)
    .map((row) => ({
      label: row.label,
      revenue: row.revenue,
      netProfit: row.netProfit,
      netMargin:
        row.revenue && row.netProfit != null && row.revenue !== 0
          ? (row.netProfit / row.revenue) * 100
          : null,
    }));

  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Revenue &amp; profitability</CardTitle>
        <CardDescription>Top line against net profit, with net margin on the right axis.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={revenueConfig} className="aspect-auto h-[300px] w-full">
          <ComposedChart data={data} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis
              yAxisId="left"
              tickLine={false}
              axisLine={false}
              width={62}
              tickFormatter={(value: number) => formatAxisCompact(value)}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={(value: number) => `${Math.round(value)}%`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) =>
                    name.toLowerCase().includes("margin")
                      ? formatPercent(Number(value), 1)
                      : formatCompactPKR(Number(value))
                  }
                />
              }
            />
            <Legend content={<ChartLegendContent />} />
            <Bar yAxisId="left" dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar yAxisId="left" dataKey="netProfit" fill="var(--color-netProfit)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Line
              yAxisId="right"
              dataKey="netMargin"
              type="monotone"
              stroke="var(--color-netMargin)"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

const marginConfig = {
  grossMarginPercent: { label: "Gross", color: "var(--chart-1)" },
  operatingMarginPercent: { label: "Operating", color: "var(--chart-2)" },
  netMarginPercent: { label: "Net", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function MarginTrendChart({ ratios }: { ratios: Ratios[] }) {
  const data = ratios.filter((row) => row.netMarginPercent != null || row.grossMarginPercent != null);
  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Margin trend</CardTitle>
        <CardDescription>Gross, operating and net margin by reporting period.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={marginConfig} className="aspect-auto h-[260px] w-full">
          <ComposedChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={(value: number) => `${Math.round(value)}%`}
            />
            <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatPercent(Number(value), 1)} />} />
            <Legend content={<ChartLegendContent />} />
            {(Object.keys(marginConfig) as (keyof typeof marginConfig)[]).map((key) => (
              <Line
                key={key}
                dataKey={key}
                type="monotone"
                stroke={`var(--color-${key})`}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

const balanceConfig = {
  totalEquity: { label: "Equity", color: "var(--chart-2)" },
  totalLiabilities: { label: "Liabilities", color: "var(--chart-5)" },
} satisfies ChartConfig;

/** Stacked equity vs liabilities — the two halves add up to total assets. */
export function BalanceCompositionChart({ balance }: { balance: BalanceSheet[] }) {
  const data = balance.filter((row) => row.totalEquity != null || row.totalLiabilities != null);
  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Capital structure</CardTitle>
        <CardDescription>Equity against total liabilities — stacked, they make up total assets.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={balanceConfig} className="aspect-auto h-[260px] w-full">
          <BarChart data={data} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={62} tickFormatter={(value: number) => formatAxisCompact(value)} />
            <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCompactPKR(Number(value))} />} />
            <Legend content={<ChartLegendContent />} />
            <Bar dataKey="totalEquity" stackId="capital" fill="var(--color-totalEquity)" isAnimationActive={false} />
            <Bar
              dataKey="totalLiabilities"
              stackId="capital"
              fill="var(--color-totalLiabilities)"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

const cashConfig = {
  operating: { label: "Operating", color: "var(--chart-2)" },
  investing: { label: "Investing", color: "var(--chart-4)" },
  financing: { label: "Financing", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function CashFlowChart({
  cashFlow,
}: {
  cashFlow: { label: string; operating: number | null; investing: number | null; financing: number | null }[];
}) {
  const data = cashFlow.filter((row) => row.operating != null || row.investing != null || row.financing != null);
  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Cash flow by activity</CardTitle>
        <CardDescription>Operating, investing and financing flows per period.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={cashConfig} className="aspect-auto h-[260px] w-full">
          <BarChart data={data} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={62} tickFormatter={(value: number) => formatAxisCompact(value)} />
            <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCompactPKR(Number(value))} />} />
            <Legend content={<ChartLegendContent />} />
            <Bar dataKey="operating" fill="var(--color-operating)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="investing" fill="var(--color-investing)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="financing" fill="var(--color-financing)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
