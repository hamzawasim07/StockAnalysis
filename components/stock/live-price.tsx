"use client";

import * as React from "react";

import { ChangeBadge } from "@/components/stock/change";
import { SampleChip } from "@/components/stock/sample-notice";
import { useLiveQuote } from "@/components/stock/use-live-quote";
import type { Quote, SourceId } from "@/lib/data/types";
import { formatCompact, formatDate, formatNumber, formatPKR } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_LABEL = {
  connecting: "connecting…",
  live: "live",
  polling: "updating every 5s",
  offline: "not updating",
} as const;

/**
 * The price, kept current in the browser.
 *
 * If live data arrives the figure is real regardless of what the server managed to
 * fetch, so the placeholder marking is dropped at that point — a viewer whose own
 * network reaches the API shouldn't be told the price is fake when it isn't.
 */
export function LivePrice({
  symbol,
  initial,
  priceSource,
}: {
  symbol: string;
  initial: Quote;
  priceSource: SourceId;
}) {
  const { quote, status, updatedAt } = useLiveQuote(symbol, initial);

  const isLive = updatedAt != null && (status === "live" || status === "polling");
  const isSample = priceSource === "sample" && !isLive;

  // Flash the figure when it changes, so an update is visible without watching.
  const [flash, setFlash] = React.useState<"up" | "down" | null>(null);
  const previous = React.useRef<number | null>(initial.price);
  React.useEffect(() => {
    const price = quote.price;
    if (price == null || previous.current == null || price === previous.current) {
      previous.current = price;
      return;
    }
    setFlash(price > previous.current ? "up" : "down");
    previous.current = price;
    const timer = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(timer);
  }, [quote.price]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <span
          className={cn(
            "tnum text-4xl font-semibold tracking-tight transition-colors duration-300",
            isSample && "text-muted-foreground/70 decoration-[var(--warn)]/60 line-through decoration-2",
            flash === "up" && "text-[var(--gain)]",
            flash === "down" && "text-[var(--loss)]",
          )}
        >
          {formatPKR(quote.price)}
        </span>
        <ChangeBadge change={quote.change} changePercent={quote.changePercent} className="mb-1.5" />
        <SampleChip source={isSample ? "sample" : "psxterminal"} />
      </div>

      {isSample ? (
        <p className="text-[var(--warn)] text-xs font-medium">
          Not a real price. The market data sources could not be reached, so this figure and the day&apos;s range
          are generated placeholders.
        </p>
      ) : (
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                "size-1.5 rounded-full",
                status === "live" && "bg-[var(--gain)] animate-pulse",
                status === "polling" && "bg-[var(--gain)]/70",
                status === "connecting" && "bg-muted-foreground/50",
                status === "offline" && "bg-[var(--warn)]",
              )}
            />
            {STATUS_LABEL[status]}
          </span>
          {updatedAt ? (
            <span className="tnum">
              · updated{" "}
              {new Date(updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          ) : (
            <span>· last close {formatDate(quote.asOf)}</span>
          )}
        </p>
      )}

      <dl className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <Figure label="Day high" value={formatNumber(quote.dayHigh)} />
        <Figure label="Day low" value={formatNumber(quote.dayLow)} />
        <Figure label="Volume" value={formatCompact(quote.volume)} />
      </dl>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt>{label}</dt>
      <dd className="text-foreground tnum font-medium">{value}</dd>
    </div>
  );
}
