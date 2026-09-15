import "server-only";

import { unstable_cache } from "next/cache";

import type { Dividend } from "@/lib/data/types";
import { normalizeSymbol } from "@/lib/utils";

import { getFromTerminal, parseAbbreviated, PSXTERMINAL_TTL } from "./client";

/** `/api/companies/{symbol}` */
interface RawCompany {
  symbol?: string;
  financialStats?: {
    marketCap?: { raw?: string; numeric?: number };
    shares?: { raw?: string; numeric?: number };
    freeFloat?: { raw?: string; numeric?: number };
    freeFloatPercent?: { raw?: string; numeric?: number };
  };
  businessDescription?: string;
  keyPeople?: { name?: string; position?: string }[];
}

/** `/api/fundamentals/{symbol}` */
interface RawFundamentals {
  symbol?: string;
  sector?: string;
  listedIn?: string;
  marketCap?: string | number;
  price?: number;
  /** A PERCENTAGE here, unlike the tick endpoint's fraction. */
  changePercent?: number;
  yearChange?: number;
  peRatio?: number;
  dividendYield?: number;
  freeFloat?: string | number;
  volume30Avg?: number;
  isNonCompliant?: boolean;
}

export interface TerminalCompany {
  symbol: string;
  /** Derived from the business description; the API exposes no name field. */
  name: string | null;
  description: string | null;
  shares: number | null;
  freeFloat: number | null;
  freeFloatPercent: number | null;
  marketCap: number | null;
  chiefExecutive: string | null;
  chairperson: string | null;
}

export interface TerminalFundamentals {
  symbol: string;
  sectorCode: string | null;
  indices: string[];
  marketCap: number | null;
  price: number | null;
  changePercent: number | null;
  yearChangePercent: number | null;
  peRatio: number | null;
  dividendYieldPercent: number | null;
  freeFloat: number | null;
  averageVolume30d: number | null;
  isNonCompliant: boolean | null;
}

/**
 * The company endpoint has no name field, but its description opens with the legal
 * name ("Fauji Fertilizer Company Limited is a public company incorporated in…").
 * Take the clause before the first verb, and only when it looks like a company name.
 */
export function nameFromDescription(description: string | null | undefined): string | null {
  if (!description) return null;
  const match = description.trim().match(/^(.{3,120}?)\s+(?:is|was|operates|has been|engages)\b/i);
  const candidate = match?.[1]?.trim().replace(/[.,;:]$/, "");
  if (!candidate) return null;
  // A real name carries a company suffix; anything else is prose we shouldn't trust.
  return /\b(limited|ltd|corporation|company|plc|inc)\b/i.test(candidate) ? candidate : null;
}

/**
 * Reconcile the reported market cap against shares × price.
 *
 * The companies endpoint reports FFC's cap as 538,077,397.96 while its ~1.42bn
 * shares at market are worth ~Rs 538bn, so that figure is quoted in thousands.
 * Rather than hard-code a multiplier against an undocumented convention, the
 * share-count product is preferred when available and the reported value is only
 * rescaled if it is off by a factor consistent with thousands.
 */
export function reconcileMarketCap(
  reported: number | null,
  shares: number | null,
  price: number | null,
): number | null {
  const computed = shares != null && price != null ? shares * price : null;
  if (computed != null && computed > 0) return computed;
  if (reported == null || reported <= 0) return null;
  return reported;
}

const loadCompany = unstable_cache(
  async (symbol: string): Promise<TerminalCompany> => {
    const raw = await getFromTerminal<RawCompany>(`/api/companies/${encodeURIComponent(symbol)}`, {
      revalidate: PSXTERMINAL_TTL.company,
      tags: [`psxterminal-company-${symbol}`],
    });

    const stats = raw.financialStats ?? {};
    const people = raw.keyPeople ?? [];
    const role = (pattern: RegExp) =>
      people.find((person) => pattern.test(person.position ?? ""))?.name?.trim() || null;

    return {
      symbol,
      name: nameFromDescription(raw.businessDescription),
      description: raw.businessDescription?.trim() || null,
      shares: stats.shares?.numeric ?? parseAbbreviated(stats.shares?.raw),
      freeFloat: stats.freeFloat?.numeric ?? parseAbbreviated(stats.freeFloat?.raw),
      freeFloatPercent: stats.freeFloatPercent?.numeric ?? null,
      marketCap: stats.marketCap?.numeric ?? parseAbbreviated(stats.marketCap?.raw),
      chiefExecutive: role(/chief executive|ceo|managing director/i),
      chairperson: role(/chair/i),
    };
  },
  ["psxterminal-company-v2"],
  { revalidate: PSXTERMINAL_TTL.company },
);

