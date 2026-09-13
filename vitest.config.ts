import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // `server-only` throws by design when imported outside a React Server
      // Component. The modules under test are server modules; stub it out.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
      // The scrapers are wrapped in unstable_cache, which needs a Next.js request
      // context. Under test it collapses to a pass-through.
      "next/cache": path.resolve(__dirname, "tests/stubs/next-cache.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
