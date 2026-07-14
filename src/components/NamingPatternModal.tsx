import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown, ChevronRight, Sparkles, Loader2, AlertCircle, CheckCircle2,
  TrendingUp, Brain, Copy,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { type Lang } from "@/lib/translations";
import type { JtlRow } from "@/components/JtlCheckModal";
import {
  analyzeAllPatterns, getRepresentativeNames, hashStrings, suggestArtikelname,
  applyAiPatternLocally,
  type WgPattern, type SlotInfo, type FamilyPrefixPattern, type NameSuggestionInputs,
} from "@/lib/namingPatterns";

// ── AI result type (mirrors server response) ──────────────────────────────────

interface AiPatternResult {
  wg: string;
  pat: string;
  conf: "high" | "medium" | "low";
  bp: "first" | "last" | "none";
  ev: string[];
  _model: "haiku" | "sonnet";
  cached: boolean;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface NamingPatternModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataset: JtlRow[];
  lang: Lang;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CONF_COLORS: Record<string, string> = {
  high:   "text-green-600 border-green-500/40",
  medium: "text-amber-600 border-amber-500/40",
  low:    "text-red-500 border-red-500/40",
};
const CONF_DE: Record<string, string> = { high: "Hoch", medium: "Mittel", low: "Niedrig" };

// ── Main modal ────────────────────────────────────────────────────────────────

export const NamingPatternModal = ({ open, onOpenChange, dataset, lang }: NamingPatternModalProps) => {
  const DE = lang === "DE";
  const { toast } = useToast();

  // Rule-based patterns (synchronous, computed once per dataset)
  const rulePatterns = useMemo(
    () => (dataset.length > 0 ? analyzeAllPatterns(dataset) : new Map<string, WgPattern>()),
    [dataset]
  );

  // AI patterns (async, fetched for unreliable WGs)
  const [aiPatterns, setAiPatterns] = useState<Map<string, AiPatternResult>>(new Map());
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Fetch AI patterns when modal opens (only for unreliable WGs)
  const hasFetchedRef = useRef(false);
  useEffect(() => {
    if (!open || dataset.length === 0) return;
    if (hasFetchedRef.current) return; // already fetched this dataset load
    hasFetchedRef.current = false; // reset on dataset change via cleanup

    const unreliableWgs = [...rulePatterns.entries()]
      .filter(([, p]) => !p.reliable)
      .map(([wg]) => wg);

    if (unreliableWgs.length === 0) return;

    const groups = unreliableWgs.map(wg => {
      const names = getRepresentativeNames(dataset, wg);
      return { warengruppe: wg, names, inputHash: hashStrings(names) };
    });

    setAiLoading(true);
    setAiError(null);

    fetch("/api/analyze-naming-pattern", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groups }),
    })
      .then(r => {
        if (!r.ok) return r.json().then(d => { throw new Error(d.error || `HTTP ${r.status}`); });
        return r.json();
      })
      .then(({ results }: { results: AiPatternResult[] }) => {
        const map = new Map<string, AiPatternResult>();
        for (const r of results) map.set(r.wg ?? r.warengruppe, r);
        setAiPatterns(map);
        hasFetchedRef.current = true;
      })
      .catch(err => setAiError(String(err)))
      .finally(() => setAiLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset fetch flag when dataset changes
  useEffect(() => {
    hasFetchedRef.current = false;
    setAiPatterns(new Map());
    setAiError(null);
  }, [dataset]);

  // Sorted WG list: reliable first, then by sample size
  const sortedWgs = useMemo(() => {
    const entries = [...rulePatterns.entries()];
    return entries.sort(([, a], [, b]) => {
      if (a.reliable !== b.reliable) return a.reliable ? -1 : 1;
      return b.sampleSize - a.sampleSize;
    });
  }, [rulePatterns]);

  // ── Name suggestion state ────────────────────────────────────────────────
  const [selectedWg, setSelectedWg] = useState("");
  const [inputs, setInputs] = useState<NameSuggestionInputs>({ productType: "", material: "", brand: "" });
  const [localSuggestion, setLocalSuggestion] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<{ name: string; conf: string } | null>(null);
  const [suggestingAi, setSuggestingAi] = useState(false);

  const activePat = selectedWg ? rulePatterns.get(selectedWg) : undefined;
  const activeAiPat = selectedWg ? aiPatterns.get(selectedWg) : undefined;

  const handleLocalSuggest = useCallback(() => {
    setLocalSuggestion(null);
    setAiSuggestion(null);
    if (!activePat && !activeAiPat) return;

    if (activeAiPat) {
      const name = applyAiPatternLocally(activeAiPat.pat, inputs);
      if (name) { setLocalSuggestion(name); return; }
    }
    if (activePat?.reliable) {
      const s = suggestArtikelname(activePat, inputs);
      if (s) setLocalSuggestion(s.name);
    }
  }, [activePat, activeAiPat, inputs]);

  const handleAiSuggest = useCallback(async () => {
    if (!selectedWg) return;
    const pat = activeAiPat?.pat ?? activePat?.patternTemplate;
    const bp = activeAiPat?.bp ?? "none";
    if (!pat) return;

    setSuggestingAi(true);
    try {
      const res = await fetch("/api/suggest-artikelname-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern: pat, brandPosition: bp, warengruppe: selectedWg, ...inputs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAiSuggestion(data);
    } catch (err) {
      toast({ title: DE ? "KI-Fehler" : "AI error", description: String(err), variant: "destructive" });
    } finally {
      setSuggestingAi(false);
    }
  }, [selectedWg, activeAiPat, activePat, inputs, DE, toast]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() =>
      toast({ title: DE ? "Kopiert" : "Copied", description: text })
    );
  };

  const reliableCount = [...rulePatterns.values()].filter(p => p.reliable).length;
  const unreliableCount = rulePatterns.size - reliableCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[96vw] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            {DE ? "Namensstruktur-Analyse" : "Naming pattern analysis"}
            {aiLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </DialogTitle>
          <DialogDescription>
            {DE
              ? `${rulePatterns.size} Warengruppen — ${reliableCount} zuverlässig erkannt, ${unreliableCount} KI-Analyse${aiLoading ? " läuft…" : aiPatterns.size > 0 ? ` (${aiPatterns.size} abgeschlossen)` : ""}`
              : `${rulePatterns.size} Warengruppen — ${reliableCount} reliably detected, ${unreliableCount} AI analysis${aiLoading ? " running…" : aiPatterns.size > 0 ? ` (${aiPatterns.size} done)` : ""}`}
          </DialogDescription>
        </DialogHeader>

        {aiError && (
          <div className="shrink-0 flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {DE ? `KI-Analyse Fehler: ${aiError}` : `AI analysis error: ${aiError}`}
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }} className="space-y-4 pr-1">
          {/* ── Name suggestion panel ─────────────────────────────────────── */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-sm font-semibold">{DE ? "Artikelname vorschlagen" : "Suggest article name"}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">{DE ? "Warengruppe" : "Product group"}</Label>
                <Select value={selectedWg} onValueChange={wg => { setSelectedWg(wg); setLocalSuggestion(null); setAiSuggestion(null); }}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={DE ? "Wählen…" : "Select…"} />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedWgs.map(([wg, p]) => (
                      <SelectItem key={wg} value={wg}>
                        <span className="flex items-center gap-1.5">
                          {p.reliable
                            ? <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                            : aiPatterns.has(wg)
                              ? <Brain className="h-3 w-3 text-blue-500 shrink-0" />
                              : <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" />}
                          {wg}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(["productType", "material", "brand"] as const).map(key => {
                const labels = {
                  productType: { de: "Produkttyp", en: "Product type", ph: "z.B. Schlafsack" },
                  material: { de: "Material/Attribut", en: "Material/Attribute", ph: "z.B. Merino" },
                  brand: { de: "Marke", en: "Brand", ph: "z.B. Engel" },
                }[key];
                return (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{DE ? labels.de : labels.en}</Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder={labels.ph}
                      value={inputs[key]}
                      onChange={e => setInputs(prev => ({ ...prev, [key]: e.target.value }))}
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={handleLocalSuggest} disabled={!selectedWg}>
                <TrendingUp className="h-3.5 w-3.5" />
                {DE ? "Lokal vorschlagen" : "Suggest locally"}
              </Button>
              <Button size="sm" className="gap-1.5 h-8" onClick={handleAiSuggest}
                disabled={!selectedWg || suggestingAi || (!activePat?.reliable && !activeAiPat)}>
                {suggestingAi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {DE ? "KI-Vorschlag" : "AI suggestion"}
              </Button>
            </div>

            {/* Results */}
            {(localSuggestion || aiSuggestion) && (
              <div className="space-y-2 pt-1 border-t border-border">
                {localSuggestion && (
                  <SuggestionResult
                    label={DE ? "Lokal (Regelbasiert)" : "Local (rule-based)"}
                    name={localSuggestion}
                    conf={activePat ? (activePat.coverage >= 0.7 ? "high" : activePat.coverage >= 0.5 ? "medium" : "low") : "medium"}
                    patternUsed={activeAiPat?.pat ?? activePat?.patternTemplate ?? ""}
                    DE={DE}
                    onCopy={copyToClipboard}
                  />
                )}
                {aiSuggestion && (
                  <SuggestionResult
                    label={DE ? "KI-Vorschlag (Claude Haiku)" : "AI suggestion (Claude Haiku)"}
                    name={aiSuggestion.name}
                    conf={aiSuggestion.conf as "high" | "medium" | "low"}
                    patternUsed={activeAiPat?.pat ?? activePat?.patternTemplate ?? ""}
                    DE={DE}
                    onCopy={copyToClipboard}
                    isAi
                  />
                )}
              </div>
            )}
          </div>

          {/* ── Per-Warengruppe pattern list ──────────────────────────────── */}
          <div className="space-y-2">
            {sortedWgs.map(([wg, pattern]) => (
              <WgPatternCard
                key={wg}
                pattern={pattern}
                aiResult={aiPatterns.get(wg)}
                aiLoading={aiLoading && !pattern.reliable}
                DE={DE}
              />
            ))}
            {sortedWgs.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                {DE ? "Keine Daten — bitte zuerst JTL-Datei laden." : "No data — load a JTL file first."}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Suggestion result row ─────────────────────────────────────────────────────

function SuggestionResult({
  label, name, conf, patternUsed, DE, onCopy, isAi = false,
}: {
  label: string; name: string; conf: "high" | "medium" | "low";
  patternUsed: string; DE: boolean; onCopy: (s: string) => void; isAi?: boolean;
}) {
  return (
    <div className={`rounded-md border px-3 py-2 space-y-1 ${isAi ? "border-blue-500/30 bg-blue-500/5" : "border-border bg-muted/30"}`}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <Badge variant="outline" className={`text-[10px] h-4 ${CONF_COLORS[conf]}`}>
          {DE ? CONF_DE[conf] : conf}
        </Badge>
        {conf === "low" && (
          <span className="text-[11px] text-amber-600">
            {DE ? "— Ergebnis bitte manuell prüfen" : "— verify manually"}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono font-semibold text-sm">{name}</span>
        <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground" onClick={() => onCopy(name)}>
          <Copy className="h-3 w-3" />
        </Button>
      </div>
      {patternUsed && (
        <p className="text-[11px] text-muted-foreground">
          {DE ? "Muster:" : "Pattern:"} <span className="font-mono">{patternUsed}</span>
        </p>
      )}
    </div>
  );
}

// ── Per-Warengruppe card ──────────────────────────────────────────────────────

function WgPatternCard({
  pattern: p, aiResult, aiLoading, DE,
}: {
  pattern: WgPattern; aiResult?: AiPatternResult; aiLoading: boolean; DE: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const statusBadge = () => {
    if (p.reliable)
      return <Badge variant="outline" className="text-[11px] h-5 text-green-600 border-green-500/40">{DE ? "Erkannt" : "Reliable"}</Badge>;
    if (aiLoading)
      return <Badge variant="outline" className="text-[11px] h-5 text-muted-foreground gap-1"><Loader2 className="h-3 w-3 animate-spin" />{DE ? "KI läuft…" : "AI running…"}</Badge>;
    if (aiResult)
      return (
        <Badge variant="outline" className={`text-[11px] h-5 gap-1 ${CONF_COLORS[aiResult.conf]} border-blue-500/40 text-blue-600`}>
          <Brain className="h-3 w-3" />
          KI {aiResult._model === "sonnet" ? "Sonnet" : "Haiku"}{aiResult.cached ? " ·cached" : ""}
        </Badge>
      );
    return <Badge variant="outline" className="text-[11px] h-5 text-amber-600 border-amber-500/40">{DE ? "Unsicher" : "Low confidence"}</Badge>;
  };

  const effectiveTemplate = aiResult?.pat ?? (p.reliable ? p.patternTemplate : "");
  const effectiveCoverage = p.reliable ? p.coverage : null;
  const effectiveExamples = aiResult?.ev?.length ? aiResult.ev : p.examples;
  const effectiveOutliers = p.outliers;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors"
      >
        {expanded
          ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}

        <span className="font-medium text-sm flex-1 min-w-0 truncate">{p.warengruppe}</span>
        <span className="text-xs text-muted-foreground shrink-0">{p.sampleSize} {DE ? "Namen" : "names"}</span>

        {effectiveTemplate && (
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono hidden sm:block max-w-xs truncate shrink-0">
            {effectiveTemplate}
          </code>
        )}
        {effectiveCoverage !== null && (
          <span className="text-xs text-muted-foreground shrink-0">{Math.round(effectiveCoverage * 100)} %</span>
        )}
        {statusBadge()}
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-border space-y-3">
          {/* Unreliable reason */}
          {!p.reliable && p.unreliableReason && !aiResult && (
            <p className="text-xs text-amber-600 italic">{p.unreliableReason}</p>
          )}

          {/* AI result detail */}
          {aiResult && (
            <div className="rounded-md border border-blue-500/25 bg-blue-500/5 px-3 py-2 space-y-1">
              <div className="flex items-center gap-2 text-[11px] font-medium text-blue-700 dark:text-blue-400">
                <Brain className="h-3.5 w-3.5" />
                {DE ? "KI-Analyse" : "AI analysis"}
                <Badge variant="outline" className={`text-[10px] h-4 ${CONF_COLORS[aiResult.conf]}`}>
                  {DE ? `Konfidenz: ${CONF_DE[aiResult.conf]}` : `Confidence: ${aiResult.conf}`}
                </Badge>
                {aiResult.conf === "low" && (
                  <span className="text-amber-600">{DE ? "— manuell prüfen" : "— verify manually"}</span>
                )}
              </div>
              <p className="text-xs">
                <span className="text-muted-foreground">{DE ? "Muster: " : "Pattern: "}</span>
                <code className="font-mono">{aiResult.pat}</code>
              </p>
              <p className="text-xs">
                <span className="text-muted-foreground">{DE ? "Markenposition: " : "Brand position: "}</span>
                {aiResult.bp === "first" ? (DE ? "Erste Position" : "First") : aiResult.bp === "last" ? (DE ? "Letzte Position" : "Last") : (DE ? "Keine Marke erkannt" : "None")}
              </p>
            </div>
          )}

          {/* Slot table (rule-based, only when reliable) */}
          {p.reliable && p.slots.length > 0 && (
            <SlotTable slots={p.slots} sampleSize={p.sampleSize} DE={DE} />
          )}

          {/* Example names */}
          {effectiveExamples.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">
                {DE ? "Beispiele" : "Examples"}
              </p>
              <ul className="space-y-0.5">
                {effectiveExamples.map((ex, i) => (
                  <li key={i} className="text-xs font-mono text-foreground">• {ex}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Outliers */}
          {effectiveOutliers.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-amber-600 mb-1 uppercase tracking-wide">
                {DE ? `Ausreißer (${effectiveOutliers.length}${effectiveOutliers.length === 5 ? "+" : ""})` : `Outliers (${effectiveOutliers.length}${effectiveOutliers.length === 5 ? "+" : ""})`}
              </p>
              <ul className="space-y-0.5">
                {effectiveOutliers.map((ex, i) => (
                  <li key={i} className="text-xs font-mono text-amber-700 dark:text-amber-400">⚠ {ex}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Family prefix patterns */}
          {p.familyPatterns.length > 0 && (
            <FamilyPatternsSection families={p.familyPatterns} DE={DE} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Slot table ────────────────────────────────────────────────────────────────

function SlotTable({ slots, sampleSize, DE }: { slots: SlotInfo[]; sampleSize: number; DE: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">
        {DE ? "Positionsanalyse" : "Position analysis"}
      </p>
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/60">
            <tr>
              <th className="text-left px-2 py-1 font-medium text-muted-foreground w-8">Pos</th>
              <th className="text-left px-2 py-1 font-medium text-muted-foreground">{DE ? "Art" : "Type"}</th>
              <th className="text-left px-2 py-1 font-medium text-muted-foreground">{DE ? "Häufigste Tokens" : "Top tokens"}</th>
              <th className="text-right px-2 py-1 font-medium text-muted-foreground">{DE ? "Abdeckung" : "Coverage"}</th>
            </tr>
          </thead>
          <tbody>
            {slots.map(slot => (
              <tr key={slot.position} className="border-t border-border">
                <td className="px-2 py-1 text-muted-foreground">{slot.position + 1}</td>
                <td className="px-2 py-1">
                  {slot.isFixed
                    ? <Badge variant="outline" className="text-[10px] h-4 text-blue-600 border-blue-500/40">{slot.label}</Badge>
                    : <span className="text-muted-foreground">{slot.label}</span>}
                </td>
                <td className="px-2 py-1 font-mono">
                  {slot.isFixed
                    ? <span className="font-semibold">{slot.topToken}</span>
                    : slot.topTokens.slice(0, 4).map((t, i) => (
                        <span key={i} className="inline-flex items-center gap-0.5 mr-1">
                          {t.token}
                          <span className="text-muted-foreground">({t.count})</span>
                          {i < Math.min(3, slot.topTokens.length - 1) && <span className="text-muted-foreground">,</span>}
                        </span>
                      ))}
                </td>
                <td className="px-2 py-1 text-right text-muted-foreground">
                  {Math.round(slot.isFixed ? slot.dominantCoverage * 100 : slot.presenceCoverage * 100)} %
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Family prefix patterns section ────────────────────────────────────────────

const FAMILY_SHOW = 3;

function FamilyPatternsSection({ families, DE }: { families: FamilyPrefixPattern[]; DE: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? families : families.slice(0, FAMILY_SHOW);

  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">
        {DE ? "Vater/Kind-Präfixmuster" : "Parent/child prefix patterns"}
      </p>
      <div className="space-y-1.5">
        {visible.map(fp => <FamilyPrefixCard key={fp.vaterartikel} fp={fp} DE={DE} />)}
      </div>
      {families.length > FAMILY_SHOW && (
        <Button variant="ghost" size="sm" className="mt-1 h-6 px-1 text-[11px] text-muted-foreground"
          onClick={() => setShowAll(v => !v)}>
          {showAll
            ? (DE ? "Weniger anzeigen" : "Show less")
            : (DE ? `+ ${families.length - FAMILY_SHOW} weitere` : `+ ${families.length - FAMILY_SHOW} more`)}
        </Button>
      )}
    </div>
  );
}

function FamilyPrefixCard({ fp, DE }: { fp: FamilyPrefixPattern; DE: boolean }) {
  return (
    <div className="rounded border border-border px-2 py-1.5 text-xs space-y-0.5">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-muted-foreground shrink-0">{fp.vaterartikel}</span>
        <span className="text-muted-foreground">
          ({fp.kinderNames.length} {DE ? "Varianten" : "variants"})
        </span>
      </div>
      {fp.sharedPrefix && (
        <div>
          <span className="text-muted-foreground">{DE ? "Präfix: " : "Prefix: "}</span>
          <span className="font-mono font-semibold">{fp.sharedPrefix}</span>
          <span className="text-muted-foreground"> + </span>
          <span className="font-mono text-blue-600">[{fp.variantParts.slice(0, 3).join(" | ")}
            {fp.variantParts.length > 3 ? ` | +${fp.variantParts.length - 3} weitere` : ""}]</span>
        </div>
      )}
    </div>
  );
}
