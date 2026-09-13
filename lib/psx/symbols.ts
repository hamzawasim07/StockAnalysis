import "server-only";

import { unstable_cache } from "next/cache";

import { errorMessage, fetchJson, note, UpstreamError } from "@/lib/data/http";
import type { Sourced, SymbolInfo } from "@/lib/data/types";
import { SAMPLE_SYMBOLS } from "@/lib/data/sample";
import { normalizeSymbol } from "@/lib/utils";

import { PSX_ENDPOINTS, PSX_TTL } from "./endpoints";

interface RawSymbol {
  symbol?: string;
  name?: string;
  sectorName?: string;
  sector?: string;
  isETF?: boolean;
  isDebt?: boolean;
}

function toSymbolInfo(raw: RawSymbol): SymbolInfo | null {
  const symbol = normalizeSymbol(raw.symbol ?? "");
  if (!symbol) return null;
  return {
    symbol,
    name: raw.name?.trim() || symbol,
    sector: (raw.sectorName ?? raw.sector ?? "").trim() || "Unclassified",
    isETF: Boolean(raw.isETF),
    isDebt: Boolean(raw.isDebt),
  };
}

/**
 * Only a usable directory is cached: on failure this throws, and a rejected promise
 * is never stored. Returning the sample fallback from inside the cache would pin a
 * transient blip in place for the full 24h TTL.
 */
const loadSymbols = unstable_cache(
  async (): Promise<SymbolInfo[]> => {
    const raw = await fetchJson<RawSymbol[]>(PSX_ENDPOINTS.symbols, {
      revalidate: PSX_TTL.symbols,
      tags: ["psx-symbols"],
      retries: 2,
    });
    const list = Array.isArray(raw)
      ? raw.map(toSymbolInfo).filter((item): item is SymbolInfo => item !== null)
      : [];
    if (list.length === 0) throw new UpstreamError("PSX returned an empty symbol list");
    list.sort((a, b) => a.symbol.localeCompare(b.symbol));
    return list;
  },
  ["psx-symbols-v1"],
  { revalidate: PSX_TTL.symbols, tags: ["psx-symbols"] },
);

export async function getSymbols(): Promise<Sourced<SymbolInfo[]>> {
  try {
    return { data: await loadSymbols(), notes: [note("psx", "dps.psx.com.pk/symbols", true)] };
  } catch (error) {
    return {
      data: SAMPLE_SYMBOLS,
      notes: [
        note("psx", "dps.psx.com.pk/symbols", false, errorMessage(error)),
        note("sample", "bundled directory", true, "PSX unreachable — using the bundled symbol directory"),
      ],
    };
  }
}

export async function getSymbolInfo(symbol: string): Promise<SymbolInfo | null> {
  const target = normalizeSymbol(symbol);
  const { data } = await getSymbols();
  return data.find((item) => item.symbol === target) ?? null;
}

/** Ranked symbol/name search used by the header command palette. */
export async function searchSymbols(query: string, limit = 12): Promise<SymbolInfo[]> {
  const term = query.trim().toLowerCase();
  const { data } = await getSymbols();
  if (!term) return data.slice(0, limit);

  const scored = data
    .map((item) => {
      const symbol = item.symbol.toLowerCase();
      const name = item.name.toLowerCase();
      let score = -1;
      if (symbol === term) score = 0;
      else if (symbol.startsWith(term)) score = 1;
      else if (name.startsWith(term)) score = 2;
      else if (symbol.includes(term)) score = 3;
      else if (name.includes(term)) score = 4;
      else if (item.sector.toLowerCase().includes(term)) score = 5;
      return { item, score };
    })
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => a.score - b.score || a.item.symbol.localeCompare(b.item.symbol));

  return scored.slice(0, limit).map((entry) => entry.item);
}

/** Symbol counts per sector, for the landing page sector grid. */
export async function getSectors(): Promise<{ sector: string; count: number }[]> {
  const { data } = await getSymbols();
  const counts = new Map<string, number>();
  for (const item of data) {
    if (item.isDebt) continue;
    counts.set(item.sector, (counts.get(item.sector) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([sector, count]) => ({ sector, count }))
    .sort((a, b) => b.count - a.count || a.sector.localeCompare(b.sector));
}
