import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface StatItem {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "gain" | "loss";
}

/** One figure in the key-stats grid. */
export function Stat({ label, value, hint, tone = "default", className }: StatItem & { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{label}</span>
      <span
        className={cn(
          "tnum text-sm font-semibold sm:text-base",
          tone === "gain" && "text-[var(--gain)]",
          tone === "loss" && "text-[var(--loss)]",
        )}
      >
        {value}
      </span>
      {hint ? <span className="text-muted-foreground text-[11px]">{hint}</span> : null}
    </div>
  );
}

export function StatGrid({ items, className }: { items: StatItem[]; className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <Stat key={item.label} {...item} />
        ))}
      </CardContent>
    </Card>
  );
}
