"use client";

import * as React from "react";

import { DeltaText } from "@/components/stock/change";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Bar } from "@/lib/data/types";
import { formatCompact, formatDate, formatInt, formatNumber } from "@/lib/format";

const PAGE_SIZE = 25;

/** Daily OHLCV, newest first, with the day-on-day close change computed here. */
export function HistoryTable({ bars }: { bars: Bar[] }) {
  const [visible, setVisible] = React.useState(PAGE_SIZE);

  const rows = React.useMemo(() => {
    const ordered = [...bars].reverse();
    return ordered.map((bar, index) => {
      const previous = ordered[index + 1];
      const change = previous ? bar.close - previous.close : null;
      return {
        ...bar,
        change,
        changePercent: previous && previous.close ? ((bar.close - previous.close) / previous.close) * 100 : null,
      };
    });
  }, [bars]);

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily history</CardTitle>
          <CardDescription>No bars were returned for this range.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Daily history</CardTitle>
        <CardDescription>
          {rows.length} trading {rows.length === 1 ? "session" : "sessions"} in the selected range, newest first.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Open</TableHead>
              <TableHead className="text-right">High</TableHead>
              <TableHead className="text-right">Low</TableHead>
              <TableHead className="text-right">Close</TableHead>
              <TableHead className="text-right">Change</TableHead>
              <TableHead className="text-right">Volume</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, visible).map((row) => (
              <TableRow key={row.date}>
                <TableCell className="tnum font-medium">{formatDate(row.date)}</TableCell>
                <TableCell className="tnum text-right">{formatNumber(row.open)}</TableCell>
                <TableCell className="tnum text-right">{formatNumber(row.high)}</TableCell>
                <TableCell className="tnum text-right">{formatNumber(row.low)}</TableCell>
                <TableCell className="tnum text-right font-medium">{formatNumber(row.close)}</TableCell>
                <TableCell className="text-right">
                  <DeltaText value={row.changePercent} />
                </TableCell>
                <TableCell className="tnum text-muted-foreground text-right" title={formatInt(row.volume)}>
                  {formatCompact(row.volume)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {visible < rows.length && (
          <div className="flex justify-center pt-4">
            <Button variant="outline" size="sm" onClick={() => setVisible((value) => value + PAGE_SIZE * 2)}>
              Show more ({rows.length - visible} remaining)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
