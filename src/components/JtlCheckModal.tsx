import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertCircle, GitBranch, ChevronDown, ChevronRight } from "lucide-react";
import { type Lang } from "@/lib/translations";

// ── Normalization ─────────────────────────────────────────────────────────────

/** Status suffixes stripped before HAN comparison. Add entries here to extend. */
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

  if (/^\d+$/.test(s)) s = String(parseInt(s, 10));

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

export interface ParentFamilySuggestion {
  /** The Vaterartikel identifier from the reference dataset. */
  vaterartikel: string;
  /** All existing Kind rows under this Vater. */
  kinder: { artikelnummer: string; artikelname: string }[];
  /** 0–1 confidence score used only for sorting and labelling. */
  matchScore: number;
  /** Human-readable explanation of why this family was suggested. */
  matchReason: string;
}

export interface JtlCheckResult {
  rowIndex: number;
  clothName: string;
  inputHan: string;
  inputGtin: string;
  matchedBy: "han" | "gtin" | null;
  match: JtlRow | null;
  storedHanSuffix: HanStatusSuffix | null;
  /** Populated only for non-matched candidates. Empty array = no family found. */
  parentSuggestions: ParentFamilySuggestion[];
}

// ── Name tokenization ─────────────────────────────────────────────────────────

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function nameTokens(name: string): string[] {
  return stripDiacritics(name.toLowerCase())
    .split(/[\s\-_\/,;.()[\]{}]+/)
    .filter(t => t.length > 1 && !/^\d+$/.test(t)); // skip single chars and pure numbers
}

function tokenOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  let hits = 0;
  for (const t of b) if (setA.has(t)) hits++;
  return hits / Math.max(a.length, b.length);
}

// ── Parent family detection ───────────────────────────────────────────────────

/** Minimum token overlap to suggest a family (name alone). */
const NAME_ONLY_THRESHOLD = 0.45;
/** Lower threshold when Warengruppe also matches — reduces false negatives. */
const WG_BOOST_THRESHOLD = 0.30;

function buildFamilyMap(dataset: JtlRow[]): Map<string, JtlRow[]> {
  const map = new Map<string, JtlRow[]>();
  for (const row of dataset) {
    const vater = row.vaterartikel.trim();
    if (!vater) continue; // Vater rows and standalone articles have no parent
    const list = map.get(vater);
    if (list) list.push(row);
    else map.set(vater, [row]);
  }
  return map;
}

function findParentFamilies(
  candidateName: string,
  candidateWarengruppe: string,
  familyMap: Map<string, JtlRow[]>
): ParentFamilySuggestion[] {
  const candidateTokens = nameTokens(candidateName);
  if (candidateTokens.length === 0) return [];

  const suggestions: ParentFamilySuggestion[] = [];

  for (const [vater, kinder] of familyMap) {
    const familyWg = kinder[0]?.warengruppe?.toLowerCase().trim() ?? "";
    const wgMatch = !!(
      candidateWarengruppe &&
      familyWg &&
      stripDiacritics(candidateWarengruppe.toLowerCase().trim()) === stripDiacritics(familyWg)
    );

    // Score against the best-matching child name
    let bestScore = 0;
    let bestChild = kinder[0];
    for (const kind of kinder) {
      const score = tokenOverlap(candidateTokens, nameTokens(kind.artikelname));
      if (score > bestScore) { bestScore = score; bestChild = kind; }
    }

    const threshold = wgMatch ? WG_BOOST_THRESHOLD : NAME_ONLY_THRESHOLD;
    if (bestScore < threshold) continue;

    const reasons: string[] = [];
    if (wgMatch) reasons.push(`Warengruppe „${kinder[0].warengruppe}" stimmt überein`);
    reasons.push(`${Math.round(bestScore * 100)} % Namensübereinstimmung mit „${bestChild.artikelname}"`);

    // Boost score when warengruppe also matched, cap at 1
    const displayScore = Math.min(wgMatch ? bestScore * 1.35 : bestScore, 1);

    suggestions.push({
      vaterartikel: vater,
      kinder: kinder.map(k => ({ artikelnummer: k.artikelnummer, artikelname: k.artikelname })),
      matchScore: displayScore,
      matchReason: reasons.join(" · "),
    });
  }

  return suggestions.sort((a, b) => b.matchScore - a.matchScore).slice(0, 3);
}

// ── Check logic (pure, importable) ───────────────────────────────────────────

