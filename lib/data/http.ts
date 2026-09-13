import "server-only";

import type { SourceId, SourceNote } from "./types";

/**
 * Neither dps.psx.com.pk nor khistocks.com publishes an API, and both reject
 * requests that don't look like a browser. Everything outbound goes through here
 * so the headers, timeout and retry behaviour stay in one place.
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
}

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

export async function fetchUpstream(url: string, options: FetchOptions = {}): Promise<string> {
  const {
    method = "GET",
    form,
    headers = {},
    revalidate = 3600,
    tags,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = 1,
  } = options;

  const origin = new URL(url).origin;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/json,application/xhtml+xml,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: `${origin}/`,
          ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
          ...(method === "POST" ? { "X-Requested-With": "XMLHttpRequest" } : {}),
          ...headers,
        },
        body: form ? new URLSearchParams(form).toString() : undefined,
        next: { revalidate, ...(tags ? { tags } : {}) },
      });

      if (!response.ok) {
        throw new UpstreamError(`${method} ${url} responded ${response.status}`, response.status);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      // 4xx other than 429 won't fix themselves on a retry.
      if (error instanceof UpstreamError && error.status && error.status < 500 && error.status !== 429) {
        break;
      }
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timer);
    }
  }

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

export function note(source: SourceId, endpoint: string, ok: boolean, message?: string): SourceNote {
  return { source, endpoint, ok, message, fetchedAt: new Date().toISOString() };
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.name === "AbortError" ? "request timed out" : error.message;
  }
  return String(error);
}
