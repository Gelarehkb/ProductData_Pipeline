// ── Configuration ─────────────────────────────────────────────────────────────

/** Minimum names in a Warengruppe to attempt pattern detection. */
const MIN_SAMPLE = 4;

/** A token must appear at a given position in ≥ this fraction of names to be "fixed". */
const FIXED_THRESHOLD = 0.65;

/** Pattern must cover ≥ this fraction of names to be declared reliable. */
const COVERAGE_THRESHOLD = 0.55;

/** Max positional slots analyzed (names beyond this length are truncated in analysis). */
const MAX_SLOTS = 6;

/** Max tokens shown for variable slots. */
const MAX_TOP_TOKENS = 8;

/** Min family size (Kinder) to include in family prefix analysis. */
const MIN_FAMILY_SIZE = 2;

/** Max families shown per Warengruppe in the UI. */
const MAX_FAMILIES_SHOWN = 5;

// ── Input type ────────────────────────────────────────────────────────────────

export interface PatternRow {
  artikelnummer: string;
  vaterartikel: string;
  artikelname: string;
  warengruppe: string;
}

// ── Output types ──────────────────────────────────────────────────────────────

export type SlotLabel =
  | "Produkttyp"
  | "Marke"
  | "Modell"
  | "Attribut/Material"
  | "Größe/Variante"
  | "Farbe"
  | "variabel";

export interface SlotInfo {
  position: number;
  isFixed: boolean;
  topToken: string;
  /** Fraction of names that have ANY token at this position. */
  presenceCoverage: number;
  /** Fraction of names with the top token here (only meaningful when isFixed). */
  dominantCoverage: number;
  topTokens: { token: string; count: number }[];
  label: SlotLabel;
}

export interface FamilyPrefixPattern {
  vaterartikel: string;
  /** Longest common word-prefix shared by all Kind names. */
  sharedPrefix: string;
  kinderNames: string[];
  /** What each Kind name adds after the shared prefix. */
  variantParts: string[];
}

export interface WgPattern {
  warengruppe: string;
  sampleSize: number;
  reliable: boolean;
  unreliableReason?: string;
  slots: SlotInfo[];
  /** Human-readable template, e.g. "Schlafsack [Attribut/Material] [Marke]" */
  patternTemplate: string;
  /** Fraction of names that conform to the detected pattern. */
  coverage: number;
  examples: string[];
  outliers: string[];
  /** Top families (by child count) within this Warengruppe. */
  familyPatterns: FamilyPrefixPattern[];
}

// ── Tokenization ──────────────────────────────────────────────────────────────

/** Split on whitespace only — hyphens are part of compound tokens (e.g. "Bio-Baumwolle"). */
function tokenize(name: string): string[] {
  return name.trim().split(/\s+/).filter(t => t.length > 0);
}

// ── Slot label inference ──────────────────────────────────────────────────────

/** German product-type noun endings (Komposita). */
const PRODUCT_TYPE_RE =
  /(sack|hose|jacke|anzug|strampler|kleid|body|hemd|shirt|pullover|fleece|decke|kissen|tuch|tasche|bett|wagen|sitz|gestell|aufsatz|zubehör|set|pack|trage|wickel|spiel|buch|spielzeug|matratze|bett|nestchen|schlafsack|strampelhose|kombination)$/i;

/** Size/variant token patterns. */
const VARIANT_RE = /^(\d+([\/\-]\d+)?(cm|g|ml)?|Gr\.\s*\d|[SsMmLl]$|[Xx][Ll]|[Xx]{1,2}[Ss]|[Nn][Bb])$/i;

/** Color token list. */
const COLOR_RE =
  /^(rot|blau|grün|gelb|schwarz|weiß|weiss|grau|beige|braun|rosa|lila|violett|mint|navy|marine|ecru|natur|natural|creme|sand|ocker|senf|koralle)$/i;

function inferLabel(
  topTokens: { token: string; count: number }[],
  isFixed: boolean,
  posIdx: number
): SlotLabel {
  const top = topTokens[0]?.token ?? "";

  if (isFixed) {
    if (posIdx === 0) {
      // Brand at position 0: capitalized, doesn't match German noun suffixes
      if (/^[A-ZÄÖÜ]/.test(top) && !PRODUCT_TYPE_RE.test(top)) return "Marke";
      return "Produkttyp";
    }
    // Subsequent fixed slot: likely a model name
    return "Modell";
  }

  const tokens = topTokens.slice(0, MAX_TOP_TOKENS).map(t => t.token);

  const variantCount = tokens.filter(t => VARIANT_RE.test(t)).length;
  if (variantCount >= Math.max(2, tokens.length * 0.45)) return "Größe/Variante";

  const colorCount = tokens.filter(t => COLOR_RE.test(t)).length;
  if (colorCount >= Math.max(2, tokens.length * 0.45)) return "Farbe";

  // Brand-like: starts uppercase, ≥ 4 chars, not a color
  const brandCount = tokens.filter(
    t => /^[A-ZÄÖÜ]/.test(t) && t.length >= 4 && !COLOR_RE.test(t) && !VARIANT_RE.test(t)
  ).length;
  if (brandCount >= Math.max(1, tokens.length * 0.5)) return "Marke";

  return "Attribut/Material";
}

