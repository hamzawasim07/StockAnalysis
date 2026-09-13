import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { SourceId } from "@/lib/data/types";
import { cn } from "@/lib/utils";

/**
 * Section-level marker. The page banner says *something* fell back; this says
 * exactly which figures did, next to the figures themselves — so real prices are
 * never read as vouching for placeholder financials sitting on the same page.
 */
export function SampleNotice({
  source,
  what,
  symbol,
  className,
}: {
  source: SourceId;
  what: string;
  symbol?: string;
  className?: string;
}) {
  if (source !== "sample") return null;

  return (
    <div
      className={cn(
        "border-[var(--warn)]/35 bg-[var(--warn)]/10 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm",
        className,
      )}
    >
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-[var(--warn)]" />
      <p className="text-muted-foreground">
        <span className="text-foreground font-medium">These are not real figures.</span> {what} could not be
        fetched, so everything below is generated placeholder data — internally consistent, but invented.{" "}
        <Link
          href={symbol ? `/api/diagnostics?symbol=${symbol}` : "/api/diagnostics"}
          className="text-foreground font-medium underline underline-offset-2"
        >
          See why
        </Link>
        .
      </p>
    </div>
  );
}

/** Inline "sample" chip for tab triggers and card headers. */
export function SampleChip({ source }: { source: SourceId }) {
  if (source !== "sample") return null;
  return (
    <Badge variant="warn" className="ml-1.5 px-1 py-0 text-[9px] font-semibold tracking-wide uppercase">
      sample
    </Badge>
  );
}
