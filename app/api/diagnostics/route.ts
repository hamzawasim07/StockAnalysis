import { NextResponse } from "next/server";

import { parseTables } from "@/lib/data/html";
import { probeUpstream, type Probe } from "@/lib/data/http";
import { scoreLinks } from "@/lib/khistocks/discover";
import { assembleFinancials } from "@/lib/khistocks/financials";
import { toStatementGrid } from "@/lib/khistocks/parse";
import { PSX_ENDPOINTS } from "@/lib/psx/endpoints";
import { parseHistoricalHtml } from "@/lib/psx/historical";
import { parseMarketWatchHtml } from "@/lib/psx/market";
import { mapWithConcurrency, normalizeSymbol } from "@/lib/utils";

/**
 * Why is this page showing sample data?
 *
 * Every scraped endpoint is hit once here — uncached, no retries, no circuit
 * breaker — and the result reports the HTTP status, timing, content type and the
 * first few hundred characters of the body, plus what the matching parser made of
 * it. The distinction that matters when a source falls back is whether the request
 * failed (blocked, timed out, 404) or succeeded and the parser didn't recognise the
 * markup: the first needs a different request, the second needs a parser change.
 *
 * GET /api/diagnostics?symbol=LUCK
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Check = Probe & { name: string; parsed?: Record<string, unknown> };

/** Run a parser without letting a malformed payload fail the whole report. */
function safely<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

