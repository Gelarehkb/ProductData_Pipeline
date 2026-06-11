import { Router } from 'express';

const router = Router();

const buildPrompt = (item) => {
  const A  = item.artikelname   || '';
  const C  = item.markenname    || '';
  const D  = item.beschreibung  || '';
  const W  = item.warengruppe   || '';
  const ART         = item.art              || '';
  const SCHAURAUM   = item.im_schauraum     || '';
  const PREIS       = item.preisniveau      || '';
  const VARIANTEN   = item.varianten        || '';
  const USPS        = item.usps             || '';
  const AWARDS      = item.auszeichnungen   || '';
  const LIMITIERT   = item.limitiert        || '';
  const isAutositz  = /Autositz/i.test(ART);
  const schauraum_hint = SCHAURAUM.toLowerCase() === 'ja'
    ? '\n- Im Schauraum: explizit erwähnen dass das Produkt in Wien getestet werden kann.'
    : '';

  return `Du bist Texter für herrundfrauklein.com (Baby/Kinderartikel, Wien). Antworte NUR mit JSON – kein Markdown.

INPUT
Markenname: "${C}"
Artikelname: "${A}"
Produktkategorie: "${W}"
Art: "${ART}"
Im Schauraum: "${SCHAURAUM}"
Preisniveau: "${PREIS}"
Varianten: "${VARIANTEN}"
USPs: "${USPS}"
Auszeichnungen: "${AWARDS}"
Limitiert/Saison: "${LIMITIERT}"
Referenzinformationen: "${D}"${isAutositz ? '\n⚠ Autositz: Normen (i-Size/ECE R129/R44), Gewichts-/Größenbereich, Isofix, Einbaurichtung, Lieferumfang recherchieren.' : ''}

Fehlende Felder eigenständig recherchieren – keine Fakten erfinden.
Quellenpriorität: 1) Herstellerwebsite  2) Referenzinformationen  3) weitere Quellen.
Bei Widersprüchen: immer Herstellerangabe.

JSON-KEYS (alle Pflicht):
"produkttext" | "html_de" | "meta_description" | "title_tag" | "suchbegriffe" | "farbe" | "produktart"

════════════════════════════════════════
AUFGABE 1 – html_de  (+ produkttext als Plaintext davon)
════════════════════════════════════════
Komplexität nach Erklärungsbedarf, NICHT nach Preis.
Auch Premium-Produkte dürfen kurz sein wenn sofort verständlich.

PRIORITÄT: Kauffakten → Verständlichkeit → Vertrauen → Scannbarkeit → SEO → Atmosphäre

TONALITÄT
- Warm, klar, geduzt (du/dein/euer), Marke 3. Person
- Humor durch Präzision (treffender Elternalltag), nie Witze. Kein Humor bei Sicherheit/Fakten/Technik.
- Keine leeren Superlative. Menschlich, nicht kataloghaft.
- Text = Empfehlung von jemandem dem man vertraut.

<strong>-REGELN
- Nur für Kaufargumente: Alter, Material, Sicherheit, Vorteile, Technik
- 1–2 Hervorhebungen pro Absatz. Nicht dekorativ. Produkttitel NICHT automatisch fetten.
- Im ersten Absatz die Produktart/Hauptnutzen hervorheben: z.B. <strong>faltbarer Reise-Kindersitz</strong>

LESBARKEIT: Mobile first. Max. 3 Sätze/Absatz. Listen > Fließtext. Kein H1.

HTML-STRUKTUR (Pflicht):
<h2><strong>[Produkttitel]</strong></h2>
<p class="bottom25">[Einleitung: was, für wen, Hauptnutzen. Altersbereich/Nutzungsdauer hier nennen. Subtiler Humor erlaubt.]</p>
<hr style="border:none;border-top:1px solid #e0e0e0;margin:10px 0;">
<details><summary><strong>[Starkes Produktargument als Titel]</strong></summary><p class="bottom25">...</p></details>
<hr style="border:none;border-top:1px solid #e0e0e0;margin:10px 0;">
<details><summary><strong>Materialien &amp; Verarbeitung</strong></summary><p class="bottom25">...</p></details>
<hr style="border:none;border-top:1px solid #e0e0e0;margin:10px 0;">
<details><summary><strong>Technische Daten &amp; Kompatibilit&auml;t</strong></summary><p class="bottom25">...</p></details>
<hr style="border:none;border-top:1px solid #e0e0e0;margin:10px 0;">
<details><summary><strong>Lieferumfang</strong></summary><p class="bottom25">...</p></details>

SEKTIONEN: Nur sinnvolle. Max 3–4 Sätze oder knappe Liste. Kein Themen-Mix. Keine Dopplungen zwischen Sektionen.
Sektionstitel: aus stärkstem Argument ableiten (z.B. "Warum dieses Bett länger bleibt"). Kein generischer Titel ohne Inhalt.

INHALT-REGELN
- Altersangaben: exakt vom Hersteller, niemals schätzen/runden. Prominent im sichtbaren Haupttext.
- Material: beschreiben, nicht nur nennen. Zertifikate (FSC/GOTS/EN71) kurz erklären.
- Baby-Sicherheit: schadstoffgeprüft/BPA-frei/PVC-frei nur wenn belegbar.
- Sozialer Beweis: Auszeichnungen aktiv recherchieren, prominent platzieren. Keine erfundenen Signale.
- Limitiert: wenn ja – dezent auf Knappheit hinweisen, kein künstlicher Druck.
- Zubehör: nur real/recherchierbar, kurz im Fließtext, kein eigener Abschnitt.
- Technische Daten: Maße, Belastung, Altersbereich, Umbauvarianten, Kompatibilität.
- Lieferumfang: Pflicht nach Recherche.
- Abschluss: Kirchengasse 7, 1070 Wien erwähnen.${schauraum_hint}
- FAQ optional: nur bei wirklich komplexen Produkten mit echten Elternfragen. Keine Dopplungen zum Haupttext.
  Format: <hr style="border:none;border-top:1px solid #e0e0e0;margin:10px 0;"><h2><strong>H&auml;ufige Fragen</strong></h2><details><summary><strong>[Echte Elternfrage]</strong></summary><p class="bottom25">[2–3 Sätze, direkt, keine Marketingsprache.]</p></details>

Kauffakten (Alter, Belastung, Nutzungsdauer, Sicherheit) NIEMALS nur in FAQs.
FORMATTING: kein head/body/div. <p class="bottom25"> und <ul class="bottom25">. Sonderzeichen als HTML-Entities. Eine Box.

════════════════════════════════════════
AUFGABE 2 – meta_description
════════════════════════════════════════
140–155 Zeichen. Struktur: Hauptnutzen + Spec/Maß + Vertrauenssignal + opt. CTA.
Maße einmal, NIE im Title wiederholen. Echter Satz der einlädt, kein Feature-Listing.
✓ "Das Wood Mini+ wächst von 70×140 bis 70×160 cm mit – FSC-Holz, umbaubar bis Schulalter. Im Schauraum Wien testen."
✗ "Das Wood Mini+. Mitwächst. FSC. 70x160 cm. Umbaubar. Jetzt kaufen."

════════════════════════════════════════
AUFGABE 3 – title_tag
════════════════════════════════════════
50–60 Zeichen. HERR UND FRAU KLEIN in Großbuchstaben.
- Kategorie/Nutzen vorne: wenn Marke schwächer oder Kategorie das stärkere Keyword
- Marke vorne: wenn starkes Keyword (Cybex, Stokke, Bugaboo, Babybjörn, Maxi-Cosi…)
- Keine Maße, keine Zertifikate, keine Materialangaben
- Wien nur wenn kaufentscheidend (z.B. Kinderwagen, Möbel)
- "| HERR UND FRAU KLEIN" weglassen wenn dadurch >60 Zeichen

════════════════════════════════════════
AUFGABE 5 – suchbegriffe
════════════════════════════════════════
Max. 240 Zeichen. Nur Substantive. Marke als erstes Wort. Rechtschreibvarianten + typische Tippfehler.
Zahlen+Einheiten zusammen: "100cm". Keine Zertifikate/Maße/Nachhaltigkeit/Pflege/Ortsbegriffe.
Einzeilig, leerzeichengetrennt. Keine Wortwiederholungen. Lieber weniger, dafür treffsicher.

════════════════════════════════════════
AUFGABE 6 – farbe
════════════════════════════════════════
Dominante Grundfarbe beim ersten Blick. Grundfarbe > Musterfarbe > Designname.
Bei Holz: Holzton entscheidet (Natur/Eiche→beige, weiß lackiert→weiß, Walnuss→braun, grau gebeizt→grau).
"mehrfarbig" nur wenn wirklich keine Grundfarbe dominiert.
Erlaubte Werte – exakt einen zurückgeben:
beige, blau, braun, gelb, grau, grün, mehrfarbig, orange, rosa, rot, schwarz, türkis, violett, weiß

════════════════════════════════════════
AUFGABE 7 – produktart
════════════════════════════════════════
Exakt einen Begriff aus dieser Liste zurückgeben (unverändert, keine Erklärung):
Accessories, Aufbewahrung, Babywippe, Baden, Beleuchtung, Betten, Bewegung, Care, Decken, Deko, Einzelkinderwagen, Essen, Fahren, Geschwisterkinderwagen, Große Spielsachen, Hochstühle, Kinderautositze, Kinderwagen, Kinderwagen Einzelteil, Kommoden, Lernen, Matratzen, Nestchen, Regale, Schränke, Spielen, Stillen, Stühle, Teppich, Teppiche, Tische, Tragen, Trinken, Waschen, Wickeltaschen, Wickelunterlagen, Wiegen, Zubehör
Bei unklarer Zuordnung: null`;
};

