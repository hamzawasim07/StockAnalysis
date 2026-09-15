import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { getSectorCounts } from "@/lib/data/sources";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Sectors",
  description: "Companies listed on the Pakistan Stock Exchange, grouped by sector.",
};

export default async function SectorsPage() {
  const sectors = await getSectorCounts();

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Sectors</h1>
        <p className="text-muted-foreground text-sm">
          {sectors.length} sectors in the PSX classification, ordered by number of listings.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sectors.map((item) => (
          <Link key={item.sector} href={`/sectors/${encodeURIComponent(item.sector)}`}>
            <Card className="hover:border-ring/60 h-full transition-colors">
              <CardContent className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{item.sector}</span>
                <span className="text-muted-foreground tnum shrink-0 text-xs">
                  {item.count} {item.count === 1 ? "listing" : "listings"}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
