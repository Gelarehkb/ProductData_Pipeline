import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Upload, FileSpreadsheet, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { type Lang } from "@/lib/translations";
import { parseDelimitedText, detectDelimiter, stripBom } from "@/lib/csvParsing";

export type ImportTargetField =
  | "ItemName"
  | "color"
  | "Size"
  | "EAN"
  | "HAN"
  | "EK"
  | "VK"
  | "Menge"
  | "Collection"
  | "Measurement"
  | "InfoMaterial"
  | "Description";

export interface ImportedRow {
  [key: string]: string;
}

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (rows: Partial<Record<ImportTargetField, string>>[]) => void;
  lang: Lang;
}

const TARGET_FIELDS: { key: ImportTargetField; labelDE: string; labelEN: string; allowMultiple?: boolean }[] = [
  { key: "ItemName", labelDE: "Name", labelEN: "Name" },
  { key: "color", labelDE: "Farbe", labelEN: "Color" },
  { key: "Size", labelDE: "Größe", labelEN: "Sizes" },
  { key: "EAN", labelDE: "EAN", labelEN: "EAN" },
  { key: "HAN", labelDE: "HAN", labelEN: "HAN" },
  { key: "EK", labelDE: "EK", labelEN: "EK" },
  { key: "VK", labelDE: "VK", labelEN: "VK" },
  { key: "Menge", labelDE: "Menge", labelEN: "Quantity" },
  { key: "Collection", labelDE: "Kollektion", labelEN: "Collection" },
  { key: "Measurement", labelDE: "Maß", labelEN: "Measurement" },
  { key: "InfoMaterial", labelDE: "Info/Material", labelEN: "Info/Material" },
  { key: "Description", labelDE: "Beschreibung", labelEN: "Description", allowMultiple: true },
];

const NONE_VALUE = "__none__";

