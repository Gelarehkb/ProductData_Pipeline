import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Upload, Download, AlertTriangle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { parseDelimitedText, detectDelimiter, decodeTextBuffer } from "@/lib/csvParsing";

// Fully self-contained, like Discounts.tsx: its own parsing, its own export,
// no shared state with the other pages. Pulls only Interner Schlüssel +
// Artikelnummer from the uploaded JTL Artikelliste; every other column is a
// single uniform value chosen via toggle and applied to every row live.

const SOURCE_COLUMNS: { label: string; aliases: string[] }[] = [
  { label: "Interner Schlüssel", aliases: ["interner schlüssel", "interner schluessel"] },
  { label: "Artikelnummer", aliases: ["artikelnummer"] },
];

const NEW_COLUMNS = [
  "Überverkäufe möglich",
  "Überverkauf Plattform HFK-POS-WIEN",
  "Überverkauf Plattform JTL-Shop 5",
  "Verkaufskanal [HFK-POS-WIEN]: Verkaufskanal aktiv",
  "Verkaufskanal [JTL-Shop 5]: Verkaufskanal aktiv",
  "Neu im Sortiment",
  "Neu im Sortiment seit",
] as const;

const DATE_RE = /^\d{2}\.\d{2}\.\d{4}$/;

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

// Every field in the target format is quoted, even plain values like "Y" or
// a bare number — unlike the rest of the app's CSV export. The trailing
// semicolon in the example (after the last quoted field, nothing following)
// is reproduced by appending one literal ";" rather than a real 10th column.
function quoteCsvCell(v: string): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

