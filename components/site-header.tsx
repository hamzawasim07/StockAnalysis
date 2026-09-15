import Link from "next/link";
import { ActivityIcon } from "lucide-react";

import { SymbolSearch } from "@/components/symbol-search";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/screener", label: "Screener" },
  { href: "/sectors", label: "Sectors" },
];

export function SiteHeader() {
  return (
    <header className="bg-background/85 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md">
            <ActivityIcon className="size-4" />
          </span>
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">PSX Terminal</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Button key={item.href} asChild variant="ghost" size="sm" className="text-muted-foreground">
              <Link href={item.href}>{item.label}</Link>
            </Button>
          ))}
        </nav>

        <div className="flex flex-1 justify-end gap-2">
          <SymbolSearch />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
