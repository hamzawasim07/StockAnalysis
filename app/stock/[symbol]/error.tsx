"use client";

import { TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function StockError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TriangleAlertIcon className="size-4 text-[var(--warn)]" />
            Could not load this company
          </CardTitle>
          <CardDescription>
            Both data sources are scraped from public web pages, so a page can fail when an upstream site is slow,
            rate-limits the request, or changes its layout.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground bg-muted rounded-md p-3 font-mono text-xs break-words">
            {error.message}
          </p>
          <Button onClick={reset}>Try again</Button>
        </CardContent>
      </Card>
    </div>
  );
}
