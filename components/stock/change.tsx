import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { directionOf, directionTextClass, formatNumber, formatSignedPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Coloured +x.xx (+y.yy%) pill used wherever a price move is shown. */
export function ChangeBadge({
  change,
  changePercent,
  className,
  showAbsolute = true,
}: {
  change: number | null | undefined;
  changePercent: number | null | undefined;
  className?: string;
  showAbsolute?: boolean;
}) {
  const direction = directionOf(changePercent ?? change);
  const Icon = direction === "up" ? ArrowUpRightIcon : direction === "down" ? ArrowDownRightIcon : ArrowRightIcon;
  const variant = direction === "up" ? "gain" : direction === "down" ? "loss" : "muted";

  return (
    <Badge variant={variant} className={cn("tnum gap-1 px-2 py-1 text-xs", className)}>
      <Icon className="size-3" />
      {showAbsolute && change != null ? `${change > 0 ? "+" : ""}${formatNumber(change)} ` : ""}
      {formatSignedPercent(changePercent)}
    </Badge>
  );
}

/** Plain coloured number, for dense table cells. */
export function DeltaText({
  value,
  format,
  className,
}: {
  value: number | null | undefined;
  format?: (value: number | null | undefined) => string;
  className?: string;
}) {
  const direction = directionOf(value);
  const text = format ? format(value) : formatSignedPercent(value);
  return <span className={cn("tnum", directionTextClass[direction], className)}>{text}</span>;
}
