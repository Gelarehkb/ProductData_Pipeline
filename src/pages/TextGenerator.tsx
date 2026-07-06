import { useState, useRef, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Download, Sparkles, Undo2, ArrowLeft } from "lucide-react";
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
interface TextRow {
  id: string;
  han: string;
  artikelnummer: string;
  artikelname: string;
  beschreibung: string;
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
// Constants
// ---------------------------------------------------------------------------
const COLUMNS: { key: TextRowKey; labelDE: string; labelEN: string; width: number; isOutput: boolean; multiline: boolean }[] = [
  { key: "han",              labelDE: "HAN / Barcode",        labelEN: "HAN / Barcode",       width: 160, isOutput: false, multiline: false },
  { key: "artikelnummer",    labelDE: "Artikelnummer",         labelEN: "Article No.",          width: 160, isOutput: false, multiline: false },
  { key: "artikelname",      labelDE: "Artikelname",           labelEN: "Item Name",            width: 200, isOutput: false, multiline: false },
  { key: "beschreibung",     labelDE: "Beschreibung",          labelEN: "Description",          width: 280, isOutput: false, multiline: true  },
  { key: "produkttext",      labelDE: "Produkttext",           labelEN: "Product Text",         width: 280, isOutput: true,  multiline: true  },
  { key: "Title_Tag",        labelDE: "Title Tag",             labelEN: "Title Tag",            width: 200, isOutput: true,  multiline: false },
  { key: "html_de",          labelDE: "HTML (DE)",             labelEN: "HTML (DE)",            width: 300, isOutput: true,  multiline: true  },
  { key: "meta_description", labelDE: "Meta Description",     labelEN: "Meta Description",     width: 220, isOutput: true,  multiline: true  },
  { key: "suchbegriffe",     labelDE: "Suchbegriffe",          labelEN: "Search Terms",         width: 180, isOutput: true,  multiline: false },
];

const INPUT_COLUMNS = COLUMNS.filter(c => !c.isOutput);
const OUTPUT_COLUMNS = COLUMNS.filter(c => c.isOutput);

const createEmptyRow = (): TextRow => ({
  id: crypto.randomUUID(),
  han: "",
  artikelnummer: "",
  artikelname: "",
  beschreibung: "",
  produkttext: "",
  Title_Tag: "",
  html_de: "",
  meta_description: "",
  suchbegriffe: "",
});

// ---------------------------------------------------------------------------
// Paste parser (same logic as Index.tsx)
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
  const [rows, setRows] = useState<TextRow[]>(() => Array.from({ length: 10 }, createEmptyRow));
  const [history, setHistory] = useState<TextRow[][]>([]);
  const [generating, setGenerating] = useState(false);

  // Selection: list of {row, col} positions
  const [selection, setSelection] = useState<CellPos[]>([]);
  const [editingCell, setEditingCell] = useState<CellPos | null>(null);
  const [editValue, setEditValue] = useState("");

  const [fillHandleDrag, setFillHandleDrag] = useState<FillDrag | null>(null);

  const lastClickedRef = useRef<CellPos | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  // Sync row count
  const parsedRowCount = Math.max(1, Math.min(200, parseInt(rowCountInput, 10) || 10));

  const applyRowCount = useCallback((count: number) => {
    setRows(prev => {
      if (prev.length === count) return prev;
      if (prev.length < count) {
        return [...prev, ...Array.from({ length: count - prev.length }, createEmptyRow)];
      }
      return prev.slice(0, count);
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Selection helpers
  // ---------------------------------------------------------------------------
  const isCellSelected = (row: number, col: number) =>
    selection.some(s => s.row === row && s.col === col);

  const handleCellMouseDown = (e: React.MouseEvent, row: number, col: number) => {
    if (editingCell && (editingCell.row !== row || editingCell.col !== col)) {
      commitEdit();
    }

    if (e.shiftKey && lastClickedRef.current) {
      // Range selection
      const r0 = Math.min(lastClickedRef.current.row, row);
      const r1 = Math.max(lastClickedRef.current.row, row);
      const c0 = Math.min(lastClickedRef.current.col, col);
      const c1 = Math.max(lastClickedRef.current.col, col);
      const range: CellPos[] = [];
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) range.push({ row: r, col: c });
      setSelection(range);
    } else {
      setSelection([{ row, col }]);
      lastClickedRef.current = { row, col };
    }
  };

  const handleCellDoubleClick = (row: number, col: number) => {
    startEdit(row, col);
  };

  const startEdit = (row: number, col: number) => {
    const val = rows[row]?.[COLUMNS[col].key] ?? "";
    setEditingCell({ row, col });
    setEditValue(val);
    setSelection([{ row, col }]);
  };

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const { row, col } = editingCell;
    const key = COLUMNS[col].key;
    setRows(prev => {
      const next = [...prev];
      next[row] = { ...next[row], [key]: editValue };
      return next;
    });
    setEditingCell(null);
  }, [editingCell, editValue]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

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
    toast({ title: lang === "DE" ? "Werte übernommen" : "Values filled", description: `${maxRow - minRow} ${lang === "DE" ? "Zellen aktualisiert." : "cells updated."}` });
  }, [rows, lang, toast]);