export async function GET(request: Request) {
  const symbol = normalizeSymbol(new URL(request.url).searchParams.get("symbol") ?? "LUCK") || "LUCK";
  const now = new Date();

  const checks: Check[] = [];

  const run = async (
    name: string,
    url: string,
    options: Parameters<typeof probeUpstream>[1] = {},
    interpret?: (body: string) => Record<string, unknown>,
  ) => {
    const { body, ...probe } = await probeUpstream(url, options);
    const check: Check = { name, ...probe };
    if (body && interpret) {
      try {
        check.parsed = interpret(body);
      } catch (error) {
        check.parsed = { parserError: error instanceof Error ? error.message : String(error) };
      }
    }
    checks.push(check);
  };

  // PSX — run sequentially so one slow endpoint can't starve the others of time.
  await run("psx:symbols", PSX_ENDPOINTS.symbols, {}, (body) => {
    const parsed: unknown = JSON.parse(body);
    return {
      isArray: Array.isArray(parsed),
      count: Array.isArray(parsed) ? parsed.length : 0,
      firstEntry: Array.isArray(parsed) ? parsed[0] : null,
    };
  });

  await run("psx:market-watch", PSX_ENDPOINTS.marketWatch, {}, (body) => {
    const rows = parseMarketWatchHtml(body);
    const tables = parseTables(body);
    return {
      tablesFound: tables.length,
      largestTableRows: Math.max(0, ...tables.map((table) => table.rows.length)),
      headers: tables.sort((a, b) => b.rows.length - a.rows.length)[0]?.headers ?? [],
      rowsParsed: rows.length,
      sampleRow: rows[0] ?? null,
    };
  });

  await run(
    "psx:historical",
    PSX_ENDPOINTS.historical,
    {
      method: "POST",
      form: {
        month: String(now.getUTCMonth() + 1),
        year: String(now.getUTCFullYear()),
        symbol,
      },
    },
    (body) => {
      const bars = parseHistoricalHtml(body);
      const tables = parseTables(body);
      return {
        tablesFound: tables.length,
        headers: tables[0]?.headers ?? [],
        firstRawRow: tables[0]?.rows[0] ?? null,
        barsParsed: bars.length,
        sampleBar: bars[0] ?? null,
      };
    },
  );

  await run("psx:timeseries-eod", PSX_ENDPOINTS.eod(symbol), {}, (body) => {
    const parsed = JSON.parse(body) as { status?: number; data?: unknown[] };
    return { status: parsed.status, points: Array.isArray(parsed.data) ? parsed.data.length : 0 };
  });

  await run("psx:company", PSX_ENDPOINTS.company(symbol), {}, (body) => {
    const tables = parseTables(body);
    return {
      tablesFound: tables.length,
      tableTitles: tables.map((table) => table.title).filter(Boolean).slice(0, 10),
    };
  });

  // khistocks — every candidate URL, since the working pattern is what we're after.
  // khistocks serves JSON under /company/. getcompinfo is confirmed; its name sets
  // the convention (get + "comp" + noun), and its payload carries a numeric company
  // id that sibling endpoints may key on instead of the ticker. Both keyings are
  // probed, because finding a financial data endpoint would beat scraping the
  // rendered page entirely.
  const describeJson = (body: string) => {
    const trimmed = body.trimStart();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return { json: false, note: "not a JSON response" };
    }
    const parsed: unknown = JSON.parse(body);
    const record = Array.isArray(parsed) ? parsed[0] : parsed;
    return {
      json: true,
      entries: Array.isArray(parsed) ? parsed.length : 1,
      // The field names are the whole point: they say what this endpoint serves.
      fields: record && typeof record === "object" ? Object.keys(record).slice(0, 40) : [],
    };
  };

  // Resolve the company id first, so id-keyed endpoints can be probed too.
  const { body: infoBody, ...infoProbe } = await probeUpstream(
    `https://www.khistocks.com/company/getcompinfo/${symbol}`,
    {},
  );
  checks.push({
    name: "khistocks-api:getcompinfo",
    ...infoProbe,
    parsed: infoBody ? safely(() => describeJson(infoBody)) : undefined,
  });

  const companyId = infoBody
    ? (safely(() => {
        const parsed: unknown = JSON.parse(infoBody);
        const record = (Array.isArray(parsed) ? parsed[0] : parsed) as Record<string, unknown> | null;
        const id = record?.rowid ?? record?.brcode;
        return id == null ? null : String(id);
      }) ?? null)
    : null;

  const NOUNS = [
    "financials",
    "financial",
    "financialhighlights",
    "highlights",
    "balancesheet",
    "incomestatement",
    "profitloss",
    "cashflow",
    "ratios",
    "dividend",
    "dividends",
    "payouts",
  ];

  const keys = [symbol, ...(companyId && companyId !== symbol ? [companyId] : [])];
  const jsonUrls = keys.flatMap((key) =>
    NOUNS.flatMap((noun) => [
      `https://www.khistocks.com/company/get${noun}/${key}`,
      `https://www.khistocks.com/company/getcomp${noun}/${key}`,
    ]),
  );

  // Up to ~48 candidates: run them concurrently with a short timeout, since almost
  // all are expected to 404 quickly and the route has a 60s budget to stay inside.
  const jsonProbes = await mapWithConcurrency(jsonUrls, 12, async (url) => {
    const { body, ...probe } = await probeUpstream(url, { timeoutMs: 6_000 });
    return {
      name: `khistocks-api:${url.split("/company/")[1]}`,
      ...probe,
      parsed: body ? safely(() => describeJson(body)) : undefined,
    } satisfies Check;
  });

  // Only the endpoints that answered are worth reporting; 40-odd 404s would bury
  // the signal. The summary still records how many were tried.
  const liveJson = jsonProbes.filter((probe) => probe.ok);
  checks.push(...liveJson);

  const khistocksUrls = [
    `https://www.khistocks.com/company-information/financial-highlights/${symbol}.html`,
    `https://www.khistocks.com/company-information/company-profile/${symbol}.html`,
    `https://www.khistocks.com/company-information/dividend-data.html`,
    `https://www.khistocks.com/market-live/companies-live/detailed-view/${symbol}.html`,
    `https://www.khistocks.com/company/getcompinfo/${symbol}`,
    `https://www.khistocks.com/`,
  ];

  for (const url of khistocksUrls) {
    await run(`khistocks:${url.replace("https://www.khistocks.com", "") || "/"}`, url, {}, (body) => {
      const tables = parseTables(body);
      const grids = tables.map(toStatementGrid).filter((grid) => grid !== null);
      const assembled = assembleFinancials(body);
      return {
        tablesFound: tables.length,
        statementGrids: grids.length,
        periodsFound: grids[0]?.periods.map((period) => period.label) ?? [],
        rowLabels: grids[0] ? [...grids[0].rows.keys()].slice(0, 12) : [],
        // What the real adapter would extract from this exact page.
        extracted: assembled?.counts ?? null,
        // Links on this page that discovery would follow for this symbol — the
        // fastest way to learn the site's real per-company URL scheme.
        symbolLinks: scoreLinks(body, url, symbol)
          .slice(0, 8)
          .map((link) => `${link.kind}: ${link.url}`),
      };
    });
  }

  const reachable = checks.filter((check) => check.ok);
  const parsedSomething = checks.filter(
    (check) => check.parsed && Object.values(check.parsed).some((value) => typeof value === "number" && value > 0),
  );

  return NextResponse.json(
    {
      symbol,
      checkedAt: now.toISOString(),
      summary: {
        endpointsChecked: checks.length,
        jsonEndpointsProbed: jsonUrls.length,
        jsonEndpointsAnswering: liveJson.length,
        companyId,
        reachable: reachable.length,
        parsedUsefulData: parsedSomething.length,
        verdict:
          reachable.length === 0
            ? "Every upstream request failed — this deployment cannot reach the source sites at all."
            : parsedSomething.length === 0
              ? "Requests succeed but no parser recognised the markup — the page layouts differ from what the scrapers expect."
              : "At least one source returned parseable data; see each check below.",
      },
      checks,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
