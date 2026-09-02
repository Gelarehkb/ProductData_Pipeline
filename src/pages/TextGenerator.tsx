import { useState, useRef, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Download, Sparkles, Undo2, ArrowLeft, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------
async function apiFetch(fn: string, body: object) {
  try {
    const res = await fetch(`/api/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: new Error(data?.error || res.statusText) };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Mode = "simple" | "complex";

interface TextRow {
  id: string;
  han: string;
  artikelnummer: string;
  artikelname: string;
  beschreibung: string;
  mode: Mode;
  produkttext: string;
  Title_Tag: string;
  html_de: string;
  meta_description: string;
  suchbegriffe: string;
}

type TextRowKey = keyof Omit<TextRow, "id">;

interface CellPos {
  row: number;
  col: number;
}

interface FillDrag {
  sourceRow: number;
  sourceCol: number;
  targetRow: number;
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------
const COLUMNS: {
  key: TextRowKey;
  labelDE: string;
  labelEN: string;
  width: number;
  isOutput: boolean;
}[] = [
  { key: "han",              labelDE: "HAN / Barcode",    labelEN: "HAN / Barcode",   width: 160, isOutput: false },
  { key: "artikelnummer",    labelDE: "Artikelnummer",     labelEN: "Article No.",      width: 160, isOutput: false },
  { key: "artikelname",      labelDE: "Artikelname",       labelEN: "Item Name",        width: 200, isOutput: false },
  { key: "beschreibung",     labelDE: "Beschreibung",      labelEN: "Description",      width: 260, isOutput: false },
  { key: "mode",             labelDE: "Modus",             labelEN: "Mode",             width: 150, isOutput: false },
  { key: "produkttext",      labelDE: "Produkttext",       labelEN: "Product Text",     width: 260, isOutput: true  },
  { key: "Title_Tag",        labelDE: "Title Tag",         labelEN: "Title Tag",        width: 200, isOutput: true  },
  { key: "html_de",          labelDE: "HTML (DE)",         labelEN: "HTML (DE)",        width: 280, isOutput: true  },
  { key: "meta_description", labelDE: "Meta Description",  labelEN: "Meta Description", width: 220, isOutput: true  },
  { key: "suchbegriffe",     labelDE: "Suchbegriffe",      labelEN: "Search Terms",     width: 180, isOutput: true  },
];

const createEmptyRow = (mode: Mode = "complex"): TextRow => ({
  id: crypto.randomUUID(),
  han: "", artikelnummer: "", artikelname: "", beschreibung: "", mode,
  produkttext: "", Title_Tag: "", html_de: "", meta_description: "", suchbegriffe: "",
});

const normalizeMode = (v: string): Mode => (v.trim().toLowerCase().startsWith("s") ? "simple" : "complex");

// ---------------------------------------------------------------------------
// Mode swatch (segmented toggle)
// ---------------------------------------------------------------------------
function ModeSwatch({ value, onChange, lang, xs = false }: { value: Mode; onChange: (m: Mode) => void; lang: "DE" | "EN"; xs?: boolean }) {
  const labels: Record<Mode, string> = {
    simple: lang === "DE" ? "Einfach" : "Simple",
    complex: lang === "DE" ? "Komplex" : "Complex",
  };
  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden shrink-0" onMouseDown={e => e.stopPropagation()}>
      {(["simple", "complex"] as Mode[]).map(m => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`font-medium transition-colors ${xs ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"} ${
            value === m
              ? m === "simple"
                ? "bg-emerald-500 text-white"
                : "bg-indigo-500 text-white"
              : "bg-muted text-muted-foreground hover:bg-muted/70"
          }`}
        >
          {labels[m]}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selection range helper
// ---------------------------------------------------------------------------
function getSelectionRange(start: CellPos, end: CellPos): CellPos[] {
  const r0 = Math.min(start.row, end.row), r1 = Math.max(start.row, end.row);
  const c0 = Math.min(start.col, end.col), c1 = Math.max(start.col, end.col);
  const out: CellPos[] = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push({ row: r, col: c });
  return out;
}

// ---------------------------------------------------------------------------
// RFC4180-aware paste parser (same logic as Index.tsx)
// ---------------------------------------------------------------------------
function parsePasteMatrix(text: string): string[][] {
  const parse = (raw: string, delim: string): string[][] => {
    const out: string[][] = [];
    let row: string[] = [], cell = "", inQ = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (inQ) {
        if (ch === '"' && raw[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') { inQ = false; }
        else { cell += ch; }
      } else {
        if (ch === '"') { inQ = true; }
        else if (ch === delim) { row.push(cell); cell = ""; }
        else if (ch === "\n") { row.push(cell); out.push(row); row = []; cell = ""; }
        else if (ch !== "\r") { cell += ch; }
      }
    }
    row.push(cell);
    if (!(row.length === 1 && row[0] === "")) out.push(row);
    return out.filter(r => r.some(c => c.trim() !== ""));
  };

  if (text.includes("\t")) return parse(text, "\t");
  if (text.includes(";")) return parse(text, ";");
  if (text.trimStart().startsWith('"')) return parse(text, "\x00");
  return text.split(/\r?\n/).filter(l => l.trim() !== "").map(l => [l]);
}

// ---------------------------------------------------------------------------
// CSV escape
// ---------------------------------------------------------------------------
function csvEscape(val: string): string {
  return `"${val.replace(/"/g, '""')}"`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function TextGenerator() {
  const { toast } = useToast();

  const [lang, setLang] = useState<"DE" | "EN">("DE");
  const [hersteller, setHersteller] = useState("");
  const [rowCountInput, setRowCountInput] = useState("10");
  const [defaultMode, setDefaultMode] = useState<Mode>("complex");
  const [rows, setRows] = useState<TextRow[]>(() => Array.from({ length: 10 }, () => createEmptyRow("complex")));
  const [history, setHistory] = useState<TextRow[][]>([]);
  const [generating, setGenerating] = useState(false);

  // Selection
  const [selection, setSelection] = useState<CellPos[]>([]);
  const [selectionStart, setSelectionStart] = useState<CellPos | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  // Fill handle
  const [fillHandleDrag, setFillHandleDrag] = useState<FillDrag | null>(null);

  // Undo debounce: only save history when moving to a new cell
  const lastEditedCellRef = useRef<{ id: string; field: string } | null>(null);

  // ---------------------------------------------------------------------------
  // Row helpers
  // ---------------------------------------------------------------------------
  const applyRowCount = useCallback((count: number) => {
    setRows(prev => {
      if (prev.length === count) return prev;
      if (prev.length < count) return [...prev, ...Array.from({ length: count - prev.length }, () => createEmptyRow(defaultMode))];
      return prev.slice(0, count);
    });
  }, [defaultMode]);

  const applyRowCountInput = () => {
    const n = Math.max(1, Math.min(200, parseInt(rowCountInput, 10) || rows.length));
    setRowCountInput(String(n));
    applyRowCount(n);
  };

  // ---------------------------------------------------------------------------
  // Cell change with undo debounce
  // ---------------------------------------------------------------------------
  const handleCellChange = useCallback((id: string, field: TextRowKey, value: string) => {
    const cellKey = `${id}:${field}`;
    if (lastEditedCellRef.current?.id !== id || lastEditedCellRef.current?.field !== field) {
      setHistory(prev => [...prev.slice(-49), rows]);
      lastEditedCellRef.current = { id, field };
    }
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }, [rows]);

  const handleModeChange = useCallback((id: string, mode: Mode) => {
    setHistory(prev => [...prev.slice(-49), rows]);
    lastEditedCellRef.current = null;
    setRows(prev => prev.map(r => r.id === id ? { ...r, mode } : r));
  }, [rows]);

  const handleDefaultModeChange = useCallback((mode: Mode) => {
    setDefaultMode(mode);
    setHistory(prev => [...prev.slice(-49), rows]);
    setRows(prev => prev.map(r => ({ ...r, mode })));
  }, [rows]);

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------
  const isCellSelected = (row: number, col: number) =>
    selection.some(s => s.row === row && s.col === col);

  const handleCellMouseDown = (e: React.MouseEvent, row: number, col: number) => {
    if (e.shiftKey && selectionStart) {
      setSelection(getSelectionRange(selectionStart, { row, col }));
    } else if (e.ctrlKey || e.metaKey) {
      const exists = selection.some(s => s.row === row && s.col === col);
      if (exists) setSelection(prev => prev.filter(s => !(s.row === row && s.col === col)));
      else { setSelection(prev => [...prev, { row, col }]); setSelectionStart({ row, col }); }
    } else {
      setSelection([{ row, col }]);
      setSelectionStart({ row, col });
      setIsSelecting(true);
    }
  };

  const handleCellMouseEnter = (row: number, col: number) => {
    if (isSelecting && selectionStart) {
      setSelection(getSelectionRange(selectionStart, { row, col }));
    }
    if (fillHandleDrag && col === fillHandleDrag.sourceCol) {
      setFillHandleDrag(prev => prev ? { ...prev, targetRow: row } : null);
    }
  };

  const handleRowSelect = (rowIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const cells: CellPos[] = COLUMNS.map((_, c) => ({ row: rowIndex, col: c }));
    if (e.shiftKey && selectionStart) {
      const minR = Math.min(selectionStart.row, rowIndex);
      const maxR = Math.max(selectionStart.row, rowIndex);
      const all: CellPos[] = [];
      for (let r = minR; r <= maxR; r++) COLUMNS.forEach((_, c) => all.push({ row: r, col: c }));
      setSelection(all);
    } else {
      setSelection(cells);
      setSelectionStart({ row: rowIndex, col: 0 });
    }
  };

  // ---------------------------------------------------------------------------
  // Keyboard navigation (same as Index.tsx)
  // ---------------------------------------------------------------------------
  const handleKeyNavigation = useCallback((e: React.KeyboardEvent, rowIndex: number, colIndex: number) => {
    const { key } = e;
    let newRow = rowIndex, newCol = colIndex;

    if (key === "ArrowUp") {
      e.preventDefault();
      newRow = Math.max(0, rowIndex - 1);
    } else if (key === "ArrowDown") {
      e.preventDefault();
      newRow = Math.min(rows.length - 1, rowIndex + 1);
    } else if (key === "ArrowLeft" && (e.target as HTMLInputElement).selectionStart === 0) {
      e.preventDefault();
      newCol = Math.max(0, colIndex - 1);
    } else if (key === "ArrowRight") {
      const inp = e.target as HTMLInputElement;
      if (inp.selectionStart === inp.value?.length) {
        e.preventDefault();
        newCol = Math.min(COLUMNS.length - 1, colIndex + 1);
      }
    } else if (key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        if (colIndex > 0) newCol = colIndex - 1;
        else if (rowIndex > 0) { newRow = rowIndex - 1; newCol = COLUMNS.length - 1; }
      } else {
        if (colIndex < COLUMNS.length - 1) newCol = colIndex + 1;
        else { newRow = Math.min(rows.length - 1, rowIndex + 1); newCol = 0; }
      }
    } else if (key === "Enter") {
      e.preventDefault();
      newRow = Math.min(rows.length - 1, rowIndex + 1);
    } else {
      return;
    }

    if (newRow !== rowIndex || newCol !== colIndex) {
      const el = document.querySelector(`[data-row="${newRow}"][data-col="${newCol}"]`) as HTMLElement | null;
      el?.focus();
    }
  }, [rows.length]);

  // ---------------------------------------------------------------------------
  // Paste — per-cell onPaste handler
  // ---------------------------------------------------------------------------
  const handleCellPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    rowIndex: number,
    colIndex: number,
    field: TextRowKey,
  ) => {
    const text = e.clipboardData.getData("text");
    if (!text) return;

    const hasTab       = text.includes("\t");
    const hasSemicolon = text.includes(";");
    const hasNewline   = /\r?\n/.test(text.trim());

    // Free-text fields paste as single cell (no column delimiter or tabs)
    if ((field === "beschreibung" || field === "html_de" || field === "produkttext" || field === "meta_description") && !hasTab && !hasSemicolon) {
      e.preventDefault();
      handleCellChange(rows[rowIndex].id, field, text.trimEnd());
      return;
    }

    // Single value no structure → native
    if (!hasTab && !hasSemicolon && !hasNewline) return;

    const matrix = parsePasteMatrix(text);
    if (matrix.length === 0) return;
    const maxCols = Math.max(1, ...matrix.map(r => r.length));
    if (matrix.length === 1 && maxCols === 1) return;

    e.preventDefault();
    setHistory(prev => [...prev.slice(-49), rows]);
    lastEditedCellRef.current = null;
    setRows(prev => {
      const next = [...prev];
      matrix.forEach((cells, i) => {
        const targetRow = rowIndex + i;
        while (targetRow >= next.length) next.push(createEmptyRow(defaultMode));
        const updated = { ...next[targetRow] };
        cells.forEach((val, j) => {
          const targetCol = colIndex + j;
          if (targetCol < COLUMNS.length) {
            const k = COLUMNS[targetCol].key;
            (updated as any)[k] = k === "mode" ? normalizeMode(val) : val.trim();
          }
        });
        next[targetRow] = updated;
      });
      return next;
    });
    toast({ title: lang === "DE" ? "Daten eingefügt" : "Data pasted", description: `${matrix.length} × ${maxCols}` });
  };

  // ---------------------------------------------------------------------------
  // Copy / Paste selection (Ctrl+C / Ctrl+V on selected cells)
  // ---------------------------------------------------------------------------
  const handleCopySelection = useCallback(async () => {
    if (selection.length === 0) return;
    const minRow = Math.min(...selection.map(s => s.row));
    const maxRow = Math.max(...selection.map(s => s.row));
    const minCol = Math.min(...selection.map(s => s.col));
    const maxCol = Math.max(...selection.map(s => s.col));
    const lines: string[] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const cells: string[] = [];
      for (let c = minCol; c <= maxCol; c++) cells.push(rows[r]?.[COLUMNS[c].key] || "");
      lines.push(cells.join("\t"));
    }
    await navigator.clipboard.writeText(lines.join("\n"));
    toast({ title: lang === "DE" ? "Kopiert" : "Copied", description: `${selection.length} ${lang === "DE" ? "Zellen" : "cells"}` });
  }, [selection, rows, lang, toast]);

  const handlePasteSelection = useCallback(async () => {
    if (selection.length === 0) return;
    try {
      const text = await navigator.clipboard.readText();
      const minRow = Math.min(...selection.map(s => s.row));
      const minCol = Math.min(...selection.map(s => s.col));
      const targetField = COLUMNS[minCol].key;

      const hasTab       = text.includes("\t");
      const hasSemicolon = text.includes(";");

      if ((targetField === "beschreibung" || targetField === "html_de" || targetField === "produkttext" || targetField === "meta_description") && !hasTab && !hasSemicolon) {
        setHistory(prev => [...prev.slice(-49), rows]);
        setRows(prev => { const n = [...prev]; n[minRow] = { ...n[minRow], [targetField]: text.trimEnd() }; return n; });
        toast({ title: lang === "DE" ? "Eingefügt" : "Pasted" });
        return;
      }

      const matrix = parsePasteMatrix(text);
      if (matrix.length === 0) return;
      setHistory(prev => [...prev.slice(-49), rows]);
      lastEditedCellRef.current = null;
      setRows(prev => {
        const next = [...prev];
        matrix.forEach((cells, i) => {
          const targetRow = minRow + i;
          while (targetRow >= next.length) next.push(createEmptyRow(defaultMode));
          const updated = { ...next[targetRow] };
          cells.forEach((val, j) => {
            const targetCol = minCol + j;
            if (targetCol < COLUMNS.length) {
              const k = COLUMNS[targetCol].key;
              (updated as any)[k] = k === "mode" ? normalizeMode(val) : val.trim();
            }
          });
          next[targetRow] = updated;
        });
        return next;
      });
      toast({ title: lang === "DE" ? "Eingefügt" : "Pasted", description: `${matrix.length} ${lang === "DE" ? "Zeilen" : "rows"}` });
    } catch {
      toast({ title: lang === "DE" ? "Fehler" : "Error", description: lang === "DE" ? "Kein Zugriff auf Zwischenablage." : "No clipboard access.", variant: "destructive" });
    }
  }, [selection, rows, lang, toast, defaultMode]);

  const handleDeleteSelection = useCallback(() => {
    if (selection.length === 0) return;
    setHistory(prev => [...prev.slice(-49), rows]);
    setRows(prev => {
      const next = [...prev];
      for (const { row, col } of selection) {
        next[row] = { ...next[row], [COLUMNS[col].key]: "" };
      }
      return next;
    });
  }, [selection, rows]);

  // ---------------------------------------------------------------------------
  // Global keyboard shortcuts
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTableInput = (target.tagName === "INPUT" || target.tagName === "TEXTAREA") && target.closest("table");
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const ctrl = isMac ? e.metaKey : e.ctrlKey;

      if (ctrl && e.key === "c") {
        if (isTableInput) return;
        if (selection.length > 0) { e.preventDefault(); handleCopySelection(); }
      } else if (ctrl && e.key === "v") {
        if (isTableInput) return;
        e.preventDefault();
        if (selection.length > 0) handlePasteSelection();
      } else if (ctrl && e.key === "z") {
        e.preventDefault();
        setHistory(prev => {
          if (prev.length === 0) return prev;
          setRows(prev[prev.length - 1]);
          lastEditedCellRef.current = null;
          toast({ title: lang === "DE" ? "Rückgängig" : "Undo" });
          return prev.slice(0, -1);
        });
      } else if ((e.key === "Delete" || e.key === "Backspace") && !isTableInput) {
        if (selection.length > 0) { e.preventDefault(); handleDeleteSelection(); }
      } else if (e.key === "Escape") {
        setSelection([]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection, handleCopySelection, handlePasteSelection, handleDeleteSelection, lang, toast]);

  // Global mouseup (end drag selection + fill drag)
  useEffect(() => {
    const onUp = () => {
      setIsSelecting(false);
      if (fillHandleDrag) {
        if (fillHandleDrag.targetRow !== fillHandleDrag.sourceRow) {
          handleFillToRange(fillHandleDrag.sourceRow, fillHandleDrag.sourceCol, fillHandleDrag.targetRow);
        }
        setFillHandleDrag(null);
      }
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [fillHandleDrag]); // eslint-disable-line

  // ---------------------------------------------------------------------------
  // Fill handle
  // ---------------------------------------------------------------------------
  const handleFillToRange = useCallback((sourceRow: number, colIdx: number, targetRow: number) => {
    const key = COLUMNS[colIdx].key;
    const value = rows[sourceRow]?.[key];
    if (!value || targetRow === sourceRow) return;
    const minRow = Math.min(sourceRow, targetRow);
    const maxRow = Math.max(sourceRow, targetRow);
    setHistory(prev => [...prev.slice(-49), rows]);
    setRows(prev => prev.map((r, i) =>
      i >= minRow && i <= maxRow && i !== sourceRow ? { ...r, [key]: value } : r
    ));
    toast({ title: lang === "DE" ? "Werte übernommen" : "Values filled", description: `${maxRow - minRow} ${lang === "DE" ? "Zellen" : "cells"}` });
  }, [rows, lang, toast]);

  const handleFillHandleMouseDown = (e: React.MouseEvent, rowIdx: number, colIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    setFillHandleDrag({ sourceRow: rowIdx, sourceCol: colIdx, targetRow: rowIdx });
  };

  const handleFillDoubleClick = (rowIdx: number, colIdx: number) => {
    const key = COLUMNS[colIdx].key;
    const value = rows[rowIdx]?.[key];
    if (!value) return;
    const refKey = colIdx === 0 ? COLUMNS[1]?.key : COLUMNS[0].key;
    let last = rowIdx;
    for (let i = rowIdx + 1; i < rows.length; i++) {
      if (!rows[i][refKey]?.trim()) break;
      if (rows[i][key]?.trim()) break;
      last = i;
    }
    if (last === rowIdx) return;
    handleFillToRange(rowIdx, colIdx, last);
  };

  // ---------------------------------------------------------------------------
  // Generation
  // ---------------------------------------------------------------------------
  const handleGenerate = async () => {
    const eligible = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.artikelname.trim() !== "");
    if (eligible.length === 0) {
      toast({ title: lang === "DE" ? "Keine Artikel" : "No items", description: lang === "DE" ? "Bitte mindestens einen Artikelnamen eingeben." : "Please enter at least one item name.", variant: "destructive" });
      return;
    }
    setHistory(prev => [...prev.slice(-49), rows]);
    setGenerating(true);

    type GenResult = { produkttext?: string; Title_Tag?: string; html_de?: string; meta_description?: string; suchbegriffe?: string; error?: string };
    type GenResponse = { data: { results: GenResult[] } | null; error: Error | null };

    const byMode: Record<Mode, { r: TextRow; i: number }[]> = {
      simple: eligible.filter(({ r }) => r.mode === "simple"),
      complex: eligible.filter(({ r }) => r.mode !== "simple"),
    };
    const endpoints: Record<Mode, string> = {
      simple: "generate-online-texts-simple",
      complex: "generate-online-texts-complex",
    };

    const fetchForMode = async (mode: Mode): Promise<GenResponse> => {
      if (byMode[mode].length === 0) return { data: { results: [] }, error: null };
      const res = await apiFetch(endpoints[mode], {
        items: byMode[mode].map(({ r }) => ({
          artikelname: r.artikelname,
          markenname: hersteller,
          beschreibung: r.beschreibung,
          warengruppe: "",
        })),
      });
      return res as GenResponse;
    };

    const [simpleRes, complexRes] = await Promise.all([fetchForMode("simple"), fetchForMode("complex")]);
    setGenerating(false);

    const resByMode: Record<Mode, GenResponse> = { simple: simpleRes, complex: complexRes };
    const firstError = resByMode.simple.error || resByMode.complex.error;
    if (firstError) {
      toast({ title: lang === "DE" ? "Fehler" : "Error", description: firstError.message ?? "Unknown error", variant: "destructive" });
      return;
    }

    setRows(prev => {
      const next = [...prev];
      (["simple", "complex"] as Mode[]).forEach(mode => {
        const results = resByMode[mode].data?.results ?? [];
        byMode[mode].forEach(({ i }, idx) => {
          const res = results[idx];
          if (!res || res.error) return;
          next[i] = { ...next[i], produkttext: res.produkttext ?? "", Title_Tag: res.Title_Tag ?? "", html_de: res.html_de ?? "", meta_description: res.meta_description ?? "", suchbegriffe: res.suchbegriffe ?? "" };
        });
      });
      return next;
    });
    toast({ title: lang === "DE" ? "Texte generiert" : "Texts generated", description: `${eligible.length} ${lang === "DE" ? "Artikel" : "items"}` });
  };

  // ---------------------------------------------------------------------------
  // CSV Export
  // ---------------------------------------------------------------------------
  const handleExport = () => {
    const headers = ["HAN/Barcode/Interner Schlüssel", "Artikelnummer", "produkttext", "Title_Tag", "html_de", "meta_description", "suchbegriffe"];
    const keys: TextRowKey[] = ["han", "artikelnummer", "produkttext", "Title_Tag", "html_de", "meta_description", "suchbegriffe"];
    const lines = [headers.map(csvEscape).join(";")];
    for (const row of rows) {
      if (keys.every(k => !row[k])) continue;
      lines.push(keys.map(k => csvEscape(row[k])).join(";"));
    }
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "texte-export.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ---------------------------------------------------------------------------
  // Undo button
  // ---------------------------------------------------------------------------
  const handleUndo = () => {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      setRows(prev[prev.length - 1]);
      lastEditedCellRef.current = null;
      toast({ title: lang === "DE" ? "Rückgängig" : "Undo" });
      return prev.slice(0, -1);
    });
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const totalWidth = COLUMNS.reduce((s, c) => s + c.width, 0) + 40;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-[1400px] mx-auto">
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
              {lang === "DE" ? "Zurück" : "Back"}
            </a>
            <h1 className="text-2xl font-bold text-foreground">
              {lang === "DE" ? "Textgenerator" : "Text Generator"}
            </h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setLang(prev => prev === "DE" ? "EN" : "DE")}
          >
            <Globe className="h-4 w-4" />
            {lang === "DE" ? "EN" : "DE"}
          </Button>
        </div>

        {/* ── Toolbar ───────────────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-lg px-4 py-3 mb-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="hersteller-tg" className="text-xs">
              {lang === "DE" ? "Hersteller" : "Brand"}
            </Label>
            <Input
              id="hersteller-tg"
              value={hersteller}
              onChange={e => setHersteller(e.target.value)}
              placeholder="z.B. SNUG"
              className="h-8 text-xs w-40"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs">
              {lang === "DE" ? "Prompt für alle" : "Prompt for all"}
            </Label>
            <ModeSwatch value={defaultMode} onChange={handleDefaultModeChange} lang={lang} />
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs">{lang === "DE" ? "Zeilen" : "Rows"}</Label>
            <Input
              type="number" min={1} max={200}
              value={rowCountInput}
              onChange={e => setRowCountInput(e.target.value)}
              onBlur={applyRowCountInput}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyRowCountInput(); } }}
              className="h-8 w-16 text-xs"
            />
          </div>

          <Button size="sm" className="gap-1.5" onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {lang === "DE" ? "Generieren" : "Generate"}
          </Button>

          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleExport}>
            <Download className="h-4 w-4" />
            CSV Export
          </Button>

          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleUndo} disabled={history.length === 0} title="Ctrl+Z">
            <Undo2 className="h-4 w-4" />
            {lang === "DE" ? "Rückgängig" : "Undo"}
          </Button>
        </div>

        {/* ── Status line ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">
            {lang === "DE" ? "Artikel" : "Items"}
          </span>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{rows.length} {lang === "DE" ? "Zeilen" : "rows"}</span>
            {selection.length > 0 && (
              <span>{selection.length} {lang === "DE" ? "Zellen ausgewählt" : "cells selected"}</span>
            )}
            {history.length > 0 && (
              <span className="opacity-60">{history.length} {lang === "DE" ? "Schritte" : "steps"} (Ctrl+Z)</span>
            )}
          </div>
        </div>

        {/* ── Table ─────────────────────────────────────────────────────────── */}
        <div className="border border-border rounded-lg overflow-hidden mb-4">
          <div className="overflow-auto" style={{ maxHeight: "65vh" }} onMouseLeave={() => setIsSelecting(false)}>
            <table
              className="table-fixed border-collapse text-sm select-none"
              style={{ minWidth: totalWidth }}
            >
              <colgroup>
                <col style={{ width: 40 }} />
                {COLUMNS.map(c => <col key={c.key} style={{ width: c.width }} />)}
              </colgroup>

              {/* Sticky header */}
              <thead className="sticky top-0 z-10">
                <tr className="bg-[hsl(0,0%,85%)]">
                  <th className="border border-[hsl(0,0%,75%)] px-2 py-2 text-left text-xs font-semibold text-muted-foreground w-10 select-none">#</th>
                  {COLUMNS.map(c => (
                    <th
                      key={c.key}
                      className={`border border-[hsl(0,0%,75%)] px-2 py-2 text-left text-xs font-semibold cursor-pointer hover:bg-[hsl(0,0%,80%)] ${
                        c.isOutput ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300" : ""
                      }`}
                      style={{ width: c.width }}
                      onClick={e => {
                        const cells: CellPos[] = rows.map((_, r) => ({ row: r, col: COLUMNS.indexOf(c) }));
                        if (e.shiftKey && selectionStart) {
                          const ci = COLUMNS.indexOf(c);
                          const all: CellPos[] = [];
                          for (let r = 0; r < rows.length; r++)
                            for (let cc = Math.min(selectionStart.col, ci); cc <= Math.max(selectionStart.col, ci); cc++)
                              all.push({ row: r, col: cc });
                          setSelection(all);
                        } else {
                          setSelection(cells);
                          setSelectionStart({ row: 0, col: COLUMNS.indexOf(c) });
                        }
                      }}
                    >
                      {lang === "DE" ? c.labelDE : c.labelEN}
                      {c.labelDE !== c.labelEN && (
                        <div className="text-[10px] opacity-60 font-normal">{lang === "DE" ? c.labelEN : c.labelDE}</div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rows.map((row, rowIdx) => (
                  <tr key={row.id} className={rowIdx % 2 === 0 ? "bg-[hsl(0,0%,96%)]" : "bg-[hsl(0,0%,92%)]"}>
                    {/* Row number — click to select row */}
                    <td
                      className="border border-[hsl(0,0%,85%)] px-1 py-1 text-center text-xs text-muted-foreground bg-[hsl(0,0%,90%)] select-none cursor-pointer hover:bg-[hsl(0,0%,85%)]"
                      onMouseDown={e => handleRowSelect(rowIdx, e)}
                    >
                      {rowIdx + 1}
                    </td>

                    {COLUMNS.map((col, colIdx) => {
                      const isSelected = isCellSelected(rowIdx, colIdx);
                      const isInFillRange = fillHandleDrag &&
                        colIdx === fillHandleDrag.sourceCol &&
                        rowIdx !== fillHandleDrag.sourceRow &&
                        rowIdx >= Math.min(fillHandleDrag.sourceRow, fillHandleDrag.targetRow) &&
                        rowIdx <= Math.max(fillHandleDrag.sourceRow, fillHandleDrag.targetRow);
                      const value = row[col.key];

                      return (
                        <td
                          key={col.key}
                          className={`group/cell border border-[hsl(0,0%,85%)] p-0 relative ${
                            isInFillRange
                              ? "bg-primary/30 ring-1 ring-primary ring-inset"
                              : isSelected
                              ? "bg-primary/20 ring-2 ring-primary ring-inset"
                              : col.isOutput
                              ? "bg-blue-50/50 dark:bg-blue-950/10"
                              : ""
                          }`}
                          style={{ width: col.width }}
                          onMouseDown={e => handleCellMouseDown(e, rowIdx, colIdx)}
                          onMouseEnter={() => handleCellMouseEnter(rowIdx, colIdx)}
                          onMouseUp={() => { if (fillHandleDrag) { /* handled by global */ } }}
                        >
                          {col.key === "mode" ? (
                            <div className="w-full h-full px-2 py-1.5 flex items-center" data-row={rowIdx} data-col={colIdx}>
                              <ModeSwatch value={row.mode} onChange={m => handleModeChange(row.id, m)} lang={lang} xs />
                            </div>
                          ) : (
                            <input
                              type="text"
                              value={value}
                              data-row={rowIdx}
                              data-col={colIdx}
                              onChange={e => handleCellChange(row.id, col.key, e.target.value)}
                              onPaste={e => handleCellPaste(e, rowIdx, colIdx, col.key)}
                              onKeyDown={e => handleKeyNavigation(e, rowIdx, colIdx)}
                              onFocus={() => {
                                if (!selection.some(s => s.row === rowIdx && s.col === colIdx)) {
                                  setSelection([{ row: rowIdx, col: colIdx }]);
                                  setSelectionStart({ row: rowIdx, col: colIdx });
                                }
                              }}
                              className="w-full px-2 py-1.5 bg-transparent border-none outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                              style={{ minWidth: 0 }}
                            />
                          )}

                          {/* Fill handle (black cube) */}
                          {value && rowIdx < rows.length - 1 && (
                            <div
                              className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-primary cursor-crosshair z-20 border border-background opacity-0 group-hover/cell:opacity-100"
                              onMouseDown={e => handleFillHandleMouseDown(e, rowIdx, colIdx)}
                              onDoubleClick={e => { e.stopPropagation(); handleFillDoubleClick(rowIdx, colIdx); }}
                              title={lang === "DE" ? "Ziehen zum Ausfüllen" : "Drag to fill"}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {/* Add row */}
                <tr>
                  <td
                    colSpan={COLUMNS.length + 1}
                    className="border border-[hsl(0,0%,85%)] px-3 py-1.5 text-center cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted/30 text-xs transition-colors select-none"
                    onClick={() => {
                      setRows(prev => [...prev, createEmptyRow(defaultMode)]);
                      setRowCountInput(String(rows.length + 1));
                    }}
                  >
                    + {lang === "DE" ? "Zeile hinzufügen" : "Add row"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
