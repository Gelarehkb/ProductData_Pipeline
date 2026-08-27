// Parses an uploaded Excel/CSV/TSV file into a header row + data rows, with
// the same header-row auto-detection heuristic used elsewhere in the app.
// Used by flows that don't ask the user to manually confirm the header row
// (e.g. the Smart page's AI column-mapping import).

import * as XLSX from "xlsx";
import { parseDelimitedText, detectDelimiter, decodeTextBuffer } from "@/lib/csvParsing";

export interface ParsedTabularFile {
  headers: string[];
  dataRows: string[][];
}

export async function parseTabularFile(file: File): Promise<ParsedTabularFile> {
  const isCsv = /\.(csv|tsv|txt)$/i.test(file.name) || file.type.includes("csv");
  let rows: string[][] = [];

  if (isCsv) {
    const buf = await file.arrayBuffer();
    const text = decodeTextBuffer(buf);
    const delimiter = detectDelimiter(text);
    rows = parseDelimitedText(text, delimiter);
  } else {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: false, raw: false });
    rows = aoa.map(r => (r as unknown[]).map(c => (c === null || c === undefined ? "" : String(c))));
  }

  while (rows.length && rows[rows.length - 1].every(c => (c ?? "").toString().trim() === "")) rows.pop();
  if (rows.length === 0) return { headers: [], dataRows: [] };

  // Auto-detect header row: first row where most cells look like short text labels.
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = rows[i].map(c => (c ?? "").toString().trim());
    const nonEmpty = cells.filter(Boolean);
    if (nonEmpty.length < 2) continue;
    const labelLike = nonEmpty.filter(v => v.length <= 40 && !/^\d+([.,]\d+)?$/.test(v)).length;
    if (labelLike >= Math.max(2, Math.floor(nonEmpty.length * 0.6))) { headerRowIndex = i; break; }
  }

  const headerRow = rows[headerRowIndex] ?? [];
  const headers = headerRow.map((c, i) => (c?.toString().trim() ? c.toString() : `Spalte ${i + 1}`));
  const dataRows = rows.slice(headerRowIndex + 1);
  return { headers, dataRows };
}
