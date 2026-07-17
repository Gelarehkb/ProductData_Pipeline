import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Upload, Download, AlertTriangle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// This page is fully self-contained: its own parsing, its own export, no shared
// state or logic with the other pages. Nothing here is imported by, or imports
// from, Index.tsx / TextGenerator.tsx / ArtikelAnlegen.tsx.

// ── Source columns pulled from the uploaded file (everything else is dropped) ──
// Each entry's aliases are matched against the uploaded header row, case/whitespace-
// insensitively; the first match wins.
const SOURCE_COLUMNS: { label: string; aliases: string[] }[] = [
  { label: "Interner Schlüssel", aliases: ["interner schlüssel", "interner schluessel"] },
  { label: "Artikelnummer", aliases: ["artikelnummer"] },
  { label: "EAN/Barcode", aliases: ["ean/barcode", "ean", "barcode"] },
  { label: "HAN", aliases: ["han"] },
  { label: "Brutto-VK", aliases: ["brutto-vk", "brutto vk"] },
];
const VK_OUTPUT_INDEX = SOURCE_COLUMNS.findIndex(c => c.label === "Brutto-VK");

// ── New discount-import columns appended to the export ───────────────────────
const NEW_COLUMNS = [
  "Sonderpreis Endkunden brutto",
  "Sonderpreise aktivieren vom (Startdatum)",
  "Bis einschließlich (Enddatum)",
  "Bis Anzahl im Lager kleiner als",
  "Erstelldatum",
] as const;

interface ExtraRowValues {
  sonderpreis: string;
  startdatum: string;
  enddatum: string;
  lagerbestand: string;
}

const emptyExtra = (): ExtraRowValues => ({ sonderpreis: "", startdatum: "", enddatum: "", lagerbestand: "" });

const DATE_RE = /^\d{2}\.\d{2}\.\d{4}$/;

// ── CSV utilities (quote-aware parse, delimiter auto-detect, BOM strip) ──────
function parseDelimitedText(text: string, delimiter: string): string[][] {
  const out: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; continue; }
        inQuotes = false; continue;
      }
      field += ch; continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === delimiter) { row.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(field); out.push(row); row = []; field = ""; continue; }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); out.push(row); }
  return out.filter(r => r.some(c => c.trim() !== ""));
}

