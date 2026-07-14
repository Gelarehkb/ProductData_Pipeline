import { useState, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, XCircle, GitBranch, AlertCircle, RefreshCw, Download,
  ChevronDown, ChevronRight, Plus, Share2, Ban, Undo2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { type Lang } from "@/lib/translations";
import { runJtlCheck, type JtlRow, type JtlCheckResult, type ParentFamilySuggestion } from "@/components/JtlCheckModal";
import { analyzeAllPatterns, suggestArtikelname, type WgPattern } from "@/lib/namingPatterns";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PreCheckCandidate {
  rowId: string;
  rowIndex: number;
  clothName: string;
  han: string;
  gtin: string;
  warengruppe: string;
  itemName: string;     // maps to Produkttyp slot
  infoMaterial: string; // maps to Attribut/Material slot
  collection: string;   // maps to Marke slot
}

type DecisionAction = "create" | "variant" | "skip";

interface Decision {
  action: DecisionAction;
  vaterId?: string;
  suggestedName?: string;
  decidedAt: number;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ArticlePreCheckModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: PreCheckCandidate[];
  jtlDataset: JtlRow[];
  lang: Lang;
  onReuploadJtl: () => void;
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export const ArticlePreCheckModal = ({
  open, onOpenChange, candidates, jtlDataset, lang, onReuploadJtl,
}: ArticlePreCheckModalProps) => {
  const DE = lang === "DE";
  const { toast } = useToast();

  // All three checks computed once from the dataset
  const checkResults = useMemo<JtlCheckResult[]>(() => {
    if (!jtlDataset.length || !candidates.length) return [];
    return runJtlCheck(
      candidates.map(c => ({
        rowIndex: c.rowIndex, clothName: c.clothName,
        han: c.han, gtin: c.gtin, warengruppe: c.warengruppe,
      })),
      jtlDataset
    );
  }, [candidates, jtlDataset]);

  const patternMap = useMemo<Map<string, WgPattern>>(
    () => (jtlDataset.length ? analyzeAllPatterns(jtlDataset) : new Map()),
    [jtlDataset]
  );

  // Per-row naming suggestions (pre-computed, no API call)
  const namingSuggestions = useMemo<Map<string, string | null>>(() => {
    const m = new Map<string, string | null>();
    for (const c of candidates) {
      const pat = patternMap.get(c.warengruppe);
      if (pat?.reliable) {
        const s = suggestArtikelname(pat, {
          productType: c.itemName.trim() || c.clothName.split(" ")[0],
          material: c.infoMaterial.trim(),
          brand: c.collection.trim(),
        });
        m.set(c.rowId, s?.name ?? null);
      } else {
        m.set(c.rowId, null);
      }
    }
    return m;
  }, [candidates, patternMap]);

  const [decisions, setDecisions] = useState<Map<string, Decision>>(new Map());
  const [logExpanded, setLogExpanded] = useState(false);

  const decide = useCallback((rowId: string, action: DecisionAction, vaterId?: string, suggestedName?: string) => {
    setDecisions(prev => {
      const next = new Map(prev);
      next.set(rowId, { action, vaterId, suggestedName, decidedAt: Date.now() });
      return next;
    });
    const labels: Record<DecisionAction, { de: string; en: string }> = {
      create: { de: "Neu anlegen", en: "Create new article" },
      variant: { de: `Variante unter ${vaterId ?? ""}`, en: `Add as variant under ${vaterId ?? ""}` },
      skip: { de: "Überspringen", en: "Skip" },
    };
    toast({ title: DE ? labels[action].de : labels[action].en });
  }, [DE, toast]);

  const undecide = useCallback((rowId: string) => {
    setDecisions(prev => { const next = new Map(prev); next.delete(rowId); return next; });
  }, []);

  // Summary counts
  const total = candidates.length;
  const decided = decisions.size;
  const createCount = [...decisions.values()].filter(d => d.action === "create").length;
  const variantCount = [...decisions.values()].filter(d => d.action === "variant").length;
  const skipCount = [...decisions.values()].filter(d => d.action === "skip").length;

  // Map results by rowId for quick lookup
  const resultByRowId = useMemo(() => {
    const m = new Map<string, JtlCheckResult>();
    checkResults.forEach(r => {
      const c = candidates[r.rowIndex];
      if (c) m.set(c.rowId, r);
    });
    return m;
  }, [checkResults, candidates]);

  // Export decisions as TSV
  const exportDecisions = () => {
    const header = DE
      ? "Name\tHAN\tGTIN\tEntscheidung\tVaterID\tVorgeschlagener Name\tZeitpunkt"
      : "Name\tHAN\tGTIN\tDecision\tParentID\tSuggestedName\tTimestamp";
    const lines = candidates
      .filter(c => decisions.has(c.rowId))
      .map(c => {
        const d = decisions.get(c.rowId)!;
        const actionLabel = d.action === "create" ? (DE ? "Neu anlegen" : "Create") :
                            d.action === "variant" ? (DE ? "Variante" : "Variant") :
                            (DE ? "Überspringen" : "Skip");
        return [
          c.clothName, c.han, c.gtin, actionLabel,
          d.vaterId ?? "", d.suggestedName ?? "",
          new Date(d.decidedAt).toLocaleString("de-DE"),
        ].join("\t");
      });
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "artikel-entscheidungen.tsv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[96vw] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{DE ? "Artikel-Vorabprüfung" : "Article pre-check"}</DialogTitle>
          <DialogDescription>
            {DE
              ? `${total} Kandidaten — ${decided}/${total} entschieden`
              : `${total} candidates — ${decided}/${total} decided`}
            {decided > 0 && ` (${createCount} ${DE ? "neu" : "new"} · ${variantCount} ${DE ? "Variante" : "variant"} · ${skipCount} ${DE ? "skip" : "skip"})`}
          </DialogDescription>
        </DialogHeader>

        {/* Re-upload bar */}
        <div className="shrink-0 flex items-center gap-2 px-1 py-1.5 border-b border-border">
          <span className="text-xs text-muted-foreground flex-1">
            {jtlDataset.length > 0
              ? (DE ? `Referenzdaten: ${jtlDataset.length.toLocaleString("de-DE")} Artikel geladen` : `Reference: ${jtlDataset.length.toLocaleString("de-DE")} articles loaded`)
              : (DE ? "Keine Referenzdaten" : "No reference data")}
          </span>
          <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={onReuploadJtl}>
            <RefreshCw className="h-3.5 w-3.5" />
            {DE ? "JTL-Datei neu laden" : "Re-load JTL file"}
          </Button>
        </div>

        {/* Candidate list */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }} className="space-y-3 pr-1 pt-1">
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              {DE ? "Keine Zeilen mit HAN oder GTIN/EAN." : "No rows with HAN or GTIN/EAN."}
            </p>
          ) : (
            candidates.map(c => (
              <CandidateCard
                key={c.rowId}
                candidate={c}
                result={resultByRowId.get(c.rowId) ?? null}
                suggestedName={namingSuggestions.get(c.rowId) ?? null}
                patternTemplate={patternMap.get(c.warengruppe)?.patternTemplate ?? null}
                decision={decisions.get(c.rowId) ?? null}
                onDecide={decide}
                onUndecide={undecide}
                DE={DE}
              />
            ))
          )}
        </div>

        {/* Decision log */}
        {decided > 0 && (
          <div className="shrink-0 border-t border-border pt-2 space-y-1.5">
            <button
              onClick={() => setLogExpanded(v => !v)}
              className="w-full flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {logExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              {DE ? "Entscheidungsprotokoll" : "Decision log"}
              <div className="flex items-center gap-1 ml-1">
                {createCount > 0 && <Badge variant="outline" className="text-[10px] h-4 text-green-600 border-green-500/40">{createCount} {DE ? "neu" : "new"}</Badge>}
                {variantCount > 0 && <Badge variant="outline" className="text-[10px] h-4 text-blue-600 border-blue-500/40">{variantCount} {DE ? "Variante" : "variant"}</Badge>}
                {skipCount > 0 && <Badge variant="outline" className="text-[10px] h-4 text-muted-foreground">{skipCount} skip</Badge>}
              </div>
              <Button variant="ghost" size="sm" className="ml-auto h-6 px-1.5 text-[11px] gap-1" onClick={e => { e.stopPropagation(); exportDecisions(); }}>
                <Download className="h-3 w-3" />
                {DE ? "Exportieren" : "Export"}
              </Button>
            </button>

            {logExpanded && (
              <div className="rounded-md border border-border text-xs divide-y divide-border max-h-40 overflow-y-auto">
                {candidates.filter(c => decisions.has(c.rowId)).map(c => {
                  const d = decisions.get(c.rowId)!;
                  const icon = d.action === "create" ? <Plus className="h-3 w-3 text-green-500 shrink-0" />
                    : d.action === "variant" ? <Share2 className="h-3 w-3 text-blue-500 shrink-0" />
                    : <Ban className="h-3 w-3 text-muted-foreground shrink-0" />;
                  const label = d.action === "create" ? (DE ? "Neu anlegen" : "Create")
                    : d.action === "variant" ? `${DE ? "Variante" : "Variant"} → ${d.vaterId}`
                    : "Skip";
                  return (
                    <div key={c.rowId} className="flex items-center gap-2 px-2 py-1">
                      {icon}
                      <span className="truncate flex-1 font-mono">{c.clothName || c.han}</span>
                      <span className="text-muted-foreground shrink-0">{label}</span>
                      {d.suggestedName && <span className="font-mono text-muted-foreground shrink-0 hidden sm:block">→ {d.suggestedName}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ── Candidate card ────────────────────────────────────────────────────────────

interface CandidateCardProps {
  candidate: PreCheckCandidate;
  result: JtlCheckResult | null;
  suggestedName: string | null;
  patternTemplate: string | null;
  decision: Decision | null;
  onDecide: (rowId: string, action: DecisionAction, vaterId?: string, suggestedName?: string) => void;
  onUndecide: (rowId: string) => void;
  DE: boolean;
}

function CandidateCard({ candidate: c, result, suggestedName, patternTemplate, decision, onDecide, onUndecide, DE }: CandidateCardProps) {
  const [familyExpanded, setFamilyExpanded] = useState(false);

  const isDuplicate = !!result?.match;
  const topParent = result?.parentSuggestions?.[0] ?? null;
  const hasParent = topParent !== null;

  const cardBorder = isDuplicate
    ? "border-slate-300 dark:border-slate-600"
    : hasParent
      ? "border-blue-400/40"
      : "border-green-400/40";

  return (
    <div className={`rounded-lg border ${cardBorder} overflow-hidden`}>
      {/* Header */}
      <div className="px-4 py-2.5 bg-muted/30 flex items-baseline gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground shrink-0">#{c.rowIndex + 1}</span>
        <span className="font-semibold text-sm flex-1 min-w-0">{c.clothName || (DE ? "(kein Name)" : "(no name)")}</span>
        <span className="text-xs text-muted-foreground shrink-0 font-mono">
          {c.han ? `HAN: ${c.han}` : ""}{c.han && c.gtin ? " · " : ""}{c.gtin ? `GTIN: ${c.gtin}` : ""}
        </span>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* ① Duplicate check */}
        <CheckSection
          icon={isDuplicate ? <XCircle className="h-4 w-4 text-slate-400" /> : <CheckCircle2 className="h-4 w-4 text-green-500" />}
          label={DE ? "Duplikat-Prüfung" : "Duplicate check"}
        >
          {isDuplicate && result.match ? (
            <div className="space-y-0.5 text-xs">
              <Badge variant="outline" className="text-[11px] h-5 text-slate-500 border-slate-400/40">
                {DE ? "Bereits in JTL" : "Already in JTL"}
              </Badge>
              <div className="flex gap-4 flex-wrap pt-0.5">
                <Field label={DE ? "Artikelnummer" : "Art.no"} value={result.match.artikelnummer} />
                <Field label={DE ? "Name" : "Name"} value={result.match.artikelname} />
                <Field label="Warengruppe" value={result.match.warengruppe} />
                {result.match.vaterartikel && <Field label={DE ? "Vater" : "Parent"} value={result.match.vaterartikel} />}
              </div>
              {result.storedHanSuffix && (
                <p className="text-orange-600 text-[11px] flex items-center gap-1 pt-0.5">
                  <AlertCircle className="h-3 w-3" />
                  {DE ? `HAN gespeichert als „${result.match.han}" (${result.storedHanSuffix})` : `Stored HAN "${result.match.han}" (${result.storedHanSuffix})`}
                </p>
              )}
            </div>
          ) : (
            <Badge variant="outline" className="text-[11px] h-5 text-green-600 border-green-500/40">
              {DE ? "Nicht in JTL — Kandidat für Neuanlage" : "Not in JTL — candidate for creation"}
            </Badge>
          )}
        </CheckSection>

        {/* ② Parent family */}
        <CheckSection
          icon={<GitBranch className={`h-4 w-4 ${hasParent ? "text-blue-500" : "text-muted-foreground"}`} />}
          label={DE ? "Produktfamilie" : "Parent family"}
        >
          {isDuplicate ? (
            <span className="text-xs text-muted-foreground">{DE ? "Nicht anwendbar (bereits vorhanden)" : "N/A (already exists)"}</span>
          ) : hasParent && topParent ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[11px] h-5 text-blue-600 border-blue-500/40">
                  {DE ? `Möglicher Vater: ${topParent.vaterartikel}` : `Possible parent: ${topParent.vaterartikel}`}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {topParent.kinder.length} {DE ? "vorhandene Varianten" : "existing variants"}
                </span>
                <Button variant="ghost" size="sm" className="h-5 px-1 text-[11px]" onClick={() => setFamilyExpanded(v => !v)}>
                  {familyExpanded ? (DE ? "Einklappen" : "Collapse") : (DE ? "Varianten anzeigen" : "Show variants")}
                </Button>
              </div>
              {familyExpanded && (
                <div className="rounded border border-blue-500/20 bg-blue-500/5 px-2 py-1.5 space-y-0.5 max-h-32 overflow-y-auto">
                  {topParent.kinder.map((k, i) => (
                    <div key={i} className="flex gap-2 text-xs font-mono">
                      <span className="text-muted-foreground w-32 truncate shrink-0">{k.artikelnummer}</span>
                      <span className="truncate">{k.artikelname}</span>
                    </div>
                  ))}
                </div>
              )}
              {result?.parentSuggestions && result.parentSuggestions.length > 1 && (
                <p className="text-[11px] text-muted-foreground">
                  {DE ? `+ ${result.parentSuggestions.length - 1} weitere mögliche Familie(n)` : `+ ${result.parentSuggestions.length - 1} more possible famil${result.parentSuggestions.length - 1 > 1 ? "ies" : "y"}`}
                </p>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground italic">
              {DE ? "Kein passender Vaterartikel gefunden" : "No matching parent family found"}
            </span>
          )}
        </CheckSection>

        {/* ③ Naming suggestion */}
        <CheckSection
          icon={<span className="text-base leading-none mt-0.5">✏️</span>}
          label={DE ? "Namensvorschlag" : "Name suggestion"}
        >
          {suggestedName ? (
            <div className="space-y-0.5">
              <span className="font-mono font-semibold text-sm">{suggestedName}</span>
              {patternTemplate && (
                <p className="text-[11px] text-muted-foreground">
                  {DE ? "Muster: " : "Pattern: "}<code className="font-mono">{patternTemplate}</code>
                </p>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground italic">
              {c.warengruppe
                ? (DE ? `Kein zuverlässiges Muster für „${c.warengruppe}"` : `No reliable pattern for "${c.warengruppe}"`)
                : (DE ? "Keine Warengruppe — Namensanalyse nicht möglich" : "No Warengruppe — naming analysis not possible")}
            </span>
          )}
        </CheckSection>

        {/* ─── Decision zone ─── */}
        <div className="border-t border-border pt-2.5">
          {decision ? (
            <DecisionBadge decision={decision} onUndo={() => onUndecide(c.rowId)} DE={DE} />
          ) : (
            <DecisionButtons
              isDuplicate={isDuplicate}
              topParent={topParent}
              suggestedName={suggestedName}
              rowId={c.rowId}
              onDecide={onDecide}
              DE={DE}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Decision buttons ──────────────────────────────────────────────────────────

function DecisionButtons({
  isDuplicate, topParent, suggestedName, rowId, onDecide, DE,
}: {
  isDuplicate: boolean;
  topParent: ParentFamilySuggestion | null;
  suggestedName: string | null;
  rowId: string;
  onDecide: (rowId: string, action: DecisionAction, vaterId?: string, suggestedName?: string) => void;
  DE: boolean;
}) {
  if (isDuplicate) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs text-muted-foreground border-dashed"
          onClick={() => onDecide(rowId, "skip")}>
          <Ban className="h-3.5 w-3.5" />
          {DE ? "Bereits vorhanden — Überspringen" : "Already exists — Skip"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button size="sm" className="h-7 gap-1.5 text-xs bg-green-600 hover:bg-green-700 text-white"
        onClick={() => onDecide(rowId, "create", undefined, suggestedName ?? undefined)}>
        <Plus className="h-3.5 w-3.5" />
        {DE ? "Neu anlegen" : "Create new article"}
      </Button>

      {topParent && (
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs text-blue-600 border-blue-500/40 hover:bg-blue-500/10"
          onClick={() => onDecide(rowId, "variant", topParent.vaterartikel, suggestedName ?? undefined)}>
          <Share2 className="h-3.5 w-3.5" />
          {DE ? `Variante unter ${topParent.vaterartikel}` : `Add as variant under ${topParent.vaterartikel}`}
        </Button>
      )}

      <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs text-muted-foreground"
        onClick={() => onDecide(rowId, "skip")}>
        <Ban className="h-3.5 w-3.5" />
        {DE ? "Überspringen" : "Skip"}
      </Button>
    </div>
  );
}

// ── Decision badge (post-decision) ────────────────────────────────────────────

function DecisionBadge({ decision: d, onUndo, DE }: { decision: Decision; onUndo: () => void; DE: boolean }) {
  const config = {
    create: {
      cls: "bg-green-500/10 border-green-500/40",
      icon: <Plus className="h-3.5 w-3.5 text-green-600" />,
      label: DE ? "Neu anlegen" : "Create new article",
    },
    variant: {
      cls: "bg-blue-500/10 border-blue-500/40",
      icon: <Share2 className="h-3.5 w-3.5 text-blue-600" />,
      label: DE ? `Variante unter ${d.vaterId}` : `Variant under ${d.vaterId}`,
    },
    skip: {
      cls: "bg-muted/60 border-border",
      icon: <Ban className="h-3.5 w-3.5 text-muted-foreground" />,
      label: DE ? "Überspringen" : "Skip",
    },
  }[d.action];

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border ${config.cls}`}>
      {config.icon}
      <span className="text-sm font-medium flex-1">{config.label}</span>
      {d.action === "create" && d.suggestedName && (
        <span className="text-xs text-muted-foreground font-mono hidden sm:block">→ {d.suggestedName}</span>
      )}
      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={onUndo} title={DE ? "Rückgängig" : "Undo"}>
        <Undo2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function CheckSection({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 items-start">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium font-mono">{value || "—"}</span>
    </div>
  );
}
