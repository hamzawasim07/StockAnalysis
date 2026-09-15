"use client";

import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";

import { cn } from "@/lib/utils";

function ToggleGroup({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn("bg-muted inline-flex items-center gap-0.5 rounded-lg p-[3px]", className)}
      {...props}
    />
  );
}

function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        "text-muted-foreground hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground inline-flex h-7 min-w-9 items-center justify-center rounded-md px-2.5 text-xs font-medium transition-all focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=on]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
