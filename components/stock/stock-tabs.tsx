"use client";

import * as React from "react";

import {
  BalanceCompositionChart,
  CashFlowChart,
  MarginTrendChart,
  RevenueProfitChart,
} from "@/components/stock/financial-charts";
import { DividendHistory } from "@/components/stock/dividends";
import { SampleChip, SampleNotice } from "@/components/stock/sample-notice";
import { HistoryTable } from "@/components/stock/history-table";
import { PriceChart } from "@/components/stock/price-chart";
import { StatementTable, type LineSpec } from "@/components/stock/statement-table";
import { StatGrid, type StatItem } from "@/components/stock/stat";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  BalanceSheet,
  CashFlow,
  HistoryRange,
  IncomeStatement,
  Ratios,
  StockSnapshot,
} from "@/lib/data/types";
import {
  formatCompact,
  formatCompactPKR,
  formatNumber,
  formatPercent,
  formatSignedPercent,
} from "@/lib/format";

const INCOME_LINES: LineSpec<IncomeStatement>[] = [
  { label: "Revenue / sales", key: "revenue", emphasis: true },
  { label: "Cost of sales", key: "costOfSales", indent: true },
  { label: "Gross profit", key: "grossProfit", emphasis: true },
  { label: "Operating profit", key: "operatingProfit" },
  { label: "Other income", key: "otherIncome", indent: true },
  { label: "Finance cost", key: "financeCost", indent: true },
  { label: "Profit before tax", key: "profitBeforeTax", emphasis: true },
  { label: "Taxation", key: "taxation", indent: true },
  { label: "Profit after tax", key: "netProfit", emphasis: true },
  { label: "EPS (Rs)", key: "eps", format: "perShare" },
];

const BALANCE_LINES: LineSpec<BalanceSheet>[] = [
  { label: "Non-current assets", key: "nonCurrentAssets" },
  { label: "Current assets", key: "currentAssets" },
  { label: "Total assets", key: "totalAssets", emphasis: true },
  { label: "Share capital", key: "shareCapital", indent: true },
  { label: "Reserves", key: "reserves", indent: true },
  { label: "Total equity", key: "totalEquity", emphasis: true },
  { label: "Non-current liabilities", key: "nonCurrentLiabilities" },
  { label: "Current liabilities", key: "currentLiabilities" },
  { label: "Total liabilities", key: "totalLiabilities", emphasis: true },
];

const CASHFLOW_LINES: LineSpec<CashFlow>[] = [
  { label: "Operating activities", key: "operating" },
  { label: "Investing activities", key: "investing" },
  { label: "Financing activities", key: "financing" },
  { label: "Net change in cash", key: "netChange", emphasis: true },
  { label: "Closing cash", key: "closingCash" },
];

const RATIO_LINES: LineSpec<Ratios>[] = [
  { label: "Gross margin", key: "grossMarginPercent", format: "percent" },
  { label: "Operating margin", key: "operatingMarginPercent", format: "percent" },
  { label: "Net margin", key: "netMarginPercent", format: "percent" },
  { label: "Return on equity", key: "returnOnEquityPercent", format: "percent" },
  { label: "Return on assets", key: "returnOnAssetsPercent", format: "percent" },
  { label: "Current ratio", key: "currentRatio", format: "ratio" },
  { label: "Debt to equity", key: "debtToEquity", format: "ratio" },
  { label: "EPS (Rs)", key: "eps", format: "perShare" },
  { label: "Book value / share (Rs)", key: "bookValuePerShare", format: "perShare" },
];

function overviewStats(snapshot: StockSnapshot): StatItem[] {
  const { stats, financials, profile, quote } = snapshot;
  const latestIncome = financials.income.at(-1);
  const previousIncome = financials.income.at(-2);
  const latestRatios = financials.ratios.at(-1);

  const revenueGrowth =
    latestIncome?.revenue != null && previousIncome?.revenue
      ? ((latestIncome.revenue - previousIncome.revenue) / Math.abs(previousIncome.revenue)) * 100
      : null;

  const peRatio =
    quote.price != null && latestIncome?.eps != null && latestIncome.eps !== 0
      ? quote.price / latestIncome.eps
      : null;

  return [
    { label: "Revenue (latest FY)", value: formatCompactPKR(latestIncome?.revenue), hint: latestIncome?.label },
    {
      label: "Revenue growth",
      value: formatSignedPercent(revenueGrowth, 1),
      tone: revenueGrowth == null ? "default" : revenueGrowth >= 0 ? "gain" : "loss",
    },
    { label: "Profit after tax", value: formatCompactPKR(latestIncome?.netProfit), hint: latestIncome?.label },
    { label: "Net margin", value: formatPercent(latestRatios?.netMarginPercent, 1) },
    { label: "EPS", value: latestIncome?.eps != null ? `Rs ${formatNumber(latestIncome.eps)}` : "—" },
    { label: "P/E", value: peRatio != null ? `${formatNumber(peRatio, 1)}x` : "—" },
    { label: "Return on equity", value: formatPercent(latestRatios?.returnOnEquityPercent, 1) },
    { label: "Debt to equity", value: latestRatios?.debtToEquity != null ? `${formatNumber(latestRatios.debtToEquity)}x` : "—" },
    { label: "52-week high", value: formatNumber(stats.fiftyTwoWeekHigh) },
    { label: "52-week low", value: formatNumber(stats.fiftyTwoWeekLow) },
    { label: "Avg daily volume", value: formatCompact(stats.averageVolume) },
    { label: "Shares outstanding", value: formatCompact(profile.listedShares) },
  ];
}

