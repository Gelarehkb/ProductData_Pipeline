import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FindReplaceDialog } from "@/components/FindReplaceDialog";
import { CATEGORY_TREE, type CategoryNode } from "@/lib/categoryTree";
import { ChevronRight, Plus, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CategoryPreviewRow {
  id: string;
  artikelnummer: string;
  han: string;
  barcode: string;
  categoryPaths: string[]; // each is a full path e.g. "Mode -> Kindermode -> T-Shirts & Tops"
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRows: CategoryPreviewRow[];
  onConfirm: (rows: CategoryPreviewRow[]) => void;
  lang: "DE" | "EN";
}

// ── Tree node component (recursive) ──────────────────────────────────────────

interface TreeNodeProps {
  node: CategoryNode;
  fullPath: string;
  selectedPaths: Set<string>;
  onToggle: (path: string) => void;
  searchQuery: string;
  depth: number;
}

function matchesQuery(node: CategoryNode, path: string, q: string): boolean {
  if (!q) return true;
  if (path.toLowerCase().includes(q)) return true;
  return (node.children || []).some(c => matchesQuery(c, `${path} -> ${c.name}`, q));
}

function TreeNode({ node, fullPath, selectedPaths, onToggle, searchQuery, depth }: TreeNodeProps) {
  const q = searchQuery.toLowerCase();
  const visible = matchesQuery(node, fullPath, q);
  const hasChildren = !!(node.children?.length);
  const [expanded, setExpanded] = useState(depth === 0);

  // Auto-expand when searching
  useEffect(() => {
    if (q) setExpanded(true);
    else if (depth > 0) setExpanded(false);
  }, [q, depth]);

  if (!visible) return null;

  const isChecked = selectedPaths.has(fullPath);

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-[3px] px-1 rounded cursor-pointer hover:bg-accent/60 select-none",
          isChecked && "bg-primary/8 font-medium"
        )}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
      >
        {hasChildren ? (
          <button
            className="flex-none text-muted-foreground hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
          >
            <ChevronRight className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")} />
          </button>
        ) : (
          <span className="w-3 flex-none" />
        )}
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => onToggle(fullPath)}
          className="accent-primary cursor-pointer flex-none"
          onClick={e => e.stopPropagation()}
        />
        <span className="text-xs leading-snug flex-1" onClick={() => onToggle(fullPath)}>
          {node.name}
        </span>
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children!.map(child => (
            <TreeNode
              key={child.name}
              node={child}
              fullPath={`${fullPath} -> ${child.name}`}
              selectedPaths={selectedPaths}
              onToggle={onToggle}
              searchQuery={searchQuery}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Category picker popup ─────────────────────────────────────────────────────

interface PickerProps {
  currentPaths: string[];
  onApply: (paths: string[]) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement>;
}

function CategoryPicker({ currentPaths, onApply, onClose, anchorRef }: PickerProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(currentPaths));
  const [search, setSearch] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);

  // Position below anchor
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [anchorRef]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, anchorRef]);

  const toggle = useCallback((path: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  return (
    <div
      ref={pickerRef}
      className="fixed z-[200] bg-background border border-border rounded-lg shadow-xl flex flex-col"
      style={{ top: pos.top, left: pos.left, width: 320, maxHeight: 480 }}
    >
      {/* search */}
      <div className="p-2 border-b border-border flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground flex-none" />
        <Input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Suchen..."
          className="h-7 text-xs border-none shadow-none p-0 focus-visible:ring-0"
        />
      </div>

      {/* tree */}
      <div className="flex-1 overflow-y-auto p-1">
        {CATEGORY_TREE.map(node => (
          <TreeNode
            key={node.name}
            node={node}
            fullPath={node.name}
            selectedPaths={selected}
            onToggle={toggle}
            searchQuery={search}
            depth={0}
          />
        ))}
      </div>

      {/* footer */}
      <div className="p-2 border-t border-border flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{selected.size} gewählt</span>
        <div className="flex gap-1.5">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 text-xs">Abbrechen</Button>
          <Button size="sm" onClick={() => onApply([...selected])} className="h-7 text-xs">Übernehmen</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export const CategoryPreviewModal = ({ open, onOpenChange, initialRows, onConfirm, lang }: Props) => {
  const [rows, setRows] = useState<CategoryPreviewRow[]>([]);
  const [history, setHistory] = useState<CategoryPreviewRow[][]>([]);
  const [redoStack, setRedoStack] = useState<CategoryPreviewRow[][]>([]);
  const [filterText, setFilterText] = useState("");
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pickerRowId, setPickerRowId] = useState<string | null>(null);
  const pickerAnchorRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (open) { setRows(initialRows); setHistory([]); setRedoStack([]); setSelectedIds(new Set()); }
  }, [open, initialRows]);

  const pushHistory = useCallback((prev: CategoryPreviewRow[]) => {
    setHistory(h => [...h.slice(-49), prev]);
    setRedoStack([]);
  }, []);

  const updatePaths = useCallback((rowId: string, paths: string[]) => {
    setRows(prev => {
      pushHistory(prev);
      return prev.map(r => r.id === rowId ? { ...r, categoryPaths: paths } : r);
    });
  }, [pushHistory]);

  const removePath = useCallback((rowId: string, path: string) => {
    setRows(prev => {
      pushHistory(prev);
      return prev.map(r => r.id === rowId ? { ...r, categoryPaths: r.categoryPaths.filter(p => p !== path) } : r);
    });
  }, [pushHistory]);

  const handleUndo = useCallback(() => {
    setHistory(h => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setRedoStack(r => [...r, rows]);
      setRows(prev);
      return h.slice(0, -1);
    });
  }, [rows]);

  const handleRedo = useCallback(() => {
    setRedoStack(r => {
      if (!r.length) return r;
      const next = r[r.length - 1];
      setHistory(h => [...h, rows]);
      setRows(next);
      return r.slice(0, -1);
    });
  }, [rows]);

  const handleFindReplace = useCallback((find: string, replace: string, scope: "all" | "selection") => {
    setRows(prev => {
      pushHistory(prev);
      return prev.map(r => {
        if (scope === "selection" && !selectedIds.has(r.id)) return r;
        return {
          ...r,
          categoryPaths: r.categoryPaths.map(p => p.split(find).join(replace)),
        };
      });
    });
  }, [pushHistory, selectedIds]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "z") { e.preventDefault(); handleUndo(); }
      if (e.key === "y") { e.preventDefault(); handleRedo(); }
      if (e.key === "h") { e.preventDefault(); setFindReplaceOpen(true); }
    }
    if (e.key === "Escape" && pickerRowId) setPickerRowId(null);
  }, [handleUndo, handleRedo, pickerRowId]);

  const q = filterText.toLowerCase();
  const filtered = useMemo(() => rows.filter(r =>
    !q || r.artikelnummer.toLowerCase().includes(q) ||
    r.categoryPaths.some(p => p.toLowerCase().includes(q))
  ), [rows, q]);

  const toggleRowSelect = (id: string, e: React.MouseEvent) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (e.shiftKey && prev.size > 0) {
        const ids = filtered.map(r => r.id);
        const last = [...prev].pop()!;
        const from = ids.indexOf(last);
        const to = ids.indexOf(id);
        const [a, b] = from < to ? [from, to] : [to, from];
        ids.slice(a, b + 1).forEach(i => next.add(i));
      } else if (e.ctrlKey || e.metaKey) {
        if (next.has(id)) next.delete(id); else next.add(id);
      } else {
        if (next.size === 1 && next.has(id)) next.clear(); else { next.clear(); next.add(id); }
      }
      return next;
    });
  };

  // Build display label for a path (last 2 parts)
  const pathLabel = (path: string) => {
    const parts = path.split(" -> ");
    return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : parts.join("/");
  };

  const pickerRow = pickerRowId ? rows.find(r => r.id === pickerRowId) : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setPickerRowId(null); onOpenChange(v); }}>
      <DialogContent
        className="max-w-5xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader className="px-4 pt-4 pb-2 border-b border-border shrink-0">
          <DialogTitle className="text-base">{lang === "DE" ? "Kategorien Vorschau" : "Category Preview"}</DialogTitle>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0 flex-wrap">
          <Input
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            placeholder={lang === "DE" ? "Filtern..." : "Filter..."}
            className="h-7 w-48 text-xs"
          />
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setFindReplaceOpen(true)}>
            Suchen & Ersetzen
          </Button>
          <Button variant="outline" size="sm" className="h-7 px-2" onClick={handleUndo} disabled={!history.length} title="Ctrl+Z">
            ↩
          </Button>
          <Button variant="outline" size="sm" className="h-7 px-2" onClick={handleRedo} disabled={!redoStack.length} title="Ctrl+Y">
            ↪
          </Button>
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} {lang === "DE" ? "Produkte" : "products"}</span>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
              <tr>
                <th className="w-8 border-b border-border p-1.5 text-center font-medium text-muted-foreground">#</th>
                <th className="w-40 border-b border-border p-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">Artikelnummer</th>
                <th className="w-28 border-b border-border p-1.5 text-left font-medium text-muted-foreground">HAN</th>
                <th className="w-32 border-b border-border p-1.5 text-left font-medium text-muted-foreground">Barcode</th>
                <th className="border-b border-border p-1.5 text-left font-medium text-muted-foreground">
                  {lang === "DE" ? "Kategorien" : "Categories"}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => {
                const isSelected = selectedIds.has(row.id);
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-border/50 hover:bg-accent/30 cursor-pointer",
                      isSelected && "bg-primary/5"
                    )}
                    onClick={e => toggleRowSelect(row.id, e)}
                  >
                    <td className="p-1.5 text-center text-muted-foreground">{idx + 1}</td>
                    <td className="p-1.5 font-mono text-muted-foreground whitespace-nowrap">{row.artikelnummer}</td>
                    <td className="p-1.5 text-muted-foreground">{row.han}</td>
                    <td className="p-1.5 text-muted-foreground">{row.barcode}</td>
                    <td className="p-1.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        {/* Path chips */}
                        {row.categoryPaths.map(path => (
                          <span
                            key={path}
                            title={path}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-[11px] max-w-[260px] group"
                          >
                            <span className="truncate">{pathLabel(path)}</span>
                            <button
                              className="opacity-0 group-hover:opacity-100 hover:text-red-500 flex-none"
                              onClick={e => { e.stopPropagation(); removePath(row.id, path); }}
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        ))}
                        {/* + button */}
                        <button
                          ref={el => {
                            if (el) pickerAnchorRefs.current.set(row.id, el);
                            else pickerAnchorRefs.current.delete(row.id);
                          }}
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-dashed border-muted-foreground/50 hover:border-primary hover:text-primary text-muted-foreground transition-colors"
                          onClick={e => { e.stopPropagation(); setPickerRowId(prev => prev === row.id ? null : row.id); }}
                          title={lang === "DE" ? "Kategorie hinzufügen" : "Add category"}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border shrink-0">
          <span className="text-xs text-muted-foreground">
            {selectedIds.size > 0 ? `${selectedIds.size} ${lang === "DE" ? "ausgewählt" : "selected"}` : ""}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {lang === "DE" ? "Abbrechen" : "Cancel"}
            </Button>
            <Button size="sm" onClick={() => { onConfirm(rows); onOpenChange(false); }}>
              {lang === "DE" ? "Bestätigen & exportieren" : "Confirm & export"}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* Find & Replace */}
      <FindReplaceDialog
        open={findReplaceOpen}
        onOpenChange={setFindReplaceOpen}
        onReplace={handleFindReplace}
        hasSelection={selectedIds.size > 0}
      />

      {/* Category picker popup */}
      {pickerRowId && pickerRow && (
        <CategoryPicker
          currentPaths={pickerRow.categoryPaths}
          anchorRef={{ current: pickerAnchorRefs.current.get(pickerRowId) ?? null } as React.RefObject<HTMLElement>}
          onApply={(paths) => { updatePaths(pickerRowId, paths); setPickerRowId(null); }}
          onClose={() => setPickerRowId(null)}
        />
      )}
    </Dialog>
  );
};
