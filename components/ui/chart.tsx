"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "@/lib/utils";

/**
 * shadcn-style wrapper over Recharts: a config object maps each series key to a
 * label and colour, the container publishes those colours as CSS variables, and
 * the tooltip/legend read labels back out of the config.
 */

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    icon?: React.ComponentType;
    color?: string;
  }
>;

type ChartContextValue = { config: ChartConfig };

const ChartContext = React.createContext<ChartContextValue | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error("useChart must be used within a <ChartContainer />");
  return context;
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "flex aspect-video justify-center text-xs",
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground",
          "[&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/60",
          "[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border",
          "[&_.recharts-radial-bar-background-sector]:fill-muted",
          "[&_.recharts-reference-line_[stroke='#ccc']]:stroke-border",
          "[&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none [&_.recharts-layer]:outline-none",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

/** Emits `--color-<key>` custom properties scoped to this chart instance. */
function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const entries = Object.entries(config).filter(([, item]) => item.color);
  if (entries.length === 0) return null;

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `[data-chart=${id}] {\n${entries
          .map(([key, item]) => `  --color-${key}: ${item.color};`)
          .join("\n")}\n}`,
      }}
    />
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;

interface TooltipEntry {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
}

function ChartTooltipContent({
  active,
  payload,
  label,
  labelFormatter,
  formatter,
  hideLabel = false,
  hideIndicator = false,
  indicator = "dot",
  className,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  labelFormatter?: (value: string | number | undefined) => React.ReactNode;
  formatter?: (value: number | string | undefined, name: string) => React.ReactNode;
  hideLabel?: boolean;
  hideIndicator?: boolean;
  indicator?: "dot" | "line";
  className?: string;
}) {
  const { config } = useChart();

  if (!active || !payload?.length) return null;

  return (
    <div
      className={cn(
        "bg-popover/95 grid min-w-36 items-start gap-1.5 rounded-lg border px-2.5 py-2 text-xs shadow-xl backdrop-blur-sm",
        className,
      )}
    >
      {!hideLabel && (
        <div className="text-muted-foreground font-medium">
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      )}
      <div className="grid gap-1">
        {payload.map((entry, index) => {
          const key = String(entry.dataKey ?? entry.name ?? index);
          const item = config[key];
          const name = (item?.label as string) ?? String(entry.name ?? key);
          return (
            <div key={key} className="flex w-full items-center gap-2">
              {!hideIndicator && (
                <span
                  className={cn("shrink-0 rounded-[2px]", indicator === "dot" ? "size-2.5" : "h-0.5 w-3")}
                  style={{ backgroundColor: entry.color ?? item?.color ?? "var(--chart-1)" }}
                />
              )}
              <span className="text-muted-foreground flex-1">{name}</span>
              <span className="text-foreground tnum font-medium">
                {formatter ? formatter(entry.value, name) : entry.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ChartLegend = RechartsPrimitive.Legend;

function ChartLegendContent({
  payload,
  className,
}: {
  payload?: { value?: string; dataKey?: string | number; color?: string }[];
  className?: string;
}) {
  const { config } = useChart();
  if (!payload?.length) return null;

  // Recharts orders legend entries by render order (bars before lines); show them
  // in the order the config declares instead, which reads as authored.
  const order = Object.keys(config);
  const entries = [...payload].sort(
    (a, b) =>
      order.indexOf(String(a.dataKey ?? a.value ?? "")) - order.indexOf(String(b.dataKey ?? b.value ?? "")),
  );

  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-3", className)}>
      {entries.map((entry) => {
        const key = String(entry.dataKey ?? entry.value ?? "");
        const item = config[key];
        return (
          <div key={key} className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <span
              className="size-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: entry.color ?? item?.color ?? "var(--chart-1)" }}
            />
            {(item?.label as string) ?? entry.value}
          </div>
        );
      })}
    </div>
  );
}

export { ChartContainer, ChartStyle, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, useChart };