export function StockTabs({ snapshot, range }: { snapshot: StockSnapshot; range: HistoryRange }) {
  const { financials, bars, stats, dividends, profile, quote, provenance } = snapshot;
  const stats12 = React.useMemo(() => overviewStats(snapshot), [snapshot]);
  const unitNote = `Figures in ${financials.currency}. Statements are as reported by the source and converted to absolute rupees.`;

  return (
    <Tabs defaultValue="overview">
      <TabsList className="w-full justify-start overflow-x-auto scrollbar-thin sm:w-auto">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="financials">
          Financials
          <SampleChip source={provenance.financials} />
        </TabsTrigger>
        <TabsTrigger value="ratios">
          Ratios
          <SampleChip source={provenance.financials} />
        </TabsTrigger>
        <TabsTrigger value="dividends">
          Dividends
          <SampleChip source={provenance.dividends} />
        </TabsTrigger>
        <TabsTrigger value="history">
          Price history
          <SampleChip source={provenance.prices} />
        </TabsTrigger>
        <TabsTrigger value="profile">Profile</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-4">
        <PriceChart symbol={profile.symbol} initialBars={bars} initialRange={range} initialStats={stats} />
        <SampleNotice
          source={provenance.financials}
          what="Company financials from khistocks.com"
          symbol={profile.symbol}
        />
        <StatGrid items={stats12} />
        <div className="grid gap-4 lg:grid-cols-2">
          <RevenueProfitChart income={financials.income} />
          <MarginTrendChart ratios={financials.ratios} />
        </div>
      </TabsContent>

      <TabsContent value="financials" className="space-y-4">
        <SampleNotice
          source={provenance.financials}
          what="Company financials from khistocks.com"
          symbol={profile.symbol}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <RevenueProfitChart income={financials.income} />
          <BalanceCompositionChart balance={financials.balance} />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Income statement</CardTitle>
            <CardDescription>{unitNote}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <StatementTable rows={financials.income} lines={INCOME_LINES} showGrowth growthKey="revenue" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Balance sheet</CardTitle>
            <CardDescription>{unitNote}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <StatementTable rows={financials.balance} lines={BALANCE_LINES} />
          </CardContent>
        </Card>

        <CashFlowChart cashFlow={financials.cashFlow} />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cash flow statement</CardTitle>
            <CardDescription>{unitNote}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <StatementTable rows={financials.cashFlow} lines={CASHFLOW_LINES} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="ratios" className="space-y-4">
        <SampleNotice
          source={provenance.financials}
          what="The statements these ratios are derived from"
          symbol={profile.symbol}
        />
        <MarginTrendChart ratios={financials.ratios} />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ratio analysis</CardTitle>
            <CardDescription>
              Derived from the income statement and balance sheet above, so every ratio here is reproducible from
              the reported figures.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <StatementTable rows={financials.ratios} lines={RATIO_LINES} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="dividends" className="space-y-4">
        <SampleNotice
          source={provenance.dividends}
          what="Payout history from khistocks.com and the PSX company page"
          symbol={profile.symbol}
        />
        <DividendHistory dividends={dividends} price={quote.price} />
      </TabsContent>

      <TabsContent value="history" className="space-y-4">
        <SampleNotice source={provenance.prices} what="Price history from the PSX data portal" symbol={profile.symbol} />
        <PriceChart symbol={profile.symbol} initialBars={bars} initialRange={range} initialStats={stats} />
        <HistoryTable bars={bars} />
      </TabsContent>

      <TabsContent value="profile">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Company profile</CardTitle>
            <CardDescription>As published on the PSX data portal.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <ProfileRow label="Symbol" value={profile.symbol} />
            <ProfileRow label="Company" value={profile.name} />
            <ProfileRow label="Sector" value={profile.sector ?? "—"} />
            <ProfileRow label="Shares outstanding" value={formatCompact(profile.listedShares)} />
            <ProfileRow label="Free float" value={formatCompact(profile.freeFloat)} />
            <ProfileRow label="Market capitalisation" value={formatCompactPKR(profile.marketCap)} />
            <ProfileRow label="Chief executive" value={profile.ceo ?? "—"} />
            <ProfileRow label="Website" value={profile.website ?? "—"} />
            <ProfileRow label="Registered address" value={profile.address ?? "—"} className="sm:col-span-2" />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function ProfileRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{label}</dt>
      <dd className="text-sm font-medium break-words">{value}</dd>
    </div>
  );
}
