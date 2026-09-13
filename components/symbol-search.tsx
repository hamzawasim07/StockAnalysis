"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { SymbolInfo } from "@/lib/data/types";
import { cn } from "@/lib/utils";

/**
 * Symbol lookup. Filtering runs server-side against the full PSX directory
 * (~500 scrips) rather than shipping the whole list to the browser.
 */
export function SymbolSearch({ className, variant = "button" }: { className?: string; variant?: "button" | "inline" }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SymbolInfo[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/symbols?q=${encodeURIComponent(query)}&limit=20`, {
          signal: controller.signal,
        });
        const payload = (await response.json()) as { results?: SymbolInfo[] };
        setResults(payload.results ?? []);
      } catch {
        // An aborted request just means the user kept typing.
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, open]);

  const go = (symbol: string) => {
    setOpen(false);
    setQuery("");
    router.push(`/stock/${symbol}`);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "text-muted-foreground hover:border-ring/60 hover:text-foreground bg-background flex items-center gap-2 rounded-lg border text-sm transition-colors",
          variant === "button" ? "h-9 w-full max-w-xs px-3" : "h-12 w-full px-4 text-base shadow-sm",
          className,
        )}
      >
        <SearchIcon className={variant === "inline" ? "size-5" : "size-4"} />
        <span className="flex-1 text-left">Search symbol or company…</span>
        <kbd className="bg-muted text-muted-foreground hidden rounded border px-1.5 py-0.5 font-mono text-[10px] sm:inline-block">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen} title="Search PSX">
        {/* Results are already ranked server-side; cmdk must not re-filter them. */}
        <CommandInput placeholder="OGDC, Lucky Cement, Commercial Banks…" value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>{loading ? "Searching…" : "No matching scrip."}</CommandEmpty>
          {results.length > 0 && (
            <CommandGroup heading={`${results.length} match${results.length === 1 ? "" : "es"}`}>
              {results.map((item) => (
                <CommandItem key={item.symbol} value={item.symbol} onSelect={() => go(item.symbol)}>
                  <span className="tnum w-20 shrink-0 font-mono text-xs font-semibold">{item.symbol}</span>
                  <span className="flex-1 truncate">{item.name}</span>
                  <span className="text-muted-foreground hidden max-w-40 truncate text-xs sm:inline">
                    {item.sector}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
