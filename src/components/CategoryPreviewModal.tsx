import { useState, useCallback, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  categoryPaths: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRows: CategoryPreviewRow[];
  onConfirm: (rows: CategoryPreviewRow[]) => void;
  lang: "DE" | "EN";
}

// ── Recursive tree node ───────────────────────────────────────────────────────

function nodeMatchesQuery(node: CategoryNode, path: string, q: string): boolean {
  if (!q) return true;
  if (path.toLowerCase().includes(q)) return true;
  return (node.children ?? []).some(c => nodeMatchesQuery(c, `${path} -> ${c.name}`, q));
}

interface TreeNodeProps {
  node: CategoryNode;
  fullPath: string;
  selected: Set<string>;
  onToggle: (path: string) => void;
  query: string;
  depth: number;
}

function TreeNode({ node, fullPath, selected, onToggle, query, depth }: TreeNodeProps) {
  const q = query.toLowerCase();
  const hasChildren = !!(node.children?.length);
  const visible = nodeMatchesQuery(node, fullPath, q);
  const [expanded, setExpanded] = useState(depth === 0);

  useEffect(() => {
    setExpanded(q ? true : depth === 0);
  }, [q, depth]);

  if (!visible) return null;

  const checked = selected.has(fullPath);

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1.5 py-[3px] rounded cursor-pointer hover:bg-accent/60 select-none",
          checked && "bg-primary/10"
        )}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        onClick={() => onToggle(fullPath)}
      >
        <button
          className="flex-none text-muted-foreground"
          style={{ visibility: hasChildren ? "visible" : "hidden", width: 14 }}
          onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
        >
          <ChevronRight className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")} />
        </button>
        <input
          type="checkbox"
          checked={checked}
          readOnly
          className="accent-primary cursor-pointer flex-none w-3.5 h-3.5"
          onClick={e => { e.stopPropagation(); onToggle(fullPath); }}
        />
        <span className="text-xs leading-snug flex-1">{node.name}</span>
      </div>
      {hasChildren && expanded && node.children!.map(child => (
        <TreeNode
          key={child.name}
          node={child}
          fullPath={`${fullPath} -> ${child.name}`}
          selected={selected}
          onToggle={onToggle}
          query={query}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

// ── Category picker (used inside Popover) ─────────────────────────────────────

interface PickerContentProps {
  currentPaths: string[];
  onApply: (paths: string[]) => void;
  onClose: () => void;
}

function PickerContent({ currentPaths, onApply, onClose }: PickerContentProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(currentPaths));
  const [search, setSearch] = useState("");

  const toggle = useCallback((path: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col" style={{ width: 320, maxHeight: 460 }}>
      {/* Search */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border">
        <Search className="h-3.5 w-3.5 text-muted-foreground flex-none" />
        <Input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Suchen..."
          className="h-7 text-xs border-none shadow-none p-0 focus-visible:ring-0"
        />
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-1 min-h-0" style={{ maxHeight: 340 }}>
        {CATEGORY_TREE.map(node => (
          <TreeNode
            key={node.name}
            node={node}
            fullPath={node.name}
            selected={selected}
            onToggle={toggle}
            query={search}
            depth={0}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-t border-border">
        <span className="text-xs text-muted-foreground">{selected.size} gewählt</span>
        <div className="flex gap-1.5">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>Abbrechen</Button>
          <Button size="sm" className="h-7 text-xs" onClick={() => { onApply([...selected]); onClose(); }}>Übernehmen</Button>
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
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRows(initialRows);
      setHistory([]);
      setRedoStack([]);
      setSelectedIds(new Set());
      setOpenPickerId(null);
    }
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

  const removePath = useCallback((rowId: string, path: string, e: React.MouseEvent) => {
    e.stopPropagation();
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
        return { ...r, categoryPaths: r.categoryPaths.map(p => p.split(find).join(replace)) };
      });
    });
  }, [pushHistory, selectedIds]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); handleUndo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === "y") { e.preventDefault(); handleRedo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === "h") { e.preventDefault(); setFindReplaceOpen(true); }
  }, [handleUndo, handleRedo]);

  const q = filterText.toLowerCase();
  const filtered = useMemo(() => rows.filter(r =>
    !q ||
    r.artikelnummer.toLowerCase().includes(q) ||
    r.categoryPaths.some(p => p.toLowerCase().includes(q))
  ), [rows, q]);

  const toggleRowSelect = (id: string, e: React.MouseEvent) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (e.shiftKey && prev.size > 0) {
        const ids = filtered.map(r => r.id);
        const last = [...prev].pop()!;
        const [from, to] = [ids.indexOf(last), ids.indexOf(id)];
        const [a, b] = from < to ? [from, to] : [to, from];
        ids.slice(a, b + 1).forEach(i => next.add(i));
      } else if (e.ctrlKey || e.metaKey) {
        next.has(id) ? next.delete(id) : next.add(id);
      } else {
        if (next.size === 1 && next.has(id)) next.clear();
        else { next.clear(); next.add(id); }
      }
      return next;
    });
  };

  const pathLabel = (path: string) => {
    const parts = path.split(" -> ");
    return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : parts.join("/");
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) setOpenPickerId(null);
          onOpenChange(v);
        }}
      >
        <DialogContent
          className="max-w-5xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0"
          onKeyDown={handleKeyDown}
          // prevent Dialog from closing when Radix Popover portal is clicked
          onInteractOutside={e => {
            const target = e.target as Element;
            if (target?.closest("[data-radix-popper-content-wrapper]")) e.preventDefault();
          }}
        >
          <DialogHeader className="px-4 pt-4 pb-2 border-b border-border shrink-0">
            <DialogTitle className="text-base">
              {lang === "DE" ? "Kategorien Vorschau" : "Category Preview"}
            </DialogTitle>
          </DialogHeader>

          {/* Toolbar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0 flex-wrap">
            <Input
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              placeholder={lang === "DE" ? "Filtern..." : "Filter..."}
              className="h-7 w-44 text-xs"
            />
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setFindReplaceOpen(true)}>
              Suchen & Ersetzen
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2" onClick={handleUndo} disabled={!history.length} title="Ctrl+Z">↩</Button>
            <Button variant="outline" size="sm" className="h-7 px-2" onClick={handleRedo} disabled={!redoStack.length} title="Ctrl+Y">↪</Button>
            <span className="text-xs text-muted-foreground ml-auto">
              {filtered.length} {lang === "DE" ? "Produkte" : "products"}
            </span>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                <tr>
                  <th className="w-8 border-b border-border p-1.5 text-center font-medium text-muted-foreground">#</th>
                  <th className="w-40 border-b border-border p-1.5 text-left font-medium text-muted-foreground">Artikelnummer</th>
                  <th className="w-28 border-b border-border p-1.5 text-left font-medium text-muted-foreground">HAN</th>
                  <th className="w-28 border-b border-border p-1.5 text-left font-medium text-muted-foreground">Barcode</th>
                  <th className="border-b border-border p-1.5 text-left font-medium text-muted-foreground">
                    {lang === "DE" ? "Kategorien" : "Categories"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, idx) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-border/40 hover:bg-accent/30 cursor-pointer",
                      selectedIds.has(row.id) && "bg-primary/5"
                    )}
                    onClick={e => toggleRowSelect(row.id, e)}
                  >
                    <td className="p-1.5 text-center text-muted-foreground">{idx + 1}</td>
                    <td className="p-1.5 font-mono text-muted-foreground whitespace-nowrap">{row.artikelnummer}</td>
                    <td className="p-1.5 text-muted-foreground">{row.han}</td>
                    <td className="p-1.5 text-muted-foreground">{row.barcode}</td>
                    <td className="p-1.5">
                      <div className="flex items-center gap-1 flex-wrap">

                        {/* Assigned path chips */}
                        {row.categoryPaths.map(path => (
                          <span
                            key={path}
                            title={path}
                            className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-[11px] max-w-[260px] group"
                          >
                            <span className="truncate">{pathLabel(path)}</span>
                            <button
                              className="flex-none opacity-40 group-hover:opacity-100 hover:text-red-500 transition-opacity"
                              onClick={e => removePath(row.id, path, e)}
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        ))}

                        {/* + button with Popover */}
                        <Popover
                          open={openPickerId === row.id}
                          onOpenChange={v => setOpenPickerId(v ? row.id : null)}
                        >
                          <PopoverTrigger asChild>
                            <button
                              className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-dashed border-muted-foreground/40 hover:border-primary hover:text-primary text-muted-foreground transition-colors"
                              onClick={e => e.stopPropagation()}
                              title={lang === "DE" ? "Kategorie hinzufügen" : "Add category"}
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="p-0 overflow-hidden"
                            style={{ width: 320 }}
                            align="start"
                            side="bottom"
                            sideOffset={6}
                            // keep Dialog open when clicking inside picker
                            onInteractOutside={e => e.preventDefault()}
                          >
                            <PickerContent
                              currentPaths={row.categoryPaths}
                              onApply={paths => updatePaths(row.id, paths)}
                              onClose={() => setOpenPickerId(null)}
                            />
                          </PopoverContent>
                        </Popover>

                      </div>
                    </td>
                  </tr>
                ))}
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
      </Dialog>

      <FindReplaceDialog
        open={findReplaceOpen}
        onOpenChange={setFindReplaceOpen}
        onReplace={handleFindReplace}
        hasSelection={selectedIds.size > 0}
      />
    </>
  );
};
