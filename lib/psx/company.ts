import "server-only";

import { unstable_cache } from "next/cache";

import { findTableWithRow, labelValueMap, parseTables, pickLabel, pickNumber } from "@/lib/data/html";
import { errorMessage, fetchUpstream, note } from "@/lib/data/http";
import { sampleCompanyName, sampleSector, sampleShares } from "@/lib/data/sample";
import type { CompanyProfile, Dividend, DividendKind, Sourced } from "@/lib/data/types";
import { parseLooseNumber } from "@/lib/format";
import { normalizeSymbol } from "@/lib/utils";

import { PSX_ENDPOINTS, PSX_TTL } from "./endpoints";

/** PSX quotes payouts as a percentage of the Rs 10 face value. */
const FACE_VALUE = 10;

export interface CompanyPage {
  profile: CompanyProfile;
  dividends: Dividend[];
}

function parseCompanyHtml(symbol: string, html: string): CompanyPage {
  const map = labelValueMap(html);
  const tables = parseTables(html);

  const name = pickLabel(map, "company name", "name", "scrip name") ?? sampleCompanyName(symbol);
  const sector = pickLabel(map, "sector name", "sector");

  return {
    profile: {
      symbol,
      name,
      sector,
      isETF: /etf/i.test(pickLabel(map, "type", "instrument") ?? ""),
      listedShares: pickNumber(map, "shares outstanding", "listed shares", "outstanding shares"),
      freeFloat: pickNumber(map, "free float", "freefloat"),
      marketCap: pickNumber(map, "market cap", "market capitalisation", "market capitalization"),
      website: pickLabel(map, "website", "web"),
      address: pickLabel(map, "address", "registered office"),
      ceo: pickLabel(map, "chief executive", "ceo"),
    },
    dividends: parsePayouts(tables),
  };
}

/**
 * The company page lists payouts in a table whose first column is the announcement
 * date and which contains a "Cash Dividend"/"Bonus"/"Right" type column. Columns
 * are matched by header text because their order varies between layouts.
 */
function parsePayouts(tables: ReturnType<typeof parseTables>): Dividend[] {
  const table =
    tables.find((candidate) =>
      /payout|dividend|book\s*clos/i.test(`${candidate.title} ${candidate.headers.join(" ")}`),
    ) ?? findTableWithRow(tables, /cash dividend|bonus (issue|shares)|right (issue|shares)/i);

  if (!table) return [];

  const headers = table.headers.map((header) => header.toLowerCase());
  const indexOf = (...terms: string[]) =>
    headers.findIndex((header) => terms.some((term) => header.includes(term)));

  const columns = {
    announced: indexOf("announce", "date"),
    period: indexOf("period", "year", "quarter"),
    type: indexOf("type", "payout", "dividend type"),
    percent: indexOf("%", "percent", "rate"),
    from: indexOf("bc from", "from"),
    to: indexOf("bc to", "to"),
    payment: indexOf("payment", "pay date"),
  };

  const at = (row: string[], index: number) => (index >= 0 ? (row[index] ?? "") : "");

  return table.rows
    .map((row): Dividend | null => {
      const announcedRaw = at(row, columns.announced) || row[0] || "";
      const announcedOn = toIsoDate(announcedRaw);
      const typeText = at(row, columns.type) || row.join(" ");
      const kind = classifyPayout(typeText);
      const percent = parseLooseNumber(at(row, columns.percent)) ?? percentFromText(typeText);
      if (!announcedOn && percent == null) return null;

      return {
        announcedOn,
        period: at(row, columns.period) || null,
        kind,
        percent,
        perShare: percent != null ? (percent / 100) * FACE_VALUE : null,
        bookClosureFrom: toIsoDate(at(row, columns.from)),
        bookClosureTo: toIsoDate(at(row, columns.to)),
        paymentDate: toIsoDate(at(row, columns.payment)),
      };
    })
    .filter((item): item is Dividend => item !== null)
    .sort((a, b) => (b.announcedOn ?? "").localeCompare(a.announcedOn ?? ""));
}

function classifyPayout(text: string): DividendKind {
  if (/bonus/i.test(text)) return "bonus";
  if (/right/i.test(text)) return "right";
  if (/cash|dividend|interim|final/i.test(text)) return "cash";
  return "other";
}

function percentFromText(text: string) {
  const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) : null;
}

function toIsoDate(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const dmy = text.match(/^(\d{1,2})[\s/-]([A-Za-z]{3,}|\d{1,2})[\s/-](\d{4})$/);
  if (dmy) {
    const parsed = new Date(`${dmy[1]} ${dmy[2]} ${dmy[3]}`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

/**
 * Throws when the page can't be fetched, so a failure is never cached: the sample
 * profile is assembled outside the cache instead.
 */
const loadCompany = unstable_cache(
  async (symbol: string): Promise<CompanyPage> => {
    const html = await fetchUpstream(PSX_ENDPOINTS.company(symbol), {
      revalidate: PSX_TTL.company,
      tags: [`psx-company-${symbol}`],
    });
    return parseCompanyHtml(symbol, html);
  },
  ["psx-company-v2"],
  { revalidate: PSX_TTL.company },
);

export async function getCompanyPage(symbolInput: string): Promise<Sourced<CompanyPage>> {
  const symbol = normalizeSymbol(symbolInput);
  try {
    return {
      data: await loadCompany(symbol),
      notes: [note("psx", `dps.psx.com.pk/company/${symbol}`, true)],
    };
  } catch (error) {
    return {
      data: {
        profile: {
          symbol,
          name: sampleCompanyName(symbol),
          sector: sampleSector(symbol),
          isETF: false,
          listedShares: sampleShares(symbol),
          freeFloat: null,
          marketCap: null,
          website: null,
          address: null,
          ceo: null,
        },
        dividends: [],
      },
      notes: [note("psx", `dps.psx.com.pk/company/${symbol}`, false, errorMessage(error))],
    };
  }
}
