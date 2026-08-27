import { useState, useCallback, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface AIIdentifierPreviewRow {
  id: string; // group key, e.g. `${name}|${color}`
  originalName: string;
  color: string;
  size: string;
  warengruppe: string;
  hersteller: string;
  suggestedArtikelnummer: string;
  suggestedArtikelname: string;
  suggestedHan: string;
  suggestedHersteller: string;
  suggestedLieferant: string;
  matchTier: "warengruppe+name" | "warengruppe" | "name-similarity" | "generic";
  exampleArtikelnummern?: string[];
}

type EditableCol = "suggestedArtikelnummer" | "suggestedArtikelname" | "suggestedHan" | "suggestedHersteller" | "suggestedLieferant";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRows: AIIdentifierPreviewRow[];
  onConfirm: (rows: AIIdentifierPreviewRow[]) => void;
  lang: "DE" | "EN";
}

const MATCH_TIER_LABEL: Record<AIIdentifierPreviewRow["matchTier"], { DE: string; EN: string }> = {
  "warengruppe+name": { DE: "Warengruppe + ähnlicher Name", EN: "Category + similar name" },
  "warengruppe": { DE: "nur Warengruppe", EN: "category only" },
  "name-similarity": { DE: "ähnlicher Produktname", EN: "similar product name" },
  "generic": { DE: "keine direkte Übereinstimmung — allgemeiner Stil", EN: "no direct match — general style" },
};

