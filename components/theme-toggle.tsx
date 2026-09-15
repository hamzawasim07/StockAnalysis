"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle colour theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {/* The server can't know the viewer's theme, so which icon shows is decided by
          CSS off the root `dark` class rather than by state — no hydration mismatch
          and no post-mount flash. */}
      <MoonIcon className="dark:hidden" />
      <SunIcon className="hidden dark:block" />
    </Button>
  );
}
