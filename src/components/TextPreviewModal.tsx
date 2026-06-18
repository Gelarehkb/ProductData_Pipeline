import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FindReplaceDialog } from "@/components/FindReplaceDialog";

export interface TextPreviewRow {
  id: string;
  name: string;
  produkttext: string;
  Title_Tag: string;
  html_de: string;
  meta_description: string;
  suchbegriffe: string;
}

type TextCol = "produkttext" | "Title_Tag" | "html_de" | "meta_description" | "suchbegriffe";

const TEXT_COLS: { key: TextCol; label: string; defaultWidth: number }[] = [
  { key: "produkttext",    label: "produkttext",     defaultWidth: 280 },
  { key: "Title_Tag",      label: "Title_Tag",        defaultWidth: 180 },
  { key: "html_de",        label: "html_de",          defaultWidth: 280 },
  { key: "meta_description", label: "meta_description", defaultWidth: 220 },
  { key: "suchbegriffe",   label: "suchbegriffe",     defaultWidth: 180 },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRows: TextPreviewRow[];
  onConfirm: (rows: TextPreviewRow[]) => void;
  lang: "DE" | "EN";
}

type SortDir = "asc" | "desc" | null;
type SelCell = { id: string; col: TextCol };

export const TextPreviewModal = ({ open, onOpenChange, initialRows, onConfirm, lang }: Props) => {
  const [rows, setRows] = useState<TextPreviewRow[]>([]);
  const [history, setHistory] = useState<TextPreviewRow[][]>([]);
  const [redoStack, setRedoStack] = useState<TextPreviewRow[][]>([]);
  const [selection, setSelection] = useState<SelCell[]>([]);
  const [selAnchor, setSelAnchor] = useState<SelCell | null>(null);
  const [editingCell, setEditingCell] = useState<{ id: string; col: TextCol } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [filterText, setFilterText] = useState("");
  const [sortCol, setSortCol] = useState<TextCol | "name" | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [colWidths, setColWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries([["name", 160], ...TEXT_COLS.map(c => [c.key, c.defaultWidth])])
  );
  const editRef = useRef<HTMLTextAreaElement>(null);
  const resizingCol = useRef<string | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setRows(initialRows);
      setHistory([]);
      setRedoStack([]);
      setSelection([]);
      setSelAnchor(null);
      setEditingCell(null);
      setFilterText("");
      setSortCol(null);
      setSortDir(null);
    }
  }, [open, initialRows]);

  useEffect(() => {
    if (editingCell && editRef.current) {
      editRef.current.focus();
      const len = editRef.current.value.length;
      editRef.current.setSelectionRange(len, len);
    }
  }, [editingCell]);

  const displayRows = useMemo(() => {
    let result = [...rows];
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      result = result.filter(r =>
        r.name.toLowerCase().includes(q) ||
        TEXT_COLS.some(c => r[c.key].toLowerCase().includes(q))
      );
    }
    if (sortCol && sortDir) {
      result.sort((a, b) => {
        const va = sortCol === "name" ? a.name : a[sortCol as TextCol];
        const vb = sortCol === "name" ? b.name : b[sortCol as TextCol];
        const cmp = va.localeCompare(vb, undefined, { sensitivity: "base" });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [rows, filterText, sortCol, sortDir]);

  const displayRowsRef = useRef(displayRows);
  displayRowsRef.current = displayRows;

  const saveHistory = useCallback(() => {
    setHistory(prev => [...prev.slice(-49), rows]);
    setRedoStack([]);
  }, [rows]);

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const { id, col } = editingCell;
    setRows(prev => {
      const row = prev.find(r => r.id === id);
      if (!row || row[col] === editValue) return prev;
      setHistory(h => [...h.slice(-49), prev]);
      setRedoStack([]);
      return prev.map(r => r.id === id ? { ...r, [col]: editValue } : r);
    });
    setEditingCell(null);
  }, [editingCell, editValue]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    setRedoStack(r => [...r, rows]);
    setRows(history[history.length - 1]);
    setHistory(h => h.slice(0, -1));
    setEditingCell(null);
  }, [history, rows]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    setHistory(h => [...h, rows]);
    setRows(redoStack[redoStack.length - 1]);
    setRedoStack(r => r.slice(0, -1));
    setEditingCell(null);
  }, [redoStack, rows]);

  const isCellSelected = useCallback((id: string, col: TextCol) =>
    selection.some(s => s.id === id && s.col === col), [selection]);

  const handleCellClick = useCallback((id: string, col: TextCol, e: React.MouseEvent) => {
    if (editingCell) commitEdit();
    if (e.shiftKey && selAnchor) {
      const dr = displayRowsRef.current;
      const anchorIdx = dr.findIndex(r => r.id === selAnchor.id);
      const cellIdx  = dr.findIndex(r => r.id === id);
      const cols = TEXT_COLS.map(c => c.key);
      const minR = Math.min(anchorIdx, cellIdx);
      const maxR = Math.max(anchorIdx, cellIdx);
      const minC = Math.min(cols.indexOf(selAnchor.col), cols.indexOf(col));
      const maxC = Math.max(cols.indexOf(selAnchor.col), cols.indexOf(col));
      const newSel: SelCell[] = [];
      for (let ri = minR; ri <= maxR; ri++) {
        for (let ci = minC; ci <= maxC; ci++) {
          newSel.push({ id: dr[ri].id, col: cols[ci] as TextCol });
        }
      }
      setSelection(newSel);
    } else {
      setSelection([{ id, col }]);
      setSelAnchor({ id, col });
    }
  }, [editingCell, commitEdit, selAnchor]);

  const handleCellDoubleClick = useCallback((id: string, col: TextCol) => {
    const row = rows.find(r => r.id === id);
    if (!row) return;
    setEditingCell({ id, col });
    setEditValue(row[col]);
  }, [rows]);

  const handleSort = (col: TextCol | "name") => {
    if (sortCol === col) {
      if (sortDir === "asc") { setSortDir("desc"); }
      else if (sortDir === "desc") { setSortCol(null); setSortDir(null); }
      else { setSortDir("asc"); }
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const handleFindReplace = useCallback((find: string, replace: string, scope: "all" | "selection") => {
    if (!find) return;
    saveHistory();
    setRows(prev => prev.map(row => {
      const newRow = { ...row };
      TEXT_COLS.forEach(({ key }) => {
        if (scope === "selection" && !isCellSelected(row.id, key)) return;
        newRow[key] = newRow[key].split(find).join(replace);
      });
      return newRow;
    }));
  }, [saveHistory, isCellSelected]);

  const applyRule = useCallback((rule: "upper" | "lower" | "trim") => {
    saveHistory();
    const hasSelection = selection.length > 0;
    setRows(prev => prev.map(row => {
      const newRow = { ...row };
      TEXT_COLS.forEach(({ key }) => {
        if (hasSelection && !isCellSelected(row.id, key)) return;
        if (rule === "upper") newRow[key] = newRow[key].toUpperCase();
        else if (rule === "lower") newRow[key] = newRow[key].toLowerCase();
        else newRow[key] = newRow[key].trim().replace(/\s+/g, " ");
      });
      return newRow;
    }));
  }, [saveHistory, selection, isCellSelected]);

  const handleResizeMouseDown = (col: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingCol.current = col;
    resizeStartX.current = e.clientX;
    resizeStartW.current = colWidths[col] ?? 180;
    const onMove = (me: MouseEvent) => {
      if (!resizingCol.current) return;
      const delta = me.clientX - resizeStartX.current;
      setColWidths(w => ({ ...w, [resizingCol.current!]: Math.max(60, resizeStartW.current + delta) }));
    };
    const onUp = () => {
      resizingCol.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if ((ctrl && e.key === "y") || (ctrl && e.key === "z" && e.shiftKey)) { e.preventDefault(); redo(); return; }
    if (ctrl && e.key === "h") { e.preventDefault(); setFindReplaceOpen(true); return; }
    if (ctrl && e.key === "c" && !editingCell && selection.length > 0) {
      e.preventDefault();
      const dr = displayRowsRef.current;
      const text = selection.map(s => dr.find(r => r.id === s.id)?.[s.col] ?? "").join("\t");
      navigator.clipboard.writeText(text);
      return;
    }
    if (ctrl && e.key === "v" && !editingCell && selection.length === 1) {
      e.preventDefault();
      const { id, col } = selection[0];
      navigator.clipboard.readText().then(text => {
        saveHistory();
        setRows(prev => prev.map(r => r.id === id ? { ...r, [col]: text } : r));
      });
      return;
    }
  }, [undo, redo, editingCell, selection, saveHistory]);

  const sortIndicator = (col: TextCol | "name") =>
    sortCol === col ? (sortDir === "asc" ? " ↑" : sortDir === "desc" ? " ↓" : "") : "";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && editingCell) commitEdit(); onOpenChange(v); }}>
      <DialogContent
        className="max-w-[96vw] w-[96vw] max-h-[92vh] h-[92vh] flex flex-col p-0 gap-0"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <DialogHeader className="px-4 pt-4 pb-2 border-b shrink-0">
          <DialogTitle>{lang === "DE" ? "Texte bearbeiten" : "Edit Generated Texts"}</DialogTitle>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0 flex-wrap">
          <Input
            placeholder={lang === "DE" ? "Filtern..." : "Filter..."}
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            className="h-7 text-xs w-36"
          />
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setFindReplaceOpen(true)}>
            {lang === "DE" ? "Suchen & Ersetzen" : "Find & Replace"} <span className="text-muted-foreground">(Ctrl+H)</span>
          </Button>
          <div className="h-4 w-px bg-border mx-1" />
          <span className="text-xs text-muted-foreground">{lang === "DE" ? "Regeln:" : "Rules:"}</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" title="UPPERCASE" onClick={() => applyRule("upper")}>ABC</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" title="lowercase" onClick={() => applyRule("lower")}>abc</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" title={lang === "DE" ? "Leerzeichen bereinigen" : "Trim whitespace"} onClick={() => applyRule("trim")}>Trim</Button>
          <div className="h-4 w-px bg-border mx-1" />
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={undo} disabled={history.length === 0} title="Ctrl+Z">↩</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={redo} disabled={redoStack.length === 0} title="Ctrl+Y">↪</Button>
          <span className="text-xs text-muted-foreground ml-2">{lang === "DE" ? "Doppelklick zum Bearbeiten" : "Double-click to edit"}</span>
        </div>

        {/* Table */}
        <div ref={tableRef} className="flex-1 overflow-auto" onClick={e => { if (e.target === tableRef.current) { commitEdit(); setSelection([]); } }}>
          <table className="border-collapse text-xs w-max min-w-full" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: colWidths["name"] }} />
              {TEXT_COLS.map(c => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                {[{ key: "name" as const, label: "Name" }, ...TEXT_COLS.map(c => ({ key: c.key, label: c.label }))].map(col => (
                  <th
                    key={col.key}
                    className="border px-2 py-1 text-left relative cursor-pointer select-none whitespace-nowrap font-medium text-xs"
                    onClick={() => handleSort(col.key as TextCol | "name")}
                    style={{ width: colWidths[col.key] }}
                  >
                    {col.label}{sortIndicator(col.key as TextCol | "name")}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/50 active:bg-primary"
                      onMouseDown={e => handleResizeMouseDown(col.key, e)}
                      onClick={e => e.stopPropagation()}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/20">
                  <td
                    className="border px-2 py-1 bg-muted/30 text-muted-foreground"
                    style={{ width: colWidths["name"], maxWidth: colWidths["name"], overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={row.name}
                  >
                    {row.name}
                  </td>
                  {TEXT_COLS.map(c => {
                    const isEditing = editingCell?.id === row.id && editingCell?.col === c.key;
                    const isSelected = isCellSelected(row.id, c.key);
                    return (
                      <td
                        key={c.key}
                        className={`border px-1 py-0 cursor-pointer align-top ${isSelected && !isEditing ? "bg-blue-100 dark:bg-blue-900/40" : ""} ${isEditing ? "p-0" : ""}`}
                        style={{ width: colWidths[c.key], maxWidth: colWidths[c.key] }}
                        onClick={e => handleCellClick(row.id, c.key, e)}
                        onDoubleClick={() => handleCellDoubleClick(row.id, c.key)}
                      >
                        {isEditing ? (
                          <textarea
                            ref={editRef}
                            className="w-full min-h-[4rem] text-xs p-1 resize-y border-none outline-2 outline-primary bg-background"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={e => {
                              e.stopPropagation();
                              if (e.key === "Escape") { setEditingCell(null); }
                              if (e.key === "Tab") { e.preventDefault(); commitEdit(); }
                            }}
                          />
                        ) : (
                          <div
                            className="py-1 px-1 leading-snug text-xs"
                            style={{ maxHeight: 72, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical" } as React.CSSProperties}
                            title={row[c.key]}
                          >
                            {row[c.key] || <span className="text-muted-foreground/40">—</span>}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {displayRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="border px-4 py-6 text-center text-muted-foreground text-xs">
                    {filterText ? (lang === "DE" ? "Keine Treffer." : "No matches.") : (lang === "DE" ? "Keine Daten." : "No data.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-4 py-3 border-t shrink-0">
          <span className="text-xs text-muted-foreground">
            {displayRows.length} {lang === "DE" ? "Einträge" : "entries"}
            {selection.length > 1 ? ` · ${selection.length} ${lang === "DE" ? "Zellen ausgewählt" : "cells selected"}` : ""}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {lang === "DE" ? "Abbrechen" : "Cancel"}
            </Button>
            <Button onClick={() => { if (editingCell) commitEdit(); onConfirm(rows); onOpenChange(false); }}>
              {lang === "DE" ? "Bestätigen & exportieren" : "Confirm & Export"}
            </Button>
          </div>
        </div>

        <FindReplaceDialog
          open={findReplaceOpen}
          onOpenChange={setFindReplaceOpen}
          onReplace={handleFindReplace}
          hasSelection={selection.length > 0}
        />
      </DialogContent>
    </Dialog>
  );
};
