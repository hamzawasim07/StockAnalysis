import type { Bar, PriceStats, Quote } from "@/lib/data/types";

/**
 * PSX doesn't expose a documented real-time quote endpoint, so the "current"
 * snapshot is derived from the most recent bars already loaded. That makes these
 * figures end-of-day accurate, not live.
 */
export function quoteFromBars(symbol: string, bars: Bar[]): Quote {
  const last = bars.at(-1);
  const previous = bars.at(-2);

  if (!last) {
    return {
      symbol,
      price: null,
      previousClose: null,
      change: null,
      changePercent: null,
      open: null,
      dayHigh: null,
      dayLow: null,
      volume: null,
      asOf: null,
    };
  }

  const previousClose = previous?.close ?? last.open;
  const change = last.close - previousClose;

  return {
    symbol,
    price: last.close,
    previousClose,
    change,
    changePercent: previousClose ? (change / previousClose) * 100 : null,
    open: last.open,
    dayHigh: last.high,
    dayLow: last.low,
    volume: last.volume,
    turnover: last.volume * last.close,
    asOf: last.date,
  };
}

export function statsFromBars(bars: Bar[]): PriceStats {
  if (bars.length === 0) {
    return {
      periodHigh: null,
      periodLow: null,
      fiftyTwoWeekHigh: null,
      fiftyTwoWeekLow: null,
      averageVolume: null,
      periodReturnPercent: null,
      volatilityPercent: null,
      barCount: 0,
    };
  }

  const highs = bars.map((bar) => bar.high);
  const lows = bars.map((bar) => bar.low);
  const volumes = bars.map((bar) => bar.volume);

  const yearAgo = new Date();
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
  const yearWindow = bars.filter((bar) => bar.date >= yearAgo.toISOString().slice(0, 10));
  const window = yearWindow.length > 0 ? yearWindow : bars;

  const first = bars[0].close;
  const last = bars[bars.length - 1].close;

  return {
    periodHigh: Math.max(...highs),
    periodLow: Math.min(...lows),
    fiftyTwoWeekHigh: Math.max(...window.map((bar) => bar.high)),
    fiftyTwoWeekLow: Math.min(...window.map((bar) => bar.low)),
    averageVolume: volumes.reduce((sum, value) => sum + value, 0) / volumes.length,
    periodReturnPercent: first ? ((last - first) / first) * 100 : null,
    volatilityPercent: annualisedVolatility(bars),
    barCount: bars.length,
  };
}

/** Standard deviation of daily log returns, annualised over 252 trading days. */
function annualisedVolatility(bars: Bar[]): number | null {
  if (bars.length < 3) return null;
  const returns: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const previous = bars[i - 1].close;
    const current = bars[i].close;
    if (previous > 0 && current > 0) returns.push(Math.log(current / previous));
  }
  if (returns.length < 2) return null;

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

/** Simple moving average aligned to `bars`, with nulls until the window fills. */
export function movingAverage(bars: Bar[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close;
    if (i >= window) sum -= bars[i - window].close;
    out.push(i >= window - 1 ? sum / window : null);
  }
  return out;
}

/** Downsample a long series so charts stay responsive, keeping first and last. */
export function downsample(bars: Bar[], maxPoints = 420): Bar[] {
  if (bars.length <= maxPoints) return bars;
  const step = bars.length / maxPoints;
  const out: Bar[] = [];
  for (let i = 0; i < maxPoints; i++) out.push(bars[Math.floor(i * step)]);
  const last = bars[bars.length - 1];
  if (out[out.length - 1].date !== last.date) out.push(last);
  return out;
}
