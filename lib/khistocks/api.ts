import "server-only";

import { unstable_cache } from "next/cache";

import { errorMessage, fetchJson } from "@/lib/data/http";
import { parseLooseNumber } from "@/lib/format";
import { normalizeSymbol } from "@/lib/utils";

/**
 * khistocks serves company data as JSON under `/company/`, separately from the
 * rendered HTML pages. `getcompinfo` is the one confirmed endpoint; it carries the
 * registry details plus paid-up capital and — importantly — the paid-up *value*,
 * which is the face value payouts are quoted against.
 */
const BASE = "https://www.khistocks.com";

export const KHISTOCKS_API = {
  companyInfo: (symbol: string) => `${BASE}/company/getcompinfo/${encodeURIComponent(symbol)}`,
} as const;

/** Raw shape as served; every field is optional because nothing here is contractual. */
interface RawCompanyInfo {
  rowid?: number | string;
  brcode?: number | string;
  ksecode?: string;
  company_name?: string;
  fullname?: string;
  smallname?: string;
  address?: string;
  website?: string;
  email?: string;
  phone?: string;
  listing_year?: number | string;
  year_end?: string;
  paidupcapital?: number | string;
  paidupvalue?: number | string;
  representative_name?: string;
  representative_designation?: string;
  board_name?: string;
}

export interface KhistocksCompany {
  symbol: string;
  name: string | null;
  address: string | null;
  website: string | null;
  listingYear: number | null;
  /** Financial year end as published, e.g. "June 30". */
  yearEnd: string | null;
  /** Paid-up capital in rupees. */
  paidUpCapital: number | null;
  /** Face value per share — payouts are quoted as a percentage of this. */
  faceValue: number | null;
  chiefExecutive: string | null;
  /** khistocks' internal company id, used in its annual-report asset paths. */
  companyId: string | null;
}

/**
 * PSX's standard face value is Rs 10 and most scrips use it, but not all — and a
 * payout percentage read against the wrong face value gives the wrong rupees per
 * share. This is the fallback when the source doesn't say.
 */
export const DEFAULT_FACE_VALUE = 10;

export function mapCompanyInfo(symbol: string, raw: RawCompanyInfo | RawCompanyInfo[]): KhistocksCompany | null {
  const record = Array.isArray(raw) ? raw[0] : raw;
  if (!record || typeof record !== "object") return null;

  const name = (record.company_name ?? record.fullname ?? record.smallname ?? "").toString().trim();
  const faceValue = parseLooseNumber(String(record.paidupvalue ?? ""));

  return {
    symbol,
    name: name || null,
    address: record.address?.toString().trim() || null,
    website: record.website?.toString().trim() || null,
    listingYear: parseLooseNumber(String(record.listing_year ?? "")),
    yearEnd: record.year_end?.toString().trim() || null,
    paidUpCapital: parseLooseNumber(String(record.paidupcapital ?? "")),
    // A face value of 0 or a missing field means "not stated", not "free shares".
    faceValue: faceValue && faceValue > 0 ? faceValue : null,
    chiefExecutive: record.representative_name?.toString().trim() || null,
    companyId: record.rowid != null ? String(record.rowid) : record.brcode != null ? String(record.brcode) : null,
  };
}

const loadCompanyInfo = unstable_cache(
  async (symbol: string): Promise<KhistocksCompany> => {
    const raw = await fetchJson<RawCompanyInfo | RawCompanyInfo[]>(KHISTOCKS_API.companyInfo(symbol), {
      revalidate: 60 * 60 * 24,
      tags: [`khistocks-${symbol}`],
      timeoutMs: 10_000,
      retries: 0,
    });
    const mapped = mapCompanyInfo(symbol, raw);
    if (!mapped) throw new Error("company info endpoint returned no usable record");
    return mapped;
  },
  ["khistocks-company-info-v1"],
  { revalidate: 60 * 60 * 24 },
);

export async function getKhistocksCompany(
  symbolInput: string,
): Promise<{ company: KhistocksCompany | null; error: string | null }> {
  const symbol = normalizeSymbol(symbolInput);
  try {
    return { company: await loadCompanyInfo(symbol), error: null };
  } catch (error) {
    return { company: null, error: errorMessage(error) };
  }
}