function detectDelimiter(text: string): string {
  const sample = text.slice(0, 64 * 1024);
  let inQ = false;
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  for (let i = 0; i < sample.length; i++) {
    const c = sample[i];
    if (c === '"') { if (inQ && sample[i + 1] === '"') { i++; continue; } inQ = !inQ; continue; }
    if (!inQ && counts[c] !== undefined) counts[c]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ";";
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

// ── CSV cell escaping for export (semicolon-delimited, matches the rest of the app) ──
function escapeCsvCell(v: string): string {
  let s = String(v ?? "");
  s = s.replace(/\r\n|\r|\n/g, " ").trim();
  if (/[";]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export default function Discounts() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  // Projected down to just SOURCE_COLUMNS, in that fixed order — everything else
  // in the uploaded file is dropped, per the columns actually needed here.
  const [rows, setRows] = useState<string[][]>([]);
  const [extraValues, setExtraValues] = useState<ExtraRowValues[]>([]);
  const [missingColumns, setMissingColumns] = useState<string[] | null>(null);

  const [globalSonderpreis, setGlobalSonderpreis] = useState("");
  const [globalStart, setGlobalStart] = useState("");
  const [globalEnd, setGlobalEnd] = useState("");
  const [globalLager, setGlobalLager] = useState("");

  const hasData = rows.length > 0;

  const loadParsedTable = (parsedHeaders: string[], parsedRows: string[][], loadedFileName: string) => {
    const normalizedIncoming = parsedHeaders.map(normalizeHeader);
    const colIndices = SOURCE_COLUMNS.map(col =>
      normalizedIncoming.findIndex(h => col.aliases.includes(h) || col.aliases.some(a => h.includes(a)))
    );

    const projectedRows = parsedRows.map(row => colIndices.map(idx => (idx >= 0 ? (row[idx] ?? "").trim() : "")));

    setRows(projectedRows);
    setExtraValues(projectedRows.map(() => emptyExtra()));
    setFileName(loadedFileName);

    const missing = SOURCE_COLUMNS.filter((_, i) => colIndices[i] === -1).map(c => c.label);
    setMissingColumns(missing);

    toast({
      title: "Datei geladen",
      description: `${projectedRows.length} Zeile(n) aus "${loadedFileName}".`,
    });
  };

  const handleFile = async (file: File) => {
    try {
      const isCsv = /\.(csv|txt)$/i.test(file.name);
      let parsedHeaders: string[] = [];
      let parsedRows: string[][] = [];

      if (isCsv) {
        const buf = await file.arrayBuffer();
        // Try UTF-8 first; only fall back to windows-1252 if decoding produced a
        // replacement char — decoding cp1252 first would silently mangle genuine
        // UTF-8 umlauts instead.
        let text = new TextDecoder("utf-8").decode(buf);
        if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buf);
        text = stripBom(text);
        const delimiter = detectDelimiter(text);
        const all = parseDelimitedText(text, delimiter);
        if (all.length < 1) {
          toast({ title: "Keine Daten", description: "Die Datei enthält keine verwertbaren Zeilen.", variant: "destructive" });
          return;
        }
        parsedHeaders = all[0].map(h => h.trim());
        parsedRows = all.slice(1);
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "", blankrows: false, raw: false });
        if (aoa.length < 1) {
          toast({ title: "Keine Daten", description: "Die Datei enthält keine verwertbaren Zeilen.", variant: "destructive" });
          return;
        }
        parsedHeaders = (aoa[0] as string[]).map(h => String(h ?? "").trim());
        parsedRows = (aoa.slice(1) as string[][]).map(r => r.map(c => String(c ?? "")));
      }

      // Normalize row length to header length (ragged rows from source files are common).
      parsedRows = parsedRows.map(r => {
        if (r.length === parsedHeaders.length) return r;
        const fixed = r.slice(0, parsedHeaders.length);
        while (fixed.length < parsedHeaders.length) fixed.push("");
        return fixed;
      });

      loadParsedTable(parsedHeaders, parsedRows, file.name);
    } catch (err) {
      toast({ title: "Fehler beim Importieren", description: String(err), variant: "destructive" });
    }
  };

  const handleApplyAll = () => {
    if (!hasData) return;

    const pct = parseFloat(globalSonderpreis.replace(",", "."));
    const hasPct = globalSonderpreis.trim() !== "" && !isNaN(pct) && pct > 0 && pct <= 100;

    let sonderpreisPerRow: string[] | null = null;
    if (globalSonderpreis.trim() !== "") {
      if (!hasPct) {
        toast({
          title: "Ungültiger Rabatt",
          description: "Bitte einen Prozentsatz zwischen 0 und 100 eingeben (z.B. 5).",
          variant: "destructive",
        });
        return;
      }
      // Compute the actual reduced price per row rather than writing an Excel
      // formula string — formulas render as literal text unless the CSV is
      // opened in a way that re-parses leading "=" as a formula, which isn't
      // reliable across import methods/apps.
      const multiplier = 1 - pct / 100;
      sonderpreisPerRow = rows.map(row => {
        const vkRaw = row[VK_OUTPUT_INDEX] ?? "";
        const vk = parseFloat(vkRaw.replace(",", "."));
        if (isNaN(vk)) return "";
        return (vk * multiplier).toFixed(2).replace(".", ",");
      });
    }

    setExtraValues(prev => prev.map((_, i) => ({
      sonderpreis: sonderpreisPerRow ? sonderpreisPerRow[i] : "",
      startdatum: globalStart,
      enddatum: globalEnd,
      lagerbestand: globalLager,
    })));
    toast({
      title: "Übernommen",
      description: `Werte wurden auf alle ${rows.length} Zeilen angewendet.`,
    });
  };

  const handleDownload = () => {
    if (!hasData) return;
    const allHeaders = [...SOURCE_COLUMNS.map(c => c.label), ...NEW_COLUMNS];
    const lines = [
      allHeaders.map(escapeCsvCell).join(";"),
      ...rows.map((row, i) => {
        const extra = extraValues[i] ?? emptyExtra();
        // "Erstelldatum" is always empty, per spec.
        const full = [...row, extra.sonderpreis, extra.startdatum, extra.enddatum, extra.lagerbestand, ""];
        return full.map(escapeCsvCell).join(";");
      }),
    ];
    const csvContent = lines.join("\r\n");
    const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, "0")}${String(today.getMonth() + 1).padStart(2, "0")}${today.getFullYear()}`;
    const base = fileName.replace(/\.[^.]+$/, "") || "export";
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}_discounts_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const startInvalid = globalStart.trim() !== "" && !DATE_RE.test(globalStart.trim());
  const endInvalid = globalEnd.trim() !== "" && !DATE_RE.test(globalEnd.trim());

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-[1400px] mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <a href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Zurück
          </a>
          <h1 className="text-2xl font-bold text-foreground">Discounts</h1>
        </div>

        {/* ── Upload ──────────────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4" />
            Datei hochladen (CSV/Excel)
          </Button>
          {fileName ? (
            <span className="text-sm text-muted-foreground flex items-center gap-2 min-w-0">
              <FileSpreadsheet className="h-4 w-4 shrink-0" />
              <span className="font-medium text-foreground truncate max-w-[300px]" title={fileName}>{fileName}</span>
              <span className="shrink-0">{rows.length.toLocaleString("de-DE")} Zeilen</span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">Noch keine Datei geladen.</span>
          )}
        </div>

        {/* ── Column detection status ─────────────────────────────────────── */}
        {missingColumns !== null && (
          <div className={`rounded-lg border px-4 py-3 mb-4 text-sm ${
            missingColumns.length > 0
              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
              : "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400"
          }`}>
            {missingColumns.length > 0 ? (
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Erwartete Spalten fehlen (Verarbeitung läuft trotzdem weiter):</p>
                  <p className="mt-0.5">{missingColumns.join(", ")}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Alle erwarteten Spalten wurden erkannt.
              </div>
            )}
          </div>
        )}

        {hasData && (
          <>
            {/* ── Global input fields ──────────────────────────────────────── */}
            <div className="bg-card border border-border rounded-lg p-4 mb-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1">
                  <Label htmlFor="sonderpreis" className="text-xs">Sonderpreis-Rabatt %</Label>
                  <Input
                    id="sonderpreis"
                    value={globalSonderpreis}
                    onChange={(e) => setGlobalSonderpreis(e.target.value)}
                    placeholder="z.B. 5"
                    title="Berechnet den reduzierten Preis je Zeile für 'Sonderpreis Endkunden brutto': Brutto-VK * (1 - Rabatt%), z.B. 5% Rabatt auf 49,99 → 47,49."
                    className="w-32"
                  />
                  <p className="text-[11px] text-muted-foreground">= Brutto-VK × (1 − %)</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="startdatum" className="text-xs">Startdatum</Label>
                  <Input
                    id="startdatum"
                    value={globalStart}
                    onChange={(e) => setGlobalStart(e.target.value)}
                    placeholder="TT.MM.JJJJ"
                    className={`w-32 ${startInvalid ? "border-destructive" : ""}`}
                  />
                  <p className="text-[11px] text-muted-foreground">Format: TT.MM.JJJJ</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="enddatum" className="text-xs">Enddatum</Label>
                  <Input
                    id="enddatum"
                    value={globalEnd}
                    onChange={(e) => setGlobalEnd(e.target.value)}
                    placeholder="TT.MM.JJJJ"
                    className={`w-32 ${endInvalid ? "border-destructive" : ""}`}
                  />
                  <p className="text-[11px] text-muted-foreground">Format: TT.MM.JJJJ</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lagerbestand" className="text-xs">Bis Anzahl im Lager kleiner als</Label>
                  <Input
                    id="lagerbestand"
                    value={globalLager}
                    onChange={(e) => setGlobalLager(e.target.value)}
                    placeholder="optional"
                    className="w-36"
                  />
                </div>
                <Button onClick={handleApplyAll} size="sm" className="gap-1.5">
                  Auf alle Zeilen anwenden
                </Button>
                <Button onClick={handleDownload} variant="outline" size="sm" className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  CSV herunterladen
                </Button>
              </div>
            </div>

            {/* ── Preview table ─────────────────────────────────────────────── */}
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="overflow-auto" style={{ maxHeight: "60vh" }}>
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-[hsl(0,0%,85%)]">
                      <th className="border border-[hsl(0,0%,75%)] px-2 py-2 text-left text-xs font-semibold text-muted-foreground w-10">#</th>
                      {SOURCE_COLUMNS.map((c) => (
                        <th key={c.label} className="border border-[hsl(0,0%,75%)] px-2 py-2 text-left text-xs font-semibold whitespace-nowrap">
                          {c.label}
                        </th>
                      ))}
                      {NEW_COLUMNS.map((h) => (
                        <th key={h} className="border border-[hsl(0,0%,75%)] px-2 py-2 text-left text-xs font-semibold whitespace-nowrap bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIndex) => {
                      const extra = extraValues[rowIndex] ?? emptyExtra();
                      return (
                        <tr key={rowIndex} className={rowIndex % 2 === 0 ? "bg-[hsl(0,0%,98%)]" : "bg-[hsl(0,0%,94%)]"}>
                          <td className="border border-[hsl(0,0%,88%)] px-2 py-1 text-xs text-muted-foreground">{rowIndex + 1}</td>
                          {row.map((cell, colIndex) => (
                            <td key={colIndex} className="border border-[hsl(0,0%,88%)] px-2 py-1 whitespace-nowrap">
                              {cell}
                            </td>
                          ))}
                          <td className="border border-[hsl(0,0%,88%)] px-2 py-1 whitespace-nowrap bg-blue-50/50 dark:bg-blue-950/10">{extra.sonderpreis}</td>
                          <td className="border border-[hsl(0,0%,88%)] px-2 py-1 whitespace-nowrap bg-blue-50/50 dark:bg-blue-950/10">{extra.startdatum}</td>
                          <td className="border border-[hsl(0,0%,88%)] px-2 py-1 whitespace-nowrap bg-blue-50/50 dark:bg-blue-950/10">{extra.enddatum}</td>
                          <td className="border border-[hsl(0,0%,88%)] px-2 py-1 whitespace-nowrap bg-blue-50/50 dark:bg-blue-950/10">{extra.lagerbestand}</td>
                          <td className="border border-[hsl(0,0%,88%)] px-2 py-1 whitespace-nowrap bg-blue-50/50 dark:bg-blue-950/10" />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
