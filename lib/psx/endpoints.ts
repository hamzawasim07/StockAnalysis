import "server-only";

/**
 * dps.psx.com.pk (the PSX Data Portal) has no documented public API. These are the
 * endpoints the portal's own front-end calls; shapes were taken from the widely
 * used open-source `psx-data-reader` package and the portal's network traffic.
 *
 * Everything that reads them is written defensively — if PSX changes a layout the
 * parser returns nothing and the UI reports the gap rather than showing junk.
 */
export const PSX_BASE = "https://dps.psx.com.pk";

export const PSX_ENDPOINTS = {
  /** JSON: every listed symbol with name and sector. */
  symbols: `${PSX_BASE}/symbols`,
  /** HTML fragment: one month of daily OHLCV, POST form {month, year, symbol}. */
  historical: `${PSX_BASE}/historical`,
  /** JSON: end-of-day close/volume series for the last ~year. */
  eod: (symbol: string) => `${PSX_BASE}/timeseries/eod/${encodeURIComponent(symbol)}`,
  /** JSON: today's intraday ticks. */
  intraday: (symbol: string) => `${PSX_BASE}/timeseries/int/${encodeURIComponent(symbol)}`,
  /** HTML: company page — profile, key stats, payouts, financial summary. */
  company: (symbol: string) => `${PSX_BASE}/company/${encodeURIComponent(symbol)}`,
  /** HTML: full board snapshot for every scrip. */
  marketWatch: `${PSX_BASE}/market-watch`,
} as const;

/** Cache lifetimes, in seconds. */
export const PSX_TTL = {
  symbols: 60 * 60 * 24,
  history: 60 * 60 * 6,
  quote: 60 * 5,
  company: 60 * 60 * 12,
  marketWatch: 60 * 5,
} as const;
