import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetCircuitBreakers } from "@/lib/data/http";
import { fetchKhistocksPage, looksUseful } from "@/lib/khistocks/client";

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

describe("what counts as a usable response", () => {
  it("accepts a JSON object body", () => {
    // khistocks serves its company endpoint as JSON; requiring a <table> threw
    // every JSON response away, including the one confirmed data API on the site.
    expect(looksUseful('{"company_name":"Lucky Cement Limited","paidupvalue":"10"}')).toBe(true);
  });

  it("accepts a JSON array body", () => {
    expect(looksUseful('[{"company_name":"Lucky Cement Limited"}]')).toBe(true);
  });

  it("rejects empty JSON", () => {
    expect(looksUseful("{}")).toBe(false);
    expect(looksUseful("[]")).toBe(false);
  });

  it("rejects malformed JSON", () => {
    expect(looksUseful('{"company_name": ')).toBe(false);
  });

  it("still requires a table in an HTML body", () => {
    expect(looksUseful(`<html><body>${"x".repeat(3000)}</body></html>`)).toBe(false);
    expect(looksUseful(`<html><body><table><tr><td>1</td></tr></table>${"x".repeat(3000)}</body></html>`)).toBe(true);
  });
});

describe("a page that renders empty tables must not stop the search", () => {
  let requested: string[] = [];
  const bodies = new Map<string, string>();

  beforeEach(() => {
    resetCircuitBreakers();
    requested = [];
    bodies.clear();
    vi.stubGlobal("fetch", async (url: string | URL) => {
      const key = String(url);
      requested.push(key);
      const body = bodies.get(key);
      if (body === undefined) return new Response("", { status: 404 });
      return new Response(body, { status: 200 });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetCircuitBreakers();
  });

  // Markup present, rows absent — what a client-rendered page looks like to a
  // server-side fetch. It passes the "is this usable" check but carries nothing.
  const SHELL = `<html><body><table><thead><tr><th>Particulars</th></tr></thead><tbody></tbody></table>${"x".repeat(2500)}</body></html>`;
  const REAL = `<html><body><table><tr><th>Particulars</th><th>FY2025</th></tr><tr><td>Net Sales</td><td>38,922</td></tr></table>${"x".repeat(2500)}</body></html>`;

  it("keeps trying candidates when a page has tables but no rows", async () => {
    bodies.set("https://www.khistocks.com/company-information/financial-highlights/LUCK.html", SHELL);
    bodies.set("https://khistocks.com/company-information/financial-highlights/LUCK.html", REAL);

    const result = await fetchKhistocksPage("financials", "LUCK", (body) => /Net Sales/.test(body));
    expect(result.html).toContain("Net Sales");
    expect(result.url).toBe("https://khistocks.com/company-information/financial-highlights/LUCK.html");
    // The shell is recorded as an attempt rather than silently accepted.
    expect(result.attempts.some((attempt) => /no usable rows/.test(attempt.error))).toBe(true);
  });

  it("falls through to the parameterised URLs when the bare page is a shell", async () => {
    for (const url of [
      "https://www.khistocks.com/company-information/financial-highlights/LUCK.html",
      "https://www.khistocks.com/index.php/company-information/financial-highlights/LUCK.html",
      "https://khistocks.com/company-information/financial-highlights/LUCK.html",
      "https://khistocks.com/index.php/company-information/financial-highlights/LUCK.html",
    ]) {
      bodies.set(url, SHELL);
    }
    const year = new Date().getUTCFullYear();
    bodies.set(
      `https://www.khistocks.com/company-information/financial-highlights/LUCK.html?from=1999&to=${year}`,
      REAL,
    );

    const result = await fetchKhistocksPage("financials", "LUCK", (body) => /Net Sales/.test(body));
    expect(result.html).toContain("Net Sales");
    expect(result.url).toContain("from=1999");
  });

  it("without a validator, any page with a table still short-circuits", async () => {
    // Documents why the validator exists: this is the old behaviour.
    bodies.set("https://www.khistocks.com/company-information/financial-highlights/LUCK.html", SHELL);
    const result = await fetchKhistocksPage("financials", "LUCK");
    expect(result.html).toBe(SHELL);
  });
});
