import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DeltaText } from "@/components/stock/change";
import { SampleDataBanner } from "@/components/stock/sources-panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getMarketBoard } from "@/lib/psx/market";
import { getSymbols } from "@/lib/psx/symbols";
import { formatCompact, formatNumber } from "@/lib/format";

export const revalidate = 300;

interface PageProps {
  params: Promise<{ sector: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { sector } = await params;
  const name = decodeURIComponent(sector);
  return { title: name, description: `Companies listed on the Pakistan Stock Exchange in the ${name} sector.` };
}

export default async function SectorPage({ params }: PageProps) {
  const { sector } = await params;
  const name = decodeURIComponent(sector);

  const [symbols, board] = await Promise.all([getSymbols(), getMarketBoard()]);
  const members = symbols.data.filter((item) => item.sector === name);
  if (members.length === 0) notFound();

  const boardBySymbol = new Map(board.data.map((row) => [row.symbol, row]));

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <p className="text-muted-foreground text-sm">
          <Link href="/sectors" className="hover:text-foreground underline underline-offset-2">
            Sectors
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
        <p className="text-muted-foreground text-sm">
          {members.length} listed {members.length === 1 ? "company" : "companies"}.
        </p>
      </div>

      <SampleDataBanner notes={board.notes} />

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Company</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Change</TableHead>
              <TableHead className="text-right">Volume</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((item) => {
              const row = boardBySymbol.get(item.symbol);
              return (
                <TableRow key={item.symbol}>
                  <TableCell className="font-mono text-sm font-semibold">
                    <Link href={`/stock/${item.symbol}`} className="hover:text-primary hover:underline">
                      {item.symbol}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-80 truncate">{item.name}</TableCell>
                  <TableCell className="tnum text-right">{formatNumber(row?.current)}</TableCell>
                  <TableCell className="text-right">
                    <DeltaText value={row?.changePercent} />
                  </TableCell>
                  <TableCell className="tnum text-muted-foreground text-right">
                    {formatCompact(row?.volume)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