export const AIIdentifierPreviewModal = ({ open, onOpenChange, initialRows, onConfirm, lang }: Props) => {
  const [rows, setRows] = useState<AIIdentifierPreviewRow[]>([]);
  const [history, setHistory] = useState<AIIdentifierPreviewRow[][]>([]);
  const [redoStack, setRedoStack] = useState<AIIdentifierPreviewRow[][]>([]);
  const [filterText, setFilterText] = useState("");

  useEffect(() => {
    if (open) {
      setRows(initialRows);
      setHistory([]);
      setRedoStack([]);
      setFilterText("");
    }
  }, [open, initialRows]);

  const displayRows = useMemo(() => {
    if (!filterText.trim()) return rows;
    const q = filterText.toLowerCase();
    return rows.filter(r =>
      r.originalName.toLowerCase().includes(q) ||
      r.suggestedArtikelnummer.toLowerCase().includes(q) ||
      r.suggestedArtikelname.toLowerCase().includes(q) ||
      r.suggestedHan.toLowerCase().includes(q)
    );
  }, [rows, filterText]);

  const setCell = useCallback((id: string, col: EditableCol, value: string) => {
    setRows(prev => {
      const row = prev.find(r => r.id === id);
      if (!row || row[col] === value) return prev;
      setHistory(h => [...h.slice(-49), prev]);
      setRedoStack([]);
      return prev.map(r => r.id === id ? { ...r, [col]: value } : r);
    });
  }, []);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    setRedoStack(r => [...r, rows]);
    setRows(history[history.length - 1]);
    setHistory(h => h.slice(0, -1));
  }, [history, rows]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    setHistory(h => [...h, rows]);
    setRows(redoStack[redoStack.length - 1]);
    setRedoStack(r => r.slice(0, -1));
  }, [redoStack, rows]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if ((ctrl && e.key === "y") || (ctrl && e.key === "z" && e.shiftKey)) { e.preventDefault(); redo(); return; }
  }, [undo, redo]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[96vw] w-[96vw] max-h-[92vh] h-[92vh] flex flex-col p-0 gap-0"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <DialogHeader className="px-4 pt-4 pb-2 border-b shrink-0">
          <DialogTitle>
            {lang === "DE" ? "KI-Namen prüfen & bestätigen" : "Review & Confirm AI Naming"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0 flex-wrap">
          <Input
            placeholder={lang === "DE" ? "Filtern..." : "Filter..."}
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            className="h-7 text-xs w-48"
          />
          <div className="h-4 w-px bg-border mx-1" />
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={undo} disabled={history.length === 0} title="Ctrl+Z">↩</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={redo} disabled={redoStack.length === 0} title="Ctrl+Y">↪</Button>
          <span className="text-xs text-muted-foreground ml-2">
            {lang === "DE"
              ? "Vorschläge stammen aus ähnlichen Produkten im JTL-Export — bei Bedarf direkt bearbeiten."
              : "Suggestions come from similar products in the JTL export — edit directly if needed."}
          </span>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="border-collapse text-xs w-max min-w-full" style={{ tableLayout: "fixed" }}>
            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                <th className="border px-2 py-1 text-left font-medium whitespace-nowrap" style={{ width: 200 }}>{lang === "DE" ? "Name" : "Name"}</th>
                <th className="border px-2 py-1 text-left font-medium whitespace-nowrap" style={{ width: 90 }}>{lang === "DE" ? "Farbe" : "Color"}</th>
                <th className="border px-2 py-1 text-left font-medium whitespace-nowrap" style={{ width: 70 }}>{lang === "DE" ? "Größe" : "Size"}</th>
                <th className="border px-2 py-1 text-left font-medium whitespace-nowrap" style={{ width: 130 }}>{lang === "DE" ? "Warengruppe" : "Category"}</th>
                <th className="border px-2 py-1 text-left font-medium whitespace-nowrap" style={{ width: 200 }}>{lang === "DE" ? "Referenz" : "Reference"}</th>
                <th className="border px-2 py-1 text-left font-medium whitespace-nowrap" style={{ width: 200 }}>{lang === "DE" ? "Vorschlag Artikelnummer" : "Suggested Artikelnummer"}</th>
                <th className="border px-2 py-1 text-left font-medium whitespace-nowrap" style={{ width: 200 }}>{lang === "DE" ? "Vorschlag Artikelname" : "Suggested Artikelname"}</th>
                <th className="border px-2 py-1 text-left font-medium whitespace-nowrap" style={{ width: 140 }}>{lang === "DE" ? "Vorschlag HAN" : "Suggested HAN"}</th>
                <th className="border px-2 py-1 text-left font-medium whitespace-nowrap" style={{ width: 150 }}>{lang === "DE" ? "Vorschlag Hersteller" : "Suggested Manufacturer"}</th>
                <th className="border px-2 py-1 text-left font-medium whitespace-nowrap" style={{ width: 150 }}>{lang === "DE" ? "Vorschlag Lieferant" : "Suggested Supplier"}</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map(row => (
                <tr key={row.id} className="hover:bg-muted/20">
                  <td className="border px-2 py-1 bg-muted/30 text-muted-foreground truncate" title={row.originalName}>{row.originalName}</td>
                  <td className="border px-2 py-1 bg-muted/30 text-muted-foreground">{row.color}</td>
                  <td className="border px-2 py-1 bg-muted/30 text-muted-foreground">{row.size}</td>
                  <td className="border px-2 py-1 bg-muted/30 text-muted-foreground truncate" title={row.warengruppe}>{row.warengruppe}</td>
                  <td className="border px-2 py-1 text-muted-foreground truncate" title={(row.exampleArtikelnummern || []).join(", ")}>
                    {row.matchTier === "generic" ? (
                      <span className="text-amber-600 dark:text-amber-500">{MATCH_TIER_LABEL.generic[lang]}</span>
                    ) : (
                      <span>
                        {MATCH_TIER_LABEL[row.matchTier][lang]}
                        {row.exampleArtikelnummern?.length ? ` (${row.exampleArtikelnummern.length})` : ""}
                      </span>
                    )}
                  </td>
                  <td className="border p-0">
                    <input
                      className="w-full h-7 px-2 bg-transparent border-none outline-none focus:ring-2 focus:ring-primary/50 text-xs"
                      value={row.suggestedArtikelnummer}
                      onChange={e => setCell(row.id, "suggestedArtikelnummer", e.target.value)}
                    />
                  </td>
                  <td className="border p-0">
                    <input
                      className="w-full h-7 px-2 bg-transparent border-none outline-none focus:ring-2 focus:ring-primary/50 text-xs"
                      value={row.suggestedArtikelname}
                      onChange={e => setCell(row.id, "suggestedArtikelname", e.target.value)}
                    />
                  </td>
                  <td className="border p-0">
                    <input
                      className="w-full h-7 px-2 bg-transparent border-none outline-none focus:ring-2 focus:ring-primary/50 text-xs"
                      value={row.suggestedHan}
                      onChange={e => setCell(row.id, "suggestedHan", e.target.value)}
                    />
                  </td>
                  <td className="border p-0">
                    <input
                      className="w-full h-7 px-2 bg-transparent border-none outline-none focus:ring-2 focus:ring-primary/50 text-xs"
                      value={row.suggestedHersteller}
                      onChange={e => setCell(row.id, "suggestedHersteller", e.target.value)}
                    />
                  </td>
                  <td className="border p-0">
                    <input
                      className="w-full h-7 px-2 bg-transparent border-none outline-none focus:ring-2 focus:ring-primary/50 text-xs"
                      value={row.suggestedLieferant}
                      onChange={e => setCell(row.id, "suggestedLieferant", e.target.value)}
                    />
                  </td>
                </tr>
              ))}
              {displayRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="border px-4 py-6 text-center text-muted-foreground text-xs">
                    {filterText ? (lang === "DE" ? "Keine Treffer." : "No matches.") : (lang === "DE" ? "Keine Daten." : "No data.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center px-4 py-3 border-t shrink-0">
          <span className="text-xs text-muted-foreground">
            {displayRows.length} {lang === "DE" ? "Einträge" : "entries"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {lang === "DE" ? "Abbrechen" : "Cancel"}
            </Button>
            <Button onClick={() => { onConfirm(rows); onOpenChange(false); }}>
              {lang === "DE" ? "Bestätigen & übernehmen" : "Confirm & Apply"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