function todayDMY(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

export default function SalesChannel() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<string[][]>([]); // projected to SOURCE_COLUMNS order
  const [missingColumns, setMissingColumns] = useState<string[] | null>(null);

  const [ueberverkaufMoeglich, setUeberverkaufMoeglich] = useState(false); // Y/N
  const [ueberverkaufHfk, setUeberverkaufHfk] = useState(false); // TRUE/FALSE
  const [ueberverkaufJtl, setUeberverkaufJtl] = useState(false); // TRUE/FALSE
  const [kanalHfkAktiv, setKanalHfkAktiv] = useState(true); // Y/N
  const [kanalJtlAktiv, setKanalJtlAktiv] = useState(true); // Y/N
  const [neuImSortiment, setNeuImSortiment] = useState(false); // Y/N
  const [neuSeit, setNeuSeit] = useState(todayDMY());

  const hasData = rows.length > 0;
  const dateInvalid = neuSeit.trim() !== "" && !DATE_RE.test(neuSeit.trim());

  const extraValuesRow = [
    ueberverkaufMoeglich ? "Y" : "N",
    ueberverkaufHfk ? "True" : "False",
    ueberverkaufJtl ? "True" : "False",
    kanalHfkAktiv ? "Y" : "N",
    kanalJtlAktiv ? "Y" : "N",
    neuImSortiment ? "Y" : "N",
    neuSeit.trim(),
  ];

  const loadParsedTable = (parsedHeaders: string[], parsedRows: string[][], loadedFileName: string) => {
    const normalizedIncoming = parsedHeaders.map(normalizeHeader);
    const colIndices = SOURCE_COLUMNS.map(col =>
      normalizedIncoming.findIndex(h => col.aliases.includes(h) || col.aliases.some(a => h.includes(a)))
    );

    const projectedRows = parsedRows.map(row => colIndices.map(idx => (idx >= 0 ? (row[idx] ?? "").trim() : "")));

    setRows(projectedRows);
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
        const text = decodeTextBuffer(buf);
        const delimiter = detectDelimiter(text);
        const all = parseDelimitedText(text, delimiter).filter(r => r.some(c => c.trim() !== ""));
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

  const handleDownload = () => {
    if (!hasData) return;
    if (dateInvalid) {
      toast({ title: "Ungültiges Datum", description: "Bitte 'Neu im Sortiment seit' im Format TT.MM.JJJJ angeben.", variant: "destructive" });
      return;
    }
    const allHeaders = [...SOURCE_COLUMNS.map(c => c.label), ...NEW_COLUMNS];
    const lines = [
      allHeaders.map(quoteCsvCell).join(";") + ";",
      ...rows.map(row => [...row, ...extraValuesRow].map(quoteCsvCell).join(";") + ";"),
    ];
    const csvContent = lines.join("\r\n");
    const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, "0")}${String(today.getMonth() + 1).padStart(2, "0")}${today.getFullYear()}`;
    const base = fileName.replace(/\.[^.]+$/, "") || "export";
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}_Artikelstammdaten_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const ToggleField = ({
    label, checked, onCheckedChange, offLabel, onLabel,
  }: { label: string; checked: boolean; onCheckedChange: (v: boolean) => void; offLabel: string; onLabel: string }) => (
    <div className="space-y-1">
      <Label className="text-xs block">{label}</Label>
      <div className="flex items-center gap-1.5">
        <span className={`text-xs ${!checked ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{offLabel}</span>
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
        <span className={`text-xs ${checked ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{onLabel}</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-[1400px] mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <a href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Zurück
          </a>
          <h1 className="text-2xl font-bold text-foreground">Sale Channel</h1>
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
            {/* ── Global toggle fields — applied live to every row ────────────── */}
            <div className="bg-card border border-border rounded-lg p-4 mb-4">
              <div className="flex flex-wrap items-end gap-5">
                <ToggleField label="Überverkäufe möglich" checked={ueberverkaufMoeglich} onCheckedChange={setUeberverkaufMoeglich} offLabel="N" onLabel="Y" />
                <ToggleField label="Überverkauf Plattform HFK-POS-WIEN" checked={ueberverkaufHfk} onCheckedChange={setUeberverkaufHfk} offLabel="False" onLabel="True" />
                <ToggleField label="Überverkauf Plattform JTL-Shop 5" checked={ueberverkaufJtl} onCheckedChange={setUeberverkaufJtl} offLabel="False" onLabel="True" />
                <ToggleField label="Verkaufskanal HFK-POS-WIEN aktiv" checked={kanalHfkAktiv} onCheckedChange={setKanalHfkAktiv} offLabel="N" onLabel="Y" />
                <ToggleField label="Verkaufskanal JTL-Shop 5 aktiv" checked={kanalJtlAktiv} onCheckedChange={setKanalJtlAktiv} offLabel="N" onLabel="Y" />
                <ToggleField label="Neu im Sortiment" checked={neuImSortiment} onCheckedChange={setNeuImSortiment} offLabel="N" onLabel="Y" />
                <div className="space-y-1">
                  <Label htmlFor="neuSeit" className="text-xs">Neu im Sortiment seit</Label>
                  <Input
                    id="neuSeit"
                    value={neuSeit}
                    onChange={(e) => setNeuSeit(e.target.value)}
                    placeholder="TT.MM.JJJJ"
                    className={`w-32 ${dateInvalid ? "border-destructive" : ""}`}
                  />
                </div>
                <Button onClick={handleDownload} size="sm" className="gap-1.5">
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
                    {rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className={rowIndex % 2 === 0 ? "bg-[hsl(0,0%,98%)]" : "bg-[hsl(0,0%,94%)]"}>
                        <td className="border border-[hsl(0,0%,88%)] px-2 py-1 text-xs text-muted-foreground">{rowIndex + 1}</td>
                        {row.map((cell, colIndex) => (
                          <td key={colIndex} className="border border-[hsl(0,0%,88%)] px-2 py-1 whitespace-nowrap">
                            {cell}
                          </td>
                        ))}
                        {extraValuesRow.map((v, i) => (
                          <td key={i} className="border border-[hsl(0,0%,88%)] px-2 py-1 whitespace-nowrap bg-blue-50/50 dark:bg-blue-950/10">
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
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