  const handleFillHandleMouseDown = (e: React.MouseEvent, rowIdx: number, colIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    setFillHandleDrag({ sourceRow: rowIdx, sourceCol: colIdx, targetRow: rowIdx });
  };

  const handleFillHandleDragMove = useCallback((rowIdx: number) => {
    if (fillHandleDrag) setFillHandleDrag(prev => prev ? { ...prev, targetRow: rowIdx } : null);
  }, [fillHandleDrag]);

  const handleFillHandleDragEnd = useCallback(() => {
    if (fillHandleDrag && fillHandleDrag.targetRow !== fillHandleDrag.sourceRow) {
      handleFillToRange(fillHandleDrag.sourceRow, fillHandleDrag.sourceCol, fillHandleDrag.targetRow);
    }
    setFillHandleDrag(null);
  }, [fillHandleDrag, handleFillToRange]);

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

  // Global mouseup to end fill drag if released outside table
  useEffect(() => {
    const onUp = () => { if (fillHandleDrag) handleFillHandleDragEnd(); };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [fillHandleDrag, handleFillHandleDragEnd]);

  // Focus textarea/input when editing starts
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      const len = editInputRef.current.value.length;
      editInputRef.current.setSelectionRange(len, len);
    }
  }, [editingCell]);

  // ---------------------------------------------------------------------------
  // Keyboard handler
  // ---------------------------------------------------------------------------
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isEditing = target.tagName === "TEXTAREA" || (target.tagName === "INPUT" && target.closest("td"));
    if (isEditing) return;

    const isMac = navigator.platform.toUpperCase().includes("MAC");
    const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

    if (ctrlOrCmd && e.key === "z") {
      e.preventDefault();
      // Undo
      setHistory(prev => {
        if (prev.length === 0) return prev;
        const snapshot = prev[prev.length - 1];
        setRows(snapshot);
        toast({ title: lang === "DE" ? "Rückgängig" : "Undo", description: lang === "DE" ? "Letzte Änderung rückgängig gemacht." : "Last change undone." });
        return prev.slice(0, -1);
      });
      return;
    }

    if (ctrlOrCmd && e.key === "c") {
      e.preventDefault();
      if (selection.length === 0) return;
      // Build matrix
      const rows_ = [...new Set(selection.map(s => s.row))].sort((a, b) => a - b);
      const cols_ = [...new Set(selection.map(s => s.col))].sort((a, b) => a - b);
      const matrix = rows_.map(r => cols_.map(c => {
        const sel = selection.find(s => s.row === r && s.col === c);
        if (!sel) return "";
        return rows[r]?.[COLUMNS[c].key] ?? "";
      }));
      const text = matrix.map(r => r.join("\t")).join("\n");
      navigator.clipboard.writeText(text).catch(() => {});
      return;
    }

    if (ctrlOrCmd && e.key === "v") {
      e.preventDefault();
      if (selection.length === 0) return;
      navigator.clipboard.readText().then(text => {
        const minRow = Math.min(...selection.map(s => s.row));
        const minCol = Math.min(...selection.map(s => s.col));
        const targetKey = COLUMNS[minCol].key;

        // For multiline columns (beschreibung, html_de) without structure: paste as single cell
        const col = COLUMNS[minCol];
        const hasTab = text.includes("\t");
        const hasSemicolon = text.includes(";");
        if ((col.key === "beschreibung" || col.key === "html_de") && !hasTab && !hasSemicolon) {
          setHistory(prev => [...prev.slice(-49), rows]);
          setRows(prev => {
            const next = [...prev];
            next[minRow] = { ...next[minRow], [targetKey]: text.trimEnd() };
            return next;
          });
          toast({ title: lang === "DE" ? "Eingefügt" : "Pasted" });
          return;
        }

        const matrix = parsePasteMatrix(text);
        if (matrix.length === 0) return;
        setHistory(prev => [...prev.slice(-49), rows]);
        setRows(prev => {
          const next = [...prev];
          // Ensure enough rows
          while (next.length < minRow + matrix.length) next.push(createEmptyRow());
          for (let ri = 0; ri < matrix.length; ri++) {
            for (let ci = 0; ci < matrix[ri].length; ci++) {
              const colIdx = minCol + ci;
              if (colIdx >= COLUMNS.length) continue;
              const k = COLUMNS[colIdx].key;
              next[minRow + ri] = { ...next[minRow + ri], [k]: matrix[ri][ci] };
            }
          }
          return next;
        });
        toast({ title: lang === "DE" ? "Eingefügt" : "Pasted" });
      }).catch(() => {});
      return;
    }

    if ((e.key === "Delete" || e.key === "Backspace") && selection.length > 0) {
      e.preventDefault();
      setHistory(prev => [...prev.slice(-49), rows]);
      setRows(prev => {
        const next = [...prev];
        for (const { row, col } of selection) {
          const k = COLUMNS[col].key;
          next[row] = { ...next[row], [k]: "" };
        }
        return next;
      });
      return;
    }

    if (e.key === "Escape") {
      setSelection([]);
      setEditingCell(null);
      return;
    }
  }, [selection, rows, lang, toast]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // ---------------------------------------------------------------------------
  // Generation
  // ---------------------------------------------------------------------------
  const handleGenerate = async () => {
    const eligible = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.artikelname.trim() !== "");

    if (eligible.length === 0) {
      toast({ title: lang === "DE" ? "Keine Artikel" : "No items", description: lang === "DE" ? "Bitte mindestens einen Artikelnamen eingeben." : "Please enter at least one item name.", variant: "destructive" });
      return;
    }

    setHistory(prev => [...prev.slice(-49), rows]);
    setGenerating(true);

    const { data, error } = await apiFetch("generate-online-texts-complex", {
      items: eligible.map(({ r }) => ({
        artikelname: r.artikelname,
        markenname: hersteller,
        beschreibung: r.beschreibung,
        warengruppe: "",
      })),
    });

    setGenerating(false);

    if (error || !data) {
      toast({ title: lang === "DE" ? "Fehler" : "Error", description: error?.message ?? "Unknown error", variant: "destructive" });
      return;
    }

    const results = (data as { results: { produkttext?: string; Title_Tag?: string; html_de?: string; meta_description?: string; suchbegriffe?: string; error?: string }[] }).results;

    setRows(prev => {
      const next = [...prev];
      eligible.forEach(({ i }, idx) => {
        const res = results[idx];
        if (!res || res.error) return;
        next[i] = {
          ...next[i],
          produkttext: res.produkttext ?? "",
          Title_Tag: res.Title_Tag ?? "",
          html_de: res.html_de ?? "",
          meta_description: res.meta_description ?? "",
          suchbegriffe: res.suchbegriffe ?? "",
        };
      });
      return next;
    });

    toast({ title: lang === "DE" ? "Texte generiert" : "Texts generated", description: `${eligible.length} ${lang === "DE" ? "Artikel verarbeitet." : "items processed."}` });
  };

  // ---------------------------------------------------------------------------
  // CSV Export
  // ---------------------------------------------------------------------------
  const handleExport = () => {
    const headers = [
      "HAN/Barcode/Interner Schlüssel",
      "Artikelnummer",
      "produkttext",
      "Title_Tag",
      "html_de",
      "meta_description",
      "suchbegriffe",
    ];
    const exportKeys: TextRowKey[] = ["han", "artikelnummer", "produkttext", "Title_Tag", "html_de", "meta_description", "suchbegriffe"];

    const lines: string[] = [headers.map(csvEscape).join(";")];
    for (const row of rows) {
      if (exportKeys.every(k => !row[k])) continue; // skip fully empty rows
      lines.push(exportKeys.map(k => csvEscape(row[k])).join(";"));
    }

    const content = lines.join("\r\n");
    const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "texte-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---------------------------------------------------------------------------
  // Undo
  // ---------------------------------------------------------------------------
  const handleUndo = () => {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      setRows(prev[prev.length - 1]);
      toast({ title: lang === "DE" ? "Rückgängig" : "Undo" });
      return prev.slice(0, -1);
    });
  };

  // ---------------------------------------------------------------------------
  // Add row (+ button)
  // ---------------------------------------------------------------------------
  const addRow = () => {
    setRows(prev => [...prev, createEmptyRow()]);
    setRowCountInput(String(rows.length + 1));
  };

  // ---------------------------------------------------------------------------
  // Row count control apply on blur/enter
  // ---------------------------------------------------------------------------
  const applyRowCountInput = () => {
    const n = Math.max(1, Math.min(200, parseInt(rowCountInput, 10) || rows.length));
    setRowCountInput(String(n));
    applyRowCount(n);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const totalWidth = COLUMNS.reduce((s, c) => s + c.width, 0);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 bg-background border-b border-border px-4 py-2 flex flex-wrap items-center gap-3">
        <a href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <ArrowLeft className="h-4 w-4" />
          {lang === "DE" ? "Zurück" : "Back"}
        </a>

        <span className="text-sm font-semibold text-foreground shrink-0">
          {lang === "DE" ? "Textgenerator" : "Text Generator"}
        </span>

        <div className="flex items-center gap-1.5 shrink-0">
          <Label htmlFor="hersteller-tg" className="text-xs text-muted-foreground whitespace-nowrap">
            {lang === "DE" ? "Hersteller" : "Brand"}
          </Label>
          <Input
            id="hersteller-tg"
            value={hersteller}
            onChange={e => setHersteller(e.target.value)}
            placeholder="z.B. SNUG"
            className="h-7 text-sm w-44"
          />
        </div>

        <Button
          size="sm"
          className="gap-1.5 h-7 text-xs shrink-0"
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {lang === "DE" ? "Generieren" : "Generate"}
        </Button>

        <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs shrink-0" onClick={handleExport}>
          <Download className="h-3.5 w-3.5" />
          CSV Export
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 h-7 text-xs shrink-0"
          onClick={handleUndo}
          disabled={history.length === 0}
          title={lang === "DE" ? "Rückgängig (Ctrl+Z)" : "Undo (Ctrl+Z)"}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>

        <div className="flex items-center gap-1.5 shrink-0">
          <Label className="text-xs text-muted-foreground">{lang === "DE" ? "Zeilen" : "Rows"}</Label>
          <Input
            type="number"
            min={1}
            max={200}
            value={rowCountInput}
            onChange={e => setRowCountInput(e.target.value)}
            onBlur={applyRowCountInput}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyRowCountInput(); } }}
            className="h-7 w-16 text-sm"
          />
        </div>

        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <Label className="text-xs text-muted-foreground">DE</Label>
          <Switch
            checked={lang === "EN"}
            onCheckedChange={v => setLang(v ? "EN" : "DE")}
            className="scale-75"
          />
          <Label className="text-xs text-muted-foreground">EN</Label>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-x-auto">
        <table
          className="table-fixed border-collapse text-sm"
          style={{ minWidth: totalWidth + 40 }}
          onMouseDown={e => {
            // Click on non-cell area deselects
            if ((e.target as HTMLElement).closest("td, th") === null) {
              setSelection([]);
              if (editingCell) commitEdit();
            }
          }}
        >
          {/* Col widths */}
          <colgroup>
            <col style={{ width: 40 }} />
            {COLUMNS.map(c => <col key={c.key} style={{ width: c.width }} />)}
          </colgroup>

          {/* Sticky header */}
          <thead className="sticky top-[49px] z-10">
            <tr>
              <th className="border border-border bg-muted px-2 py-1.5 text-left text-xs font-medium text-muted-foreground w-10">#</th>
              {COLUMNS.map(c => (
                <th
                  key={c.key}
                  className={`border border-border px-2 py-1.5 text-left text-xs font-medium ${
                    c.isOutput
                      ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300"
                      : "bg-muted text-muted-foreground"
                  }`}
                  style={{ width: c.width }}
                >
                  <div className="font-semibold">{lang === "DE" ? c.labelDE : c.labelEN}</div>
                  {c.labelDE !== c.labelEN && (
                    <div className="text-[10px] opacity-60 font-normal">{lang === "DE" ? c.labelEN : c.labelDE}</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={row.id} className="hover:bg-muted/20 group">
                <td className="border border-border px-2 py-0.5 text-center text-xs text-muted-foreground bg-muted/40 select-none">
                  {rowIdx + 1}
                </td>
                {COLUMNS.map((col, colIdx) => {
                  const isSelected = isCellSelected(rowIdx, colIdx);
                  const isEditing = editingCell?.row === rowIdx && editingCell?.col === colIdx;
                  const isInFillRange = fillHandleDrag &&
                    colIdx === fillHandleDrag.sourceCol &&
                    rowIdx !== fillHandleDrag.sourceRow &&
                    rowIdx >= Math.min(fillHandleDrag.sourceRow, fillHandleDrag.targetRow) &&
                    rowIdx <= Math.max(fillHandleDrag.sourceRow, fillHandleDrag.targetRow);
                  const value = row[col.key];
                  const hasValue = value.trim().length > 0;

                  return (
                    <td
                      key={col.key}
                      style={{ width: col.width }}
                      className={`group/cell border border-border px-0 py-0 relative align-top cursor-default select-none ${
                        isInFillRange
                          ? "bg-primary/30 ring-1 ring-primary ring-inset"
                          : isSelected
                          ? "bg-blue-100 dark:bg-blue-900/40 ring-2 ring-primary ring-inset"
                          : col.isOutput
                          ? hasValue
                            ? "bg-blue-50/40 dark:bg-blue-950/10"
                            : "bg-muted/10"
                          : "bg-white dark:bg-background"
                      }`}
                      onMouseDown={e => handleCellMouseDown(e, rowIdx, colIdx)}
                      onDoubleClick={() => handleCellDoubleClick(rowIdx, colIdx)}
                      onMouseEnter={() => {
                        if (fillHandleDrag && colIdx === fillHandleDrag.sourceCol) {
                          handleFillHandleDragMove(rowIdx);
                        }
                      }}
                      onMouseUp={() => {
                        if (fillHandleDrag) handleFillHandleDragEnd();
                      }}
                    >
                      {isEditing ? (
                        col.multiline ? (
                          <textarea
                            ref={el => { editInputRef.current = el; }}
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={e => {
                              if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                              if (e.key === "Tab") { e.preventDefault(); commitEdit(); }
                            }}
                            className="w-full min-h-16 resize-none bg-transparent outline outline-2 outline-primary px-2 py-1 text-sm font-inherit"
                            style={{ width: col.width - 2 }}
                          />
                        ) : (
                          <input
                            ref={el => { editInputRef.current = el; }}
                            type="text"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={e => {
                              if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); commitEdit(); }
                            }}
                            className="w-full bg-transparent outline outline-2 outline-primary px-2 py-1 text-sm"
                            style={{ width: col.width - 2 }}
                          />
                        )
                      ) : (
                        <div
                          className={`px-2 py-1 min-h-[28px] text-sm whitespace-pre-wrap break-words ${
                            !hasValue ? "text-muted-foreground/40 italic text-xs" : ""
                          }`}
                          style={{ minHeight: col.multiline ? 48 : 28 }}
                        >
                          {value || ""}
                        </div>
                      )}
                      {/* Fill handle (black cube) */}
                      {hasValue && !isEditing && rowIdx < rows.length - 1 && (
                        <div
                          className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-primary cursor-crosshair z-20 border border-background opacity-0 group-hover/cell:opacity-100"
                          onMouseDown={e => handleFillHandleMouseDown(e, rowIdx, colIdx)}
                          onDoubleClick={e => { e.stopPropagation(); handleFillDoubleClick(rowIdx, colIdx); }}
                          title={lang === "DE" ? "Ziehen zum Ausfüllen, Doppelklick zum Auto-Ausfüllen" : "Drag to fill, double-click to auto-fill"}
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
                className="border border-border px-3 py-1 text-center cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted/30 text-xs transition-colors select-none"
                onClick={addRow}
              >
                + {lang === "DE" ? "Zeile hinzufügen" : "Add row"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 bg-background border-t border-border px-4 py-1.5 flex items-center gap-4 text-xs text-muted-foreground">
        <span>{rows.length} {lang === "DE" ? "Zeilen" : "rows"}</span>
        {selection.length > 0 && (
          <span>{selection.length} {lang === "DE" ? "Zellen ausgewählt" : "cells selected"}</span>
        )}
      </div>
    </div>
  );
}
