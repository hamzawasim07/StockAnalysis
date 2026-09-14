import "server-only";

import type { SourceId, SourceNote } from "./types";

/**
 * Neither dps.psx.com.pk nor khistocks.com publishes an API, and both reject
 * requests that don't look like a browser. Everything outbound goes through here
 * so the headers, timeout, retry and circuit-breaker behaviour stay in one place.
 */

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

export interface FetchOptions {
  method?: "GET" | "POST";
  /** Form-encoded body; PSX's /historical endpoint is a form POST. */
  form?: Record<string, string>;
  headers?: Record<string, string>;
  /** Seconds the Next.js data cache should hold the response. */
  revalidate?: number;
  /** Cache tags, so a route can be revalidated on demand. */
  tags?: string[];
  timeoutMs?: number;
  /** Extra attempts after the first failure. */
  retries?: number;
  /** Skip the per-host circuit breaker — used by the diagnostics route. */
  ignoreBreaker?: boolean;
  /** Bypass the Next.js data cache entirely — used by the diagnostics route. */
  noStore?: boolean;
}

/**
 * Cache-key version for every `unstable_cache` wrapper in the data layer.
 *
 * Vercel's Data Cache survives deployments. Before failures stopped being cached,
 * a failed fetch was stored under the same key as a real result with a TTL of up to
 * 24 hours — so a deployment that fixed the fetch would still read the old "this
 * failed" entry and keep showing sample data, with no way to tell from the outside
 * that the fix had landed.
 *
 * Bump this whenever a change should not inherit cached results from the version
 * before it. Individual keys embed it, e.g. `psx-symbols-v2`.
 */
export const CACHE_VERSION = "v2";

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Per-host circuit breaker. When an upstream is down, a page would otherwise pay
 * the full timeout on every request for every endpoint it touches. After a few
 * consecutive failures the host is skipped outright for a short cooldown, so a
 * page renders its sample fallback immediately instead of hanging. State is
 * per-instance and in-memory, which is the right scope: it's about not hammering
 * a host from this process, not about correctness.
 *
 * Only failures that suggest the *host* is unusable count. A 404 or 403 means the
 * server answered — the URL was wrong, not the site down — and several of those are
 * expected, since both adapters probe a handful of URL variants per page. Counting
 * them would trip the breaker during normal probing and then skip the URL that
 * actually works.
 */
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 60_000;

const breakers = new Map<string, { failures: number; openUntil: number }>();

function breakerFor(host: string) {
  let breaker = breakers.get(host);
  if (!breaker) {
    breaker = { failures: 0, openUntil: 0 };
    breakers.set(host, breaker);
  }
  return breaker;
}

function recordSuccess(host: string) {
  breakers.set(host, { failures: 0, openUntil: 0 });
}

function recordFailure(host: string) {
  const breaker = breakerFor(host);
  breaker.failures += 1;
  if (breaker.failures >= BREAKER_THRESHOLD) {
    breaker.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
  }
}

/** Does this failure say the host itself is unusable, rather than the URL? */
function indictsHost(error: unknown) {
  if (error instanceof UpstreamError && error.status) {
    // 5xx and 429 are the server struggling; other 4xx are answers about the URL.
    return error.status >= 500 || error.status === 429;
  }
  // Connection refused, DNS failure, TLS error, timeout.
  return true;
}

/** Test seam: clears breaker state between cases. */
export function resetCircuitBreakers() {
  breakers.clear();
}

function breakerOpen(host: string) {
  const breaker = breakers.get(host);
  return breaker != null && breaker.openUntil > Date.now();
}