// Multi-column picker — used for fields (e.g. Description) that may be
// assembled from several source columns, joined with ", " on import.
function ColumnMultiSelect({
  headers, values, onChange, placeholder,
}: { headers: string[]; values: number[]; onChange: (v: number[]) => void; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const toggle = (idx: number) => {
    onChange(values.includes(idx) ? values.filter(v => v !== idx) : [...values, idx]);
  };
  const displayText = values.length > 0 ? values.map(i => headers[i]).join(", ") : "";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-8 flex items-center justify-between px-2 border rounded-md bg-transparent text-xs text-left"
          style={{ width: "4cm" }}
        >
          <span className="truncate flex-1">
            {displayText || <span className="text-muted-foreground">{placeholder}</span>}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2 bg-background z-50 max-h-60 overflow-y-auto" align="start">
        {headers.map((h, i) => (
          <label key={i} className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent rounded cursor-pointer text-xs">
            <Checkbox checked={values.includes(i)} onCheckedChange={() => toggle(i)} />
            <span className="truncate">{h}</span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// Auto-guess mapping from header name to target field
function autoGuessMapping(headers: string[]): Record<ImportTargetField, number[]> {
  const map: Partial<Record<ImportTargetField, number[]>> = {};
  const lower = headers.map(h => (h ?? "").toString().toLowerCase().trim());
  const find = (...keywords: string[]): number => {
    for (let i = 0; i < lower.length; i++) {
      const h = lower[i];
      if (!h) continue;
      if (keywords.some(k => h === k || h.includes(k))) return i;
    }
    return -1;
  };
  const set = (field: ImportTargetField, idx: number) => { if (idx >= 0) map[field] = [idx]; };
  set("ItemName", find("name", "artikelname", "bezeichnung", "title", "produkt", "style name", "style"));
  set("color", find("farbe", "color", "colour", "farve"));
  set("Size", find("größe", "groesse", "size", "sizes", "str.", "str "));
  set("EAN", find("ean", "barcode", "gtin"));
  set("HAN", find("han", "sku", "artikelnummer", "art.nr", "artnr", "style number", "style no", "item no"));
  set("EK", find("ek", "einkauf", "cost", "wholesale", "wsp", "wholesaleprice"));
  set("VK", find("vk", "verkauf", "rrp", "msrp", "uvp", "retail", "price", "preis"));
  set("Menge", find("menge", "qty", "quantity", "anzahl", "stk"));
  set("Collection", find("kollektion", "collection", "serie", "brand"));
  set("Measurement", find("maß", "mass", "measurement", "dimension", "size cm", "größe maß"));
  set("InfoMaterial", find("material", "info", "fabric", "composition"));
  set("Description", find("beschreibung", "description", "details", "text"));
  return map as Record<ImportTargetField, number[]>;
}

export const ImportDialog = ({ open, onOpenChange, onImport, lang }: ImportDialogProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [headerRowIndex, setHeaderRowIndex] = useState<number>(0); // -1 means "no header"
  const [rawRows, setRawRows] = useState<string[][]>([]); // before header split
  const [mapping, setMapping] = useState<Record<ImportTargetField, number[]>>({} as Record<ImportTargetField, number[]>);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setFileName("");
    setHeaders([]);
    setDataRows([]);
    setRawRows([]);
    setMapping({} as Record<ImportTargetField, number[]>);
    setHeaderRowIndex(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const applyHeaderSplit = (rows: string[][], headerIdx: number) => {
    if (rows.length === 0) {
      setHeaders([]); setDataRows([]); return;
    }
    if (headerIdx >= 0 && headerIdx < rows.length) {
      const h = rows[headerIdx].map((c, i) => (c?.toString().trim() ? c.toString() : `Spalte ${i + 1}`));
      setHeaders(h);
      setDataRows(rows.slice(headerIdx + 1));
      setMapping(autoGuessMapping(h));
    } else {
      const colCount = Math.max(...rows.map(r => r.length));
      const h = Array.from({ length: colCount }, (_, i) => `Spalte ${i + 1}`);
      setHeaders(h);
      setDataRows(rows);
      setMapping({} as Record<ImportTargetField, number[]>);
    }
  };

  const handleFile = async (file: File) => {
    setLoading(true);
    setFileName(file.name);
    try {
      const isCsv = /\.(csv|tsv|txt)$/i.test(file.name) || file.type.includes("csv");
      let rows: string[][] = [];
      if (isCsv) {
        const buf = await file.arrayBuffer();
        // Try utf-8 first
        let text = new TextDecoder("utf-8").decode(buf);
        // If contains replacement char, retry latin-1
        if (text.includes("\uFFFD")) {
          text = new TextDecoder("windows-1252").decode(buf);
        }
        text = stripBom(text);
        const delimiter = detectDelimiter(text);
        rows = parseDelimitedText(text, delimiter);
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellDates: false, raw: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        // raw=false preserves formatted strings; defval keeps empties; blankrows=false drops empty rows
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: false, raw: false });
        rows = aoa.map(r => (r as unknown[]).map(c => (c === null || c === undefined ? "" : String(c))));
      }
      // Drop fully empty trailing rows
      while (rows.length && rows[rows.length - 1].every(c => (c ?? "").toString().trim() === "")) rows.pop();
      setRawRows(rows);
      // Auto-detect header row: first row where >=3 cells look like short text labels (no digits-only, short)
      let detected = 0;
      for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const cells = rows[i].map(c => (c ?? "").toString().trim());
        const nonEmpty = cells.filter(Boolean);
        if (nonEmpty.length < 2) continue;
        const labelLike = nonEmpty.filter(v => v.length <= 40 && !/^\d+([.,]\d+)?$/.test(v)).length;
        if (labelLike >= Math.max(2, Math.floor(nonEmpty.length * 0.6))) { detected = i; break; }
      }
      setHeaderRowIndex(detected);
      applyHeaderSplit(rows, detected);
    } catch (err) {
      console.error(err);
      toast({ title: lang === "DE" ? "Fehler beim Lesen" : "Read error", description: String(err), variant: "destructive" });
      reset();
    } finally {
      setLoading(false);
    }
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const changeHeaderRow = (idx: number) => {
    setHeaderRowIndex(idx);
    applyHeaderSplit(rawRows, idx);
  };

  const setFieldMapping = (field: ImportTargetField, value: string) => {
    setMapping(prev => {
      const next = { ...prev };
      if (value === NONE_VALUE) delete next[field];
      else next[field] = [parseInt(value, 10)];
      return next;
    });
  };

  const setFieldMappingMulti = (field: ImportTargetField, values: number[]) => {
    setMapping(prev => {
      const next = { ...prev };
      if (values.length === 0) delete next[field];
      else next[field] = values;
      return next;
    });
  };

  const confirmImport = () => {
    const out: Partial<Record<ImportTargetField, string>>[] = dataRows.map(row => {
      const obj: Partial<Record<ImportTargetField, string>> = {};
      (Object.keys(mapping) as ImportTargetField[]).forEach(f => {
        const idxs = mapping[f];
        if (!idxs || idxs.length === 0) return;
        obj[f] = idxs.length === 1
          ? (row[idxs[0]] ?? "")
          : idxs.map(idx => (row[idx] ?? "").toString().trim()).filter(v => v !== "").join(", ");
      });
      return obj;
    });
    onImport(out);
    onOpenChange(false);
    reset();
  };

  const mappedCount = Object.keys(mapping).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-[95vw] w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lang === "DE" ? "Datei importieren" : "Import file"}</DialogTitle>
          <DialogDescription>
            {lang === "DE"
              ? "Excel (.xlsx, .xls) oder CSV/TSV hochladen und Spalten zuordnen."
              : "Upload Excel (.xlsx, .xls) or CSV/TSV and map columns."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,.txt,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={onFileInput}
              className="hidden"
            />
            <div className="flex items-center gap-3">
              <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="gap-2" disabled={loading}>
                <Upload className="h-4 w-4" />
                {lang === "DE" ? "Datei wählen" : "Choose file"}
              </Button>
              {fileName && (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <FileSpreadsheet className="h-4 w-4" /> {fileName} ({dataRows.length} {lang === "DE" ? "Zeilen" : "rows"})
                </span>
              )}
            </div>
          </div>

          {headers.length > 0 && (
            <>
              <div className="flex items-center gap-2 text-sm">
                <Label className="text-xs">{lang === "DE" ? "Kopfzeile = Zeile" : "Header = row"}</Label>
                <Input
                  type="number"
                  min={0}
                  max={Math.max(0, rawRows.length)}
                  value={headerRowIndex < 0 ? "" : headerRowIndex + 1}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") { changeHeaderRow(-1); return; }
                    const n = parseInt(v, 10);
                    if (!Number.isNaN(n)) changeHeaderRow(Math.max(0, n - 1));
                  }}
                  className="h-7 w-20 text-xs"
                />
                <span className="text-xs text-muted-foreground">
                  {lang === "DE" ? "(leer = keine Kopfzeile)" : "(empty = no header)"}
                </span>
              </div>

              <div className="border rounded-md overflow-auto max-h-64 max-w-full">
                <table className="text-xs border-collapse" style={{ tableLayout: "fixed" }}>
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-left font-medium border-r border-b text-muted-foreground" style={{ width: "4cm", maxWidth: "4cm" }}>#</th>
                      {headers.map((h, i) => (
                        <th key={i} className="px-2 py-1 text-left font-medium border-r border-b truncate" style={{ width: "4cm", maxWidth: "4cm", minWidth: "4cm" }} title={h}>
                          <div className="truncate" style={{ width: "calc(4cm - 1rem)" }}>{h}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataRows.slice(0, 5).map((row, r) => (
                      <tr key={r} className="border-t">
                        <td className="px-2 py-1 border-r text-muted-foreground" style={{ width: "4cm", maxWidth: "4cm" }}>{r + 1}</td>
                        {headers.map((_, c) => (
                          <td key={c} className="px-2 py-1 border-r" style={{ width: "4cm", maxWidth: "4cm", minWidth: "4cm" }} title={row[c] ?? ""}>
                            <div className="truncate" style={{ width: "calc(4cm - 1rem)" }}>{row[c] ?? ""}</div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">
                  {lang === "DE" ? "Spalten zuordnen" : "Map columns"} ({mappedCount}/{TARGET_FIELDS.length})
                </div>
                <div className="flex flex-wrap gap-x-2 gap-y-2">
                  {TARGET_FIELDS.map(f => (
                    <div key={f.key} className="space-y-1">
                      <Label className="text-xs">{lang === "DE" ? f.labelDE : f.labelEN}</Label>
                      {f.allowMultiple ? (
                        <ColumnMultiSelect
                          headers={headers}
                          values={mapping[f.key] || []}
                          onChange={(vals) => setFieldMappingMulti(f.key, vals)}
                          placeholder={lang === "DE" ? "Spalten wählen..." : "Select columns..."}
                        />
                      ) : (
                        <Select
                          value={mapping[f.key]?.[0] !== undefined ? String(mapping[f.key][0]) : NONE_VALUE}
                          onValueChange={(v) => setFieldMapping(f.key, v)}
                        >
                          <SelectTrigger className="h-8 text-xs" style={{ width: "4cm" }}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE_VALUE}>— {lang === "DE" ? "keine" : "none"} —</SelectItem>
                            {headers.map((h, i) => (
                              <SelectItem key={i} value={String(i)}>{h}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); reset(); }}>
            {lang === "DE" ? "Abbrechen" : "Cancel"}
          </Button>
          <Button onClick={confirmImport} disabled={dataRows.length === 0 || mappedCount === 0}>
            {lang === "DE" ? `${dataRows.length} Zeilen importieren` : `Import ${dataRows.length} rows`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