// ── Family prefix ─────────────────────────────────────────────────────────────

function longestCommonPrefixWords(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  const tok = names.map(n => n.trim().split(/\s+/));
  const first = tok[0];
  let len = first.length;
  for (const t of tok.slice(1)) {
    let i = 0;
    while (i < len && i < t.length && first[i] === t[i]) i++;
    len = i;
    if (len === 0) break;
  }
  return first.slice(0, len).join(" ");
}

function buildFamilyMap(rows: PatternRow[]): Map<string, PatternRow[]> {
  const map = new Map<string, PatternRow[]>();
  for (const row of rows) {
    const vater = row.vaterartikel.trim();
    if (!vater || !row.artikelname.trim()) continue;
    const list = map.get(vater);
    if (list) list.push(row);
    else map.set(vater, [row]);
  }
  return map;
}

// ── Core analysis ─────────────────────────────────────────────────────────────

function analyzeWgPattern(warengruppe: string, names: string[]): Omit<WgPattern, "familyPatterns"> {
  const nonEmpty = names.filter(n => n.trim().length > 0);
  const sampleSize = nonEmpty.length;

  if (sampleSize < MIN_SAMPLE) {
    return {
      warengruppe, sampleSize, reliable: false,
      unreliableReason: `Nur ${sampleSize} Einträge (mindestens ${MIN_SAMPLE} benötigt)`,
      slots: [], patternTemplate: "", coverage: 0,
      examples: nonEmpty.slice(0, 3), outliers: [],
    };
  }

  const tokenized = nonEmpty.map(tokenize);
  const effectiveMaxLen = Math.min(MAX_SLOTS, Math.max(...tokenized.map(t => t.length)));

  // Build positional frequency maps
  const posFreq: Map<string, number>[] = Array.from({ length: effectiveMaxLen }, () => new Map());
  for (const tokens of tokenized) {
    tokens.slice(0, effectiveMaxLen).forEach((token, i) => {
      posFreq[i].set(token, (posFreq[i].get(token) ?? 0) + 1);
    });
  }

  // Build slots (only positions present in ≥ 30% of names)
  const slots: SlotInfo[] = posFreq
    .map((freq, i) => {
      const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
      const presenceCoverage = sorted.reduce((s, [, c]) => s + c, 0) / sampleSize;
      if (presenceCoverage < 0.3) return null;

      const topEntry = sorted[0];
      const dominantCoverage = topEntry ? topEntry[1] / sampleSize : 0;
      const isFixed = dominantCoverage >= FIXED_THRESHOLD;
      const topTokens = sorted.slice(0, MAX_TOP_TOKENS).map(([token, count]) => ({ token, count }));

      return {
        position: i,
        isFixed,
        topToken: topEntry?.[0] ?? "",
        presenceCoverage,
        dominantCoverage,
        topTokens,
        label: inferLabel(topTokens, isFixed, i),
      } satisfies SlotInfo;
    })
    .filter((s): s is SlotInfo => s !== null);

  const patternTemplate = slots.map(s => s.isFixed ? s.topToken : `[${s.label}]`).join(" ");

  // Coverage: fraction of names where all fixed slots match
  const fixedSlots = slots.filter(s => s.isFixed);
  const conforms = (idx: number) => {
    const tokens = tokenized[idx];
    return fixedSlots.every(slot => tokens[slot.position] === slot.topToken);
  };

  const examples: string[] = [];
  const outliers: string[] = [];
  nonEmpty.forEach((name, i) => {
    if (conforms(i)) examples.push(name);
    else outliers.push(name);
  });
  const coverage = examples.length / sampleSize;

  let reliable = fixedSlots.length > 0 && coverage >= COVERAGE_THRESHOLD;
  let unreliableReason: string | undefined;
  if (!reliable) {
    if (fixedSlots.length === 0)
      unreliableReason = "Kein dominantes Muster erkennbar — Namen sind sehr heterogen";
    else
      unreliableReason = `Muster deckt nur ${Math.round(coverage * 100)} % der Namen ab (Schwelle: ${Math.round(COVERAGE_THRESHOLD * 100)} %)`;
  }

  return {
    warengruppe, sampleSize, reliable, unreliableReason,
    slots, patternTemplate, coverage,
    examples: examples.slice(0, 3),
    outliers: outliers.slice(0, 5),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function analyzeAllPatterns(rows: PatternRow[]): Map<string, WgPattern> {
  // Group names by Warengruppe
  const wgNames = new Map<string, string[]>();
  for (const row of rows) {
    const wg = row.warengruppe.trim();
    if (!wg || !row.artikelname.trim()) continue;
    const list = wgNames.get(wg);
    if (list) list.push(row.artikelname.trim());
    else wgNames.set(wg, [row.artikelname.trim()]);
  }

  // Analyze each Warengruppe
  const patternMap = new Map<string, WgPattern>();
  for (const [wg, names] of wgNames) {
    patternMap.set(wg, { ...analyzeWgPattern(wg, names), familyPatterns: [] });
  }

  // Attach family prefix patterns per Warengruppe
  const familyMap = buildFamilyMap(rows);
  const familiesByWg = new Map<string, FamilyPrefixPattern[]>();

  for (const [vater, kindRows] of familyMap) {
    if (kindRows.length < MIN_FAMILY_SIZE) continue;
    const wg = kindRows[0].warengruppe.trim();
    const names = kindRows.map(r => r.artikelname.trim());
    const prefix = longestCommonPrefixWords(names);
    const fp: FamilyPrefixPattern = {
      vaterartikel: vater,
      sharedPrefix: prefix,
      kinderNames: names,
      variantParts: names.map(n => (prefix ? n.slice(prefix.length).trim() : n) || "(identisch)"),
    };
    const list = familiesByWg.get(wg);
    if (list) list.push(fp);
    else familiesByWg.set(wg, [fp]);
  }

  for (const [wg, families] of familiesByWg) {
    if (patternMap.has(wg)) {
      // Show largest families first
      patternMap.get(wg)!.familyPatterns = families
        .sort((a, b) => b.kinderNames.length - a.kinderNames.length)
        .slice(0, MAX_FAMILIES_SHOWN);
    }
  }

  return patternMap;
}

// ── AI batch helpers (client-side, called before API) ────────────────────────

/** Collapse variants under the same Vaterartikel to one representative per family. */
export function getRepresentativeNames(
  rows: PatternRow[],
  warengruppe: string,
  maxNames = 20
): string[] {
  const wgRows = rows.filter(r => r.warengruppe.trim() === warengruppe && r.artikelname.trim());
  const seenVaters = new Set<string>();
  const out: string[] = [];
  for (const row of wgRows) {
    if (out.length >= maxNames) break;
    const vater = row.vaterartikel.trim();
    if (vater) {
      if (seenVaters.has(vater)) continue;
      seenVaters.add(vater);
    }
    out.push(row.artikelname.trim());
  }
  return out;
}

/** Fast non-cryptographic hash used only as a cache key. */
export function hashStrings(strings: string[]): string {
  let h = 0;
  const s = strings.join("\n");
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

// ── Name suggestion ───────────────────────────────────────────────────────────

export interface NameSuggestionInputs {
  productType: string;
  material: string;
  brand: string;
}

export interface NameSuggestion {
  name: string;
  explanation: string;
  patternTemplate: string;
  coverage: number;
  sampleSize: number;
}

/**
 * Apply a raw AI pattern template string (e.g. "Schlafsack [Attribut/Material] [Marke]")
 * to user inputs — no API call needed.
 */
export function applyAiPatternLocally(
  template: string,
  inputs: NameSuggestionInputs
): string {
  const labelMap: Record<string, string> = {
    "marke": inputs.brand,
    "produkttyp": inputs.productType,
    "attribut/material": inputs.material,
    "attribut": inputs.material,
    "material": inputs.material,
    "modell": "",
    "größe/variante": "",
    "farbe": "",
    "variante": "",
  };

  return template
    .replace(/\[([^\]]+)\]/g, (_, label) => labelMap[label.toLowerCase()] ?? "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function suggestArtikelname(
  pattern: WgPattern,
  inputs: NameSuggestionInputs
): NameSuggestion | null {
  if (!pattern.reliable || pattern.slots.length === 0) return null;

  const parts: string[] = [];
  const trace: string[] = [];

  for (const slot of pattern.slots) {
    let placed = "";

    if (slot.isFixed) {
      if (slot.label === "Marke" && inputs.brand.trim()) {
        placed = inputs.brand.trim();
        trace.push(`Pos ${slot.position + 1}: Marke "${placed}"`);
      } else if (slot.label === "Produkttyp" && inputs.productType.trim()) {
        placed = inputs.productType.trim();
        trace.push(`Pos ${slot.position + 1}: Produkttyp "${placed}"`);
      } else {
        // Keep the fixed token from the pattern (consistent with convention)
        placed = slot.topToken;
        trace.push(`Pos ${slot.position + 1}: fest „${placed}"`);
      }
    } else {
      if (slot.label === "Marke" && inputs.brand.trim()) {
        placed = inputs.brand.trim();
        trace.push(`Pos ${slot.position + 1}: Marke "${placed}"`);
      } else if (slot.label === "Attribut/Material" && inputs.material.trim()) {
        placed = inputs.material.trim();
        trace.push(`Pos ${slot.position + 1}: Material "${placed}"`);
      } else if (slot.label === "Produkttyp" && inputs.productType.trim()) {
        placed = inputs.productType.trim();
        trace.push(`Pos ${slot.position + 1}: Produkttyp "${placed}"`);
      }
      // Größe/Variante and Farbe slots are skipped — those come from actual variant selection
    }

    if (placed) parts.push(placed);
  }

  if (parts.length === 0) return null;

  return {
    name: parts.join(" "),
    explanation: trace.join(" · "),
    patternTemplate: pattern.patternTemplate,
    coverage: pattern.coverage,
    sampleSize: pattern.sampleSize,
  };
}
