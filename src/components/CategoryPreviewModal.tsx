import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FindReplaceDialog } from "@/components/FindReplaceDialog";

export interface CategoryPreviewRow {
  id: string;
  artikelnummer: string;
  categoryPath: string; // e.g. "Mode -> Kindermode 0 bis 5J -> T-Shirts & Tops"
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRows: CategoryPreviewRow[];
  onConfirm: (rows: CategoryPreviewRow[]) => void;
  lang: "DE" | "EN";
}

type SortDir = "asc" | "desc" | null;

export const CategoryPreviewModal = ({ open, onOpenChange, initialRows, onConfirm, lang }: Props) => {
  const [rows, setRows] = useState<CategoryPreviewRow[]>([]);
  const [history, setHistory] = useState<CategoryPreviewRow[][]>([]);
  const [redoStack, setRedoStack] = useState<CategoryPreviewRow[][]>([]);
  const [selection, setSelection] = useState<{ id: string }[]>([]);
  const [selAnchor, setSelAnchor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [filterText, setFilterText] = useState("");
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [colWidths, setColWidths] = useState({ artikelnummer: 200, categoryPath: 480 });

  const editRef = useRef<HTMLInputElement>(null);
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
      setEditingId(null);
      setFilterText("");
      setSortDir(null);
    }
  }, [open, initialRows]);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      const len = editRef.current.value.length;
      editRef.current.setSelectionRange(len, len);
    }
  }, [editingId]);

  const displayRows = useMemo(() => {
    let result = [...rows];
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      result = result.filter(r =>
        r.artikelnummer.toLowerCase().includes(q) ||
        r.categoryPath.toLowerCase().includes(q)
      );
    }
    if (sortDir) {
      result.sort((a, b) => {
        const cmp = a.categoryPath.localeCompare(b.categoryPath, undefined, { sensitivity: "base" });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [rows, filterText, sortDir]);

  const displayRowsRef = useRef(displayRows);
  displayRowsRef.current = displayRows;

  const commitEdit = useCallback(() => {
    if (!editingId) return;
    setRows(prev => {
      const row = prev.find(r => r.id === editingId);
      if (!row || row.categoryPath === editValue) { setEditingId(null); return prev; }
      setHistory(h => [...h.slice(-49), prev]);
      setRedoStack([]);
      return prev.map(r => r.id === editingId ? { ...r, categoryPath: editValue } : r);
    });
    setEditingId(null);
  }, [editingId, editValue]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    setRedoStack(r => [...r, rows]);
    setRows(history[history.length - 1]);
    setHistory(h => h.slice(0, -1));
    setEditingId(null);
  }, [history, rows]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    setHistory(h => [...h, rows]);
    setRows(redoStack[redoStack.length - 1]);
    setRedoStack(r => r.slice(0, -1));
    setEditingId(null);
  }, [redoStack, rows]);

  const isCellSelected = (id: string) => selection.some(s => s.id === id);

  const handleRowClick = (id: string, e: React.MouseEvent) => {
    if (editingId && editingId !== id) commitEdit();
    if (e.shiftKey && selAnchor) {
      const dr = displayRowsRef.current;
      const ai = dr.findIndex(r => r.id === selAnchor);
      const bi = dr.findIndex(r => r.id === id);
      const min = Math.min(ai, bi), max = Math.max(ai, bi);
      setSelection(dr.slice(min, max + 1).map(r => ({ id: r.id })));
    } else {
      setSelection([{ id }]);
      setSelAnchor(id);
    }
  };

  const handleRowDoubleClick = (id: string) => {
    const row = rows.find(r => r.id === id);
    if (!row) return;
    setEditingId(id);
    setEditValue(row.categoryPath);
  };

  const handleFindReplace = useCallback((find: string, replace: string, scope: "all" | "selection") => {
    if (!find) return;
    setHistory(h => [...h.slice(-49), rows]);
    setRedoStack([]);
    setRows(prev => prev.map(row => {
      if (scope === "selection" && !isCellSelected(row.id)) return row;
      return { ...row, categoryPath: row.categoryPath.split(find).join(replace) };
    }));
  }, [rows, selection]); // eslint-disable-line

  const handleResizeMouseDown = (col: "artikelnummer" | "categoryPath", e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingCol.current = col;
    resizeStartX.current = e.clientX;
    resizeStartW.current = colWidths[col];
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
    if (ctrl && e.key === "c" && !editingId && selection.length > 0) {
      e.preventDefault();
      const dr = displayRowsRef.current;
      const text = selection.map(s => dr.find(r => r.id === s.id)?.categoryPath ?? "").join("\n");
      navigator.clipboard.writeText(text);
      return;
    }
    if (ctrl && e.key === "v" && !editingId && selection.length === 1) {
      e.preventDefault();
      const { id } = selection[0];
      navigator.clipboard.readText().then(text => {
        setHistory(h => [...h.slice(-49), rows]);
        setRedoStack([]);
        setRows(prev => prev.map(r => r.id === id ? { ...r, categoryPath: text.trim() } : r));
      });
      return;
    }
  }, [undo, redo, editingId, selection, rows]);

  const sortIndicator = sortDir === "asc" ? " ↑" : sortDir === "desc" ? " ↓" : "";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && editingId) commitEdit(); onOpenChange(v); }}>
      <DialogContent
        className="max-w-[92vw] w-[92vw] max-h-[92vh] h-[92vh] flex flex-col p-0 gap-0"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <DialogHeader className="px-4 pt-4 pb-2 border-b shrink-0">
          <DialogTitle>
            {lang === "DE" ? "Kategorie-Zuordnung prüfen" : "Review Category Mapping"}
          </DialogTitle>
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
            {lang === "DE" ? "Suchen & Ersetzen" : "Find & Replace"}
            <span className="text-muted-foreground ml-1">(Ctrl+H)</span>
          </Button>
          <div className="h-4 w-px bg-border mx-1" />
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={undo} disabled={history.length === 0} title="Ctrl+Z">↩</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={redo} disabled={redoStack.length === 0} title="Ctrl+Y">↪</Button>
          <span className="text-xs text-muted-foreground ml-2">
            {lang === "DE" ? "Doppelklick zum Bearbeiten · Format: Ebene1 -> Ebene2 -> Ebene3" : "Double-click to edit · Format: Level1 -> Level2 -> Level3"}
          </span>
        </div>

        {/* Table */}
        <div
          ref={tableRef}
          className="flex-1 overflow-auto"
          onClick={e => { if (e.target === tableRef.current) { commitEdit(); setSelection([]); } }}
        >
          <table className="border-collapse text-xs w-max min-w-full" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 40 }} />
              <col style={{ width: colWidths.artikelnummer }} />
              <col style={{ width: colWidths.categoryPath }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                <th className="border px-2 py-1.5 text-left text-xs font-medium text-muted-foreground select-none w-10">#</th>
                <th className="border px-2 py-1.5 text-left text-xs font-medium relative select-none" style={{ width: colWidths.artikelnummer }}>
                  {lang === "DE" ? "Artikelnummer" : "Article No."}
                  <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/50 active:bg-primary"
                    onMouseDown={e => handleResizeMouseDown("artikelnummer", e)} onClick={e => e.stopPropagation()} />
                </th>
                <th
                  className="border px-2 py-1.5 text-left text-xs font-medium relative select-none cursor-pointer hover:bg-muted/80"
                  style={{ width: colWidths.categoryPath }}
                  onClick={() => setSortDir(d => d === "asc" ? "desc" : d === "desc" ? null : "asc")}
                >
                  {lang === "DE" ? `Kategoriepfad${sortIndicator}` : `Category Path${sortIndicator}`}
                  <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/50 active:bg-primary"
                    onMouseDown={e => handleResizeMouseDown("categoryPath", e)} onClick={e => e.stopPropagation()} />
                </th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, idx) => {
                const isEditing = editingId === row.id;
                const isSelected = isCellSelected(row.id);
                const parts = row.categoryPath.split(" -> ").filter(Boolean);

                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-muted/20 cursor-pointer ${isSelected && !isEditing ? "bg-primary/10" : ""}`}
                    onClick={e => handleRowClick(row.id, e)}
                    onDoubleClick={() => handleRowDoubleClick(row.id)}
                  >
                    {/* Row number */}
                    <td className="border px-2 py-1 text-center text-xs text-muted-foreground bg-muted/40 select-none w-10">
                      {idx + 1}
                    </td>

                    {/* Artikelnummer — read-only */}
                    <td
                      className="border px-2 py-1.5 bg-muted/30 text-muted-foreground font-mono text-xs"
                      style={{ width: colWidths.artikelnummer, maxWidth: colWidths.artikelnummer, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={row.artikelnummer}
                    >
                      {row.artikelnummer}
                    </td>

                    {/* Category path — editable */}
                    <td
                      className={`border px-0 py-0 ${isEditing ? "" : isSelected ? "bg-primary/20 ring-2 ring-primary ring-inset" : ""}`}
                      style={{ width: colWidths.categoryPath }}
                    >
                      {isEditing ? (
                        <input
                          ref={editRef}
                          type="text"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={e => {
                            e.stopPropagation();
                            if (e.key === "Escape") { setEditingId(null); }
                            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); commitEdit(); }
                          }}
                          className="w-full px-2 py-1.5 bg-transparent outline outline-2 outline-primary text-xs"
                          style={{ width: colWidths.categoryPath - 2 }}
                        />
                      ) : (
                        <div className="px-2 py-1.5 flex items-center gap-1 flex-wrap" style={{ minHeight: 30 }}>
                          {parts.length === 0 ? (
                            <span className="text-muted-foreground/40 italic">—</span>
                          ) : (
                            parts.map((part, i) => (
                              <span key={i} className="flex items-center gap-1">
                                {i > 0 && <span className="text-muted-foreground/50 text-[10px]">›</span>}
                                <span className={`px-1 py-0.5 rounded text-[11px] ${
                                  i === 0 ? "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 font-medium"
                                  : i === parts.length - 1 ? "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200"
                                  : "bg-muted text-muted-foreground"
                                }`}>
                                  {part}
                                </span>
                              </span>
                            ))
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {displayRows.length === 0 && (
                <tr>
                  <td colSpan={3} className="border px-4 py-6 text-center text-muted-foreground text-xs">
                    {filterText
                      ? (lang === "DE" ? "Keine Treffer." : "No matches.")
                      : (lang === "DE" ? "Keine Daten." : "No data.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-4 py-3 border-t shrink-0">
          <span className="text-xs text-muted-foreground">
            {displayRows.length} {lang === "DE" ? "Produkte" : "products"}
            {selection.length > 1 ? ` · ${selection.length} ${lang === "DE" ? "ausgewählt" : "selected"}` : ""}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { if (editingId) commitEdit(); onOpenChange(false); }}>
              {lang === "DE" ? "Abbrechen" : "Cancel"}
            </Button>
            <Button onClick={() => { if (editingId) commitEdit(); onConfirm(rows); onOpenChange(false); }}>
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
