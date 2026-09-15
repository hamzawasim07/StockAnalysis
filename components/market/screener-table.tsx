"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";

import { DeltaText } from "@/components/stock/change";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MarketRow } from "@/lib/psx/market";
import { formatCompact, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type SortKey = "symbol" | "current" | "changePercent" | "volume" | "high" | "low";

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "symbol", label: "Symbol", numeric: false },
  { key: "current", label: "Price", numeric: true },
  { key: "changePercent", label: "Change", numeric: true },
  { key: "high", label: "Day high", numeric: true },
  { key: "low", label: "Day low", numeric: true },
  { key: "volume", label: "Volume", numeric: true },
];

const PAGE_SIZE = 50;

/**
 * Whole-board screener. Filtering and sorting run in the browser over the board
 * that was already fetched server-side — a few hundred rows, so no pagination
 * round-trips are needed.
 */
export function ScreenerTable({ rows, sectors }: { rows: MarketRow[]; sectors: string[] }) {
  const [query, setQuery] = React.useState("");
  const [sector, setSector] = React.useState("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("volume");
  const [ascending, setAscending] = React.useState(false);
  const [visible, setVisible] = React.useState(PAGE_SIZE);

  const filtered = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    const result = rows.filter((row) => {
      if (sector !== "all" && row.sector !== sector) return false;
      if (!term) return true;
      return row.symbol.toLowerCase().includes(term) || (row.sector ?? "").toLowerCase().includes(term);
    });

    result.sort((a, b) => {
      if (sortKey === "symbol") {
        return ascending ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol);
      }
      const left = a[sortKey] ?? Number.NEGATIVE_INFINITY;
      const right = b[sortKey] ?? Number.NEGATIVE_INFINITY;
      return ascending ? left - right : right - left;
    });

    return result;
  }, [rows, query, sector, sortKey, ascending]);

  // Any change to the filter or sort starts the list over at the first page.
  const toggleSort = (key: SortKey) => {
    setVisible(PAGE_SIZE);
    if (key === sortKey) {
      setAscending((value) => !value);
    } else {
      setSortKey(key);
      setAscending(key === "symbol");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Filter by symbol or sector…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setVisible(PAGE_SIZE);
          }}
          className="max-w-xs"
        />
        <Select
          value={sector}
          onValueChange={(value) => {
            setSector(value);
            setVisible(PAGE_SIZE);
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All sectors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sectors</SelectItem>
            {sectors.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground ml-auto text-sm">
          {filtered.length} of {rows.length} scrips
        </p>
      </div>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((column) => (
                <TableHead key={column.key} className={cn(column.numeric && "text-right")}>
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className={cn(
                      "hover:text-foreground inline-flex items-center gap-1 uppercase transition-colors",
                      sortKey === column.key && "text-foreground",
                    )}
                  >
                    {column.label}
                    {sortKey === column.key &&
                      (ascending ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />)}
                  </button>
                </TableHead>
              ))}
              <TableHead className="hidden lg:table-cell">Sector</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice(0, visible).map((row) => (
              <TableRow key={row.symbol}>
                <TableCell className="font-mono text-sm font-semibold">
                  <Link href={`/stock/${row.symbol}`} className="hover:text-primary hover:underline">
                    {row.symbol}
                  </Link>
                </TableCell>
                <TableCell className="tnum text-right">{formatNumber(row.current)}</TableCell>
                <TableCell className="text-right">
                  <DeltaText value={row.changePercent} />
                </TableCell>
                <TableCell className="tnum text-right">{formatNumber(row.high)}</TableCell>
                <TableCell className="tnum text-right">{formatNumber(row.low)}</TableCell>
                <TableCell className="tnum text-muted-foreground text-right">{formatCompact(row.volume)}</TableCell>
                <TableCell className="text-muted-foreground hidden max-w-56 truncate text-xs lg:table-cell">
                  {row.sector ?? "—"}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-10 text-center">
                  Nothing matches that filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {visible < filtered.length && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setVisible((value) => value + PAGE_SIZE * 2)}>
            Show more ({filtered.length - visible} remaining)
          </Button>
        </div>
      )}
    </div>
  );
}
