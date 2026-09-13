"use client";

import * as React from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PeriodRef } from "@/lib/data/types";
import {
  directionTextClass,
  formatCompactPKR,
  formatNumber,
  formatPercent,
  formatSignedPercent,
  directionOf,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export type LineFormat = "currency" | "percent" | "ratio" | "perShare";

export interface LineSpec<T> {
  label: string;
  key: keyof T & string;
  format?: LineFormat;
  /** Renders bold with a top rule — used for subtotals like Gross profit. */
  emphasis?: boolean;
  indent?: boolean;
}

function formatValue(value: number | null | undefined, format: LineFormat = "currency") {
  if (value == null || !Number.isFinite(value)) return "—";
  switch (format) {
    case "percent":
      return formatPercent(value);
    case "ratio":
      return `${formatNumber(value, 2)}x`;
    case "perShare":
      return formatNumber(value, 2);
    default:
      return formatCompactPKR(value);
  }
}

/**
 * Statement layout used across the financials tabs: line items down the left,
 * reporting periods across the top, newest first (the order PSX filings and
 * khistocks both use). Optionally appends a year-on-year growth column.
 */
export function StatementTable<T extends PeriodRef>({
  rows,
  lines,
  showGrowth = false,
  growthKey,
  caption,
}: {
  rows: T[];
  lines: LineSpec<T>[];
  showGrowth?: boolean;
  growthKey?: keyof T & string;
  caption?: string;
}) {
  // Newest first for display; the incoming array is oldest-first for charts.
  const periods = React.useMemo(() => [...rows].reverse(), [rows]);

  if (periods.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No statement data available for this company.
      </p>
    );
  }

  const growthFor = (line: LineSpec<T>) => {
    if (!showGrowth || (growthKey && line.key !== growthKey)) return null;
    const latest = periods[0]?.[line.key] as number | null | undefined;
    const previous = periods[1]?.[line.key] as number | null | undefined;
    if (latest == null || previous == null || previous === 0) return null;
    return ((latest - previous) / Math.abs(previous)) * 100;
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="bg-card sticky left-0 z-10 min-w-48">Line item</TableHead>
          {periods.map((period) => (
            <TableHead key={period.label} className="text-right">
              {period.label}
            </TableHead>
          ))}
          {showGrowth && <TableHead className="text-right">YoY</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => {
          const growth = growthFor(line);
          return (
            <TableRow key={line.key} className={cn(line.emphasis && "bg-muted/30 font-semibold")}>
              <TableCell
                className={cn(
                  "bg-card sticky left-0 z-10 font-medium",
                  line.indent && "pl-6 font-normal",
                  line.emphasis && "font-semibold",
                )}
              >
                {line.label}
              </TableCell>
              {periods.map((period) => {
                const value = period[line.key] as number | null | undefined;
                return (
                  <TableCell
                    key={`${line.key}-${period.label}`}
                    className={cn("tnum text-right", value != null && value < 0 && "text-[var(--loss)]")}
                  >
                    {formatValue(value, line.format)}
                  </TableCell>
                );
              })}
              {showGrowth && (
                <TableCell className={cn("tnum text-right", growth != null && directionTextClass[directionOf(growth)])}>
                  {growth != null ? formatSignedPercent(growth, 1) : "—"}
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
      {caption ? <caption className="text-muted-foreground mt-3 text-left text-xs">{caption}</caption> : null}
    </Table>
  );
}