export function runJtlCheck(
  candidates: { rowIndex: number; clothName: string; han: string; gtin: string; warengruppe: string }[],
  dataset: JtlRow[]
): JtlCheckResult[] {
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

  const familyMap = buildFamilyMap(dataset);

  return candidates.map((c) => {
    const { normalized: normHan } = normalizeHan(c.han);
    const normGtin = c.gtin.trim().toLowerCase();

    if (normHan && hanMap.has(normHan)) {
      return {
        rowIndex: c.rowIndex, clothName: c.clothName, inputHan: c.han, inputGtin: c.gtin,
        matchedBy: "han" as const, match: hanMap.get(normHan)!,
        storedHanSuffix: hanSuffixMap.get(normHan) ?? null,
        parentSuggestions: [],
      };
    }

    if (normGtin && gtinMap.has(normGtin)) {
      return {
        rowIndex: c.rowIndex, clothName: c.clothName, inputHan: c.han, inputGtin: c.gtin,
        matchedBy: "gtin" as const, match: gtinMap.get(normGtin)!,
        storedHanSuffix: null,
        parentSuggestions: [],
      };
    }

    return {
      rowIndex: c.rowIndex, clothName: c.clothName, inputHan: c.han, inputGtin: c.gtin,
      matchedBy: null, match: null, storedHanSuffix: null,
      parentSuggestions: findParentFamilies(c.clothName, c.warengruppe, familyMap),
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
  const found = results.filter(r => r.match !== null).length;
  const notFound = results.length - found;
  const withFamily = results.filter(r => !r.match && r.parentSuggestions.length > 0).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[88vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{DE ? "JTL-Duplikat- & Variantenprüfung" : "JTL duplicate & variant check"}</DialogTitle>
          <DialogDescription>
            {DE
              ? `${results.length} Artikel geprüft — ${found} bereits vorhanden, ${notFound} neu (davon ${withFamily} mit möglicher Produktfamilie)`
              : `${results.length} checked — ${found} already in JTL, ${notFound} new (${withFamily} with a possible parent family)`}
          </DialogDescription>
        </DialogHeader>

        {results.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            {DE ? "Keine prüfbaren Zeilen (HAN oder GTIN erforderlich)." : "No checkable rows (HAN or GTIN required)."}
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }} className="space-y-2 pr-1">
            {results.map(r => <ResultCard key={r.rowIndex} result={r} DE={DE} />)}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ── Result card ───────────────────────────────────────────────────────────────

function ResultCard({ result: r, DE }: { result: JtlCheckResult; DE: boolean }) {
  const found = r.match !== null;

  return (
    <div className={`rounded-lg border px-4 py-3 flex gap-3 items-start ${
      found ? "border-green-500/40 bg-green-500/5" : "border-amber-500/40 bg-amber-500/5"
    }`}>
      <div className="mt-0.5 shrink-0">
        {found
          ? <CheckCircle2 className="h-5 w-5 text-green-500" />
          : <XCircle className="h-5 w-5 text-amber-500" />}
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        {/* Row header */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground shrink-0">#{r.rowIndex + 1}</span>
          <span className="font-medium text-sm">{r.clothName || (DE ? "(kein Name)" : "(no name)")}</span>
          <span className="text-xs text-muted-foreground">
            {r.inputHan ? `HAN: ${r.inputHan}` : ""}
            {r.inputHan && r.inputGtin ? " · " : ""}
            {r.inputGtin ? `GTIN: ${r.inputGtin}` : ""}
          </span>
        </div>

        {found && r.match ? (
          <FoundDetails r={r} DE={DE} />
        ) : (
          <NotFoundDetails r={r} DE={DE} />
        )}
      </div>
    </div>
  );
}

function FoundDetails({ r, DE }: { r: JtlCheckResult; DE: boolean }) {
  if (!r.match) return null;
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
        <Field label={DE ? "Artikelnummer" : "Article no."} value={r.match.artikelnummer} />
        <Field label={DE ? "Artikelname" : "Article name"} value={r.match.artikelname} />
        <Field label="Warengruppe" value={r.match.warengruppe} />
        <Field label={DE ? "Vaterartikel" : "Parent article"} value={r.match.vaterartikel || "—"} />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-[11px] h-5 text-green-600 border-green-500/40">
          {DE ? "Bereits in JTL vorhanden" : "Already exists in JTL"}
        </Badge>
        <Badge variant="outline" className="text-[11px] h-5 text-muted-foreground">
          {DE ? `Gefunden über ${r.matchedBy === "han" ? "HAN" : "GTIN"}` : `Matched by ${r.matchedBy === "han" ? "HAN" : "GTIN"}`}
        </Badge>
        {r.storedHanSuffix && (
          <Badge variant="outline" className="text-[11px] h-5 text-orange-600 border-orange-500/40 gap-1">
            <AlertCircle className="h-3 w-3" />
            {DE
              ? `Gespeichert als „${r.match.han}" (${r.storedHanSuffix})`
              : `Stored as "${r.match.han}" (${r.storedHanSuffix})`}
          </Badge>
        )}
      </div>
    </div>
  );
}

function NotFoundDetails({ r, DE }: { r: JtlCheckResult; DE: boolean }) {
  const hasFamilies = r.parentSuggestions.length > 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-[11px] h-5 text-amber-600 border-amber-500/40">
          {DE ? "Nicht in JTL — Kandidat für Neuanlage" : "Not in JTL — candidate for creation"}
        </Badge>
        {hasFamilies && (
          <Badge variant="outline" className="text-[11px] h-5 text-blue-600 border-blue-500/40 gap-1">
            <GitBranch className="h-3 w-3" />
            {DE ? `${r.parentSuggestions.length} mögliche Produktfamilie${r.parentSuggestions.length > 1 ? "n" : ""}` : `${r.parentSuggestions.length} possible parent famil${r.parentSuggestions.length > 1 ? "ies" : "y"}`}
          </Badge>
        )}
      </div>

      {hasFamilies ? (
        <div className="space-y-2">
          {r.parentSuggestions.map((s, i) => (
            <ParentFamilyCard key={i} suggestion={s} DE={DE} rank={i} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          {DE
            ? "Kein passender Vaterartikel gefunden — vermutlich echter Neuartikel."
            : "No matching parent family found — likely a genuinely new article."}
        </p>
      )}
    </div>
  );
}

// ── Parent family card ────────────────────────────────────────────────────────

const SCORE_LABELS = {
  high:   { de: "Hohe Übereinstimmung",    en: "High confidence",   cls: "text-blue-700 border-blue-500/40" },
  medium: { de: "Mittlere Übereinstimmung", en: "Medium confidence", cls: "text-sky-600 border-sky-500/40" },
  low:    { de: "Niedrige Übereinstimmung", en: "Low confidence",    cls: "text-muted-foreground border-border" },
} as const;

function scoreLabel(score: number) {
  if (score >= 0.70) return SCORE_LABELS.high;
  if (score >= 0.50) return SCORE_LABELS.medium;
  return SCORE_LABELS.low;
}

const KIND_COLLAPSE_THRESHOLD = 5;

function ParentFamilyCard({
  suggestion: s, DE, rank,
}: { suggestion: ParentFamilySuggestion; DE: boolean; rank: number }) {
  const [open, setOpen] = useState(rank === 0); // first suggestion expanded by default
  const [kinderExpanded, setKinderExpanded] = useState(false);
  const label = scoreLabel(s.matchScore);
  const visibleKinder = kinderExpanded ? s.kinder : s.kinder.slice(0, KIND_COLLAPSE_THRESHOLD);
  const hiddenCount = s.kinder.length - KIND_COLLAPSE_THRESHOLD;

  return (
    <div className="rounded-md border border-blue-500/25 bg-blue-500/5 overflow-hidden">
      {/* Suggestion header — always visible */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-blue-500/10 transition-colors"
      >
        <GitBranch className="h-3.5 w-3.5 text-blue-500 shrink-0" />
        <span className="text-xs font-medium flex-1 min-w-0">
          {DE ? "Vaterartikel" : "Parent"}{": "}
          <span className="font-mono">{s.vaterartikel}</span>
          <span className="font-normal text-muted-foreground ml-1.5">
            ({s.kinder.length} {DE ? "vorhandene Variante" : "existing variant"}{s.kinder.length !== 1 ? (DE ? "n" : "s") : ""})
          </span>
        </span>
        <Badge variant="outline" className={`text-[10px] h-4 shrink-0 ${label.cls}`}>
          {DE ? label.de : label.en}
        </Badge>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-blue-500/15">
          {/* Match reason */}
          <p className="text-[11px] text-muted-foreground pt-2">{s.matchReason}</p>

          {/* Existing Kind list */}
          <div>
            <p className="text-[11px] font-medium text-foreground mb-1">
              {DE ? "Vorhandene Varianten:" : "Existing variants:"}
            </p>
            <div className="space-y-0.5">
              {visibleKinder.map((k, i) => (
                <div key={i} className="flex gap-2 text-xs">
                  <span className="font-mono text-muted-foreground shrink-0 w-36 truncate" title={k.artikelnummer}>{k.artikelnummer}</span>
                  <span className="text-foreground truncate">{k.artikelname}</span>
                </div>
              ))}
            </div>
            {s.kinder.length > KIND_COLLAPSE_THRESHOLD && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 h-5 px-1 text-[11px] text-muted-foreground"
                onClick={() => setKinderExpanded(v => !v)}
              >
                {kinderExpanded
                  ? (DE ? "Weniger anzeigen" : "Show less")
                  : (DE ? `+ ${hiddenCount} weitere anzeigen` : `Show ${hiddenCount} more`)}
              </Button>
            )}
          </div>

          {/* Verdict */}
          <p className="text-xs font-medium text-blue-700 dark:text-blue-400 border-t border-blue-500/15 pt-2">
            {DE
              ? `→ Vermutlich neue Variante unter Vater „${s.vaterartikel}"`
              : `→ Likely a new variant under parent "${s.vaterartikel}"`}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Shared field display ──────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="font-medium truncate">{value || "—"}</span>
    </div>
  );
}
