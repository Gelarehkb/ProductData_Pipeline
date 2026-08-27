// Shared CSV/TSV parsing primitives — quote-aware split, delimiter
// auto-detection, and BOM stripping. Used by any file importer in the app
// (ImportDialog, the JTL dictionary importer, the JTL catalog parser).

export function parseDelimitedText(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === delimiter) { row.push(field); field = ""; i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += ch; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 64 * 1024);
  let inQ = false;
  const counts: Record<string, number> = { "\t": 0, ";": 0, ",": 0, "|": 0 };
  for (let i = 0; i < sample.length; i++) {
    const c = sample[i];
    if (c === '"') {
      if (inQ && sample[i + 1] === '"') { i++; continue; }
      inQ = !inQ; continue;
    }
    if (!inQ && counts[c] !== undefined) counts[c]++;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries[0][1] > 0 ? entries[0][0] : ",";
}

export function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

// Decodes a file buffer as UTF-8, falling back to windows-1252 if the result
// looks corrupted (replacement characters) — JTL/Excel exports are commonly
// saved as cp1252.
export function decodeTextBuffer(buf: ArrayBuffer): string {
  let text = new TextDecoder("utf-8").decode(buf);
  if (text.includes("�")) {
    text = new TextDecoder("windows-1252").decode(buf);
  }
  return stripBom(text);
}