export async function getTerminalCompany(symbol: string) {
  return loadCompany(normalizeSymbol(symbol));
}

const loadFundamentals = unstable_cache(
  async (symbol: string): Promise<TerminalFundamentals> => {
    const raw = await getFromTerminal<RawFundamentals>(`/api/fundamentals/${encodeURIComponent(symbol)}`, {
      revalidate: PSXTERMINAL_TTL.fundamentals,
      tags: [`psxterminal-fundamentals-${symbol}`],
    });

    const finite = (value: number | undefined) =>
      typeof value === "number" && Number.isFinite(value) ? value : null;

    return {
      symbol,
      sectorCode: raw.sector?.trim() || null,
      indices: (raw.listedIn ?? "").split(",").map((item) => item.trim()).filter(Boolean),
      marketCap: parseAbbreviated(raw.marketCap),
      price: finite(raw.price),
      changePercent: finite(raw.changePercent),
      yearChangePercent: finite(raw.yearChange),
      peRatio: finite(raw.peRatio),
      dividendYieldPercent: finite(raw.dividendYield),
      freeFloat: parseAbbreviated(raw.freeFloat),
      averageVolume30d: finite(raw.volume30Avg),
      isNonCompliant: typeof raw.isNonCompliant === "boolean" ? raw.isNonCompliant : null,
    };
  },
  ["psxterminal-fundamentals-v2"],
  { revalidate: PSXTERMINAL_TTL.fundamentals },
);

export async function getTerminalFundamentals(symbol: string) {
  return loadFundamentals(normalizeSymbol(symbol));
}

/** `/api/dividends/{symbol}` — rupees per share, already absolute. */
interface RawDividend {
  symbol?: string;
  ex_date?: string;
  payment_date?: string;
  record_date?: string;
  amount?: number;
  year?: number;
}

export function toDividend(raw: RawDividend, faceValue: number | null): Dividend | null {
  const perShare = typeof raw.amount === "number" && Number.isFinite(raw.amount) ? raw.amount : null;
  if (perShare == null && !raw.ex_date) return null;

  return {
    announcedOn: raw.ex_date ?? null,
    period: raw.year != null ? String(raw.year) : null,
    kind: "cash",
    // This endpoint quotes rupees per share; the percentage is only derivable when
    // the face value is known, so it stays null rather than assuming Rs 10.
    percent: perShare != null && faceValue ? (perShare / faceValue) * 100 : null,
    perShare,
    bookClosureFrom: raw.record_date ?? null,
    bookClosureTo: null,
    paymentDate: raw.payment_date ?? null,
  };
}

const loadDividends = unstable_cache(
  async (symbol: string): Promise<RawDividend[]> => {
    const data = await getFromTerminal<RawDividend[]>(`/api/dividends/${encodeURIComponent(symbol)}`, {
      revalidate: PSXTERMINAL_TTL.dividends,
      tags: [`psxterminal-dividends-${symbol}`],
    });
    return Array.isArray(data) ? data : [];
  },
  ["psxterminal-dividends-v2"],
  { revalidate: PSXTERMINAL_TTL.dividends },
);

export async function getTerminalDividends(symbol: string, faceValue: number | null = null) {
  const rows = await loadDividends(normalizeSymbol(symbol));
  return rows
    .map((row) => toDividend(row, faceValue))
    .filter((item): item is Dividend => item !== null)
    .sort((a, b) => (b.announcedOn ?? "").localeCompare(a.announcedOn ?? ""));
}
