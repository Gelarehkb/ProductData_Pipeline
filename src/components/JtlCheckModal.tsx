import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { type Lang } from "@/lib/translations";

// ── Normalization ─────────────────────────────────────────────────────────────

/** Status suffixes that are stripped before comparison. Extend this list freely. */
export const HAN_STATUS_SUFFIXES = ["OP", "DC", "NA", "EOL", "NOS"] as const;

export type HanStatusSuffix = (typeof HAN_STATUS_SUFFIXES)[number];

export interface NormalizedHan {
  normalized: string;
  suffix: HanStatusSuffix | null;
}

/** Trim, strip known status suffix (space- or dash-separated), normalize leading zeros. */
export function normalizeHan(value: string): NormalizedHan {
  let s = value.trim();
  let suffix: HanStatusSuffix | null = null;

  for (const tag of HAN_STATUS_SUFFIXES) {
    const pattern = new RegExp(`[\\s\\-]+${tag}$`, "i");
    if (pattern.test(s)) {
      suffix = tag as HanStatusSuffix;
      s = s.replace(pattern, "").trim();
      break;
    }
  }

  // Normalize leading zeros for purely numeric values
  if (/^\d+$/.test(s)) {
    s = String(parseInt(s, 10));
  }

  return { normalized: s.toLowerCase(), suffix };
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JtlRow {
  internerSchluessel: string;
  artikelnummer: string;
  vaterartikel: string;
  artikelname: string;
  warengruppe: string;
  gtin: string;
  han: string;
}

export interface JtlCheckResult {
  rowIndex: number;
  clothName: string;
  inputHan: string;
  inputGtin: string;
  matchedBy: "han" | "gtin" | null;
  match: JtlRow | null;
  storedHanSuffix: HanStatusSuffix | null;
}

// ── Check logic (pure, importable) ───────────────────────────────────────────

export function runJtlCheck(
  candidates: { rowIndex: number; clothName: string; han: string; gtin: string }[],
  dataset: JtlRow[]
): JtlCheckResult[] {
  // Build lookup maps from the reference dataset
  const hanMap = new Map<string, JtlRow>();
  const gtinMap = new Map<string, JtlRow>();
  const hanSuffixMap = new Map<string, HanStatusSuffix | null>();

  for (const ref of dataset) {
    if (ref.han.trim()) {
      const { normalized, suffix } = normalizeHan(ref.han);
      if (!hanMap.has(normalized)) {
        hanMap.set(normalized, ref);
        hanSuffixMap.set(normalized, suffix);
      }
    }
    if (ref.gtin.trim()) {
      const normGtin = ref.gtin.trim().toLowerCase();
      if (!gtinMap.has(normGtin)) gtinMap.set(normGtin, ref);
    }
  }

  return candidates.map((c) => {
    const { normalized: normHan } = normalizeHan(c.han);
    const normGtin = c.gtin.trim().toLowerCase();

    // 1. Try HAN
    if (normHan && hanMap.has(normHan)) {
      return {
        rowIndex: c.rowIndex,
        clothName: c.clothName,
        inputHan: c.han,
        inputGtin: c.gtin,
        matchedBy: "han",
        match: hanMap.get(normHan)!,
        storedHanSuffix: hanSuffixMap.get(normHan) ?? null,
      };
    }

    // 2. Fallback: GTIN
    if (normGtin && gtinMap.has(normGtin)) {
      return {
        rowIndex: c.rowIndex,
        clothName: c.clothName,
        inputHan: c.han,
        inputGtin: c.gtin,
        matchedBy: "gtin",
        match: gtinMap.get(normGtin)!,
        storedHanSuffix: null,
      };
    }

    return {
      rowIndex: c.rowIndex,
      clothName: c.clothName,
      inputHan: c.han,
      inputGtin: c.gtin,
      matchedBy: null,
      match: null,
      storedHanSuffix: null,
    };
  });
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface JtlCheckModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  results: JtlCheckResult[];
  lang: Lang;
}

export const JtlCheckModal = ({ open, onOpenChange, results, lang }: JtlCheckModalProps) => {
  const DE = lang === "DE";
  const found = results.filter((r) => r.match !== null);
  const notFound = results.filter((r) => r.match === null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[88vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{DE ? "JTL-Duplikatprüfung" : "JTL duplicate check"}</DialogTitle>
          <DialogDescription>
            {DE
              ? `${results.length} Artikel geprüft — ${found.length} gefunden, ${notFound.length} neu`
              : `${results.length} articles checked — ${found.length} found, ${notFound.length} new`}
          </DialogDescription>
        </DialogHeader>

        {results.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            {DE ? "Keine prüfbaren Zeilen (HAN oder GTIN erforderlich)." : "No checkable rows (HAN or GTIN required)."}
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }} className="space-y-2 pr-1">
            {results.map((r) => (
              <ResultCard key={r.rowIndex} result={r} DE={DE} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

function ResultCard({ result: r, DE }: { result: JtlCheckResult; DE: boolean }) {
  const found = r.match !== null;

  return (
    <div
      className={`rounded-lg border px-4 py-3 flex gap-3 items-start ${
        found ? "border-green-500/40 bg-green-500/5" : "border-amber-500/40 bg-amber-500/5"
      }`}
    >
      {/* Icon */}
      <div className="mt-0.5 shrink-0">
        {found ? (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        ) : (
          <XCircle className="h-5 w-5 text-amber-500" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Row header */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground shrink-0">#{r.rowIndex + 1}</span>
          <span className="font-medium text-sm truncate">{r.clothName || (DE ? "(kein Name)" : "(no name)")}</span>
          <span className="text-xs text-muted-foreground shrink-0">
            {r.inputHan ? `HAN: ${r.inputHan}` : ""}
            {r.inputHan && r.inputGtin ? " · " : ""}
            {r.inputGtin ? `GTIN: ${r.inputGtin}` : ""}
          </span>
        </div>

        {found && r.match ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs mt-1">
            <Field label={DE ? "Artikelnummer" : "Article no."} value={r.match.artikelnummer} />
            <Field label={DE ? "Artikelname" : "Article name"} value={r.match.artikelname} />
            <Field label="Warengruppe" value={r.match.warengruppe} />
            <Field label={DE ? "Vaterartikel" : "Parent article"} value={r.match.vaterartikel || "—"} />
            <div className="col-span-2 flex items-center gap-2 pt-0.5">
              <Badge variant="outline" className="text-[11px] h-5 text-green-600 border-green-500/40">
                {DE ? "Bereits in JTL vorhanden" : "Already exists in JTL"}
              </Badge>
              <Badge variant="outline" className="text-[11px] h-5 text-muted-foreground">
                {DE ? `Gefunden über ${r.matchedBy === "han" ? "HAN" : "GTIN"}` : `Matched by ${r.matchedBy === "han" ? "HAN" : "GTIN"}`}
              </Badge>
              {r.storedHanSuffix && (
                <Badge variant="outline" className="text-[11px] h-5 text-orange-600 border-orange-500/40 gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {DE ? `Gespeichert als „${r.match?.han}" (${r.storedHanSuffix})` : `Stored as "${r.match?.han}" (${r.storedHanSuffix})`}
                </Badge>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-[11px] h-5 text-amber-600 border-amber-500/40">
              {DE ? "Nicht in JTL — Kandidat für Neuanlage" : "Not in JTL — candidate for creation"}
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="font-medium truncate">{value || "—"}</span>
    </div>
  );
}
