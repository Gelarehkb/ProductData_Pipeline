import { useState, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Upload, Download, Sparkles, FolderTree, Loader2, Database, Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { type Lang, t } from "@/lib/translations";
import { ImportDialog, type ImportTargetField } from "@/components/ImportDialog";
import { TextPreviewModal, type TextPreviewRow } from "@/components/TextPreviewModal";
import { CategoryPreviewModal, type CategoryPreviewRow } from "@/components/CategoryPreviewModal";
import { AIIdentifierPreviewModal, type AIIdentifierPreviewRow } from "@/components/AIIdentifierPreviewModal";
import {
  type ClothRow, getClothName, safe, toProperCase, stripForbiddenChars,
  mapColorToMerkmaleFarbe, mapSizeToMerkmaleGroesse, artikelnummerBuilder, buildRow,
} from "@/lib/gesamtExport";
import { parseJtlCatalogFile, type JtlCatalogRow } from "@/lib/jtlCatalogParser";

// This page reuses the same GESAMT export shape and the same backend AI
// routes as the main grid (Index.tsx), but sources Artikelnummer/Artikelname/HAN
// from an AI-naming step that learns from a real JTL export, instead of the
// hard-coded KURZL+Name+Color+Size formula / the user's own typed Name column.

async function apiFetch(fn: string, body: object): Promise<{ data: unknown; error: Error | null }> {
  try {
    const res = await fetch(`/api/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: new Error((data as any)?.error || `HTTP ${res.status}`) };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

const createEmptyRow = (): ClothRow => ({
  id: crypto.randomUUID(),
  Collection: "", ItemName: "", Measurement: "", InfoMaterial: "",
  WarenGruppe: "", color: "", Size: "", EAN: "", HAN: "", EK: "", VK: "", Menge: "",
  Description: "", MerkmaleGroesse: "", MerkmaleFarbe: "", MerkmaleArt: "",
});

const WARENGRUPPE_OPTIONS = [
  "Accessoires", "Care", "Deko", "Dienstleistungen", "Essen/Trinken", "Fahren", "Fahrräder",
  "Gutscheine", "Homeware", "KiWa", "KiWa Zubehör", "Kleidung Basics", "Kleidung Funktion",
  "Kleidung Mode", "Medien", "Möbel", "Schuhe", "Spielzeug Baby", "Spielzeug Kind",
  "Spielzeug Kleinkind", "Taschen", "Tragen",
];

const VERFUEGBARKEIT_OPTIONS = [
  "2 - 5 Werktage", "3 - 7 Werktage", "4 - 5 Werktage", "5 - 7 Werktage",
  "1 - 2 Wochen", "2 - 3 Wochen", "3 - 4 Wochen", "4 - 8 Wochen",
  "Derzeit nicht verfügbar", "Liefertermin auf Anfrage",
];

const MERKMALE_FARBE_OPTIONS = [
  "beige", "blau", "braun", "gelb", "grau", "grün", "mehrfärbig",
  "orange", "rosa", "rot", "schwarz", "türkis", "violett", "weiß",
];

const MERKMALE_GROESSE_MATCH_OPTIONS = [
  "50 cm (0M)", "62 cm (0-3M)", "68 cm (3-6M)", "74 cm (6-9M)", "80 cm (9-12M)",
  "86 cm (12-18M)", "92 cm (2J)", "98 cm (3J)", "104 cm (4J)", "110 cm (5J)",
  "116 cm (6J)", "120 cm (6J)", "128 cm (6J)",
  "T0 (0-1M)", "T1 (1-3M)", "T2 (6-12M)", "T3 (12-24M)", "T4 (36-48M)",
  "S1 (0-3M)", "S2 (3-6M)", "S3 (6-12M)", "S4 (12-24M)", "S5 (36-48M)",
];

type MatchTier = "warengruppe+hersteller" | "warengruppe" | "hersteller" | "none";

function buildNamingCandidates(row: ClothRow, catalog: JtlCatalogRow[], herstellerGlobal: string): { examples: JtlCatalogRow[]; matchTier: MatchTier } {
  const wg = (row.WarenGruppe || "").trim().toLowerCase();
  const hst = herstellerGlobal.trim().toLowerCase();

  const byWgHst = wg && hst ? catalog.filter(c => c.warengruppe.trim().toLowerCase() === wg && c.hersteller.trim().toLowerCase() === hst) : [];
  if (byWgHst.length > 0) return { examples: byWgHst.slice(0, 5), matchTier: "warengruppe+hersteller" };

  const byWg = wg ? catalog.filter(c => c.warengruppe.trim().toLowerCase() === wg) : [];
  if (byWg.length > 0) return { examples: byWg.slice(0, 5), matchTier: "warengruppe" };

  const byHst = hst ? catalog.filter(c => c.hersteller.trim().toLowerCase() === hst) : [];
  if (byHst.length > 0) return { examples: byHst.slice(0, 5), matchTier: "hersteller" };

  return { examples: [], matchTier: "none" };
}

const COLUMNS: { key: keyof ClothRow; label: string; width: string }[] = [
  { key: "Collection", label: "Kollektion", width: "110px" },
  { key: "ItemName", label: "Name", width: "160px" },
  { key: "Measurement", label: "Maß", width: "80px" },
  { key: "InfoMaterial", label: "Info/Material", width: "110px" },
  { key: "WarenGruppe", label: "WarenGruppe", width: "140px" },
  { key: "color", label: "Farbe", width: "100px" },
  { key: "Size", label: "Größe", width: "70px" },
  { key: "EAN", label: "EAN", width: "120px" },
  { key: "HAN", label: "HAN", width: "100px" },
  { key: "EK", label: "EK", width: "70px" },
  { key: "VK", label: "VK", width: "70px" },
  { key: "Menge", label: "Menge", width: "70px" },
  { key: "MerkmaleGroesse", label: "M. Größe", width: "120px" },
  { key: "MerkmaleArt", label: "M. Art", width: "120px" },
  { key: "MerkmaleFarbe", label: "M. Farbe", width: "100px" },
  { key: "Description", label: "Beschreibung", width: "180px" },
];

const Smart = () => {
  const { toast } = useToast();
  const [lang, setLang] = useState<Lang>("DE");

  const [rows, setRows] = useState<ClothRow[]>([]);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // ── Toolbar globals — same defaults/roles as Index.tsx, applied uniformly at export ──
  const [kurzl, setKurzl] = useState("");
  const [hersteller, setHersteller] = useState("");
  const [lieferant, setLieferant] = useState("");
  const [auf, setAuf] = useState("2");
  const [ab, setAb] = useState("1");
  const [aufSe, setAufSe] = useState("");
  const [seasonalCode, setSeasonalCode] = useState("");
  const [lieferzeit, setLieferzeit] = useState("14");
  const [verfuegbarkeit, setVerfuegbarkeit] = useState("3 - 5 Werktage");
  const [ekDiscount, setEkDiscount] = useState("");
  const [vaterstat, setVaterstat] = useState(false);

  // ── JTL reference catalog ──────────────────────────────────────────────────
  const jtlFileInputRef = useRef<HTMLInputElement>(null);
  const [jtlCatalogRows, setJtlCatalogRows] = useState<JtlCatalogRow[]>([]);
  const [jtlCatalogFileName, setJtlCatalogFileName] = useState("");
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);

  // ── Classification ─────────────────────────────────────────────────────────
  const [isClassifying, setIsClassifying] = useState(false);

  // ── AI naming ──────────────────────────────────────────────────────────────
  const [isGeneratingNames, setIsGeneratingNames] = useState(false);
  const [namingPreviewOpen, setNamingPreviewOpen] = useState(false);
  const [namingPreviewRows, setNamingPreviewRows] = useState<AIIdentifierPreviewRow[]>([]);
  const [namingSuggestions, setNamingSuggestions] = useState<Record<string, AIIdentifierPreviewRow>>({});

  // ── Category mapping ───────────────────────────────────────────────────────
  const [isMapping, setIsMapping] = useState(false);
  const [categoryPreviewOpen, setCategoryPreviewOpen] = useState(false);
  const [categoryPreviewRows, setCategoryPreviewRows] = useState<CategoryPreviewRow[]>([]);
  const [confirmedCategories, setConfirmedCategories] = useState<Record<string, string[]>>({});
  const [categoryArtikelToName, setCategoryArtikelToName] = useState<Record<string, string>>({});

  // ── Text generation ────────────────────────────────────────────────────────
  const [isGeneratingTexts, setIsGeneratingTexts] = useState(false);
  const [textPreviewOpen, setTextPreviewOpen] = useState(false);
  const [textPreviewRows, setTextPreviewRows] = useState<TextPreviewRow[]>([]);
  const [confirmedTexts, setConfirmedTexts] = useState<Record<string, { produkttext: string; Title_Tag: string; html_de: string; meta_description: string; suchbegriffe: string }>>({});

  const filledCount = useMemo(() => rows.filter(r => getClothName(r).trim() !== "").length, [rows]);

  // ── Row editing ────────────────────────────────────────────────────────────
  const handleCellChange = (id: string, field: keyof ClothRow, value: string) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  };
  const addRow = () => setRows(prev => [...prev, createEmptyRow()]);
  const deleteRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id));
  const clearAll = () => {
    setRows([]);
    setJtlCatalogRows([]);
    setJtlCatalogFileName("");
    setNamingSuggestions({});
    setConfirmedCategories({});
    setCategoryArtikelToName({});
    setConfirmedTexts({});
  };

  const handleImportRows = (imported: Partial<Record<ImportTargetField, string>>[]) => {
    if (imported.length === 0) return;
    const built = imported.map(item => ({
      ...createEmptyRow(),
      ItemName: item.ItemName ?? "",
      color: item.color ?? "",
      Size: item.Size ?? "",
      EAN: item.EAN ?? "",
      HAN: item.HAN ?? "",
      EK: (item.EK ?? "").replace(/\./g, ","),
      VK: (item.VK ?? "").replace(/\./g, ","),
      Menge: item.Menge ?? "",
      Collection: item.Collection ?? "",
      Measurement: item.Measurement ?? "",
      InfoMaterial: item.InfoMaterial ?? "",
      Description: item.Description ?? "",
    }));
    setRows(prev => [...prev, ...built]);
    toast({ title: lang === "DE" ? "Bestellung importiert" : "Order imported", description: `${imported.length} ${lang === "DE" ? "Zeilen" : "rows"}` });
  };

  const handleJtlCatalogUpload = async (file: File) => {
    setIsLoadingCatalog(true);
    setJtlCatalogFileName(file.name);
    try {
      const parsed = await parseJtlCatalogFile(file);
      setJtlCatalogRows(parsed);
      toast({
        title: lang === "DE" ? "JTL-Export geladen" : "JTL export loaded",
        description: `${parsed.length} ${lang === "DE" ? "Referenz-Artikel" : "reference items"}`,
      });
    } catch (err) {
      console.error(err);
      toast({ title: lang === "DE" ? "Fehler beim Lesen" : "Read error", description: String(err), variant: "destructive" });
      setJtlCatalogFileName("");
    } finally {
      setIsLoadingCatalog(false);
    }
  };

  // ── Step 1: AI classification (same rules/endpoint as Index.tsx) ────────────
  const handleAIClassify = async () => {
    const filledRows = rows.filter(r => getClothName(r).trim() !== "");
    if (filledRows.length === 0) {
      toast({ title: t("noData", lang), description: t("noDataDesc", lang), variant: "destructive" });
      return;
    }
    setIsClassifying(true);
    try {
      const itemNames = filledRows.map(r => [getClothName(r), r.color].filter(Boolean).join(" ").trim());
      const itemSizes = filledRows.map(r => r.Size || "");

      const { data, error } = await apiFetch("classify-products", { items: itemNames, sizes: itemSizes });
      if (error) throw error;
      const anyData = data as any;
      if (anyData?.error) {
        if (anyData.error.includes("Rate limit")) {
          toast({ title: t("rateLimit", lang), description: t("rateLimitDesc", lang), variant: "destructive" });
        } else if (anyData.error.includes("Payment")) {
          toast({ title: t("paymentIssue", lang), description: t("paymentIssueDesc", lang), variant: "destructive" });
        } else {
          throw new Error(anyData.error);
        }
        return;
      }
      const classifications = anyData?.classifications;
      if (!Array.isArray(classifications)) throw new Error("Invalid response");

      setRows(prev => {
        const next = [...prev];
        let idx = 0;
        next.forEach((row, i) => {
          if (getClothName(row).trim() !== "" && idx < classifications.length) {
            const c = classifications[idx];
            next[i] = {
              ...row,
              WarenGruppe: c.warengruppe || row.WarenGruppe,
              MerkmaleFarbe: c.farbe || mapColorToMerkmaleFarbe(row.color, MERKMALE_FARBE_OPTIONS) || row.MerkmaleFarbe || "",
              MerkmaleArt: c.art || row.MerkmaleArt || "",
              MerkmaleGroesse: c.groesse || mapSizeToMerkmaleGroesse(row.Size, MERKMALE_GROESSE_MATCH_OPTIONS) || row.MerkmaleGroesse || "",
            };
            idx++;
          }
        });
        return next;
      });
      toast({ title: t("classifyDone", lang), description: `${classifications.length} ${t("classifyDoneDesc", lang)}` });
    } catch (err) {
      console.error("Classification error:", err);
      toast({ title: t("classifyError", lang), description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setIsClassifying(false);
    }
  };

  // ── Step 2: AI naming — match similar JTL rows, generate, confirm ───────────
  const handleGenerateNames = async () => {
    const filledRows = rows.filter(r => getClothName(r).trim() !== "");
    if (filledRows.length === 0) {
      toast({ title: t("noData", lang), description: t("noDataDesc", lang), variant: "destructive" });
      return;
    }
    if (jtlCatalogRows.length === 0) {
      toast({
        title: lang === "DE" ? "Kein JTL-Export geladen" : "No JTL export loaded",
        description: lang === "DE" ? "Bitte zuerst den JTL-Export hochladen." : "Please upload the JTL export first.",
        variant: "destructive",
      });
      return;
    }

    const groups: Record<string, ClothRow[]> = {};
    filledRows.forEach(r => {
      const key = `${safe(getClothName(r))}|${safe(r.color)}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    const groupEntries = Object.entries(groups);

    const candidatesByKey: Record<string, { examples: JtlCatalogRow[]; matchTier: MatchTier }> = {};
    groupEntries.forEach(([key, groupRows]) => {
      candidatesByKey[key] = buildNamingCandidates(groupRows[0], jtlCatalogRows, hersteller);
    });

    const toQuery = groupEntries.filter(([key]) => candidatesByKey[key].matchTier !== "none");
    const noMatch = groupEntries.filter(([key]) => candidatesByKey[key].matchTier === "none");

    setIsGeneratingNames(true);
    try {
      const previewRows: AIIdentifierPreviewRow[] = [];

      noMatch.forEach(([key, groupRows]) => {
        const r0 = groupRows[0];
        const [name, color] = key.split("|");
        const wg = r0.WarenGruppe || "";
        previewRows.push({
          id: key,
          originalName: name, color, size: r0.Size || "", warengruppe: wg, hersteller,
          suggestedArtikelnummer: artikelnummerBuilder(kurzl, getClothName(r0), color, "", wg, seasonalCode),
          suggestedArtikelname: toProperCase(getClothName(r0)),
          suggestedHan: r0.HAN || "",
          matchTier: "none",
          exampleArtikelnummern: [],
        });
      });

      const CHUNK = 20;
      for (let i = 0; i < toQuery.length; i += CHUNK) {
        const chunk = toQuery.slice(i, i + CHUNK);
        const items = chunk.map(([key, groupRows]) => {
          const r0 = groupRows[0];
          const cand = candidatesByKey[key];
          return {
            id: key,
            itemName: r0.ItemName, collection: r0.Collection, measurement: r0.Measurement, infoMaterial: r0.InfoMaterial,
            color: r0.color, size: r0.Size, warengruppe: r0.WarenGruppe, hersteller,
            examples: cand.examples.map(e => ({ artikelnummer: e.artikelnummer, artikelname: e.artikelname, han: e.han })),
            matchTier: cand.matchTier,
          };
        });

        const { data, error } = await apiFetch("generate-naming", { items });
        if (error) throw error;
        const anyData = data as any;
        if (anyData?.error) throw new Error(anyData.error);
        const results: { id: string; artikelnummer: string; artikelname: string; han: string; confidence: string }[] = anyData?.results || [];

        chunk.forEach(([key, groupRows], idx) => {
          const r0 = groupRows[0];
          const [name, color] = key.split("|");
          const cand = candidatesByKey[key];
          const wg = r0.WarenGruppe || "";
          const result = results.find(r => r.id === key) || results[idx];
          previewRows.push({
            id: key,
            originalName: name, color, size: r0.Size || "", warengruppe: wg, hersteller,
            suggestedArtikelnummer: result?.artikelnummer || artikelnummerBuilder(kurzl, getClothName(r0), color, "", wg, seasonalCode),
            suggestedArtikelname: result?.artikelname || toProperCase(getClothName(r0)),
            suggestedHan: result?.han || r0.HAN || "",
            matchTier: cand.matchTier,
            exampleArtikelnummern: cand.examples.map(e => e.artikelnummer),
          });
        });
      }

      setNamingPreviewRows(previewRows);
      setNamingPreviewOpen(true);
    } catch (err) {
      console.error("generate-naming failed:", err);
      toast({
        title: lang === "DE" ? "Namensgenerierung fehlgeschlagen" : "Naming generation failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setIsGeneratingNames(false);
    }
  };

  const handleNamingConfirm = (confirmedRows: AIIdentifierPreviewRow[]) => {
    setNamingSuggestions(prev => {
      const next = { ...prev };
      confirmedRows.forEach(r => { next[r.id] = r; });
      return next;
    });
    toast({
      title: lang === "DE" ? "Namen übernommen" : "Naming applied",
      description: `${confirmedRows.length} ${lang === "DE" ? "Produkte" : "products"}`,
    });
  };

  // Resolves the base SKU (no size) for a group, from a confirmed AI suggestion
  // if one exists, falling back to today's formula otherwise.
  const resolveSkuBase = (row: ClothRow, color: string): string => {
    const key = `${safe(getClothName(row))}|${safe(color)}`;
    const suggestion = namingSuggestions[key];
    const wg = row.WarenGruppe || "";
    return suggestion?.suggestedArtikelnummer?.trim()
      || artikelnummerBuilder(kurzl, getClothName(row), color, "", wg, seasonalCode);
  };
  const resolveSku = (row: ClothRow, color: string, size: string): string => {
    const key = `${safe(getClothName(row))}|${safe(color)}`;
    const suggestion = namingSuggestions[key];
    if (suggestion?.suggestedArtikelnummer?.trim()) {
      const base = suggestion.suggestedArtikelnummer.trim();
      return size ? `${base} ${stripForbiddenChars(size).toUpperCase()}` : base;
    }
    const wg = row.WarenGruppe || "";
    return artikelnummerBuilder(kurzl, getClothName(row), color, size, wg, seasonalCode);
  };
  const resolveArtikelname = (row: ClothRow, color: string): string => {
    const key = `${safe(getClothName(row))}|${safe(color)}`;
    return namingSuggestions[key]?.suggestedArtikelname?.trim() || getClothName(row);
  };
  const resolveHan = (row: ClothRow, color: string): string => {
    const key = `${safe(getClothName(row))}|${safe(color)}`;
    return namingSuggestions[key]?.suggestedHan?.trim() || safe(row.HAN) || "";
  };

  // ── Step 3: Category mapping (same rules/endpoint as Index.tsx) ─────────────
  const handleCategoryMapping = async () => {
    const filledRows = rows.filter(r => getClothName(r).trim() !== "");
    if (filledRows.length === 0) {
      toast({ title: t("noData", lang), description: t("noDataDesc", lang), variant: "destructive" });
      return;
    }

    const vkByName: Record<string, number> = {};
    filledRows.forEach(r => {
      const n = getClothName(r);
      if (!n) return;
      const raw = String(r.VK ?? "").replace(",", ".").replace(/[^\d.\-]/g, "");
      const vk = parseFloat(raw);
      if (!isNaN(vk)) {
        if (!(n in vkByName) || vk > vkByName[n]) vkByName[n] = vk;
      } else if (!(n in vkByName)) {
        vkByName[n] = 0;
      }
    });

    const nameGroups: Record<string, { first: ClothRow; variants: { artnr: string; han: string; barcode: string }[] }> = {};
    const artikelToName: Record<string, string> = {};
    filledRows.forEach(r => {
      const name = getClothName(r).trim();
      if (!name) return;
      const artnr = resolveSkuBase(r, r.color || "");
      if (!nameGroups[name]) nameGroups[name] = { first: r, variants: [] };
      if (!nameGroups[name].variants.find(v => v.artnr === artnr)) {
        nameGroups[name].variants.push({ artnr, han: r.HAN || "", barcode: r.EAN || "" });
      }
      artikelToName[artnr] = name;
    });

    if (vaterstat) {
      Object.keys(nameGroups).forEach(name => {
        const { first, variants } = nameGroups[name];
        if (variants.length > 1) {
          const vaterArtnr = resolveSkuBase(first, first.color || "");
          artikelToName[vaterArtnr] = name;
        }
      });
    }
    setCategoryArtikelToName(prev => ({ ...prev, ...artikelToName }));

    const priceSkipped: string[] = [];
    const priceEligible = Object.keys(nameGroups).filter(name => {
      const ok = (vkByName[name] ?? 0) >= 19;
      if (!ok) priceSkipped.push(name);
      return ok;
    });

    const alreadyConfirmed: string[] = [];
    const needsClassification = priceEligible.filter(name => {
      if (confirmedCategories[name]?.length) { alreadyConfirmed.push(name); return false; }
      return true;
    });

    const wgArtMap = new Map<string, string>();
    const toClassify: string[] = [];
    const reuseFrom: Record<string, string> = {};
    needsClassification.forEach(name => {
      const { first } = nameGroups[name];
      const wg = (first.WarenGruppe || "").trim();
      const art = (first.MerkmaleArt || "").trim();
      const wgArtKey = `${wg}|${art}`;
      if (wg && art && wgArtMap.has(wgArtKey)) {
        reuseFrom[name] = wgArtMap.get(wgArtKey)!;
      } else {
        if (wg && art) wgArtMap.set(wgArtKey, name);
        toClassify.push(name);
      }
    });

    const callsMade = toClassify.length;
    const reuseCount = Object.keys(reuseFrom).length;
    const priceSkippedCount = priceSkipped.length;
    const confirmedReuseCount = alreadyConfirmed.length;

    if (callsMade === 0 && reuseCount === 0 && confirmedReuseCount === 0) {
      toast({ title: lang === "DE" ? "Keine Produkte" : "No products", description: lang === "DE" ? "Alle Produkte wurden übersprungen (VK<19 oder bereits bestätigt)" : "All products skipped (VK<19 or already confirmed)" });
      return;
    }

    setIsMapping(true);
    try {
      const generatedCategoryMap: Record<string, string[]> = { ...confirmedCategories };

      if (toClassify.length > 0) {
        const items = toClassify.map(name => {
          const { first } = nameGroups[name];
          const wg = first.WarenGruppe || "";
          const artnr = resolveSkuBase(first, first.color || "");
          return {
            artikelnummer: artnr,
            artikelname: name,
            farbe: first.color || "",
            hersteller: hersteller.trim(),
            warengruppe: wg,
            art: first.MerkmaleArt || "",
            beschreibung: first.Description || "",
          };
        });
        const { data, error } = await apiFetch("map-categories", { items });
        if (error) throw error;
        const anyData = data as any;
        if (anyData?.error) throw new Error(anyData.error);
        const results: { artikelnummer: string; categoryPaths: string[] }[] = anyData.results;
        toClassify.forEach((name, i) => {
          generatedCategoryMap[name] = (results[i]?.categoryPaths || []).map(p => p.trim()).filter(Boolean);
        });
      }

      Object.entries(reuseFrom).forEach(([dst, src]) => {
        generatedCategoryMap[dst] = generatedCategoryMap[src] || [];
      });

      toast({
        title: lang === "DE" ? "Kategorien klassifiziert" : "Categories classified",
        description: lang === "DE"
          ? `${callsMade} KI-Aufrufe · ${reuseCount} Typ-Reuse · ${confirmedReuseCount} bereits bestätigt · ${priceSkippedCount} übersprungen (VK<19)`
          : `${callsMade} AI calls · ${reuseCount} type-reuse · ${confirmedReuseCount} already confirmed · ${priceSkippedCount} skipped (VK<19)`,
      });

      const previewRows: CategoryPreviewRow[] = [];
      priceEligible.forEach(name => {
        const { variants } = nameGroups[name];
        const categoryPaths = generatedCategoryMap[name] || [];
        variants.forEach(({ artnr, han, barcode }) => {
          previewRows.push({ id: crypto.randomUUID(), artikelnummer: artnr, han, barcode, categoryPaths: [...categoryPaths] });
        });
      });
      setCategoryPreviewRows(previewRows);
      setCategoryPreviewOpen(true);
    } catch (err) {
      toast({ title: lang === "DE" ? "Fehler" : "Error", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setIsMapping(false);
    }
  };

  const exportCategoryCSV = (confirmedRows: CategoryPreviewRow[]) => {
    const escSemi = (v: string) => (v.includes(";") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v);
    const csvRows: string[][] = [];
    let maxDepth = 0;
    confirmedRows.forEach(r => {
      (r.categoryPaths || []).forEach(path => {
        const trimmed = path.trim();
        if (!trimmed) return;
        const parts = trimmed.split(" -> ").map(p => p.trim()).filter(Boolean);
        maxDepth = Math.max(maxDepth, parts.length);
        for (let depth = 1; depth <= parts.length; depth++) {
          csvRows.push([r.artikelnummer, r.han || "", r.barcode || "", ...parts.slice(0, depth)]);
        }
      });
    });
    if (csvRows.length === 0) {
      toast({ title: lang === "DE" ? "Keine Kategorien" : "No categories", variant: "destructive" });
      return;
    }
    const totalCols = 3 + maxDepth;
    const headers = ["Artikelnummer", "HAN", "Barcode", ...Array.from({ length: maxDepth }, (_, i) => `cat${i + 1}`)];
    const lines = [
      headers.map(escSemi).join(";"),
      ...csvRows.map(row => {
        const padded = [...row];
        while (padded.length < totalCols) padded.push("");
        return padded.map(escSemi).join(";");
      }),
    ];
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, "0")}${String(today.getMonth() + 1).padStart(2, "0")}${today.getFullYear()}`;
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kurzl || "smart"}_kategorien_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: lang === "DE" ? "Kategorien exportiert" : "Categories exported", description: `${confirmedRows.length} ${lang === "DE" ? "Produkte" : "products"}` });
  };

  const handleCategoryConfirm = (confirmedRows: CategoryPreviewRow[]) => {
    const updated: Record<string, string[]> = { ...confirmedCategories };
    confirmedRows.forEach(r => {
      const name = categoryArtikelToName[r.artikelnummer];
      if (name) updated[name] = r.categoryPaths;
    });
    setConfirmedCategories(updated);
    exportCategoryCSV(confirmedRows);
  };

  // ── Step 4: Text generation (unchanged rules/endpoints) ──────────────────────
  const handleGenerateTexts = async () => {
    const filledRows = rows.filter(r => getClothName(r).trim() !== "");
    if (filledRows.length === 0) {
      toast({ title: t("noData", lang), description: t("noDataDesc", lang), variant: "destructive" });
      return;
    }
    const vkByName: Record<string, number> = {};
    rows.forEach(r => {
      const n = getClothName(r);
      if (!n) return;
      const raw = String(r.VK ?? "").replace(",", ".").replace(/[^\d.\-]/g, "");
      const vk = parseFloat(raw);
      if (!isNaN(vk)) {
        if (!(n in vkByName) || vk > vkByName[n]) vkByName[n] = vk;
      } else if (!(n in vkByName)) {
        vkByName[n] = 0;
      }
    });

    const seen = new Set<string>();
    const allItems: { artikelname: string; han: string; markenname: string; beschreibung: string; warengruppe: string; art: string; infoMaterial: string; _name: string }[] = [];
    rows.forEach(r => {
      const _name = getClothName(r);
      if (!_name || seen.has(_name)) return;
      seen.add(_name);
      allItems.push({
        artikelname: toProperCase(_name),
        han: safe(r.HAN),
        markenname: hersteller.trim(),
        beschreibung: safe(r.Description),
        warengruppe: safe(r.WarenGruppe),
        art: safe(r.MerkmaleArt),
        infoMaterial: safe(r.InfoMaterial),
        _name,
      });
    });

    const priceSkipped: string[] = [];
    const priceEligible = allItems.filter(it => {
      const ok = (vkByName[it._name] ?? 0) >= 19;
      if (!ok) priceSkipped.push(it._name);
      return ok;
    });

    const descMap = new Map<string, typeof priceEligible[number]>();
    const toGenerate: typeof priceEligible = [];
    const reuseFrom: Record<string, string> = {};
    priceEligible.forEach(it => {
      const key = (it.beschreibung || "").trim().toLowerCase();
      if (key && descMap.has(key)) {
        reuseFrom[it._name] = descMap.get(key)!._name;
      } else {
        if (key) descMap.set(key, it);
        toGenerate.push(it);
      }
    });

    const callsMade = toGenerate.length;
    const reuseCount = Object.keys(reuseFrom).length;
    const priceSkippedCount = priceSkipped.length;
    const generatedMap: Record<string, { produkttext: string; Title_Tag: string; html_de: string; meta_description: string; suchbegriffe: string }> = {};

    setIsGeneratingTexts(true);
    try {
      if (toGenerate.length > 0) {
        const COMPLEX_WG = new Set(["KiWa", "Möbel"]);
        const isComplex = (it: typeof toGenerate[number]) => COMPLEX_WG.has((it.warengruppe || "").trim()) || /Autositz/i.test(it.art || "");
        const isClothing = (it: typeof toGenerate[number]) => {
          const wg = (it.warengruppe || "").trim().toLowerCase();
          return wg.includes("kleidung") || wg === "accessoires";
        };
        const clothingItems = toGenerate.filter(isClothing);
        const nonClothing = toGenerate.filter(it => !isClothing(it));
        const complexItems = nonClothing.filter(isComplex);
        const simpleItems = nonClothing.filter(it => !isComplex(it));

        const invokeBatch = async (fn: string, batch: typeof toGenerate) => {
          if (batch.length === 0) return;
          const { data, error } = await apiFetch(fn, { items: batch.map(({ _name, ...rest }) => rest) });
          if (error) throw error;
          const results = (data as any)?.results;
          if (Array.isArray(results)) {
            batch.forEach((it, i) => {
              const res = results[i];
              if (res && !("error" in res)) {
                generatedMap[it._name] = {
                  produkttext: res.produkttext || "",
                  Title_Tag: res.Title_Tag || "",
                  html_de: res.html_de || "",
                  meta_description: res.meta_description || "",
                  suchbegriffe: res.suchbegriffe || "",
                };
              }
            });
          }
        };

        await Promise.all([
          invokeBatch("generate-online-texts-simple", simpleItems),
          invokeBatch("generate-online-texts-complex", complexItems),
          invokeBatch("generate-online-texts-clothing", clothingItems),
        ]);
      }

      Object.entries(reuseFrom).forEach(([dst, src]) => {
        const srcTx = generatedMap[src];
        if (!srcTx) return;
        const srcName = toProperCase(src);
        const dstName = toProperCase(dst);
        const swap = (s: string) => (s && srcName ? s.split(srcName).join(dstName) : s);
        generatedMap[dst] = {
          produkttext: swap(srcTx.produkttext),
          Title_Tag: swap(srcTx.Title_Tag),
          html_de: swap(srcTx.html_de),
          meta_description: swap(srcTx.meta_description),
          suchbegriffe: swap(srcTx.suchbegriffe),
        };
      });

      toast({
        title: lang === "DE" ? "KI-Aufrufe" : "AI calls",
        description: lang === "DE"
          ? `${callsMade} generiert · ${reuseCount} wiederverwendet · ${priceSkippedCount} übersprungen (VK<19)`
          : `${callsMade} generated · ${reuseCount} reused · ${priceSkippedCount} skipped (VK<19)`,
      });

      const previewMap = { ...confirmedTexts, ...generatedMap };
      const empty = { produkttext: "", Title_Tag: "", html_de: "", meta_description: "", suchbegriffe: "" };
      const preview: TextPreviewRow[] = allItems.map(it => ({ id: it._name, name: it._name, ...(previewMap[it._name] || empty) }));
      setTextPreviewRows(preview);
      setTextPreviewOpen(true);
    } catch (err) {
      console.error("generate-online-texts failed:", err);
      toast({ title: lang === "DE" ? "Textgenerierung fehlgeschlagen" : "Text generation failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setIsGeneratingTexts(false);
    }
  };

  // ── Step 5: Final GESAMT export ───────────────────────────────────────────────
  const processAndDownload = () => {
    const AufAB = parseInt(ab) || 1;
    const AufAuf = parseInt(auf) || 2;
    const AufSe = aufSe;
    const Lieferstatus = verfuegbarkeit || "3 - 5 Werktage";
    const LieferzeitVal = parseInt(lieferzeit) || 14;

    const ekDiscountPct = parseFloat(ekDiscount.replace(",", "."));
    const applyDiscount = (raw: string): string => {
      if (isNaN(ekDiscountPct) || ekDiscountPct <= 0 || ekDiscountPct > 100) return raw;
      const n = parseFloat((raw || "").replace(",", "."));
      if (isNaN(n)) return raw;
      return (n * (1 - ekDiscountPct / 100)).toFixed(2).replace(".", ",");
    };

    const groups: Record<string, ClothRow[]> = {};
    rows.forEach(row => {
      const key = `${safe(getClothName(row))}|${safe(row.color)}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    });

    const outputRows: Record<string, string | number>[] = [];

    Object.entries(groups).forEach(([key, groupRows]) => {
      const [name, color] = key.split("|");
      if (!name && !color) return;

      const sizes = [...new Set(groupRows.map(r => safe(r.Size)))];
      const hasParent = vaterstat && sizes.length > 1;
      const exportName = resolveArtikelname(groupRows[0], color);

      const unionMulti = (field: "MerkmaleGroesse" | "MerkmaleArt" | "MerkmaleFarbe") => {
        const set = new Set<string>();
        groupRows.forEach(r => {
          (r[field] || "").split(",").map(v => v.trim()).filter(Boolean).forEach(v => set.add(v));
        });
        return [...set].join(", ");
      };
      const parentGroesse = unionMulti("MerkmaleGroesse");
      const parentArt = unionMulti("MerkmaleArt");
      const parentFarbe = unionMulti("MerkmaleFarbe");

      const tx = confirmedTexts[name] || { produkttext: "", Title_Tag: "", html_de: "", meta_description: "", suchbegriffe: "" };

      if (hasParent) {
        const firstRowWarengruppe = groupRows[0]?.WarenGruppe || "";
        const vaterArtikelnummer = resolveSku(groupRows[0], color, "");
        const toNum = (v: string) => { const n = parseFloat((v || "").replace(",", ".")); return isNaN(n) ? Infinity : n; };
        const eks = groupRows.map(r => ({ raw: r.EK || "", num: toNum(r.EK || "") })).filter(x => isFinite(x.num));
        const vks = groupRows.map(r => ({ raw: r.VK || "", num: toNum(r.VK || "") })).filter(x => isFinite(x.num));
        const minEK = eks.length ? eks.reduce((a, b) => a.num <= b.num ? a : b).raw : "";
        const minVK = vks.length ? vks.reduce((a, b) => a.num <= b.num ? a : b).raw : "";
        outputRows.push(buildRow(
          vaterArtikelnummer, "", exportName, "", color, "", "Vater", applyDiscount(minEK), minVK, hersteller,
          AufAB, AufAuf, AufSe, Lieferstatus, LieferzeitVal, "", lieferant, firstRowWarengruppe, exportName,
          parentGroesse, parentArt, parentFarbe, "",
          tx.produkttext, tx.Title_Tag, tx.html_de, tx.meta_description, tx.suchbegriffe
        ));
      }

      groupRows.forEach(r => {
        const wg = r.WarenGruppe || "";
        const artikelnummer = resolveSku(r, color, r.Size);
        const hanVal = resolveHan(r, color);
        const rowGroesse = (r.MerkmaleGroesse || "").split(",").map(v => v.trim()).filter(Boolean).join(", ");
        const rowArt = (r.MerkmaleArt || "").split(",").map(v => v.trim()).filter(Boolean).join(", ");
        const rowFarbe = (r.MerkmaleFarbe || "").split(",").map(v => v.trim()).filter(Boolean).join(", ");
        outputRows.push(buildRow(
          artikelnummer,
          hasParent ? resolveSku(groupRows[0], color, "") : "",
          exportName,
          r.Size,
          color,
          safe(r.EAN) || "",
          hanVal,
          applyDiscount(r.EK),
          r.VK,
          hersteller,
          AufAB, AufAuf, AufSe, Lieferstatus, LieferzeitVal, r.Menge, lieferant,
          r.WarenGruppe || "",
          exportName,
          rowGroesse, rowArt, rowFarbe,
          safe(r.Description),
          tx.produkttext, tx.Title_Tag, tx.html_de, tx.meta_description, tx.suchbegriffe
        ));
      });
    });

    if (outputRows.length === 0) {
      toast({ title: t("noData", lang), description: t("noDataDesc", lang), variant: "destructive" });
      return;
    }

    const headers = Object.keys(outputRows[0]);
    const escCsv = (v: any) => {
      if (v === null || v === undefined) return "";
      let s = typeof v === "number" ? String(v).replace(".", ",") : String(v);
      s = s.replace(/\r\n|\r|\n/g, " ").replace(/\s+/g, " ").trim();
      if (/[";]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const csvContent = [
      headers.map(escCsv).join(";"),
      ...outputRows.map(row => headers.map(h => escCsv(row[h])).join(";")),
    ].join("\r\n");

    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, "0")}${String(today.getMonth() + 1).padStart(2, "0")}${today.getFullYear()}`;
    const blob = new Blob(["﻿" + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kurzl || "smart"}_artikelanlegen_GESAMT_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
              {lang === "DE" ? "Zurück" : "Back"}
            </a>
            <h1 className="text-2xl font-bold text-foreground">Smart</h1>
            <span className="text-xs text-muted-foreground">
              {lang === "DE" ? "KI-Namensgenerierung aus bestehendem JTL-Export" : "AI naming from an existing JTL export"}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLang(lang === "DE" ? "EN" : "DE")}>{lang}</Button>
        </div>

        {/* ── Uploads ────────────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-lg px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setImportDialogOpen(true)}>
            <Upload className="h-4 w-4" />
            {lang === "DE" ? "Neue Bestellung importieren" : "Import new order"}
          </Button>

          <input
            ref={jtlFileInputRef}
            type="file"
            accept=".csv,.txt,.tsv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleJtlCatalogUpload(f); e.target.value = ""; }}
          />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => jtlFileInputRef.current?.click()} disabled={isLoadingCatalog}>
            <Database className="h-4 w-4" />
            {isLoadingCatalog ? "..." : (lang === "DE" ? "JTL-Export laden" : "Load JTL export")}
          </Button>
          {jtlCatalogFileName && (
            <span className="text-xs text-muted-foreground">
              {jtlCatalogFileName} — {jtlCatalogRows.length} {lang === "DE" ? "Referenz-Artikel" : "reference items"}
            </span>
          )}

          <div className="h-5 w-px bg-border mx-1" />
          <span className="text-xs text-muted-foreground">{filledCount} {lang === "DE" ? "Produkte" : "products"}</span>
          <Button variant="ghost" size="sm" className="gap-1.5 text-destructive" onClick={clearAll}>
            <Trash2 className="h-4 w-4" />
            {lang === "DE" ? "Daten leeren" : "Clear data"}
          </Button>
        </div>

        {/* ── Toolbar globals ────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-lg px-4 py-3 mb-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t("kurzl", lang)}</Label>
            <Input value={kurzl} onChange={e => setKurzl(e.target.value)} className="h-8 w-28 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t("hersteller", lang)}</Label>
            <Input value={hersteller} onChange={e => setHersteller(e.target.value)} className="h-8 w-36 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t("lieferant", lang)}</Label>
            <Input value={lieferant} onChange={e => setLieferant(e.target.value)} className="h-8 w-36 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t("auf", lang)}</Label>
            <Input value={auf} onChange={e => setAuf(e.target.value)} className="h-8 w-16 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t("ab", lang)}</Label>
            <Input value={ab} onChange={e => setAb(e.target.value)} className="h-8 w-16 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t("auffuellSeason", lang)}</Label>
            <Input value={aufSe} onChange={e => setAufSe(e.target.value)} className="h-8 w-24 text-xs" placeholder="z.B. SS25" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{lang === "DE" ? "Saisoncode" : "Seasonal code"}</Label>
            <Input value={seasonalCode} onChange={e => setSeasonalCode(e.target.value)} className="h-8 w-24 text-xs" placeholder="z.B. SS25" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t("lieferzeit", lang)}</Label>
            <Input value={lieferzeit} onChange={e => setLieferzeit(e.target.value)} className="h-8 w-16 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t("lieferstatusOnline", lang)}</Label>
            <Select value={verfuegbarkeit} onValueChange={setVerfuegbarkeit}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {VERFUEGBARKEIT_OPTIONS.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{lang === "DE" ? "EK Rabatt %" : "EK Discount %"}</Label>
            <Input value={ekDiscount} onChange={e => setEkDiscount(e.target.value)} className="h-8 w-20 text-xs" />
          </div>
          <div className="flex items-center gap-1.5 pb-1.5">
            <Checkbox id="vaterstat" checked={vaterstat} onCheckedChange={v => setVaterstat(v === true)} />
            <Label htmlFor="vaterstat" className="text-xs">{t("vaterStatus", lang)}</Label>
          </div>
        </div>

        {/* ── Pipeline actions ───────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-lg px-4 py-3 mb-4 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleAIClassify} disabled={isClassifying || filledCount === 0}>
            {isClassifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {t("aiClassify", lang)}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleGenerateNames} disabled={isGeneratingNames || filledCount === 0 || jtlCatalogRows.length === 0}>
            {isGeneratingNames ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {lang === "DE" ? "KI-Namen generieren" : "Generate AI naming"}
          </Button>
          {Object.keys(namingSuggestions).length > 0 && (
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setNamingPreviewOpen(true)}>
              {lang === "DE" ? `${Object.keys(namingSuggestions).length} bestätigt` : `${Object.keys(namingSuggestions).length} confirmed`}
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCategoryMapping} disabled={isMapping || filledCount === 0}>
            {isMapping ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderTree className="h-4 w-4" />}
            {lang === "DE" ? "Kategorien" : "Categories"}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleGenerateTexts} disabled={isGeneratingTexts || filledCount === 0}>
            {isGeneratingTexts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {lang === "DE" ? "Texte" : "Texts"}
          </Button>
          <div className="flex-1" />
          <Button size="sm" className="gap-1.5" onClick={processAndDownload} disabled={filledCount === 0}>
            <Download className="h-4 w-4" />
            {t("csvExport", lang)}
          </Button>
        </div>

        {/* ── Grid ───────────────────────────────────────────────────────── */}
        <div className="border border-border rounded-lg overflow-auto max-h-[55vh]">
          <table className="text-xs border-collapse w-max min-w-full">
            <thead className="bg-muted sticky top-0 z-10">
              <tr>
                <th className="border px-2 py-1 text-left font-medium w-8">#</th>
                {COLUMNS.map(col => (
                  <th key={col.key} className="border px-2 py-1 text-left font-medium whitespace-nowrap" style={{ width: col.width }}>{col.label}</th>
                ))}
                <th className="border px-2 py-1 w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                  <td className="border px-2 py-1 text-center text-muted-foreground">{i + 1}</td>
                  {COLUMNS.map(col => (
                    <td key={col.key} className="border p-0" style={{ width: col.width }}>
                      <input
                        className="w-full h-7 px-2 bg-transparent border-none outline-none focus:ring-2 focus:ring-primary/50 text-xs"
                        value={(row[col.key] as string) || ""}
                        onChange={e => handleCellChange(row.id, col.key, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="border px-1 text-center">
                    <button onClick={() => deleteRow(row.id)} className="text-muted-foreground hover:text-destructive" title={lang === "DE" ? "Zeile löschen" : "Delete row"}>×</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 2} className="border px-4 py-8 text-center text-muted-foreground">
                    {lang === "DE" ? "Noch keine Bestellung importiert." : "No order imported yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" />
            {lang === "DE" ? "Zeile hinzufügen" : "Add row"}
          </Button>
        </div>
      </div>

      <ImportDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} onImport={handleImportRows} lang={lang} />

      <AIIdentifierPreviewModal
        open={namingPreviewOpen}
        onOpenChange={setNamingPreviewOpen}
        initialRows={namingPreviewRows}
        onConfirm={handleNamingConfirm}
        lang={lang}
      />

      <CategoryPreviewModal
        open={categoryPreviewOpen}
        onOpenChange={setCategoryPreviewOpen}
        initialRows={categoryPreviewRows}
        onConfirm={handleCategoryConfirm}
        lang={lang}
      />

      <TextPreviewModal
        open={textPreviewOpen}
        onOpenChange={setTextPreviewOpen}
        initialRows={textPreviewRows}
        onConfirm={(editedRows) => {
          const map: typeof confirmedTexts = {};
          editedRows.forEach(r => { map[r.name] = { produkttext: r.produkttext, Title_Tag: r.Title_Tag, html_de: r.html_de, meta_description: r.meta_description, suchbegriffe: r.suchbegriffe }; });
          setConfirmedTexts(map);
        }}
        lang={lang}
      />
    </div>
  );
};

export default Smart;
