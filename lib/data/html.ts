import "server-only";

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

import { parseLooseNumber } from "@/lib/format";

/**
 * Generic HTML table helpers. Both PSX and khistocks render their data as plain
 * server-side `<table>`s with no stable ids or classes, so everything here works
 * off shape and row labels rather than selectors that are likely to change.
 */

export interface ParsedTable {
  headers: string[];
  rows: string[][];
  /** Caption or nearest preceding heading, used to identify which table this is. */
  title: string;
}

export function loadHtml(html: string) {
  return cheerio.load(html);
}

export function cleanText(input: string | null | undefined) {
  return (input ?? "")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lowercase, punctuation-free form used for fuzzy label matching. */
export function labelKey(input: string) {
  return cleanText(input)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseTables(html: string): ParsedTable[] {
  const $ = cheerio.load(html);
  const tables: ParsedTable[] = [];

  $("table").each((_, element) => {
    const table = $(element);
    const caption = cleanText(table.find("caption").first().text());
    const heading = cleanText(
      table.prevAll("h1,h2,h3,h4,h5,div.title,div.head").first().text() ||
        table.parent().prevAll("h1,h2,h3,h4,h5,div.title,div.head").first().text(),
    );

    const rows: string[][] = [];
    table.find("tr").each((__, tr) => {
      const cells: string[] = [];
      $(tr)
        .find("th,td")
        .each((___, cell) => {
          cells.push(cleanText($(cell).text()));
        });
      if (cells.some((cell) => cell.length > 0)) rows.push(cells);
    });

    if (rows.length === 0) return;

    // A header row is the first row that came from <th>, else the first row when it
    // carries no numbers (a row of pure labels).
    const headerCells: string[] = [];
    table
      .find("thead tr")
      .first()
      .find("th,td")
      .each((__, cell) => {
        headerCells.push(cleanText($(cell).text()));
      });

    let headers = headerCells;
    let body = rows;
    if (headers.length === 0) {
      const [first, ...rest] = rows;
      const numeric = first.filter((cell) => parseLooseNumber(cell) != null).length;
      if (numeric <= 1 && rest.length > 0) {
        headers = first;
        body = rest;
      }
    } else if (rows[0] && rows[0].join("|") === headers.join("|")) {
      body = rows.slice(1);
    }

    tables.push({ headers, rows: body, title: caption || heading });
  });

  return tables;
}

/** Find the first table whose title or headers mention every term. */
export function findTable(tables: ParsedTable[], ...terms: string[]) {
  const wanted = terms.map((term) => term.toLowerCase());
  return tables.find((table) => {
    const haystack = `${table.title} ${table.headers.join(" ")}`.toLowerCase();
    return wanted.every((term) => haystack.includes(term));
  });
}

/** Find the first table containing a row whose first cell matches `pattern`. */
export function findTableWithRow(tables: ParsedTable[], pattern: RegExp) {
  return tables.find((table) => table.rows.some((row) => pattern.test(row[0] ?? "")));
}

/**
 * Collapse a label/value table (two-column "key: value" layouts, which both sites
 * use for company profiles) into a lookup keyed by the normalised label.
 */
export function labelValueMap(html: string): Map<string, string> {
  const $ = cheerio.load(html);
  const map = new Map<string, string>();

  const record = (rawLabel: string, rawValue: string) => {
    const key = labelKey(rawLabel);
    const value = cleanText(rawValue);
    if (key && value && !map.has(key)) map.set(key, value);
  };

  $("tr").each((_, tr) => {
    const cells = $(tr).find("th,td");
    if (cells.length === 2) {
      record($(cells[0]).text(), $(cells[1]).text());
    }
  });

  // PSX's company page also uses definition-list-ish div pairs.
  $("dl").each((_, dl) => {
    const terms = $(dl).find("dt");
    const defs = $(dl).find("dd");
    terms.each((index, dt) => {
      const dd = defs[index] as AnyNode | undefined;
      if (dd) record($(dt).text(), $(dd).text());
    });
  });

  $("[data-label]").each((_, element) => {
    record($(element).attr("data-label") ?? "", $(element).text());
  });

  return map;
}

/** Look a value up by any of several candidate labels, matching on substrings. */
export function pickLabel(map: Map<string, string>, ...candidates: string[]) {
  for (const candidate of candidates) {
    const key = labelKey(candidate);
    const exact = map.get(key);
    if (exact) return exact;
  }
  for (const candidate of candidates) {
    const key = labelKey(candidate);
    for (const [mapKey, value] of map) {
      if (mapKey.includes(key)) return value;
    }
  }
  return null;
}

export function pickNumber(map: Map<string, string>, ...candidates: string[]) {
  return parseLooseNumber(pickLabel(map, ...candidates));
}