const generateForItem = async (item, apiKey) => {
  const prompt = buildPrompt(item);
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }),
  });
  if (!response.ok) {
    const t = await response.text();
    throw new Error(`OpenAI API error [${response.status}]: ${t}`);
  }
  const data = await response.json();
  let content = data?.choices?.[0]?.message?.content || '';
  content = content.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  const parsed = JSON.parse(content);
  return {
    produkttext:      parsed.produkttext      || '',
    Title_Tag:        parsed.title_tag        || `${item.artikelname} von ${item.markenname} | HERR UND FRAU KLEIN`,
    html_de:          parsed.html_de          || '',
    meta_description: parsed.meta_description || '',
    suchbegriffe:     parsed.suchbegriffe     || '',
    farbe:            parsed.farbe            || '',
    produktart:       parsed.produktart       || null,
  };
};

router.post('/', async (req, res) => {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) throw new Error('items array is required');

    const CONCURRENCY = 4;
    const results = new Array(items.length);
    let cursor = 0;
    const worker = async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= items.length) return;
        try {
          results[idx] = await generateForItem(items[idx], OPENAI_API_KEY);
        } catch (err) {
          console.error(`Item ${idx} failed:`, err.message);
          results[idx] = { error: err.message };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => worker()));
    res.json({ results });
  } catch (error) {
    console.error('generate-online-texts-complex error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export default router;
