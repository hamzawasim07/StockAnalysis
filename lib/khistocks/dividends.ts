import "server-only";

import { unstable_cache } from "next/cache";

import { parseTables } from "@/lib/data/html";
import { errorMessage, note, UpstreamError } from "@/lib/data/http";
import type { Dividend, DividendKind, Sourced } from "@/lib/data/types";
import { parseLooseNumber } from "@/lib/format";
import { normalizeSymbol } from "@/lib/utils";

import { fetchKhistocksPage, KHISTOCKS_TTL, summariseAttempts } from "./client";

const FACE_VALUE = 10;

function classify(text: string): DividendKind {
  if (/bonus/i.test(text)) return "bonus";
  if (/right/i.test(text)) return "right";
  if (/cash|dividend|interim|final/i.test(text)) return "cash";
  return "other";
}

function toIso(raw: string | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const iso = text.match(/^\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const parsed = new Date(text.replace(/(\d{1,2})[-/](\w{3,})[-/](\d{2,4})/, "$2 $1 $3"));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

/**
 * khistocks publishes payouts on one page covering every listed company, so when a
 * symbol column is present the rows are filtered to `symbol`. Per-company pages have
 * no such column, in which case every row belongs to the company already.
 */
export function parseDividendTables(html: string, symbol?: string): Dividend[] {
  const out: Dividend[] = [];
  const target = symbol?.trim().toUpperCase();

  for (const table of parseTables(html)) {
    const headers = table.headers.map((header) => header.toLowerCase());
    const looksLikePayouts = /dividend|payout|bonus|book clos/.test(
      `${table.title} ${headers.join(" ")}`.toLowerCase(),
    );
    if (!looksLikePayouts) continue;

    const indexOf = (...terms: string[]) =>
      headers.findIndex((header) => terms.some((term) => header.includes(term)));
    const columns = {
      symbol: indexOf("symbol", "scrip", "company", "name"),
      announced: indexOf("announce", "declar", "date"),
      period: indexOf("period", "year", "quarter"),
      type: indexOf("type", "nature", "payout"),
      percent: indexOf("%", "percent", "rate"),
      perShare: indexOf("per share", "rs/share", "amount"),
      from: indexOf("from"),
      to: indexOf("to"),
      payment: indexOf("payment", "pay date"),
    };

    const at = (row: string[], index: number) => (index >= 0 ? (row[index] ?? "") : "");

    for (const row of table.rows) {
      if (target && columns.symbol >= 0) {
        const rowSymbol = at(row, columns.symbol).trim().toUpperCase();
        // Match the ticker exactly, or a company-name cell that names it.
        if (rowSymbol !== target && !new RegExp(`(^|[^A-Z0-9])${target}([^A-Z0-9]|$)`).test(rowSymbol)) {
          continue;
        }
      }
      const announcedOn = toIso(at(row, columns.announced) || row[0]);
      const typeText = at(row, columns.type) || row.join(" ");
      const percent = parseLooseNumber(at(row, columns.percent));
      const perShare = parseLooseNumber(at(row, columns.perShare));
      if (announcedOn == null && percent == null && perShare == null) continue;

      out.push({
        announcedOn,
        period: at(row, columns.period) || null,
        kind: classify(typeText),
        percent: percent ?? (perShare != null ? (perShare / FACE_VALUE) * 100 : null),
        perShare: perShare ?? (percent != null ? (percent / 100) * FACE_VALUE : null),
        bookClosureFrom: toIso(at(row, columns.from)),
        bookClosureTo: toIso(at(row, columns.to)),
        paymentDate: toIso(at(row, columns.payment)),
      });
    }
  }

  return out.sort((a, b) => (b.announcedOn ?? "").localeCompare(a.announcedOn ?? ""));
}

interface ParsedDividends {
  dividends: Dividend[];
  endpoint: string;
}

/** Throws when no payout table was recognised, so a failure is never cached. */
const loadDividends = unstable_cache(
  async (symbol: string): Promise<ParsedDividends> => {
    const page = await fetchKhistocksPage("dividends", symbol);
    if (!page.html || !page.url) {
      throw new UpstreamError(summariseAttempts(page.attempts));
    }

    const endpoint = page.url.replace(/^https?:\/\//, "");
    const dividends = parseDividendTables(page.html, symbol);
    if (dividends.length === 0) {
      throw new UpstreamError(`${endpoint} reached, but no payout table was recognised`);
    }
    return { dividends, endpoint };
  },
  ["khistocks-dividends-v1"],
  { revalidate: KHISTOCKS_TTL.dividends },
);

export async function getKhistocksDividends(symbolInput: string): Promise<Sourced<Dividend[]>> {
  const symbol = normalizeSymbol(symbolInput);
  try {
    const result = await loadDividends(symbol);
    return {
      data: result.dividends,
      notes: [note("khistocks", result.endpoint, true, `${result.dividends.length} payouts`)],
    };
  } catch (error) {
    return {
      data: [],
      notes: [note("khistocks", "khistocks.com", false, errorMessage(error))],
    };
  }
}
