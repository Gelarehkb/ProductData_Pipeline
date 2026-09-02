// Pure, stateless helpers for building the GESAMT export CSV — shared
// between the main grid (Index.tsx) and any other page that needs to
// produce the same JTL import shape (e.g. the Smart page).

export interface ClothRow {
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
  Artikelnummer?: string;
  MerkmaleGroesse?: string;
  MerkmaleFarbe?: string;
  MerkmaleArt?: string;
}

// Combine the 4 ItemName sub-fields into one string, avoiding double spaces
export const getClothName = (row: ClothRow): string => {
  return [row.Collection, row.ItemName, row.Measurement, row.InfoMaterial]
    .map(s => s?.trim() || "")
    .filter(Boolean)
    .join(" ");
};

// The Artikelnummer column holds the original Stammdaten naming, pasted in
// separately from the Name column — it feeds the exported SKU (Artikelnummer),
// while the Name column stays dedicated to the exported Artikelname.
export const getArtikelnummerName = (row: ClothRow): string => (row.Artikelnummer || "").trim();

// Strip forbidden characters from names for artikelnummer etc. (hyphen "-" is allowed)
export const stripForbiddenChars = (s: string): string => s.replace(/\s+/g, " ").trim();

// Returns each value that appears more than once (blank values ignored —
// missing Artikelnummer is its own separate problem, not a "duplicate").
// Used to block a GESAMT export whose SKUs collide, since JTL import
// silently overwrites/conflates rows sharing the same Artikelnummer.
export const findDuplicateValues = (values: string[]): string[] => {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  values.forEach(v => {
    const trimmed = (v || "").trim();
    if (!trimmed) return;
    if (seen.has(trimmed)) dupes.add(trimmed);
    else seen.add(trimmed);
  });
  return [...dupes];
};

export const safe = (val: string | null | undefined): string => {
  if (val === null || val === undefined) return "";
  const v = String(val).trim();
  return v.toLowerCase() === "nan" ? "" : v;
};

export const capitalizeWord = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

// Title-cases each word, treating hyphens as internal word boundaries too —
// otherwise a compound like "Bio-Baumwolle" would come out "Bio-baumwolle".
export const toProperCase = (s: string): string =>
  s.split(' ').map(w => w.split('-').map(capitalizeWord).join('-')).join(' ');

// Map a Size value to the best matching MerkmaleGroesse option
export const mapSizeToMerkmaleGroesse = (size: string, options: string[]): string => {
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
export const mapColorToMerkmaleFarbe = (color: string, options: string[]): string => {
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

export const AUFSE_WARENGRUPPEN = ["Kleidung Basics", "Kleidung Funktion", "Kleidung Mode"];

export const artikelnummerBuilder = (KRZL: string, name: string, color: string, size: string, warengruppe: string = "", seasonalCode: string = ""): string => {
  const cleanName = stripForbiddenChars(name);
  const cleanColor = stripForbiddenChars(color);
  const includeSeasonalCode = seasonalCode.trim() !== "" && AUFSE_WARENGRUPPEN.includes(warengruppe);
  const parts = [KRZL.toUpperCase()];
  if (includeSeasonalCode) parts.push(stripForbiddenChars(seasonalCode).toUpperCase());
  parts.push(toProperCase(cleanName), cleanColor.toLowerCase());
  const filtered = parts.filter(Boolean);
  if (size !== "") {
    filtered.push(stripForbiddenChars(size).toUpperCase());
  }
  return filtered.join(" ").replace(/\s+/g, " ").trim();
};

export const buildRow = (
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

  // Proper Case name + lowercase color, no double spaces. A confirmed
  // AI-generated name can already fold the color into itself (mirroring the
  // reference JTL convention) — only append color here if it isn't already
  // part of the name, so it's never duplicated.
  const fmtName = (n: string) => toProperCase(n);
  const baseName = fmtName(translatedName || name);
  const alreadyHasColor = color !== "" && baseName.toLowerCase().includes(color.toLowerCase());
  const nameWithColor = [baseName, alreadyHasColor ? "" : color.toLowerCase()].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

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
