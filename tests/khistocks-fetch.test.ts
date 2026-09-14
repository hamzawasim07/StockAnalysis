import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetCircuitBreakers } from "@/lib/data/http";
import { fetchKhistocksPage } from "@/lib/khistocks/client";

const PAGE = `<html><body><table><tr><th>Particulars</th><th>FY2025</th></tr><tr><td>Net Sales</td><td>1,000</td></tr></table>${"x".repeat(2500)}</body></html>`;

describe("khistocks page fetching", () => {
  let requested: string[] = [];
  const available = new Set<string>();

  beforeEach(() => {
    resetCircuitBreakers();
    requested = [];
    available.clear();
    vi.stubGlobal("fetch", async (url: string | URL) => {
      const key = String(url);
      requested.push(key);
      if (!available.has(key)) return new Response("", { status: 404 });
      return new Response(PAGE, { status: 200 });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetCircuitBreakers();
  });

  it("finds the statements page on the known URL", async () => {
    available.add("https://www.khistocks.com/company-information/financial-highlights/LUCK.html");
    const result = await fetchKhistocksPage("financials", "LUCK");
    expect(result.url).toBe("https://www.khistocks.com/company-information/financial-highlights/LUCK.html");
    expect(result.html).toContain("Net Sales");
  });

  it("does not crawl the site when a known URL works", async () => {
    // Crawling first cost several requests before the first real attempt, and the
    // 404s it generated used to trip the circuit breaker and block the real URL.
    available.add("https://www.khistocks.com/company-information/financial-highlights/LUCK.html");
    await fetchKhistocksPage("financials", "LUCK");
    expect(requested).toHaveLength(1);
    expect(requested.some((url) => url === "https://www.khistocks.com/")).toBe(false);
  });

  it("still reaches a working URL after several variants 404", async () => {
    // The apex-domain variant is fourth in line; everything before it 404s. With
    // 404s counting toward the breaker this was skipped without a request.
    available.add("https://khistocks.com/index.php/company-information/financial-highlights/LUCK.html");
    const result = await fetchKhistocksPage("financials", "LUCK");
    expect(result.html).toContain("Net Sales");
    expect(result.attempts.length).toBeGreaterThanOrEqual(3);
  });

  it("falls back to crawling once every known URL fails", async () => {
    available.add("https://www.khistocks.com/");
    await fetchKhistocksPage("financials", "LUCK");
    expect(requested).toContain("https://www.khistocks.com/");
  });

  it("reports every URL it tried when nothing works", async () => {
    const result = await fetchKhistocksPage("financials", "LUCK");
    expect(result.html).toBeNull();
    expect(result.attempts.length).toBeGreaterThan(0);
    expect(result.attempts.every((attempt) => /404/.test(attempt.error))).toBe(true);
  });
});
