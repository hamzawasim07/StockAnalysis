import { describe, expect, it } from "vitest";

import { formatAxisCompact, formatCompactPKR, parseLooseNumber } from "@/lib/format";

describe("parseLooseNumber", () => {
  it("strips thousands separators and currency prefixes", () => {
    expect(parseLooseNumber("1,234,567")).toBe(1234567);
    expect(parseLooseNumber("Rs 1,234.56")).toBe(1234.56);
    expect(parseLooseNumber("PKR 88")).toBe(88);
  });

  it("reads accounting parentheses as negative", () => {
    // Every PSX filing prints losses and outflows this way.
    expect(parseLooseNumber("(292,560,300)")).toBe(-292560300);
    expect(parseLooseNumber("(1.57)")).toBe(-1.57);
  });

  it("handles percentages and explicit signs", () => {
    expect(parseLooseNumber("2.23%")).toBe(2.23);
    expect(parseLooseNumber("-0.98")).toBe(-0.98);
  });

  it("returns null for placeholders rather than zero", () => {
    // Zero and "not reported" mean different things on a financial statement.
    for (const blank of ["", "—", "-", "N/A", "n/a", null, undefined]) {
      expect(parseLooseNumber(blank)).toBeNull();
    }
  });

  it("tolerates non-breaking spaces from scraped HTML", () => {
    expect(parseLooseNumber("1 234")).toBe(1234);
  });
});

describe("formatting", () => {
  it("uses the mn/bn scale PSX filings use", () => {
    expect(formatCompactPKR(420_116_500_000)).toBe("Rs 420.12bn");
    expect(formatCompactPKR(61_847_500)).toBe("Rs 61.85mn");
    expect(formatCompactPKR(-8_014_400)).toBe("-Rs 8.01mn");
  });

  it("keeps axis labels short", () => {
    expect(formatAxisCompact(600_000_000_000)).toBe("600bn");
    expect(formatAxisCompact(500_000)).toBe("500k");
  });

  it("renders missing values as an em dash, never 0", () => {
    expect(formatCompactPKR(null)).toBe("—");
    expect(formatCompactPKR(undefined)).toBe("—");
  });
});
