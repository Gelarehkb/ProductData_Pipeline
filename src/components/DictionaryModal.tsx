import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { type Lang } from "@/lib/translations";

interface DictionaryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productTypes: string[];
  eanCount: number;
  hanCount: number;
  lang: Lang;
}

export const DictionaryModal = ({ open, onOpenChange, productTypes, eanCount, hanCount, lang }: DictionaryModalProps) => {
  const DE = lang === "DE";
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return productTypes;
    return productTypes.filter(p => p.toLowerCase().includes(q));
  }, [productTypes, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[92vw] max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{DE ? "Wörterbücher" : "Dictionaries"}</DialogTitle>
          <DialogDescription>
            {DE
              ? `${productTypes.length} Produkttypen · ${eanCount} EAN · ${hanCount} HAN`
              : `${productTypes.length} product types · ${eanCount} EAN · ${hanCount} HAN`}
          </DialogDescription>
        </DialogHeader>

        <div className="relative shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={DE ? "Produkttyp suchen…" : "Search product types…"}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }} className="rounded-md border border-border">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {productTypes.length === 0
                ? (DE ? "Noch keine Produkttypen — bitte zuerst eine JTL-Import-Datei laden." : "No product types yet — load a JTL Import file first.")
                : (DE ? "Keine Treffer." : "No matches.")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((p, i) => (
                <li key={i} className="px-3 py-1.5 text-sm font-mono">{p}</li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
