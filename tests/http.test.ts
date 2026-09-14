import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchUpstream, resetCircuitBreakers } from "@/lib/data/http";

/**
 * The circuit breaker exists so a dead host doesn't cost a full timeout on every
 * request. The failure mode it must avoid: both adapters probe several URL
 * variants per page, so 404s are routine — counting those as "host down" trips the
 * breaker during normal probing and then skips the URL that actually works.
 */
describe("circuit breaker", () => {
  const responses = new Map<string, { status: number }>();

  beforeEach(() => {
    resetCircuitBreakers();
    responses.clear();
    vi.stubGlobal("fetch", async (url: string | URL) => {
      const key = String(url);
      const planned = responses.get(key);
      if (!planned) throw new TypeError("fetch failed");
      return new Response(planned.status === 200 ? "<html><table></table></html>" : "", {
        status: planned.status,
      });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetCircuitBreakers();
  });

  const get = (url: string) => fetchUpstream(url, { retries: 0, revalidate: 0 });

  it("does not open on 404s — the host answered, the URL was wrong", async () => {
    for (const path of ["a", "b", "c", "d", "e"]) {
      responses.set(`https://example.test/${path}`, { status: 404 });
      await expect(get(`https://example.test/${path}`)).rejects.toThrow(/404/);
    }

    // The URL that exists must still be attempted after all that probing.
    responses.set("https://example.test/real", { status: 200 });
    await expect(get("https://example.test/real")).resolves.toContain("<table>");
  });

  it("does not open on 403 either", async () => {
    for (const path of ["a", "b", "c", "d"]) {
      responses.set(`https://example.test/${path}`, { status: 403 });
      await expect(get(`https://example.test/${path}`)).rejects.toThrow(/403/);
    }
    responses.set("https://example.test/real", { status: 200 });
    await expect(get("https://example.test/real")).resolves.toContain("<table>");
  });

  it("opens after repeated connection failures and skips without a request", async () => {
    for (let i = 0; i < 3; i++) {
      await expect(get(`https://down.test/${i}`)).rejects.toThrow();
    }
    // Even a URL that would succeed is skipped while the breaker is open.
    responses.set("https://down.test/ok", { status: 200 });
    await expect(get("https://down.test/ok")).rejects.toThrow(/circuit breaker open/);
  });

  it("opens on repeated 5xx, which does indict the host", async () => {
    for (const path of ["a", "b", "c"]) {
      responses.set(`https://flaky.test/${path}`, { status: 503 });
      await expect(get(`https://flaky.test/${path}`)).rejects.toThrow(/503/);
    }
    responses.set("https://flaky.test/ok", { status: 200 });
    await expect(get("https://flaky.test/ok")).rejects.toThrow(/circuit breaker open/);
  });

  it("keeps breaker state per host", async () => {
    for (let i = 0; i < 3; i++) {
      await expect(get(`https://down.test/${i}`)).rejects.toThrow();
    }
    responses.set("https://other.test/ok", { status: 200 });
    await expect(get("https://other.test/ok")).resolves.toContain("<table>");
  });

  it("a success clears the failure count", async () => {
    await expect(get("https://mixed.test/1")).rejects.toThrow();
    await expect(get("https://mixed.test/2")).rejects.toThrow();

    responses.set("https://mixed.test/ok", { status: 200 });
    await expect(get("https://mixed.test/ok")).resolves.toContain("<table>");

    // Two more failures must not open it — the counter restarted at the success.
    await expect(get("https://mixed.test/3")).rejects.toThrow();
    await expect(get("https://mixed.test/4")).rejects.toThrow();
    await expect(get("https://mixed.test/ok")).resolves.toContain("<table>");
  });
});