function requestHeaders(url: string, options: FetchOptions) {
  const origin = new URL(url).origin;
  return {
    "User-Agent": USER_AGENT,
    Accept: "text/html,application/json,application/xhtml+xml,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: `${origin}/`,
    ...(options.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    ...(options.method === "POST" ? { "X-Requested-With": "XMLHttpRequest" } : {}),
    ...options.headers,
  };
}

/** One attempt, no retries or breaker logic. Returns the raw Response. */
async function attempt(url: string, options: FetchOptions): Promise<Response> {
  const { method = "GET", form, revalidate = 3600, tags, timeoutMs = DEFAULT_TIMEOUT_MS, noStore } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method,
      signal: controller.signal,
      headers: requestHeaders(url, options),
      body: form ? new URLSearchParams(form).toString() : undefined,
      ...(noStore
        ? { cache: "no-store" as const }
        : { next: { revalidate, ...(tags ? { tags } : {}) } }),
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchUpstream(url: string, options: FetchOptions = {}): Promise<string> {
  const { method = "GET", retries = 1, ignoreBreaker = false } = options;
  const host = new URL(url).host;

  if (!ignoreBreaker && breakerOpen(host)) {
    throw new UpstreamError(`${host} is failing — skipped without a request (circuit breaker open)`);
  }

  let lastError: unknown;

  for (let index = 0; index <= retries; index++) {
    try {
      const response = await attempt(url, options);
      if (!response.ok) {
        throw new UpstreamError(`${method} ${url} responded ${response.status}`, response.status);
      }
      const text = await response.text();
      recordSuccess(host);
      return text;
    } catch (error) {
      lastError = error;
      // 4xx other than 429 won't fix themselves on a retry.
      if (error instanceof UpstreamError && error.status && error.status < 500 && error.status !== 429) {
        break;
      }
      if (index < retries) {
        await new Promise((resolve) => setTimeout(resolve, 400 * (index + 1)));
      }
    }
  }

  if (!ignoreBreaker && indictsHost(lastError)) recordFailure(host);
  throw lastError instanceof Error ? lastError : new UpstreamError(String(lastError));
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const text = await fetchUpstream(url, {
    ...options,
    headers: { Accept: "application/json, text/plain, */*", ...options.headers },
  });
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UpstreamError(`${url} did not return JSON`);
  }
}

export interface Probe {
  url: string;
  method: string;
  ok: boolean;
  status: number | null;
  elapsedMs: number;
  contentType: string | null;
  bytes: number | null;
  /** First few hundred characters of the body, so a block page or redirect is visible. */
  bodyPrefix: string | null;
  error: string | null;
  /** Filled in by the caller: what the parser made of the body. */
  parsed?: Record<string, unknown>;
}

/**
 * A single uncached, breaker-free request that reports what came back rather than
 * throwing. This exists for `/api/diagnostics` — when the app falls back to sample
 * data, this is what says why.
 */
export async function probeUpstream(
  url: string,
  options: FetchOptions = {},
): Promise<Probe & { body: string | null }> {
  const started = Date.now();
  const method = options.method ?? "GET";

  try {
    const response = await attempt(url, {
      ...options,
      retries: 0,
      noStore: true,
      timeoutMs: options.timeoutMs ?? 12_000,
    });
    const body = await response.text();
    return {
      url,
      method,
      ok: response.ok,
      status: response.status,
      elapsedMs: Date.now() - started,
      contentType: response.headers.get("content-type"),
      bytes: body.length,
      bodyPrefix: body.slice(0, 400).replace(/\s+/g, " ").trim(),
      error: response.ok ? null : `HTTP ${response.status}`,
      body: response.ok ? body : null,
    };
  } catch (error) {
    return {
      url,
      method,
      ok: false,
      status: null,
      elapsedMs: Date.now() - started,
      contentType: null,
      bytes: null,
      bodyPrefix: null,
      error: errorMessage(error),
      body: null,
    };
  }
}

export function note(source: SourceId, endpoint: string, ok: boolean, message?: string): SourceNote {
  return { source, endpoint, ok, message, fetchedAt: new Date().toISOString() };
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.name === "AbortError" ? "request timed out" : error.message;
  }
  return String(error);
}
