import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Download, Trash2, ClipboardPaste, Undo2, Sparkles, Loader2, Globe, Plus, Upload, FolderTree, Eye, RotateCcw } from "lucide-react";
import { MerkmaleMultiSelect } from "@/components/MerkmaleMultiSelect";
import { useToast } from "@/hooks/use-toast";
import { FindReplaceDialog } from "@/components/FindReplaceDialog";
import { ImportDialog, type ImportTargetField } from "@/components/ImportDialog";
import { TextPreviewModal, type TextPreviewRow } from "@/components/TextPreviewModal";
import { CategoryPreviewModal, type CategoryPreviewRow } from "@/components/CategoryPreviewModal";
import { JtlCheckModal, runJtlCheck, type JtlCheckResult, type JtlRow } from "@/components/JtlCheckModal";
import { NamingPatternModal } from "@/components/NamingPatternModal";
import { ArticlePreCheckModal, type PreCheckCandidate } from "@/components/ArticlePreCheckModal";
import { ShieldCheck, BookOpen, ClipboardCheck } from "lucide-react";
async function apiFetch(fn: string, body: object): Promise<{ data: unknown; error: Error | null }> {
  try {
    const res = await fetch(`/api/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: new Error(data?.error || `HTTP ${res.status}`) };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}
import { type Lang, t, warengruppeTranslations, farbeTranslations, artTranslations, groesseTranslations, getDisplayValue, getDropdownOptions } from "@/lib/translations";

interface CellPosition {
  row: number;
  col: number;
}

// ---- CSV utilities for JTL import ----
function jtlParseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === delimiter) { row.push(field); field = ""; i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += ch; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function jtlDetectDelimiter(text: string): string {
  const sample = text.slice(0, 64 * 1024);
  let inQ = false;
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0, "|": 0 };
  for (let i = 0; i < sample.length; i++) {
    const c = sample[i];
    if (c === '"') { if (inQ && sample[i + 1] === '"') { i++; continue; } inQ = !inQ; continue; }
    if (!inQ && counts[c] !== undefined) counts[c]++;
  }
  // Default to semicolon for JTL exports; only override if another delimiter clearly dominates
  const semi = counts[";"];
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > semi * 2 ? best[0] : ";";
}

function jtlStripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

interface ClothRow {
  id: string;
  Collection: string;
  ItemName: string;
  Measurement: string;
  InfoMaterial: string;
  WarenGruppe: string;
  color: string;
  Size: string;
  EAN: string;
  HAN: string;
  EK: string;
  VK: string;
  Menge: string;
  Description?: string;
  MerkmaleGroesse?: string;
  MerkmaleFarbe?: string;
  MerkmaleArt?: string;
}

// Combine the 4 ItemName sub-fields into one string, avoiding double spaces
const getClothName = (row: ClothRow): string => {
  return [row.Collection, row.ItemName, row.Measurement, row.InfoMaterial]
    .map(s => s?.trim() || "")
    .filter(Boolean)
    .join(" ");
};

// Strip forbidden characters from names for artikelnummer etc. (hyphen "-" is allowed)
const stripForbiddenChars = (s: string): string => s.replace(/\s+/g, " ").trim();

const createEmptyRow = (): ClothRow => ({
  id: crypto.randomUUID(),
  Collection: "",
  ItemName: "",
  Measurement: "",
  InfoMaterial: "",
  WarenGruppe: "",
  color: "",
  Size: "",
  EAN: "",
  HAN: "",
  EK: "",
  VK: "",
  Menge: "",
  Description: "",
  MerkmaleGroesse: "",
  MerkmaleFarbe: "",
  MerkmaleArt: "",
});

const safe = (val: string | null | undefined): string => {
  if (val === null || val === undefined) return "";
  const v = String(val).trim();
  return v.toLowerCase() === "nan" ? "" : v;
};

// Column letter to index mapping (A=0, B=1, etc.)
const colLetterToIndex = (letter: string): number => {
  const upper = letter.toUpperCase();
  let result = 0;
  for (let i = 0; i < upper.length; i++) {
    result = result * 26 + (upper.charCodeAt(i) - 64);
  }
  return result - 1; // 0-indexed
};

// Parse cell reference like "A1" into {col: 0, row: 0}
const parseCellRef = (ref: string): { col: number; row: number } | null => {
  const match = ref.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return null;
  const col = colLetterToIndex(match[1]);
  const row = parseInt(match[2], 10) - 1; // 0-indexed
  return { col, row };
};

// Get cell value by reference
const getCellValue = (
  ref: string,
  rows: ClothRow[],
  columns: { key: keyof ClothRow }[]
): string => {
  const parsed = parseCellRef(ref);
  if (!parsed) return "";
  const { col, row } = parsed;
  if (row < 0 || row >= rows.length || col < 0 || col >= columns.length) return "";
  return rows[row][columns[col].key] || "";
};

// Parse a range like "H1:H10" into array of cell references
const parseRange = (range: string): string[] => {
  const match = range.match(/^([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)$/);
  if (!match) return [];
  
  const startCol = colLetterToIndex(match[1]);
  const startRow = parseInt(match[2], 10);
  const endCol = colLetterToIndex(match[3]);
  const endRow = parseInt(match[4], 10);
  
  const refs: string[] = [];
  for (let col = Math.min(startCol, endCol); col <= Math.max(startCol, endCol); col++) {
    for (let row = Math.min(startRow, endRow); row <= Math.max(startRow, endRow); row++) {
      // Convert column index back to letter
      let colLetter = "";
      let c = col + 1;
      while (c > 0) {
        colLetter = String.fromCharCode(((c - 1) % 26) + 65) + colLetter;
        c = Math.floor((c - 1) / 26);
      }
      refs.push(`${colLetter}${row}`);
    }
  }
  return refs;
};

// Get numeric value from cell
const getNumericValue = (
  ref: string,
  rows: ClothRow[],
  columns: { key: keyof ClothRow }[]
): number => {
  const value = getCellValue(ref, rows, columns);
  const numValue = parseFloat(value.replace(",", "."));
  return isNaN(numValue) ? 0 : numValue;
};

// Evaluate a formula string (starting with =)
const evaluateFormula = (
  formula: string,
  rows: ClothRow[],
  columns: { key: keyof ClothRow }[]
): string => {
  if (!formula.startsWith("=")) return formula;
  
  let expr = formula.slice(1).trim();
  
  // Check for SUM function
  const sumMatch = expr.match(/^SUM\(([^)]+)\)$/i);
  if (sumMatch) {
    const arg = sumMatch[1].trim();
    let values: number[] = [];
    
    // Check if it's a range (e.g., H1:H10)
    if (arg.includes(":")) {
      const refs = parseRange(arg);
      values = refs.map(ref => getNumericValue(ref, rows, columns));
    } else {
      // Single cell or comma-separated cells
      const cells = arg.split(",").map(c => c.trim());
      values = cells.map(ref => getNumericValue(ref, rows, columns));
    }
    
    const sum = values.reduce((acc, val) => acc + val, 0);
    return Number.isInteger(sum) ? String(sum) : sum.toFixed(2).replace(".", ",");
  }
  
  // Check for AVERAGE function
  const avgMatch = expr.match(/^AVERAGE\(([^)]+)\)$/i);
  if (avgMatch) {
    const arg = avgMatch[1].trim();
    let values: number[] = [];
    
    if (arg.includes(":")) {
      const refs = parseRange(arg);
      values = refs.map(ref => getNumericValue(ref, rows, columns));
    } else {
      const cells = arg.split(",").map(c => c.trim());
      values = cells.map(ref => getNumericValue(ref, rows, columns));
    }
    
    if (values.length === 0) return "0";
    const avg = values.reduce((acc, val) => acc + val, 0) / values.length;
    return avg.toFixed(2).replace(".", ",");
  }
  
  // Check for COUNT function
  const countMatch = expr.match(/^COUNT\(([^)]+)\)$/i);
  if (countMatch) {
    const arg = countMatch[1].trim();
    let values: number[] = [];
    
    if (arg.includes(":")) {
      const refs = parseRange(arg);
      values = refs.map(ref => getNumericValue(ref, rows, columns)).filter(v => v !== 0);
    } else {
      const cells = arg.split(",").map(c => c.trim());
      values = cells.map(ref => getNumericValue(ref, rows, columns)).filter(v => v !== 0);
    }
    
    return String(values.length);
  }
  
  // Check if it's a string concatenation formula (contains &)
  if (expr.includes("&")) {
    const parts = expr.split("&").map(p => p.trim());
    const result = parts.map(part => {
      // Check if it's a quoted string
      if ((part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'"))) {
        return part.slice(1, -1);
      }
      // Check if it's a cell reference
      const cellRef = parseCellRef(part);
      if (cellRef) {
        return getCellValue(part, rows, columns);
      }
      return part;
    });
    return result.join("");
  }
  
  // For arithmetic operations, replace cell references with values
  const cellRefPattern = /([A-Za-z]+\d+)/g;
  let processedExpr = expr.replace(cellRefPattern, (match) => {
    const value = getCellValue(match, rows, columns);
    // Try to parse as number, handle comma as decimal separator
    const numValue = parseFloat(value.replace(",", "."));
    return isNaN(numValue) ? "0" : String(numValue);
  });
  
  // Safely evaluate arithmetic expression (only allow numbers and basic operators)
  try {
    // Validate expression contains only safe characters
    if (!/^[\d\s+\-*/().]+$/.test(processedExpr)) {
      return "#ERROR";
    }
    // Use Function constructor for safe evaluation
    const result = new Function(`return (${processedExpr})`)();
    if (typeof result === "number") {
      // Format with 2 decimal places if needed
      return Number.isInteger(result) ? String(result) : result.toFixed(2).replace(".", ",");
    }
    return String(result);
  } catch {
    return "#ERROR";
  }
};

const toProperCase = (s: string): string =>
  s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

// Map a Size value to the best matching MerkmaleGroesse option
const mapSizeToMerkmaleGroesse = (size: string, options: string[]): string => {
  if (!size.trim()) return "";
  const s = size.trim().toLowerCase();
  
  // Try exact match first
  for (const opt of options) {
    if (opt.toLowerCase() === s) return opt;
  }
  
  // Try matching the numeric cm part (e.g. "86" matches "86 cm (12-18 M)")
  const numericSize = parseInt(s, 10);
  if (!isNaN(numericSize)) {
    for (const opt of options) {
      const cmMatch = opt.match(/^(\d+)\s*cm/);
      if (cmMatch && parseInt(cmMatch[1], 10) === numericSize) return opt;
    }
  }
  
  // Try substring match
  for (const opt of options) {
    if (opt.toLowerCase().includes(s) || s.includes(opt.toLowerCase().split(" ")[0])) return opt;
  }
  
  return "";
};

// Map a color value to the best matching MerkmaleFarbe option
const mapColorToMerkmaleFarbe = (color: string, options: string[]): string => {
  if (!color.trim()) return "";
  const c = color.trim().toLowerCase();
  
  const colorMap: Record<string, string> = {
    pink: "rosa", blue: "blau", brown: "braun", yellow: "gelb", grey: "grau", gray: "grau",
    green: "grün", multicolor: "mehrfärbig", bunt: "mehrfärbig", red: "rot", black: "schwarz",
    turquoise: "türkis", purple: "violett", violet: "violett", white: "weiß", beige: "beige",
    orange: "orange", rose: "rosa", nuvola: "weiß", cream: "beige", ivory: "beige",
    navy: "blau", mint: "grün", khaki: "grün", sand: "beige", taupe: "braun",
  };
  
  for (const opt of options) {
    if (opt.toLowerCase() === c) return opt;
  }
  
  for (const [key, val] of Object.entries(colorMap)) {
    if (c.includes(key)) {
      const match = options.find(o => o.toLowerCase() === val);
      if (match) return match;
    }
  }
  
  for (const opt of options) {
    if (opt.toLowerCase().includes(c) || c.includes(opt.toLowerCase())) return opt;
  }
  
  return "";
};

const AUFSE_WARENGRUPPEN = ["Kleidung Basics", "Kleidung Funktion", "Kleidung Mode"];

const artikelnummerBuilder = (KRZL: string, name: string, color: string, size: string, warengruppe: string = "", aufSe: string = ""): string => {
  const cleanName = stripForbiddenChars(name);
  const cleanColor = stripForbiddenChars(color);
  const includeAufSe = aufSe.trim() !== "" && AUFSE_WARENGRUPPEN.includes(warengruppe);
  const parts = [KRZL.toUpperCase()];
  if (includeAufSe) parts.push(stripForbiddenChars(aufSe).toUpperCase());
  parts.push(toProperCase(cleanName), cleanColor.toLowerCase());
  const filtered = parts.filter(Boolean);
  if (size !== "") {
    filtered.push(stripForbiddenChars(size).toUpperCase());
  }
  return filtered.join(" ").replace(/\s+/g, " ").trim();
};

const buildRow = (
  artikelnummer: string, vaterartikel: string, name: string,
  size: string, color: string, EAN: string, HAN: string, EK: string, VK: string, Hersteller: string,
  AufAB: number, AufAuf: number, AufSe: string, Lieferstatus: string, Lieferzeit: number, Menge: string,
  Lieferant: string,
  warengruppe: string, translatedName: string = "",
  merkmaleGroesse: string = "", merkmaleArt: string = "", merkmaleFarbe: string = "",
  description: string = "",
  produkttext: string = "", titleTag: string = "", htmlDe: string = "",
  metaDescription: string = "", suchbegriffe: string = ""
): Record<string, string | number> => {
  let check = "";
  try {
    const ek = parseFloat(EK.replace(",", "."));
    const vk = parseFloat(VK.replace(",", "."));
    check = ek < vk ? "OK" : "ERROR";
  } catch {
    check = "";
  }

  // Proper Case name + lowercase color, no double spaces
  const fmtName = (n: string) => toProperCase(n);
  const nameWithColor = [fmtName(translatedName || name), color ? color.toLowerCase() : ""].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  return {
    "für Kassa aktivieren": "Y",
    "Artikelnummer": artikelnummer,
    "VaterArtikel ID-Feld": vaterartikel,
    "EAN": EAN || "",
    "HAN": HAN || "",
    "Artikelname/Etikettenname": nameWithColor,
    "VarName 1 (Größe)": "Größe",
    "Wert Name 1": size || "",
    "Größe Sort.no": "",
    "EK Netto": EK,
    "VK Brutto": VK,
    "EK < VK": check,
    "Hersteller": Hersteller.toUpperCase(),
    "Lieferant": Lieferant || Hersteller.split(' ').map(w => ['mit','zum','aus'].includes(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '),
    "Lieferstatus": Lieferstatus,
    "Lieferzeit ohne Bestand mit ÜV": Lieferzeit,
    "Versandklasse": "standard",
    "Warengruppe": warengruppe,
    "Liefer. EK": EK,
    "Lieferanten ArtikelNR": HAN || "",
    "Puffer": 0,
    "Var Darstel.form Größe": "SWATCHES",
    "Var Darstel.form Farbe": "DROPDOWN",
    "Variationsname Englisch": "size",
    "Variationsname Englisch2": "color",
    "Bestell Menge": Menge || "",
    "Spalte2": "KG-Store - Auffüllen AB",
    "KG-Store - Auffüllen AB": AufAB,
    "Spalte3": "KG-Store - Auffüllen AUF",
    "KG-Store - Auffüllen AUF": AufAuf,
    "Spalte4": "",
    "Kategorie f. Kassa Ebene 1": "Kassenartikel",
    "Kategorie f. Kassa Ebene 2": "alle",
    "Name Auffüllen Saison": "Auffüllen Saison",
    "Auffüllen Saison": AufSe,
    "Abnahmeintervall": 0,
    "Mindestabnahme": 0,
    "Bild 1": "",
    "Beschaffungszeit (manuell in Tage)": Lieferzeit,
    "Bild URL": description || "",
    "Größe": merkmaleGroesse ? "Größe" : "",
    "Größewert": merkmaleGroesse,
    "Art": merkmaleArt ? "Art" : "",
    "Artwert": merkmaleArt,
    "Farbe": merkmaleFarbe ? "Farbe" : "",
    "Farbewert": merkmaleFarbe,
    "produkttext": produkttext || "",
    "Title_Tag": titleTag || "",
    "html_de": htmlDe || "",
    "meta_description": metaDescription || "",
    "suchbegriffe": suchbegriffe || "",
  };
};

const Index = () => {
  const { toast } = useToast();
  const [lang, setLang] = useState<Lang>("DE");
  const [kurzl, setKurzl] = useState("");
  const [vaterstat, setVaterstat] = useState(false);
  const [hersteller, setHersteller] = useState("");
  const [lieferant, setLieferant] = useState("");
  const [auf, setAuf] = useState("2");
  const [ab, setAb] = useState("1");
  const [aufSe, setAufSe] = useState("");
  const [lieferzeit, setLieferzeit] = useState("14");
  const [verfuegbarkeit, setVerfuegbarkeit] = useState("3 - 5 Werktage");
  const verfuegbarkeitOptions = [
    "2 - 5 Werktage",
    "3 - 7 Werktage",
    "4 - 5 Werktage",
    "5 - 7 Werktage",
    "1 - 2 Wochen",
    "2 - 3 Wochen",
    "3 - 4 Wochen",
    "4 - 8 Wochen",
    "Derzeit nicht verfügbar",
    "Liefertermin auf Anfrage",
  ];
  const warengruppeOptions = [
    "Accessoires",
    "Care",
    "Deko",
    "Dienstleistungen",
    "Essen/Trinken",
    "Fahren",
    "Fahrräder",
    "Gutscheine",
    "Homeware",
    "KiWa",
    "KiWa Zubehör",
    "Kleidung Basics",
    "Kleidung Funktion",
    "Kleidung Mode",
    "Medien",
    "Möbel",
    "Schuhe",
    "Spielzeug Baby",
    "Spielzeug Kind",
    "Spielzeug Kleinkind",
    "Taschen",
    "Tragen"
  ];

  // Merkmale state and options (placeholder values - to be updated)
  const [merkmale, setMerkmale] = useState(false);
  const [showKollektion, setShowKollektion] = useState(false);
  const [showMeasurement, setShowMeasurement] = useState(false);
  const [showInfoMaterial, setShowInfoMaterial] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [combineHAN, setCombineHAN] = useState(false);
  const [hanFixed, setHanFixed] = useState<Record<string, boolean>>({});
  const handleFixHAN = () => {
    setRows(prev => {
      const next = prev.map(r => {
        const combined = combineHAN
          ? [r.HAN, r.color, r.Size].map(v => (v || "").trim()).filter(Boolean).join(" ")
          : (r.HAN || "");
        return { ...r, HAN: combined };
      });
      return next;
    });
    setHanFixed(prev => {
      const next = { ...prev };
      rows.forEach(r => { next[r.id] = true; });
      return next;
    });
    setCombineHAN(false);
  };
  const [isRestructuring, setIsRestructuring] = useState(false);
  const [isGeneratingTexts, setIsGeneratingTexts] = useState(false);
  const [textGenerating, setTextGenerating] = useState(false);
  const [kategorienToggle, setKategorienToggle] = useState(false);
  const [textPreviewOpen, setTextPreviewOpen] = useState(false);
  const [textPreviewRows, setTextPreviewRows] = useState<TextPreviewRow[]>([]);
  const [confirmedTexts, setConfirmedTexts] = useState<Record<string, { produkttext: string; Title_Tag: string; html_de: string; meta_description: string; suchbegriffe: string }>>({});
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const handleImportRows = useCallback((imported: Partial<Record<ImportTargetField, string>>[]) => {
    if (imported.length === 0) return;
    setRows(prev => {
      const newRows = prev.filter(r =>
        !r.Collection && !r.ItemName && !r.Measurement && !r.InfoMaterial &&
        !r.color && !r.Size && !r.EAN && !r.HAN && !r.EK && !r.VK && !r.Menge
      );
      const built = imported.map(item => ({
        ...createEmptyRow(),
        ItemName: item.ItemName ?? "",
        color: item.color ?? "",
        Size: item.Size ?? "",
        EAN: item.EAN ?? "",
        HAN: item.HAN ?? "",
        EK: item.EK ?? "",
        VK: item.VK ?? "",
        Menge: item.Menge ?? "",
        Collection: item.Collection ?? "",
        Measurement: item.Measurement ?? "",
        InfoMaterial: item.InfoMaterial ?? "",
        Description: item.Description ?? "",
      }));
      const next = [...newRows, ...built];
      setRowCount(String(next.length));
      return next;
    });
    toast({ title: "Import abgeschlossen", description: `${imported.length} Zeilen importiert.` });
  }, [toast]);



  
  const merkmaleGroesseOptions = [
    "50 cm (0M)", "62 cm (0-3M)", "68 cm (3-6M)", "74 cm (6-9M)", "80 cm (9-12M)",
    "86 cm (12-18M)", "92 cm (2J)", "98 cm (3J)", "104 cm (4J)", "110 cm (5J)",
    "116 cm (6J)", "120 cm (6J)", "128 cm (6J)"
  ];
  
  const merkmaleFarbeOptions = [
    "beige", "blau", "braun", "gelb", "grau", "grün", "mehrfärbig",
    "orange", "rosa", "rot", "schwarz", "türkis", "violett", "weiß"
  ];
  
  const merkmaleArtOptions = [
    "Accessories", "Aufbewahrung", "Babyspielsachen", "Babywippe", "Baden", "Beißen",
    "Beleuchtung", "Betten", "Bettwäsche", "Bewegung", "Bodies", "Cardigans", "Care",
    "Decken", "Deko", "Einzelkinderwagen", "Essen", "Fahren", "Fußsäcke",
    "Geschwisterkinderwagen", "Große Spielsachen", "Gutscheine", "Handschuhe", "Hauben",
    "Hochstühle", "Holzspielzeug", "Hosen", "Hüte", "Jacken", "Autositze",
    "Kinderwagen", "Kinderwagen Einzelteil", "Kissen", "Kleider", "Kniestrümpfe",
    "Kommoden", "Kurze Hosen", "Kuscheltiere", "Lätzchen", "Leggings", "Lernen",
    "Matratzen", "Modellbahn", "Musik", "Nestchen", "Overalls", "Pullover", "Puppen",
    "Pyjamas", "Regale", "Röcke", "Schals", "Schlafsäcke", "Schnuller", "Schränke",
    "Schuhe", "Schwimmbekleidung", "Socken", "Spiele", "Spielen", "Stillen", "Stofftiere",
    "Stoffwindeln", "Strampler", "Stühle", "Sweatshirts", "Taschen", "Tattoos", "Teppich",
    "Teppiche", "Tische", "Tops", "Tragen", "Trinken", "T-Shirts", "Waschen",
    "Wickeltaschen", "Wickelunterlagen", "Wiegen", "Zubehör"
  ];
  const [rowCount, setRowCount] = useState("10");
  const [rows, setRows] = useState<ClothRow[]>(() =>
    Array.from({ length: 10 }, () => createEmptyRow())
  );
  const [history, setHistory] = useState<ClothRow[][]>([]);

  const handleClearData = useCallback(() => {
    const count = Math.max(1, parseInt(rowCount, 10) || 10);
    setRows(Array.from({ length: count }, () => createEmptyRow()));
    setHistory([]);
    setDiscount("");
    setSelection([]);
    setSelectionStart(null);
    setHanFixed({});
    setTextGenerating(false);
    setTextPreviewRows([]);
    setConfirmedTexts({});
    setTextPreviewOpen(false);
    setKategorienToggle(false);
    setCategoryPreviewRows([]);
    setConfirmedCategories({});
    setCategoryArtikelToName({});
    setCategoryPreviewOpen(false);
    toast({ title: lang === "DE" ? "Daten geleert" : "Data cleared", description: lang === "DE" ? "Alle eingefügten Inhalte wurden entfernt." : "All pasted content has been removed." });
  }, [rowCount, lang, toast]);
  const lastEditedCellRef = useRef<{ id: string; field: string } | null>(null);
  const [discount, setDiscount] = useState<string>("");
  const [selection, setSelection] = useState<CellPosition[]>([]);
  const [selectionStart, setSelectionStart] = useState<CellPosition | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [fillHandleDrag, setFillHandleDrag] = useState<{
    sourceRow: number;
    sourceCol: number;
    targetRow: number;
  } | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    ItemName: 150,
    Collection: 120,
  });
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);
  const tableRef = useRef<HTMLTableElement>(null);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isMapping, setIsMapping] = useState(false);
  const [categoryPreviewOpen, setCategoryPreviewOpen] = useState(false);
  const [categoryPreviewRows, setCategoryPreviewRows] = useState<CategoryPreviewRow[]>([]);
  // Maps productName → confirmed categoryPath (persists across mapping runs like confirmedTexts)
  const [confirmedCategories, setConfirmedCategories] = useState<Record<string, string>>({});
  // Maps artikelnummer → productName so onConfirm can save back to confirmedCategories
  const [categoryArtikelToName, setCategoryArtikelToName] = useState<Record<string, string>>({});

  const [jtlDataset, setJtlDataset] = useState<JtlRow[]>([]);
  const jtlFileInputRef = useRef<HTMLInputElement>(null);
  const [jtlCheckOpen, setJtlCheckOpen] = useState(false);
  const [jtlCheckResults, setJtlCheckResults] = useState<JtlCheckResult[]>([]);
  const [namingPatternOpen, setNamingPatternOpen] = useState(false);
  const [preCheckOpen, setPreCheckOpen] = useState(false);
  const [preCheckCandidates, setPreCheckCandidates] = useState<PreCheckCandidate[]>([]);

  const handleJtlImport = useCallback(async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      // cp1252 default for JTL/Ameise exports; fall back to UTF-8 on replacement chars
      let text = new TextDecoder("windows-1252").decode(buf);
      if (text.includes("�")) text = new TextDecoder("utf-8").decode(buf);
      text = jtlStripBom(text);
      const delimiter = jtlDetectDelimiter(text);
      const allRows = jtlParseCsv(text, delimiter);
      if (allRows.length < 2) {
        toast({ title: "Keine Daten", description: "Die Datei enthält keine verwertbaren Zeilen.", variant: "destructive" });
        return;
      }
      const headers = allRows[0].map(h => h.trim().toLowerCase());
      const colIdx = (names: string[]): number => {
        for (const name of names) {
          const idx = headers.findIndex(h => h === name || h.includes(name));
          if (idx !== -1) return idx;
        }
        return -1;
      };
      const iInternerSchluessel = colIdx(["interner schlüssel", "interner schluessel", "schlüssel"]);
      const iArtikelnummer = colIdx(["artikelnummer"]);
      const iVaterartikel = colIdx(["identifizierungsspalte vaterartikel", "vaterartikel"]);
      const iArtikelname = colIdx(["artikelname"]);
      const iWarengruppe = colIdx(["warengruppe"]);
      const iGtin = colIdx(["gtin", "ean"]);
      const iHan = colIdx(["han"]);
      const parsed: JtlRow[] = [];
      for (let r = 1; r < allRows.length; r++) {
        const row = allRows[r];
        if (row.every(c => c.trim() === "")) continue;
        parsed.push({
          internerSchluessel: iInternerSchluessel >= 0 ? (row[iInternerSchluessel] ?? "").trim() : "",
          artikelnummer: iArtikelnummer >= 0 ? (row[iArtikelnummer] ?? "").trim() : "",
          vaterartikel: iVaterartikel >= 0 ? (row[iVaterartikel] ?? "").trim() : "",
          artikelname: iArtikelname >= 0 ? (row[iArtikelname] ?? "").trim() : "",
          warengruppe: iWarengruppe >= 0 ? (row[iWarengruppe] ?? "").trim() : "",
          gtin: iGtin >= 0 ? (row[iGtin] ?? "").trim() : "",
          han: iHan >= 0 ? (row[iHan] ?? "").trim() : "",
        });
      }
      setJtlDataset(parsed);
      toast({ title: `${parsed.length} Artikel geladen`, description: `JTL-Referenzdatei: ${file.name}` });
    } catch (err) {
      toast({ title: "Fehler beim Importieren", description: String(err), variant: "destructive" });
    }
  }, [toast]);

  const handleJtlCheck = useCallback(() => {
    if (jtlDataset.length === 0) {
      toast({ title: lang === "DE" ? "Keine Referenzdaten" : "No reference data", description: lang === "DE" ? "Bitte zuerst eine JTL-Datei laden." : "Please load a JTL file first.", variant: "destructive" });
      return;
    }
    const candidates = rows
      .map((r, i) => ({ rowIndex: i, clothName: getClothName(r), han: r.HAN, gtin: r.EAN, warengruppe: r.WarenGruppe }))
      .filter(c => c.han.trim() !== "" || c.gtin.trim() !== "");
    if (candidates.length === 0) {
      toast({ title: lang === "DE" ? "Keine prüfbaren Zeilen" : "No checkable rows", description: lang === "DE" ? "Fülle HAN oder GTIN/EAN Felder aus." : "Fill in HAN or GTIN/EAN fields.", variant: "destructive" });
      return;
    }
    setJtlCheckResults(runJtlCheck(candidates, jtlDataset));
    setJtlCheckOpen(true);
  }, [rows, jtlDataset, lang, toast]);

  const handleAIClassify = async () => {
    const filledRows = rows.filter(r => getClothName(r).trim() !== "");
    if (filledRows.length === 0) {
      toast({ title: t("noData", lang), description: t("noDataDesc", lang), variant: "destructive" });
      return;
    }
    try {
      const itemNames = filledRows.map(r => {
        const parts = [getClothName(r), r.color].filter(Boolean);
        return parts.join(" ").trim();
      });
      const itemSizes = filledRows.map(r => r.Size || "");

      const { data, error } = await apiFetch('classify-products', {
        items: itemNames,
        sizes: itemSizes,
      });

      if (error) throw error;

      if (data?.error) {
        if (data.error.includes("Rate limit")) {
          toast({ title: t("rateLimit", lang), description: t("rateLimitDesc", lang), variant: "destructive" });
        } else if (data.error.includes("Payment")) {
          toast({ title: t("paymentIssue", lang), description: t("paymentIssueDesc", lang), variant: "destructive" });
        } else {
          throw new Error(data.error);
        }
        return;
      }

      const classifications = data?.classifications;
      if (!Array.isArray(classifications)) throw new Error("Invalid response");

      setHistory(prev => [...prev.slice(-49), rows]);
      setRows(prev => {
        const newRows = [...prev];
        let classIdx = 0;
        newRows.forEach((row, i) => {
          if (getClothName(row).trim() !== "" && classIdx < classifications.length) {
            const c = classifications[classIdx];
            newRows[i] = {
              ...row,
              WarenGruppe: c.warengruppe || row.WarenGruppe,
              MerkmaleFarbe: c.farbe || mapColorToMerkmaleFarbe(row.color, merkmaleFarbeOptions) || row.MerkmaleFarbe || "",
              MerkmaleArt: c.art || row.MerkmaleArt || "",
              MerkmaleGroesse: c.groesse || mapSizeToMerkmaleGroesse(row.Size, merkmaleGroesseOptions) || row.MerkmaleGroesse || "",
            };
            classIdx++;
          }
        });
        return newRows;
      });

      toast({ title: t("classifyDone", lang), description: `${classifications.length} ${t("classifyDoneDesc", lang)}` });
    } catch (err) {
      console.error("Classification error:", err);
      toast({ title: t("classifyError", lang), description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setIsClassifying(false);
    }
  };

  // Retry: re-classify only rows that are incomplete (missing WarenGruppe or Art)
  const handleAIClassifyRetry = async () => {
    const incompleteRows = rows.filter(r =>
      getClothName(r).trim() !== "" && (!r.WarenGruppe || !r.MerkmaleArt)
    );
    if (incompleteRows.length === 0) {
      toast({ title: lang === "DE" ? "Nichts zu wiederholen" : "Nothing to retry", description: lang === "DE" ? "Alle Zeilen sind bereits klassifiziert." : "All rows are already classified." });
      return;
    }
    setIsRetrying(true);
    try {
      const itemNames = incompleteRows.map(r => [getClothName(r), r.color].filter(Boolean).join(" ").trim());
      const itemSizes = incompleteRows.map(r => r.Size || "");

      const { data, error } = await apiFetch('classify-products', { items: itemNames, sizes: itemSizes });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const classifications = data?.classifications;
      if (!Array.isArray(classifications)) throw new Error("Invalid response");

      setHistory(prev => [...prev.slice(-49), rows]);
      setRows(prev => {
        const newRows = [...prev];
        let classIdx = 0;
        newRows.forEach((row, i) => {
          if (getClothName(row).trim() !== "" && (!row.WarenGruppe || !row.MerkmaleArt) && classIdx < classifications.length) {
            const c = classifications[classIdx];
            newRows[i] = {
              ...row,
              WarenGruppe: c.warengruppe || row.WarenGruppe,
              MerkmaleFarbe: c.farbe || mapColorToMerkmaleFarbe(row.color, merkmaleFarbeOptions) || row.MerkmaleFarbe || "",
              MerkmaleArt: c.art || row.MerkmaleArt || "",
              MerkmaleGroesse: c.groesse || mapSizeToMerkmaleGroesse(row.Size, merkmaleGroesseOptions) || row.MerkmaleGroesse || "",
            };
            classIdx++;
          }
        });
        return newRows;
      });

      toast({ title: lang === "DE" ? "Nachklassifiziert" : "Retry done", description: `${incompleteRows.length} ${lang === "DE" ? "unvollständige Zeilen aktualisiert." : "incomplete rows updated."}` });
    } catch (err) {
      console.error("Retry classification error:", err);
      toast({ title: t("classifyError", lang), description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setIsRetrying(false);
    }
  };

  const handleTranslateNames = async () => {
    const filledRows = rows.filter(r => getClothName(r).trim() !== "");
    if (filledRows.length === 0) {
      toast({ title: t("noData", lang), description: t("noDataDesc", lang), variant: "destructive" });
      return;
    }
    setIsTranslating(true);
    try {
      const uniqueNames = [...new Set(filledRows.map(r => getClothName(r).trim()))];
      const { data, error } = await apiFetch('translate-article-names', { articleNames: uniqueNames });
      if (error) throw error;
      const d = data as any;
      if (d?.error) throw new Error(d.error);

      const translations: { de: string }[] = d?.translations;
      if (!Array.isArray(translations)) throw new Error("Invalid response");

      const nameMap: Record<string, string> = {};
      uniqueNames.forEach((name, i) => {
        nameMap[name] = translations[i]?.de || name;
      });

      setHistory(prev => [...prev.slice(-49), rows]);
      setRows(prev => prev.map(row => {
        const original = getClothName(row).trim();
        if (!original || !nameMap[original]) return row;
        return { ...row, Collection: "", ItemName: nameMap[original], Measurement: "", InfoMaterial: "" };
      }));
      toast({ title: lang === "DE" ? "Namen übersetzt" : "Names translated", description: lang === "DE" ? `${uniqueNames.length} Namen übersetzt.` : `${uniqueNames.length} names translated.` });
    } catch (err) {
      console.error("Translation error:", err);
      toast({ title: t("translationFailed", lang), description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setIsTranslating(false);
    }
  };

  // Calculate order total (EK × Menge for all rows)
  const orderTotal = useMemo(() => {
    return rows.reduce((total, row) => {
      const ek = parseFloat((row.EK || "0").replace(",", "."));
      const menge = parseFloat((row.Menge || "0").replace(",", "."));
      if (!isNaN(ek) && !isNaN(menge)) {
        return total + (ek * menge);
      }
      return total;
    }, 0);
  }, [rows]);

  // Sum of Menge (quantity) values
  const filledRowsCount = useMemo(() => {
    return rows.reduce((sum, row) => {
      const val = parseInt(row.Menge, 10);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }, [rows]);

  // Calculate discounted total
  const discountedTotal = useMemo(() => {
    const discountValue = parseFloat(discount.replace(",", "."));
    if (isNaN(discountValue) || discountValue <= 0 || discountValue > 100) {
      return orderTotal;
    }
    return orderTotal * (1 - discountValue / 100);
  }, [orderTotal, discount]);

  // Handle discount input change with validation
  const handleDiscountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty, or valid numbers 0-100 (including decimals)
    if (value === "" || /^(\d{0,3}([.,]\d{0,2})?)?$/.test(value)) {
      const numValue = parseFloat(value.replace(",", "."));
      if (value === "" || (numValue >= 0 && numValue <= 100)) {
        setDiscount(value);
      }
    }
  };

  const isCellSelected = useCallback((row: number, col: number) => {
    return selection.some(s => s.row === row && s.col === col);
  }, [selection]);

  const getSelectionRange = (start: CellPosition, end: CellPosition): CellPosition[] => {
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);
    
    const positions: CellPosition[] = [];
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        positions.push({ row: r, col: c });
      }
    }
    return positions;
  };

  const handleCellMouseDown = (e: React.MouseEvent, rowIndex: number, colIndex: number) => {
    if (e.shiftKey && selectionStart) {
      // Shift+click: extend selection
      const range = getSelectionRange(selectionStart, { row: rowIndex, col: colIndex });
      setSelection(range);
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl+click: toggle cell in selection
      const exists = selection.some(s => s.row === rowIndex && s.col === colIndex);
      if (exists) {
        setSelection(prev => prev.filter(s => !(s.row === rowIndex && s.col === colIndex)));
      } else {
        setSelection(prev => [...prev, { row: rowIndex, col: colIndex }]);
        setSelectionStart({ row: rowIndex, col: colIndex });
      }
    } else {
      // Normal click: start new selection
      setSelection([{ row: rowIndex, col: colIndex }]);
      setSelectionStart({ row: rowIndex, col: colIndex });
      setIsSelecting(true);
    }
  };

  const handleCellMouseEnter = (rowIndex: number, colIndex: number) => {
    if (isSelecting && selectionStart) {
      const range = getSelectionRange(selectionStart, { row: rowIndex, col: colIndex });
      setSelection(range);
    }
  };

  const handleMouseUp = useCallback(() => {
    setIsSelecting(false);
    // Fill handle drag end is handled separately
  }, []);

  // Global mouse up listener for both selection and fill handle
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      handleMouseUp();
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [handleMouseUp]);

  // Column resize handlers
  const handleResizeStart = (e: React.MouseEvent, columnKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(columnKey);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = columnWidths[columnKey] || 180;
  };

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (resizingColumn) {
      const delta = e.clientX - resizeStartX.current;
      const newWidth = Math.max(100, resizeStartWidth.current + delta);
      setColumnWidths(prev => ({ ...prev, [resizingColumn]: newWidth }));
    }
  }, [resizingColumn]);

  const handleResizeEnd = useCallback(() => {
    setResizingColumn(null);
  }, []);

  // Global resize listeners
  useEffect(() => {
    if (resizingColumn) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
      return () => {
        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [resizingColumn, handleResizeMove, handleResizeEnd]);

  const handleRestructureNames = async () => {
    const toProcess = rows.filter(r => (r.ItemName || "").trim() !== "");
    if (toProcess.length === 0) {
      toast({ title: t("noData", lang), description: t("noDataDesc", lang), variant: "destructive" });
      return;
    }
    setIsRestructuring(true);
    try {
      const items = toProcess.map(r => r.ItemName.trim());
      const { data, error } = await apiFetch('restructure-names', { items });
      if (error) throw error;
      const d = data as any;
      if (!d?.results || !Array.isArray(d.results) || d.results.length !== items.length) throw new Error("Invalid response");
      const results: { name: string; color: string }[] = d.results;
      setHistory(prev => [...prev.slice(-49), rows]);
      setRows(prev => prev.map(row => {
        const idx = toProcess.findIndex(r => r.id === row.id);
        if (idx === -1) return row;
        const res = results[idx];
        if (!res) return row;
        const newName = (res.name || "").trim();
        if (!newName) return row;
        const extractedColor = (res.color || "").trim().toLowerCase();
        let newColor = row.color;
        if (extractedColor) {
          const existing = (row.color || "").trim();
          if (!existing) newColor = extractedColor;
          else if (!existing.toLowerCase().split("/").map(s => s.trim()).includes(extractedColor)) {
            newColor = `${existing}/${extractedColor}`;
          }
        }
        return { ...row, ItemName: newName, color: newColor };
      }));
      toast({ title: lang === "DE" ? "Namen umstrukturiert" : "Names restructured", description: `${toProcess.length} ${lang === "DE" ? "Namen verarbeitet." : "names processed."}` });
    } catch (err) {
      console.error("restructure-names failed", err);
      toast({ title: lang === "DE" ? "Fehler" : "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setIsRestructuring(false);
    }
  };

  const baseColumns: { key: keyof ClothRow; label: string; width: string; isDropdown?: boolean; isMultiSelect?: boolean; resizable?: boolean; dropdownOptions?: string[]; translationMap?: Record<string, string> }[] = [
    { key: "Collection", label: t("colCollection", lang), width: "120px", resizable: true },
    { key: "ItemName", label: t("colName", lang), width: "150px", resizable: true },
    { key: "Measurement", label: t("colMeasurement", lang), width: "80px", resizable: true },
    { key: "InfoMaterial", label: t("colInfoMaterial", lang), width: "100px", resizable: true },
    { key: "WarenGruppe", label: t("colWarenGruppe", lang), width: "150px", isDropdown: true, resizable: true, dropdownOptions: warengruppeOptions, translationMap: warengruppeTranslations },
    { key: "color", label: t("colColor", lang), width: "100px", resizable: true },
    { key: "Size", label: t("colSize", lang), width: "80px", resizable: true },
    { key: "EAN", label: t("colEAN", lang), width: "140px", resizable: true },
    { key: "HAN", label: t("colHAN", lang), width: "120px", resizable: true },
    { key: "EK", label: t("colEK", lang), width: "80px", resizable: true },
    { key: "VK", label: t("colVK", lang), width: "80px", resizable: true },
    { key: "Menge", label: t("colMenge", lang), width: "80px", resizable: true },
    { key: "Description", label: lang === "DE" ? "Beschreibung" : "Description", width: "200px", resizable: true },
  ];

  const merkmaleColumns: { key: keyof ClothRow; label: string; width: string; isDropdown?: boolean; isMultiSelect?: boolean; resizable?: boolean; dropdownOptions?: string[]; translationMap?: Record<string, string> }[] = [
    { key: "MerkmaleGroesse", label: t("colGroesse", lang), width: "140px", isDropdown: true, isMultiSelect: true, resizable: true, dropdownOptions: merkmaleGroesseOptions, translationMap: groesseTranslations },
    { key: "MerkmaleFarbe", label: t("colFarbe", lang), width: "140px", isDropdown: true, isMultiSelect: true, resizable: true, dropdownOptions: merkmaleFarbeOptions, translationMap: farbeTranslations },
    { key: "MerkmaleArt", label: t("colArt", lang), width: "140px", isDropdown: true, isMultiSelect: true, resizable: true, dropdownOptions: merkmaleArtOptions, translationMap: artTranslations },
  ];

  const columns = useMemo(() => {
    let filteredBase = baseColumns;
    if (!showKollektion) {
      filteredBase = filteredBase.filter(c => c.key !== "Collection");
    }
    if (!showMeasurement) {
      filteredBase = filteredBase.filter(c => c.key !== "Measurement");
    }
    if (!showInfoMaterial) {
      filteredBase = filteredBase.filter(c => c.key !== "InfoMaterial");
    }
    if (!showDescription) {
      filteredBase = filteredBase.filter(c => c.key !== "Description");
    }
    if (merkmale) {
      return [...filteredBase, ...merkmaleColumns];
    }
    return filteredBase;
  }, [merkmale, showKollektion, showMeasurement, showInfoMaterial, showDescription, lang]);

  const parseClipboardData = (text: string): ClothRow[] => {
    const lines = text.trim().split(/\r?\n/);
    const parsedRows: ClothRow[] = [];
    
    for (const line of lines) {
      // Split by tab (Excel) or semicolon (CSV)
      const cells = line.includes("\t") ? line.split("\t") : line.split(";");
      
      if (cells.length > 0 && cells.some(c => c.trim() !== "")) {
        parsedRows.push({
          id: crypto.randomUUID(),
          ItemName: safe(cells[0]),
          Collection: "",
          Measurement: "",
          InfoMaterial: "",
          WarenGruppe: "",
          color: safe(cells[1]),
          Size: safe(cells[2]),
          EAN: safe(cells[3]),
          HAN: safe(cells[4]),
          EK: safe(cells[5]),
          VK: safe(cells[6]),
          Menge: safe(cells[7]),
        });
      }
    }
    return parsedRows;
  };

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsedRows = parseClipboardData(text);
      
      if (parsedRows.length === 0) {
        toast({
          title: "Keine Daten gefunden",
          description: "Die Zwischenablage enthält keine gültigen Daten.",
          variant: "destructive",
        });
        return;
      }
      
      setHistory(prev => [...prev.slice(-49), rows]);
      
      // Find first empty row or append
      const firstEmptyIndex = rows.findIndex(r => 
        !r.Collection && !r.ItemName && !r.Measurement && !r.InfoMaterial && !r.color && !r.Size && !r.EAN && !r.HAN && !r.EK && !r.VK && !r.Menge
      );
      
      if (firstEmptyIndex >= 0) {
        const newRows = [...rows];
        parsedRows.forEach((pr, i) => {
          if (firstEmptyIndex + i < newRows.length) {
            newRows[firstEmptyIndex + i] = pr;
          } else {
            newRows.push(pr);
          }
        });
        setRows(newRows);
        setRowCount(String(newRows.length));
      } else {
        setRows(prev => [...prev, ...parsedRows]);
        setRowCount(String(rows.length + parsedRows.length));
      }
      
      toast({
        title: "Daten eingefügt",
        description: `${parsedRows.length} Zeilen wurden eingefügt.`,
      });
    } catch (error) {
      toast({
        title: "Fehler beim Einfügen",
        description: "Bitte erlauben Sie den Zugriff auf die Zwischenablage.",
        variant: "destructive",
      });
    }
  }, [rows, toast]);

  const handleCellChange = (id: string, field: keyof ClothRow, value: string, saveHistory = true) => {
    if (saveHistory) {
      const cellKey = `${id}:${field}`;
      if (lastEditedCellRef.current?.id !== id || lastEditedCellRef.current?.field !== field) {
        setHistory(prev => [...prev.slice(-49), rows]);
        lastEditedCellRef.current = { id, field };
      }
    }
    
    // Check if value is a formula
    let finalValue = value;
    if (value.startsWith("=")) {
      finalValue = evaluateFormula(value, rows, columns);
    }
    // EK and VK use comma as decimal separator — always convert . to ,
    if (field === "EK" || field === "VK") {
      finalValue = finalValue.replace(/\./g, ",");
    }
    
    setRows(prev => prev.map(row => {
      if (row.id !== id) return row;
      const updated = { ...row, [field]: finalValue };
      // Auto-map Size to MerkmaleGroesse
      if (field === "Size") {
        updated.MerkmaleGroesse = mapSizeToMerkmaleGroesse(finalValue, merkmaleGroesseOptions);
      }
      // Auto-map color to MerkmaleFarbe
      if (field === "color") {
        updated.MerkmaleFarbe = mapColorToMerkmaleFarbe(finalValue, merkmaleFarbeOptions);
      }
      return updated;
    }));
  };

  const handleUndo = () => {
    if (history.length > 0) {
      const previousState = history[history.length - 1];
      setRows(previousState);
      setHistory(prev => prev.slice(0, -1));
      lastEditedCellRef.current = null;
      toast({
        title: "Rückgängig",
        description: "Letzte Änderung wurde rückgängig gemacht.",
      });
    }
  };

  const handleHeaderDropdownChange = (colKey: keyof ClothRow, value: string) => {
    setHistory(prev => [...prev.slice(-49), rows]);
    setRows(prev => prev.map(row => 
      getClothName(row).trim() !== "" ? { ...row, [colKey]: value } : row
    ));
  };

  // Fill to a specific range (drag up or down)
  const handleFillToRange = (sourceRow: number, colIndex: number, targetRow: number) => {
    const field = columns[colIndex].key;
    const value = rows[sourceRow][field];
    if (!value || targetRow === sourceRow) return;

    const minRow = Math.min(sourceRow, targetRow);
    const maxRow = Math.max(sourceRow, targetRow);
    setHistory(prev => [...prev.slice(-49), rows]);
    const fillCount = maxRow - minRow;
    setRows(prev => prev.map((row, idx) =>
      idx >= minRow && idx <= maxRow && idx !== sourceRow ? { ...row, [field]: value } : row
    ));
    toast({
      title: "Werte übernommen",
      description: `${fillCount} Zellen wurden aktualisiert.`,
    });
  };

  // Double-click fill: fill until adjacent column has data gap
  const handleFillDoubleClick = (rowIndex: number, colIndex: number) => {
    const field = columns[colIndex].key;
    const value = rows[rowIndex][field];
    if (!value) return;
    
    // Find how far to fill based on adjacent column data
    // Use the first column (Collection) as reference, or next column if we're at Collection
    const refColIndex = colIndex === 0 ? 1 : 0;
    const refField = columns[refColIndex]?.key || "Collection";
    
    let lastRowToFill = rowIndex;
    for (let i = rowIndex + 1; i < rows.length; i++) {
      // Stop if the reference column is empty (end of data block)
      if (!rows[i][refField]?.trim()) break;
      // Also stop if the target cell already has data
      if (rows[i][field]?.trim()) break;
      lastRowToFill = i;
    }
    
    if (lastRowToFill === rowIndex) return; // Nothing to fill
    
    handleFillToRange(rowIndex, colIndex, lastRowToFill);
  };

  // Handle fill handle drag start
  const handleFillHandleMouseDown = (e: React.MouseEvent, rowIndex: number, colIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setFillHandleDrag({
      sourceRow: rowIndex,
      sourceCol: colIndex,
      targetRow: rowIndex,
    });
  };

  // Handle fill handle drag move — allow both up and down
  const handleFillHandleDragMove = useCallback((rowIndex: number) => {
    if (fillHandleDrag) {
      setFillHandleDrag(prev => prev ? { ...prev, targetRow: rowIndex } : null);
    }
  }, [fillHandleDrag]);

  // Handle fill handle drag end — works up or down
  const handleFillHandleDragEnd = useCallback(() => {
    if (fillHandleDrag && fillHandleDrag.targetRow !== fillHandleDrag.sourceRow) {
      handleFillToRange(fillHandleDrag.sourceRow, fillHandleDrag.sourceCol, fillHandleDrag.targetRow);
    }
    setFillHandleDrag(null);
  }, [fillHandleDrag, rows, columns]);

  // Copy selected cells
  const handleCopySelection = useCallback(async () => {
    if (selection.length === 0) return;

    const minRow = Math.min(...selection.map(s => s.row));
    const maxRow = Math.max(...selection.map(s => s.row));
    const minCol = Math.min(...selection.map(s => s.col));
    const maxCol = Math.max(...selection.map(s => s.col));

    const lines: string[] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const rowData: string[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        const field = columns[c].key;
        rowData.push(rows[r][field] || "");
      }
      lines.push(rowData.join("\t"));
    }
    
    await navigator.clipboard.writeText(lines.join("\n"));
    toast({
      title: "Kopiert",
      description: `${selection.length} Zellhen wurden kopiert.`,
    });
  }, [selection, rows, columns, toast]);

  // Paste into selected area
  const handlePasteSelection = useCallback(async () => {
    if (selection.length === 0) return;
    
    try {
      const text = await navigator.clipboard.readText();
      const minRow = Math.min(...selection.map(s => s.row));
      const minCol = Math.min(...selection.map(s => s.col));
      const targetField = columns[minCol].key as keyof ClothRow;

      const hasTab       = text.includes("\t");
      const hasSemicolon = text.includes(";");
      const hasNewline   = /\r?\n/.test(text.trim());

      // Description always gets the full text as one value.
      if (targetField === "Description" && !hasTab && !hasSemicolon) {
        setHistory(prev => [...prev.slice(-49), rows]);
        setRows(prev => {
          const newRows = [...prev];
          newRows[minRow] = { ...newRows[minRow], [targetField]: text.trimEnd() };
          return newRows;
        });
        toast({ title: "Eingefügt", description: "Daten wurden eingefügt." });
        return;
      }

      // Parse with the right delimiter: tab → semicolon → newline-only.
      const parse = (raw: string, delim: string): string[][] => {
        const out: string[][] = [];
        let row: string[] = [], cell = "", inQ = false;
        for (let i = 0; i < raw.length; i++) {
          const ch = raw[i];
          if (inQ) {
            if (ch === '"' && raw[i + 1] === '"') { cell += '"'; i++; }
            else if (ch === '"') { inQ = false; }
            else { cell += ch; }
          } else {
            if (ch === '"') { inQ = true; }
            else if (ch === delim) { row.push(cell); cell = ""; }
            else if (ch === "\n") { row.push(cell); out.push(row); row = []; cell = ""; }
            else if (ch !== "\r") { cell += ch; }
          }
        }
        row.push(cell);
        if (!(row.length === 1 && row[0] === "")) out.push(row);
        return out.filter(r => r.some(c => c.trim() !== ""));
      };

      let matrix: string[][];
      if (hasTab) {
        matrix = parse(text, "\t");
      } else if (hasSemicolon) {
        matrix = parse(text, ";");
      } else if (text.trimStart().startsWith('"')) {
        // Quoted RFC4180 with no column delimiter — each "..." block is one row.
        matrix = parse(text, "\x00");
      } else {
        matrix = text.split(/\r?\n/).filter(l => l.trim() !== "").map(l => [l]);
      }

      if (matrix.length === 0) return;

      setHistory(prev => [...prev.slice(-49), rows]);
      lastEditedCellRef.current = null;
      setRows(prev => {
        const newRows = [...prev];
        matrix.forEach((cells, i) => {
          const targetRow = minRow + i;
          while (targetRow >= newRows.length) newRows.push(createEmptyRow());
          const updated = { ...newRows[targetRow] };
          cells.forEach((val, j) => {
            const targetCol = minCol + j;
            if (targetCol < columns.length) {
              const tf = columns[targetCol].key as keyof ClothRow;
              let v = val.trim();
              if (tf === "EK" || tf === "VK") v = v.replace(/\./g, ",");
              (updated as any)[tf] = v;
            }
          });
          newRows[targetRow] = updated;
        });
        setRowCount(String(newRows.length));
        return newRows;
      });
      
      toast({
        title: "Eingefügt",
        description: `Daten wurden eingefügt.`,
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Konnte nicht einfügen.",
        variant: "destructive",
      });
    }
  }, [selection, rows, columns, toast]);

  // Delete selected cells
  const handleDeleteSelection = useCallback(() => {
    if (selection.length === 0) return;
    
    setHistory(prev => [...prev.slice(-49), rows]);
    
    setRows(prev => {
      const newRows = [...prev];
      selection.forEach(({ row, col }) => {
        const field = columns[col].key;
        newRows[row] = { ...newRows[row], [field]: "" };
      });
      return newRows;
    });
    
    toast({
      title: "Gelöscht",
      description: `${selection.length} Zellen wurden gelöscht.`,
    });
  }, [selection, rows, columns, toast]);

  // Find and Replace handler
  const handleFindReplace = useCallback((findValue: string, replaceValue: string, scope: "all" | "selection") => {
    if (!findValue) return;
    
    setHistory(prev => [...prev.slice(-49), rows]);
    
    let replacementCount = 0;
    
    setRows(prev => {
      const newRows = [...prev];
      
      if (scope === "selection" && selection.length > 0) {
        // Replace only in selected cells
        selection.forEach(({ row, col }) => {
          const field = columns[col].key;
          const currentValue = newRows[row][field];
          if (currentValue && currentValue.includes(findValue)) {
            newRows[row] = {
              ...newRows[row],
              [field]: currentValue.split(findValue).join(replaceValue),
            };
            replacementCount++;
          }
        });
      } else {
        // Replace in all cells
        newRows.forEach((row, rowIndex) => {
          columns.forEach((col) => {
            const currentValue = row[col.key];
            if (currentValue && currentValue.includes(findValue)) {
              newRows[rowIndex] = {
                ...newRows[rowIndex],
                [col.key]: currentValue.split(findValue).join(replaceValue),
              };
              replacementCount++;
            }
          });
        });
      }
      
      return newRows;
    });
    
    toast({
      title: "Ersetzen abgeschlossen",
      description: replacementCount > 0 
        ? `${replacementCount} Zellen wurden aktualisiert.`
        : "Keine Übereinstimmungen gefunden.",
    });
  }, [rows, selection, columns, toast]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputFocused = target.tagName === 'INPUT' && !target.closest('table');
      
      // Ctrl+F for Find & Replace - should work anywhere
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setFindReplaceOpen(true);
        return;
      }
      
      if (isInputFocused) return;
      
      // Check if we're in a table input that is actively focused (user is editing text)
      const isTableInput = (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && target.closest('table');
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (isTableInput) return; // Let browser handle native copy in focused input
        if (selection.length > 0) {
          e.preventDefault();
          handleCopySelection();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (isTableInput) return; // Let browser handle native paste in focused input
        e.preventDefault();
        if (selection.length > 0) {
          handlePasteSelection();
        } else {
          handlePaste();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (isTableInput) return; // Let browser handle native delete in focused input
        if (selection.length >= 1) {
          e.preventDefault();
          handleDeleteSelection();
        }
      } else if (e.key === 'Escape') {
        if (selection.length > 0) {
          e.preventDefault();
          // Excel-like: clear contents of all selected cells, keep selection intact
          handleDeleteSelection();
        }
      }
    };
    
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleCopySelection, handlePasteSelection, handleDeleteSelection, handlePaste, selection, handleUndo]);

  // Select entire column
  const handleColumnSelect = (colIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    const positions: CellPosition[] = rows.map((_, rowIndex) => ({ row: rowIndex, col: colIndex }));
    setSelection(positions);
    setSelectionStart({ row: 0, col: colIndex });
  };

  // Select entire row
  const handleRowSelect = (rowIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const positions: CellPosition[] = columns.map((_, colIndex) => ({ row: rowIndex, col: colIndex }));
    if (e.shiftKey && selectionStart) {
      const minRow = Math.min(selectionStart.row, rowIndex);
      const maxRow = Math.max(selectionStart.row, rowIndex);
      const allPositions: CellPosition[] = [];
      for (let r = minRow; r <= maxRow; r++) {
        columns.forEach((_, c) => allPositions.push({ row: r, col: c }));
      }
      setSelection(allPositions);
    } else if (e.ctrlKey || e.metaKey) {
      setSelection(prev => [...prev, ...positions]);
    } else {
      setSelection(positions);
      setSelectionStart({ row: rowIndex, col: 0 });
    }
  };

  const parseCsvQuoteAware = (text: string, delimiter: string): string[][] => {
    const rows: string[][] = [];
    let field = "";
    let row: string[] = [];
    let inQuotes = false;
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += ch; i++; continue;
      }
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === delimiter) { row.push(field); field = ""; i++; continue; }
      if (ch === "\r") { i++; continue; }
      if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += ch; i++;
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
  };

  const detectDelimiter = (text: string): string => {
    let inQ = false;
    const counts: Record<string, number> = { "\t": 0, ";": 0, ",": 0 };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (inQ && text[i + 1] === '"') { i++; continue; }
        inQ = !inQ; continue;
      }
      if (!inQ && counts[c] !== undefined) counts[c]++;
    }
    if (counts["\t"] > 0) return "\t";
    if (counts[";"] > 0 && counts[";"] >= counts[","]) return ";";
    if (counts[","] > 0) return ",";
    return "\t";
  };

  const handleCellPaste = (e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>, rowIndex: number, colIndex: number, field: keyof ClothRow) => {
    const pastedText = e.clipboardData.getData("text");
    if (!pastedText) return;

    const hasTab       = pastedText.includes("\t");
    const hasSemicolon = pastedText.includes(";");
    const hasNewline   = /\r?\n/.test(pastedText.trim());

    // Description is a free-text blob — always one cell, newlines included.
    if (field === "Description" && !hasTab && !hasSemicolon) {
      e.preventDefault();
      handleCellChange(rows[rowIndex].id, field, pastedText.trimEnd());
      return;
    }

    // Single-value paste with no structure → native browser (except EK/VK decimal normalisation).
    if (!hasTab && !hasSemicolon && !hasNewline) {
      if (field === "EK" || field === "VK") {
        e.preventDefault();
        handleCellChange(rows[rowIndex].id, field, pastedText.trim().replace(/\./g, ","));
      }
      return;
    }

    // RFC4180 parser — handles quoted fields with embedded newlines/delimiters.
    const parse = (text: string, delim: string): string[][] => {
      const out: string[][] = [];
      let row: string[] = [];
      let cell = "";
      let inQ = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQ) {
          if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
          else if (ch === '"') { inQ = false; }
          else { cell += ch; }
        } else {
          if (ch === '"') { inQ = true; }
          else if (ch === delim) { row.push(cell); cell = ""; }
          else if (ch === "\n") { row.push(cell); out.push(row); row = []; cell = ""; }
          else if (ch !== "\r") { cell += ch; }
        }
      }
      row.push(cell);
      if (!(row.length === 1 && row[0] === "")) out.push(row);
      return out.filter(r => r.some(c => c.trim() !== ""));
    };

    // Delimiter priority: tab (Excel) → semicolon (CSV) → quoted blocks → newline-only.
    let matrix: string[][];
    if (hasTab) {
      matrix = parse(pastedText, "\t");
    } else if (hasSemicolon) {
      matrix = parse(pastedText, ";");
    } else if (pastedText.trimStart().startsWith('"')) {
      // Quoted RFC4180 with no column delimiter — each "..." block is one row.
      matrix = parse(pastedText, "\x00");
    } else {
      // Plain newline-separated values: one value per row, one column.
      matrix = pastedText.split(/\r?\n/).filter(l => l.trim() !== "").map(l => [l]);
    }

    if (matrix.length === 0) return;
    const maxCols = Math.max(1, ...matrix.map(r => r.length));
    // Single cell with a single value → let browser handle natively (already caught above for no-newline case).
    if (matrix.length === 1 && maxCols === 1) return;

    e.preventDefault();
    setHistory(prev => [...prev.slice(-49), rows]);
    lastEditedCellRef.current = null;
    setRows(prev => {
      const newRows = [...prev];
      matrix.forEach((cells, i) => {
        const targetRow = rowIndex + i;
        while (targetRow >= newRows.length) newRows.push(createEmptyRow());
        const updated = { ...newRows[targetRow] };
        cells.forEach((val, j) => {
          const targetCol = colIndex + j;
          if (targetCol < columns.length) {
            const tf = columns[targetCol].key as keyof ClothRow;
            let v = val.trim();
            if (tf === "EK" || tf === "VK") v = v.replace(/\./g, ",");
            (updated as any)[tf] = v;
          }
        });
        newRows[targetRow] = updated;
      });
      setRowCount(String(newRows.length));
      return newRows;
    });
    toast({ title: "Daten eingefügt", description: `${matrix.length} Zeile(n) × ${maxCols} Spalte(n) verteilt.` });
  };





  const handleKeyNavigation = useCallback((e: React.KeyboardEvent, rowIndex: number, colIndex: number) => {
    const { key } = e;
    let newRow = rowIndex;
    let newCol = colIndex;

    if (key === "ArrowUp") {
      e.preventDefault();
      newRow = Math.max(0, rowIndex - 1);
    } else if (key === "ArrowDown") {
      e.preventDefault();
      newRow = Math.min(rows.length - 1, rowIndex + 1);
    } else if (key === "ArrowLeft" && (e.target as HTMLInputElement).selectionStart === 0) {
      e.preventDefault();
      newCol = Math.max(0, colIndex - 1);
    } else if (key === "ArrowRight") {
      const input = e.target as HTMLInputElement;
      if (input.selectionStart === input.value?.length) {
        e.preventDefault();
        newCol = Math.min(columns.length - 1, colIndex + 1);
      }
    } else if (key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        if (colIndex > 0) {
          newCol = colIndex - 1;
        } else if (rowIndex > 0) {
          newRow = rowIndex - 1;
          newCol = columns.length - 1;
        }
      } else {
        if (colIndex < columns.length - 1) {
          newCol = colIndex + 1;
        } else if (rowIndex < rows.length - 1) {
          newRow = rowIndex + 1;
          newCol = 0;
        }
      }
    } else if (key === "Enter") {
      e.preventDefault();
      newRow = Math.min(rows.length - 1, rowIndex + 1);
    } else if (key === "Escape") {
      e.preventDefault();
      const row = rows[rowIndex];
      const field = columns[colIndex].key;
      handleCellChange(row.id, field, "");
      return;
    } else {
      return;
    }

    if (newRow !== rowIndex || newCol !== colIndex) {
      const selector = `[data-row="${newRow}"][data-col="${newCol}"]`;
      const nextCell = document.querySelector(selector) as HTMLElement;
      if (nextCell) {
        nextCell.focus();
      }
    }
  }, [rows.length, columns.length]);

  const setRowsCount = (count: number) => {
    const currentCount = rows.length;
    if (count > currentCount) {
      setRows(prev => [...prev, ...Array.from({ length: count - currentCount }, () => createEmptyRow())]);
    } else if (count < currentCount) {
      setRows(prev => prev.slice(0, count));
    }
  };

  const deleteRow = (id: string) => {
    setRows(prev => prev.filter(row => row.id !== id));
  };

  const insertRowBelow = (id: string) => {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === id);
      if (idx === -1) return prev;
      const next = [...prev];
      next.splice(idx + 1, 0, createEmptyRow());
      return next;
    });
  };

  const handleGenerateTexts = async () => {
    const filledRows = rows.filter(r => getClothName(r).trim() !== "");
    if (filledRows.length === 0) {
      toast({ title: t("noData", lang), description: t("noDataDesc", lang), variant: "destructive" });
      return;
    }

    // Compute max VK per product name (Rule 1: skip if VK < 19)
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
    const allItems: { artikelname: string; han: string; markenname: string; beschreibung: string; warengruppe: string; art: string; _name: string }[] = [];
    rows.forEach(r => {
      const _name = getClothName(r);
      if (!_name || seen.has(_name)) return;
      seen.add(_name);
      allItems.push({
        artikelname: _name,
        han: safe(r.HAN),
        markenname: hersteller.trim(),
        beschreibung: safe(r.Description),
        warengruppe: safe(r.WarenGruppe),
        art: safe(r.MerkmaleArt),
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
        const isComplex = (it: typeof toGenerate[number]) =>
          COMPLEX_WG.has((it.warengruppe || "").trim()) || /Autositz/i.test(it.art || "");
        const complexItems = toGenerate.filter(isComplex);
        const simpleItems = toGenerate.filter(it => !isComplex(it));

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
            const failed = results.filter((r: any) => r && typeof r === "object" && "error" in r);
            if (failed.length > 0) {
              toast({
                title: lang === "DE" ? "Teilweise fehlgeschlagen" : "Partially failed",
                description: `${failed.length}/${results.length}: ${(failed[0] as any).error}`,
                variant: "destructive",
              });
            }
          }
        };

        await Promise.all([
          invokeBatch("generate-online-texts-simple", simpleItems),
          invokeBatch("generate-online-texts-complex", complexItems),
        ]);
      }

      Object.entries(reuseFrom).forEach(([dst, src]) => {
        const srcTx = generatedMap[src];
        if (!srcTx) return;
        const swap = (s: string) => (s && src ? s.split(src).join(dst) : s);
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

      // Build preview rows from all eligible items (using confirmed texts as base, overwriting with newly generated)
      const previewMap = { ...confirmedTexts, ...generatedMap };
      const empty = { produkttext: "", Title_Tag: "", html_de: "", meta_description: "", suchbegriffe: "" };
      const preview: TextPreviewRow[] = allItems.map(it => ({
        id: it._name,
        name: it._name,
        ...(previewMap[it._name] || empty),
      }));
      setTextPreviewRows(preview);
      setTextPreviewOpen(true);
    } catch (err) {
      console.error("generate-online-texts failed:", err);
      toast({ title: lang === "DE" ? "Textgenerierung fehlgeschlagen" : "Text generation failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setIsGeneratingTexts(false);
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

    const totalCols = 3 + maxDepth; // artikelnummer + han + barcode + cat columns
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
    a.download = `${kurzl || "export"}_kategorien_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: lang === "DE" ? "Kategorien exportiert" : "Categories exported",
      description: `${confirmedRows.length} ${lang === "DE" ? "Produkte" : "products"}`,
    });
  };

  const handleCategoryMapping = async () => {
    const filledRows = rows.filter(r => getClothName(r).trim() !== "");
    if (filledRows.length === 0) {
      toast({ title: t("noData", lang), description: t("noDataDesc", lang), variant: "destructive" });
      return;
    }

    // Rule 1: compute max VK per product name — skip if max VK < 19 (same as text gen)
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

    // Rule 2: deduplicate by product name only — color/size variations share the same category
    // Build one entry per unique product name; collect all color-variant artikelnummern + their HAN/EAN
    const nameGroups: Record<string, { first: ClothRow; variants: { artnr: string; han: string; barcode: string }[] }> = {};
    const artikelToName: Record<string, string> = {};
    filledRows.forEach(r => {
      const name = getClothName(r).trim();
      if (!name) return;
      const wg = r.WarenGruppe || "";
      const artnr = artikelnummerBuilder(kurzl, name, r.color || "", "", wg, aufSe);
      if (!nameGroups[name]) nameGroups[name] = { first: r, variants: [] };
      if (!nameGroups[name].variants.find(v => v.artnr === artnr)) {
        nameGroups[name].variants.push({ artnr, han: r.HAN || "", barcode: r.EAN || "" });
      }
      artikelToName[artnr] = name;
    });

    // Also include Vater-Artikel artikelnummer if vaterstat is on and there are multiple variants
    if (vaterstat) {
      Object.keys(nameGroups).forEach(name => {
        const { first, variants } = nameGroups[name];
        if (variants.length > 1) {
          const wg = first.WarenGruppe || "";
          // Vater has same artikelnummer as first color variant in our builder (empty size/color slot)
          const vaterArtnr = artikelnummerBuilder(kurzl, name, first.color || "", "", wg, aufSe);
          artikelToName[vaterArtnr] = name;
        }
      });
    }
    setCategoryArtikelToName(prev => ({ ...prev, ...artikelToName }));

    // Rule 1 applied: skip VK < 19
    const priceSkipped: string[] = [];
    const priceEligible = Object.keys(nameGroups).filter(name => {
      const ok = (vkByName[name] ?? 0) >= 19;
      if (!ok) priceSkipped.push(name);
      return ok;
    });

    // Rule 3: skip already-confirmed products (like confirmedTexts reuse)
    const alreadyConfirmed: string[] = [];
    const needsClassification = priceEligible.filter(name => {
      if (confirmedCategories[name]) { alreadyConfirmed.push(name); return false; }
      return true;
    });

    // Rule 4: reuse by Warengruppe + Art — two products with identical type → same category
    // (biggest token saver: "Kleidung Mode|T-Shirts" products all map to the same JTL path)
    const wgArtMap = new Map<string, string>(); // "WG|Art" → source product name
    const toClassify: string[] = [];
    const reuseFrom: Record<string, string> = {}; // name → name to copy path from

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
      const generatedCategoryMap: Record<string, string> = { ...confirmedCategories };

      if (toClassify.length > 0) {
        const items = toClassify.map(name => {
          const { first } = nameGroups[name];
          const wg = first.WarenGruppe || "";
          const artnr = artikelnummerBuilder(kurzl, name, first.color || "", "", wg, aufSe);
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

        const res = await fetch("/api/map-categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || res.statusText);

        const results: { artikelnummer: string; categoryPath: string }[] = data.results;
        toClassify.forEach((name, i) => {
          generatedCategoryMap[name] = (results[i]?.categoryPath || "").trim();
        });
      }

      // Apply Warengruppe+Art reuse
      Object.entries(reuseFrom).forEach(([dst, src]) => {
        generatedCategoryMap[dst] = generatedCategoryMap[src] || "";
      });

      toast({
        title: lang === "DE" ? "Kategorien klassifiziert" : "Categories classified",
        description: lang === "DE"
          ? `${callsMade} KI-Aufrufe · ${reuseCount} Typ-Reuse · ${confirmedReuseCount} bereits bestätigt · ${priceSkippedCount} übersprungen (VK<19)`
          : `${callsMade} AI calls · ${reuseCount} type-reuse · ${confirmedReuseCount} already confirmed · ${priceSkippedCount} skipped (VK<19)`,
      });

      // Build preview rows: one row per color-variant, all sharing the name's category
      const previewRows: CategoryPreviewRow[] = [];
      priceEligible.forEach(name => {
        const { variants } = nameGroups[name];
        const categoryPath = generatedCategoryMap[name] || "";
        variants.forEach(({ artnr, han, barcode }) => {
          previewRows.push({ id: crypto.randomUUID(), artikelnummer: artnr, han, barcode, categoryPaths: categoryPath ? [categoryPath] : [] });
        });
      });

      setCategoryPreviewRows(previewRows);
      setCategoryPreviewOpen(true);
    } catch (err) {
      toast({
        title: lang === "DE" ? "Fehler" : "Error",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setIsMapping(false);
    }
  };

  const handleCategoryConfirm = (confirmedRows: CategoryPreviewRow[]) => {
    const updated: Record<string, string> = { ...confirmedCategories };
    confirmedRows.forEach(r => {
      const name = categoryArtikelToName[r.artikelnummer];
      if (name) updated[name] = r.categoryPaths[0] || ""; // save primary path for next-run reuse
    });
    setConfirmedCategories(updated);
    exportCategoryCSV(confirmedRows);
  };

  const processAndDownload = async (textsOverride?: typeof confirmedTexts) => {
    const AufAB = parseInt(ab) || 1;
    const AufAuf = parseInt(auf) || 2;
    const AufSe = aufSe;
    const Lieferstatus = verfuegbarkeit || "3 - 5 Werktage";
    const LieferzeitVal = parseInt(lieferzeit) || 14;

    // Group by combined name + color
    const groups: Record<string, ClothRow[]> = {};
    rows.forEach(row => {
      const key = `${safe(getClothName(row))}|${safe(row.color)}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    });

    const textsByName = textsOverride ?? confirmedTexts;

    const outputRows: Record<string, string | number>[] = [];

    Object.entries(groups).forEach(([key, groupRows]) => {
      const [name, color] = key.split("|");
      if (!name && !color) return;

      const sizes = [...new Set(groupRows.map(r => safe(r.Size)))];
      const hasParent = vaterstat && sizes.length > 1;
      // German translation is fetched ONCE per name and reused for Artikelname/Etikettenname
      const translated = name;

      // Aggregate merkmale across group for parent row (union of values)
      const unionMulti = (key: "MerkmaleGroesse" | "MerkmaleArt" | "MerkmaleFarbe") => {
        const set = new Set<string>();
        groupRows.forEach(r => {
          (r[key] || "").split(",").map(v => v.trim()).filter(Boolean).forEach(v => set.add(v));
        });
        return [...set].join(", ");
      };
      const parentGroesse = unionMulti("MerkmaleGroesse");
      const parentArt = unionMulti("MerkmaleArt");
      const parentFarbe = unionMulti("MerkmaleFarbe");

      const tx = textsByName[name] || { produkttext: "", Title_Tag: "", html_de: "", meta_description: "", suchbegriffe: "" };

      if (hasParent) {
        const firstRowWarengruppe = groupRows[0]?.WarenGruppe || "";
        const vaterArtikelnummer = artikelnummerBuilder(kurzl, name, color, "", firstRowWarengruppe, AufSe);
        const toNum = (v: string) => {
          const n = parseFloat((v || "").replace(",", "."));
          return isNaN(n) ? Infinity : n;
        };
        const eks = groupRows.map(r => ({ raw: r.EK || "", num: toNum(r.EK || "") })).filter(x => isFinite(x.num));
        const vks = groupRows.map(r => ({ raw: r.VK || "", num: toNum(r.VK || "") })).filter(x => isFinite(x.num));
        const minEK = eks.length ? eks.reduce((a, b) => a.num <= b.num ? a : b).raw : "";
        const minVK = vks.length ? vks.reduce((a, b) => a.num <= b.num ? a : b).raw : "";
        outputRows.push(buildRow(
          vaterArtikelnummer, "", name, "", color, "", "Vater", minEK, minVK, hersteller,
          AufAB, AufAuf, AufSe, Lieferstatus, LieferzeitVal, "", lieferant, firstRowWarengruppe, translated,
          parentGroesse, parentArt, parentFarbe, "",
          tx.produkttext, tx.Title_Tag, tx.html_de, tx.meta_description, tx.suchbegriffe
        ));
      }

      groupRows.forEach(r => {
        const wg = r.WarenGruppe || "";
        const artikelnummer = artikelnummerBuilder(kurzl, name, color, r.Size, wg, AufSe);
        const eanVal = safe(r.EAN) || "";
        const hanVal = safe(r.HAN) || "";
        const rowGroesse = (r.MerkmaleGroesse || "").split(",").map(v => v.trim()).filter(Boolean).join(", ");
        const rowArt = (r.MerkmaleArt || "").split(",").map(v => v.trim()).filter(Boolean).join(", ");
        const rowFarbe = (r.MerkmaleFarbe || "").split(",").map(v => v.trim()).filter(Boolean).join(", ");
        outputRows.push(buildRow(
          artikelnummer,
          hasParent ? artikelnummerBuilder(kurzl, name, color, "", wg, AufSe) : "",
          name,
          r.Size,
          color,
          eanVal,
          hanVal,
          r.EK,
          r.VK,
          hersteller,
          AufAB,
          AufAuf,
          AufSe,
          Lieferstatus,
          LieferzeitVal,
          r.Menge,
          lieferant,
          r.WarenGruppe || "",
          translated,
          rowGroesse,
          rowArt,
          rowFarbe,
          safe(r.Description),
          tx.produkttext, tx.Title_Tag, tx.html_de, tx.meta_description, tx.suchbegriffe
        ));
      });
    });
    if (outputRows.length === 0) return;

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
      ...outputRows.map(row => headers.map(h => escCsv(row[h])).join(";"))
    ].join("\r\n");

    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, '0')}${String(today.getMonth() + 1).padStart(2, '0')}${today.getFullYear()}`;
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kurzl || "export"}_artikelanlegen_GESAMT_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };



  return (
    <div className="min-h-screen bg-background p-6">
      <FindReplaceDialog
        open={findReplaceOpen}
        onOpenChange={setFindReplaceOpen}
        onReplace={handleFindReplace}
        hasSelection={selection.length > 0}
      />
      <div className="max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{t("pageTitle", lang)}</h1>
            <Button onClick={() => setImportDialogOpen(true)} variant="outline" size="sm" className="gap-1.5">
              <Upload className="h-4 w-4" />
              {lang === "DE" ? "Datei importieren" : "Import file"}
            </Button>
            <Button
              onClick={handleClearData}
              variant="outline"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-destructive hover:border-destructive/50"
            >
              <RotateCcw className="h-4 w-4" />
              {lang === "DE" ? "Daten leeren" : "Clear data"}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <a href="/text-generator">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Sparkles className="h-3.5 w-3.5" />
                {lang === "DE" ? "Texte" : "Texts"}
              </Button>
            </a>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setLang(prev => prev === "DE" ? "EN" : "DE")}
            >
              <Globe className="h-4 w-4" />
              {lang === "DE" ? "EN" : "DE"}
            </Button>
          </div>
        </div>
        
        {/* JTL Reference Import */}
        <div className="bg-card border border-border rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
          <input
            ref={jtlFileInputRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleJtlImport(f);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => jtlFileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            {lang === "DE" ? "JTL-Artikeldaten laden" : "Load JTL article data"}
          </Button>
          {jtlDataset.length > 0 ? (
            <span className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{jtlDataset.length.toLocaleString("de-DE")}</span>
              {lang === "DE" ? " Artikel geladen" : " articles loaded"}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">
              {lang === "DE"
                ? "JTL/Ameise-Exportdatei (.csv) als Referenz laden"
                : "Load a JTL/Ameise export (.csv) as reference"}
            </span>
          )}
        </div>

        {/* Input Controls */}
        <div className="bg-card border border-border rounded-lg p-4 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="kurzl" className="text-xs">{t("kurzl", lang)}</Label>
              <Input id="kurzl" value={kurzl} onChange={(e) => setKurzl(e.target.value)} placeholder="z.B. SNU FS26" className="w-36" />
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="hersteller" className="text-xs">{t("hersteller", lang)}</Label>
              <Input id="hersteller" value={hersteller} onChange={(e) => setHersteller(e.target.value)} placeholder="z.B. SNUG" className="w-36" />
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="lieferant" className="text-xs">{t("lieferant", lang)}</Label>
              <Input id="lieferant" value={lieferant} onChange={(e) => setLieferant(e.target.value)} placeholder="z.B. Snug" className="w-36" />
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="auf" className="text-xs">{t("auf", lang)}</Label>
              <Input id="auf" type="number" min="0" value={auf} onChange={(e) => setAuf(e.target.value)} className="w-14" />
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="ab" className="text-xs">{t("ab", lang)}</Label>
              <Input id="ab" type="number" min="0" value={ab} onChange={(e) => setAb(e.target.value)} className="w-14" />
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="aufSe" className="text-xs">{t("auffuellSeason", lang)}</Label>
              <Input id="aufSe" value={aufSe} onChange={(e) => setAufSe(e.target.value)} placeholder="z.B. SS25" className="w-28" />
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="lieferzeit" className="text-xs">{t("lieferzeit", lang)}</Label>
              <Input id="lieferzeit" inputMode="numeric" pattern="[0-9]*" value={lieferzeit} onChange={(e) => setLieferzeit(e.target.value.replace(/[^0-9]/g, ''))} placeholder="14" className="w-14" />
            </div>

            <div className="space-y-1">
              <Label htmlFor="verfuegbarkeit" className="text-xs">{t("lieferstatusOnline", lang)}</Label>
              <Select value={verfuegbarkeit} onValueChange={setVerfuegbarkeit}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder={t("lieferstatusPlaceholder", lang)} />
                </SelectTrigger>
                <SelectContent>
                  {verfuegbarkeitOptions.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                  <div className="px-2 py-1.5 border-t border-border mt-1">
                    <Input
                      placeholder={t("manualInput", lang)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const val = (e.target as HTMLInputElement).value.trim();
                          if (val) setVerfuegbarkeit(val);
                        }
                        e.stopPropagation();
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-4 pb-2">
              <div className="flex items-center gap-1.5">
                <Checkbox id="vaterstat" checked={vaterstat} onCheckedChange={(checked) => setVaterstat(checked === true)} />
                <Label htmlFor="vaterstat" className="text-xs font-normal cursor-pointer">{t("vaterStatus", lang)}</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <Checkbox id="merkmale" checked={merkmale} onCheckedChange={(checked) => setMerkmale(checked === true)} />
                <Label htmlFor="merkmale" className="text-xs font-normal cursor-pointer">{t("merkmale", lang)}</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <Checkbox id="kollektion" checked={showKollektion} onCheckedChange={(checked) => setShowKollektion(checked === true)} />
                <Label htmlFor="kollektion" className="text-xs font-normal cursor-pointer">{t("colCollection", lang)}</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <Checkbox id="measurement" checked={showMeasurement} onCheckedChange={(checked) => setShowMeasurement(checked === true)} />
                <Label htmlFor="measurement" className="text-xs font-normal cursor-pointer">{t("colMeasurement", lang)}</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <Checkbox id="infomaterial" checked={showInfoMaterial} onCheckedChange={(checked) => setShowInfoMaterial(checked === true)} />
                <Label htmlFor="infomaterial" className="text-xs font-normal cursor-pointer">{t("colInfoMaterial", lang)}</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <Checkbox id="description" checked={showDescription} onCheckedChange={(checked) => setShowDescription(checked === true)} />
                <Label htmlFor="description" className="text-xs font-normal cursor-pointer">{lang === "DE" ? "Beschreibung" : "Description"}</Label>
              </div>
            </div>
          </div>
        </div>

        {/* Excel-like Table */}
        <div className="border border-border rounded-lg overflow-hidden mb-4">
          <div className="overflow-x-auto">
            <table ref={tableRef} className="w-full border-collapse select-none">
              <thead>
                <tr className="bg-[hsl(0,0%,85%)]">
                  <th className="border border-[hsl(0,0%,75%)] px-1 py-2 w-8 bg-[hsl(0,0%,80%)] cursor-pointer hover:bg-[hsl(0,0%,75%)]"
                    onClick={() => {
                      // Select all cells
                      const allCells: CellPosition[] = [];
                      rows.forEach((_, r) => columns.forEach((_, c) => allCells.push({ row: r, col: c })));
                      setSelection(allCells);
                    }}
                    title={t("selectAll", lang)}
                  >
                    <span className="text-xs text-muted-foreground">#</span>
                  </th>
                  {columns.map((col, colIndex) => (
                    <th 
                      key={col.key}
                      className="border border-[hsl(0,0%,75%)] px-2 py-2 text-left text-sm font-semibold text-foreground cursor-pointer hover:bg-[hsl(0,0%,80%)] relative"
                      style={{ 
                        minWidth: col.resizable ? `${columnWidths[col.key] || parseInt(col.width)}px` : col.width,
                        width: col.resizable ? `${columnWidths[col.key] || parseInt(col.width)}px` : undefined,
                      }}
                      onClick={(e) => !col.isDropdown && !col.resizable && handleColumnSelect(colIndex, e)}
                    >
                      <div className="flex items-center justify-between">
                        {col.isDropdown && col.dropdownOptions ? (
                          <Select onValueChange={(value) => handleHeaderDropdownChange(col.key, value)}>
                            <SelectTrigger className="h-7 bg-white border-border text-sm font-semibold">
                              <SelectValue placeholder={col.label} />
                            </SelectTrigger>
                            <SelectContent className="bg-background z-50">
                              {getDropdownOptions(col.dropdownOptions, col.translationMap || {}, lang).map(({ value, label }) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="flex items-center gap-2" onClick={(e) => { e.stopPropagation(); handleColumnSelect(colIndex, e); }}>
                            {col.label}
                            {col.key === "HAN" && (
                              <>
                                <Switch
                                  checked={combineHAN}
                                  onCheckedChange={setCombineHAN}
                                  onClick={(e) => e.stopPropagation()}
                                  title={lang === "DE" ? "HAN + Farbe + Größe kombinieren" : "Combine HAN + Color + Size"}
                                  className="scale-75"
                                />
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleFixHAN(); }}
                                  className="px-1.5 py-0.5 text-[10px] rounded bg-primary text-primary-foreground hover:bg-primary/90"
                                  title={lang === "DE" ? "HAN-Werte fixieren" : "Lock HAN values"}
                                >
                                  {lang === "DE" ? "Fix" : "Fix"}
                                </button>
                              </>
                            )}
                            {col.key === "ItemName" && (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleRestructureNames(); }}
                                  className="px-1.5 py-0.5 text-[10px] rounded bg-primary text-primary-foreground hover:bg-primary/90"
                                  title={lang === "DE" ? "KI: Name umstrukturieren & Farbe extrahieren" : "AI: Restructure name & extract color"}
                                  disabled={isRestructuring}
                                >
                                  {isRestructuring ? "..." : "Re"}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleTranslateNames(); }}
                                  className="px-1.5 py-0.5 text-[10px] rounded bg-primary text-primary-foreground hover:bg-primary/90"
                                  title={lang === "DE" ? "Namen ins Deutsche übersetzen" : "Translate names to German"}
                                  disabled={isTranslating}
                                >
                                  {isTranslating ? "..." : "De"}
                                </button>
                              </>
                            )}
                          </span>
                        )}
                        {col.resizable && (
                          <div
                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary"
                            onMouseDown={(e) => handleResizeStart(e, col.key)}
                          />
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="border border-[hsl(0,0%,75%)] px-2 py-2 w-10 bg-[hsl(0,0%,85%)]"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={row.id} className={rowIndex % 2 === 0 ? "bg-[hsl(0,0%,96%)]" : "bg-[hsl(0,0%,92%)]"}>
                    <td 
                      className="border border-[hsl(0,0%,85%)] px-1 py-1 text-center text-xs text-muted-foreground bg-[hsl(0,0%,90%)] cursor-pointer hover:bg-[hsl(0,0%,85%)]"
                      onClick={(e) => handleRowSelect(rowIndex, e)}
                      title={t("selectRow", lang)}
                    >
                      {rowIndex + 1}
                    </td>
                    {columns.map((col, colIndex) => {
                      const isSelected = isCellSelected(rowIndex, colIndex);
                      const isInFillRange = fillHandleDrag &&
                        colIndex === fillHandleDrag.sourceCol &&
                        rowIndex !== fillHandleDrag.sourceRow &&
                        rowIndex >= Math.min(fillHandleDrag.sourceRow, fillHandleDrag.targetRow) &&
                        rowIndex <= Math.max(fillHandleDrag.sourceRow, fillHandleDrag.targetRow);
                      const cellValue = col.key === "HAN" && combineHAN && !hanFixed[row.id]
                        ? [row.HAN, row.color, row.Size].map(v => (v || "").trim()).filter(Boolean).join(" ")
                        : row[col.key];
                      
                      return (
                        <td 
                          key={col.key} 
                          className={`border border-[hsl(0,0%,85%)] p-0 relative group/cell ${isSelected ? 'bg-primary/20 ring-2 ring-primary ring-inset' : ''} ${isInFillRange ? 'bg-primary/30 ring-1 ring-primary ring-inset' : ''}`}
                          style={{
                            width: col.resizable ? `${columnWidths[col.key] || parseInt(col.width)}px` : undefined,
                            minWidth: col.resizable ? `${columnWidths[col.key] || parseInt(col.width)}px` : undefined,
                          }}
                          onMouseDown={(e) => handleCellMouseDown(e, rowIndex, colIndex)}
                          onMouseEnter={() => {
                            handleCellMouseEnter(rowIndex, colIndex);
                            if (fillHandleDrag && colIndex === fillHandleDrag.sourceCol) {
                              handleFillHandleDragMove(rowIndex);
                            }
                          }}
                          onMouseUp={() => {
                            if (fillHandleDrag) {
                              handleFillHandleDragEnd();
                            }
                          }}
                        >
                          {col.isMultiSelect && col.dropdownOptions ? (
                            <div 
                              className="relative"
                              onClickCapture={(e) => {
                                if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                  e.stopPropagation();
                                  e.preventDefault();
                                }
                              }}
                            >
                              <MerkmaleMultiSelect
                                values={(row[col.key] || "").split(",").map(v => v.trim()).filter(Boolean)}
                                options={col.dropdownOptions}
                                translationMap={col.translationMap || {}}
                                lang={lang}
                                placeholder={t("choose", lang)}
                                onChange={(vals) => handleCellChange(row.id, col.key, vals.join(", "))}
                                data-row={rowIndex}
                                data-col={colIndex}
                                onKeyDown={(e) => handleKeyNavigation(e, rowIndex, colIndex)}
                              />
                              {row[col.key] && rowIndex < rows.length - 1 && (
                                <div
                                  className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-primary cursor-crosshair z-20 border border-background"
                                  onMouseDown={(e) => handleFillHandleMouseDown(e, rowIndex, colIndex)}
                                  onDoubleClick={(e) => { e.stopPropagation(); handleFillDoubleClick(rowIndex, colIndex); }}
                                  title={t("fillDoubleClick", lang)}
                                />
                              )}
                            </div>
                          ) : col.isDropdown && col.dropdownOptions ? (
                            <div 
                              className="relative"
                              onClickCapture={(e) => {
                                if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                  e.stopPropagation();
                                  e.preventDefault();
                                }
                              }}
                            >
                              <Select 
                                value={row[col.key] || ""} 
                                onValueChange={(value) => handleCellChange(row.id, col.key, value)}
                              >
                                <SelectTrigger 
                                  className="w-full h-8 border-none rounded-none bg-transparent focus:ring-2 focus:ring-primary/50 text-sm pr-8"
                                  data-row={rowIndex}
                                  data-col={colIndex}
                                  onKeyDown={(e) => handleKeyNavigation(e, rowIndex, colIndex)}
                                  onPointerDown={(e) => {
                                    if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                    }
                                  }}
                                >
                                  <SelectValue placeholder={t("choose", lang)}>
                                    {row[col.key] ? getDisplayValue(row[col.key] || "", col.translationMap || {}, lang) : undefined}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent className="bg-background z-50">
                                  {getDropdownOptions(col.dropdownOptions, col.translationMap || {}, lang).map(({ value, label }) => (
                                    <SelectItem key={value} value={value}>
                                      {label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {row[col.key] && rowIndex < rows.length - 1 && (
                                <div
                                  className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-primary cursor-crosshair z-20 border border-background"
                                  onMouseDown={(e) => handleFillHandleMouseDown(e, rowIndex, colIndex)}
                                  onDoubleClick={(e) => { e.stopPropagation(); handleFillDoubleClick(rowIndex, colIndex); }}
                                  title={t("fillDoubleClick", lang)}
                                />
                              )}
                            </div>
                          ) : (
                            <input
                              type="text"
                              value={cellValue}
                              onChange={(e) => handleCellChange(row.id, col.key, e.target.value)}
                              onPaste={(e) => handleCellPaste(e, rowIndex, colIndex, col.key)}
                              onKeyDown={(e) => handleKeyNavigation(e, rowIndex, colIndex)}
                              data-row={rowIndex}
                              data-col={colIndex}
                              readOnly={col.key === "HAN" && combineHAN && !hanFixed[row.id]}
                              className="w-full px-2 py-1.5 bg-transparent border-none outline-none focus:ring-2 focus:ring-primary/50 text-sm pr-6"
                            />
                          )}
                          {!col.isDropdown && row[col.key] && rowIndex < rows.length - 1 && (
                            <div
                              className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-primary cursor-crosshair z-20 border border-background"
                              onMouseDown={(e) => handleFillHandleMouseDown(e, rowIndex, colIndex)}
                              onDoubleClick={(e) => { e.stopPropagation(); handleFillDoubleClick(rowIndex, colIndex); }}
                              title={t("fillDoubleClick", lang)}
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="border border-[hsl(0,0%,85%)] p-1">
                      <div className="flex gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-primary hover:text-primary"
                          onClick={() => insertRowBelow(row.id)}
                          title="Insert row below"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => deleteRow(row.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action toolbar */}
        <div className="flex items-center gap-2 flex-wrap mt-4">

          {/* ── Row count + undo ── */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">{t("rowCount", lang)}</span>
            <Input
              id="rowCount"
              type="number"
              value={rowCount}
              onChange={(e) => {
                setRowCount(e.target.value);
                const count = parseInt(e.target.value) || 0;
                if (count > 0) setRowsCount(count);
              }}
              className="h-8 w-20 text-sm"
              min="1"
            />
            <Button
              onClick={handleUndo}
              variant="outline"
              size="sm"
              disabled={history.length === 0}
              title={t("undoTitle", lang)}
            >
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="w-px h-5 bg-border" />

          {/* ── Order summary ── */}
          <div className="flex items-center gap-2.5 px-3 h-8 bg-background rounded-md border border-input text-xs">
            <span className="text-muted-foreground">{t("artikel", lang)}</span>
            <span className="font-semibold">{filledRowsCount}</span>
            <div className="w-px h-4 bg-border" />
            <span className="text-muted-foreground">{t("bestellwert", lang)}</span>
            <span className="font-bold text-primary">
              {orderTotal.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
            </span>
            <div className="w-px h-4 bg-border" />
            <span className="text-muted-foreground whitespace-nowrap">{t("rabatt", lang)}</span>
            <Input
              id="discount"
              type="text"
              inputMode="decimal"
              value={discount}
              onChange={handleDiscountChange}
              placeholder="0"
              className="h-5 w-12 px-1 text-xs text-center"
            />
            {parseFloat(discount.replace(",", ".")) > 0 && (
              <>
                <div className="w-px h-4 bg-border" />
                <span className="text-muted-foreground">{t("netto", lang)}</span>
                <span className="font-bold">
                  {discountedTotal.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                </span>
              </>
            )}
          </div>

          <div className="w-px h-5 bg-border" />

          {/* ── Paste ── */}
          <Button onClick={handlePaste} variant="outline" size="sm" className="gap-1.5">
            <ClipboardPaste className="h-3.5 w-3.5" />
            {t("csvPaste", lang)}
          </Button>

          <div className="w-px h-5 bg-border" />

          {/* ── Text generation toggle ── */}
          <div className="flex items-center gap-1">
            <Switch
              id="textGenerating"
              checked={textGenerating}
              onCheckedChange={(v) => {
                setTextGenerating(v);
                if (v) handleGenerateTexts();
              }}
              className="scale-90"
            />
            <Label htmlFor="textGenerating" className="text-xs font-normal cursor-pointer whitespace-nowrap">
              {lang === "DE" ? "Texte" : "Texts"}
            </Label>
            {textGenerating && textPreviewRows.length > 0 && (
              <Button
                variant="ghost" size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => setTextPreviewOpen(true)}
                title={lang === "DE" ? "Textvorschau öffnen" : "Open text preview"}
                disabled={isGeneratingTexts}
              >
                {isGeneratingTexts ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
              </Button>
            )}
          </div>

          {/* ── Kategorien toggle ── */}
          <div className="flex items-center gap-1">
            <Switch
              id="kategorienToggle"
              checked={kategorienToggle}
              onCheckedChange={(v) => {
                setKategorienToggle(v);
                if (v) handleCategoryMapping();
              }}
              className="scale-90"
            />
            <Label htmlFor="kategorienToggle" className="text-xs font-normal cursor-pointer whitespace-nowrap">
              {lang === "DE" ? "Kategorien" : "Categories"}
            </Label>
            {kategorienToggle && categoryPreviewRows.length > 0 && (
              <Button
                variant="ghost" size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => setCategoryPreviewOpen(true)}
                title={lang === "DE" ? "Kategorienvorschau öffnen" : "Open category preview"}
                disabled={isMapping}
              >
                {isMapping ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
              </Button>
            )}
          </div>

          {/* ── Primary export ── */}
          <Button onClick={() => processAndDownload()} size="sm" className="gap-1.5" disabled={isGeneratingTexts || isMapping}>
            <Download className="h-3.5 w-3.5" />
            {t("csvExport", lang)}
          </Button>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={jtlDataset.length === 0}
                  onClick={() => {
                    const candidates: PreCheckCandidate[] = rows
                      .map((r, i) => ({
                        rowId: r.id,
                        rowIndex: i,
                        clothName: getClothName(r),
                        han: r.HAN,
                        gtin: r.EAN,
                        warengruppe: r.WarenGruppe,
                        itemName: r.ItemName,
                        infoMaterial: r.InfoMaterial,
                        collection: r.Collection,
                      }))
                      .filter(c => c.han.trim() || c.gtin.trim() || c.clothName.trim());
                    setPreCheckCandidates(candidates);
                    setPreCheckOpen(true);
                  }}
                >
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  {lang === "DE" ? "Vorabprüfung" : "Pre-check"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {jtlDataset.length === 0
                  ? (lang === "DE" ? "Erst JTL-Datei laden" : "Load a JTL file first")
                  : (lang === "DE" ? "Duplikate, Varianten & Namen prüfen" : "Check duplicates, variants & names")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="w-px h-5 bg-border" />

          {/* ── AI tools ── */}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleAIClassify} disabled={isClassifying || isRetrying}>
            {isClassifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {isClassifying ? t("aiClassifying", lang) : t("aiClassify", lang)}
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="px-2"
                  onClick={handleAIClassifyRetry}
                  disabled={isClassifying || isRetrying}
                >
                  {isRetrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {lang === "DE" ? "Unvollständige neu klassifizieren" : "Retry incomplete rows"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="w-px h-5 bg-border" />

          {/* ── JTL duplicate check ── */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleJtlCheck}
                  disabled={jtlDataset.length === 0}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {lang === "DE" ? "JTL Prüfen" : "JTL Check"}
                  {jtlDataset.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">({jtlDataset.length.toLocaleString("de-DE")})</span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {jtlDataset.length === 0
                  ? (lang === "DE" ? "Erst JTL-Datei laden" : "Load a JTL file first")
                  : (lang === "DE" ? "HAN/GTIN gegen JTL-Referenz prüfen" : "Check HAN/GTIN against JTL reference")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* ── Naming pattern analysis ── */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setNamingPatternOpen(true)}
                  disabled={jtlDataset.length === 0}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  {lang === "DE" ? "Namensanalyse" : "Name patterns"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {jtlDataset.length === 0
                  ? (lang === "DE" ? "Erst JTL-Datei laden" : "Load a JTL file first")
                  : (lang === "DE" ? "Namensstruktur pro Warengruppe analysieren" : "Analyze naming structure per product group")}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      <ImportDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} onImport={handleImportRows} lang={lang} />
      <TextPreviewModal
        open={textPreviewOpen}
        onOpenChange={setTextPreviewOpen}
        initialRows={textPreviewRows}
        lang={lang}
        onConfirm={(editedRows) => {
          const map: Record<string, { produkttext: string; Title_Tag: string; html_de: string; meta_description: string; suchbegriffe: string }> = {};
          editedRows.forEach(r => {
            map[r.name] = { produkttext: r.produkttext, Title_Tag: r.Title_Tag, html_de: r.html_de, meta_description: r.meta_description, suchbegriffe: r.suchbegriffe };
          });
          setConfirmedTexts(map);
        }}
      />
      <CategoryPreviewModal
        open={categoryPreviewOpen}
        onOpenChange={setCategoryPreviewOpen}
        initialRows={categoryPreviewRows}
        lang={lang}
        onConfirm={handleCategoryConfirm}
      />
      <JtlCheckModal
        open={jtlCheckOpen}
        onOpenChange={setJtlCheckOpen}
        results={jtlCheckResults}
        lang={lang}
      />
      <NamingPatternModal
        open={namingPatternOpen}
        onOpenChange={setNamingPatternOpen}
        dataset={jtlDataset}
        lang={lang}
      />
      <ArticlePreCheckModal
        open={preCheckOpen}
        onOpenChange={setPreCheckOpen}
        candidates={preCheckCandidates}
        jtlDataset={jtlDataset}
        lang={lang}
        onReuploadJtl={() => jtlFileInputRef.current?.click()}
      />
    </div>
  );
};

export default Index;
