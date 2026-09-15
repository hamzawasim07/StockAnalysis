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
  ["psx-symbols-v2"],
  { revalidate: PSX_TTL.symbols, tags: ["psx-symbols"] },
);

/** The scraped directory, used only when the documented API can't supply one. */
export async function getScrapedSymbols(): Promise<Sourced<SymbolInfo[]>> {
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
