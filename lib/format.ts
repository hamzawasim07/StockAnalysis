/**
 * Display formatting. PSX reports in Pakistani Rupees and companies file their
 * accounts in thousands (`Rs '000`), so most of these helpers deal in PKR.
 */

const numberFmt = new Intl.NumberFormat("en-US");

export function formatNumber(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatInt(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return numberFmt.format(Math.round(value));
}

/** Rs 1,234.56 */
export function formatPKR(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `Rs ${formatNumber(value, digits)}`;
}

/**
 * Compact PKR using the South Asian scale that PSX filings and khistocks use:
 * thousand / million / billion (crore and lakh are avoided — PSX reports use mn/bn).
 */
export function formatCompact(value: number | null | undefined, prefix = "") {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${prefix}${formatNumber(abs / 1e12, 2)}T`;
  if (abs >= 1e9) return `${sign}${prefix}${formatNumber(abs / 1e9, 2)}bn`;
  if (abs >= 1e6) return `${sign}${prefix}${formatNumber(abs / 1e6, 2)}mn`;
  if (abs >= 1e3) return `${sign}${prefix}${formatNumber(abs / 1e3, 1)}k`;
  return `${sign}${prefix}${formatNumber(abs, 2)}`;
}

/** Compact form for chart axes: no decimals unless the value is small. */
export function formatAxisCompact(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${formatNumber(abs / 1e12, abs >= 1e13 ? 0 : 1)}T`;
  if (abs >= 1e9) return `${sign}${formatNumber(abs / 1e9, abs >= 1e10 ? 0 : 1)}bn`;
  if (abs >= 1e6) return `${sign}${formatNumber(abs / 1e6, abs >= 1e7 ? 0 : 1)}mn`;
  if (abs >= 1e3) return `${sign}${formatNumber(abs / 1e3, 0)}k`;
  return `${sign}${formatNumber(abs, abs >= 10 ? 0 : 1)}`;
}

export function formatCompactPKR(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatCompact(value, "Rs ");
}

export function formatPercent(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${formatNumber(value, digits)}%`;
}

/** Signed percent, for day change and growth columns. */
export function formatSignedPercent(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, digits)}%`;
}

export function formatSigned(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, digits)}`;
}

/** `2026-09-13` -> `13 Sep 2026` */
export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Short axis label: `13 Sep` for intra-year ranges, `Sep '25` for long ones. */
export function formatAxisDate(iso: string, long = false) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  if (long) {
    return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${formatDate(iso)}, ${date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Karachi",
  })} PKT`;
}

/** Direction of a change, used to pick the up/down/flat colour. */
export type Direction = "up" | "down" | "flat";

export function directionOf(value: number | null | undefined): Direction {
  if (value == null || !Number.isFinite(value) || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

export const directionTextClass: Record<Direction, string> = {
  up: "text-[var(--gain)]",
  down: "text-[var(--loss)]",
  flat: "text-muted-foreground",
};

export const directionBgClass: Record<Direction, string> = {
  up: "bg-[var(--gain)]/10 text-[var(--gain)]",
  down: "bg-[var(--loss)]/10 text-[var(--loss)]",
  flat: "bg-muted text-muted-foreground",
};

/**
 * Parse a number out of scraped HTML: strips thousands separators, currency
 * prefixes and footnote markers, and reads `(1,234)` as negative (accounting
 * convention used throughout PSX financial statements).
 */
export function parseLooseNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let text = String(raw).replace(/ /g, " ").trim();
  if (!text || /^[-–—]+$/.test(text) || /^n\/?a$/i.test(text)) return null;

  const negative = /^\(.*\)$/.test(text);
  text = text
    .replace(/^\(|\)$/g, "")
    .replace(/(rs\.?|pkr)/gi, "")
    .replace(/[,\s]/g, "")
    .replace(/%$/, "");

  const match = text.match(/-?\d*\.?\d+/);
  if (!match) return null;
  const value = Number(match[0]);
  if (!Number.isFinite(value)) return null;
  return negative ? -Math.abs(value) : value;
}
