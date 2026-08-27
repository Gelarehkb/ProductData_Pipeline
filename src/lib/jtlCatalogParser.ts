// Parses a full JTL product-export CSV/TSV, keeping full rows (not just a
// duplicate-check dictionary like the existing "JTL Import" feature in
// Index.tsx) — this is the reference catalog the Smart page uses to learn
// real, in-production Artikelnummer/Artikelname/HAN naming conventions.

import { parseDelimitedText, detectDelimiter, decodeTextBuffer } from "@/lib/csvParsing";

export interface JtlCatalogRow {
  interneSchluessel: string;
  artikelnummer: string;
  artikelname: string;
  han: string;
  ean: string;
  warengruppe: string;
  hersteller: string;
  lieferant: string;
  vaterartikel: string;
}

const HEADER_MATCHERS: Record<keyof JtlCatalogRow, string[]> = {
  interneSchluessel: ["interner schlüssel", "interner schluessel"],
  artikelnummer: ["artikelnummer"],
  artikelname: ["artikelname"],
  han: ["han"],
  ean: ["ean"],
  warengruppe: ["warengruppe"],
  hersteller: ["hersteller"],
  lieferant: ["lieferant"],
  vaterartikel: ["vaterartikel"],
};

function findColumnIndex(headers: string[], keywords: string[]): number {
  const lower = headers.map(h => (h ?? "").toString().trim().toLowerCase());
  for (let i = 0; i < lower.length; i++) {
    if (keywords.some(k => lower[i] === k || lower[i].includes(k))) return i;
  }
  return -1;
}

export function parseJtlCatalog(text: string): JtlCatalogRow[] {
  const delimiter = detectDelimiter(text);
  const rows = parseDelimitedText(text, delimiter).filter(r => r.some(c => (c ?? "").trim() !== ""));
  if (rows.length === 0) return [];

  const headers = rows[0];
  const colIdx: Record<keyof JtlCatalogRow, number> = {
    interneSchluessel: findColumnIndex(headers, HEADER_MATCHERS.interneSchluessel),
    artikelnummer: findColumnIndex(headers, HEADER_MATCHERS.artikelnummer),
    artikelname: findColumnIndex(headers, HEADER_MATCHERS.artikelname),
    han: findColumnIndex(headers, HEADER_MATCHERS.han),
    ean: findColumnIndex(headers, HEADER_MATCHERS.ean),
    warengruppe: findColumnIndex(headers, HEADER_MATCHERS.warengruppe),
    hersteller: findColumnIndex(headers, HEADER_MATCHERS.hersteller),
    lieferant: findColumnIndex(headers, HEADER_MATCHERS.lieferant),
    vaterartikel: findColumnIndex(headers, HEADER_MATCHERS.vaterartikel),
  };

  const get = (row: string[], idx: number): string => (idx >= 0 ? (row[idx] ?? "").toString().trim() : "");

  return rows.slice(1)
    .map(row => ({
      interneSchluessel: get(row, colIdx.interneSchluessel),
      artikelnummer: get(row, colIdx.artikelnummer),
      artikelname: get(row, colIdx.artikelname),
      han: get(row, colIdx.han),
      ean: get(row, colIdx.ean),
      warengruppe: get(row, colIdx.warengruppe),
      hersteller: get(row, colIdx.hersteller),
      lieferant: get(row, colIdx.lieferant),
      vaterartikel: get(row, colIdx.vaterartikel),
    }))
    .filter(r => r.artikelnummer !== "" || r.artikelname !== "");
}

export async function parseJtlCatalogFile(file: File): Promise<JtlCatalogRow[]> {
  const buf = await file.arrayBuffer();
  const text = decodeTextBuffer(buf);
  return parseJtlCatalog(text);
}
