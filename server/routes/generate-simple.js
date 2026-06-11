import { Router } from 'express';

const router = Router();

const buildPrompt = (item) => {
  const A          = item.artikelname   || '';
  const C          = item.markenname    || '';
  const D          = item.beschreibung  || '';
  const W          = item.warengruppe   || '';
  const ART        = item.art           || '';
  const PREIS      = item.preisniveau   || '';
  const VARIANTEN  = item.varianten     || '';
  const USPS       = item.usps          || '';
  const AWARDS     = item.auszeichnungen|| '';
  const LIMITIERT  = item.limitiert     || '';

  return `Du bist Texter für herrundfrauklein.com (Baby/Kinderartikel, Wien). Antworte NUR mit JSON – kein Markdown.

INPUT
Markenname: "${C}"
Artikelname: "${A}"
Produktkategorie: "${W}"
Art: "${ART}"
Preisniveau: "${PREIS}"
Varianten: "${VARIANTEN}"
USPs: "${USPS}"
Auszeichnungen: "${AWARDS}"
Limitiert/Saison: "${LIMITIERT}"
Referenzinformationen: "${D}"

Fehlende Felder eigenständig recherchieren – keine Fakten erfinden.
Quellenpriorität: 1) Herstellerwebsite  2) Referenzinformationen  3) weitere Quellen.
Bei Widersprüchen: immer Herstellerangabe.

JSON-KEYS (alle Pflicht):
"produkttext" | "html_de" | "meta_description" | "title_tag" | "suchbegriffe" | "farbe" | "produktart" | "groesse"

════════════════════════════════════════
AUFGABE 1 – html_de  (+ produkttext als Plaintext davon)
════════════════════════════════════════
Komplexität nach Erklärungsbedarf, NICHT nach Preis.
Einfache Produkte (Mütze, Body, kleines Spielzeug, Trinkflasche) → 1 kurzer Absatz, mehr direkte Kaufargumente, weniger Atmosphäre.
Mittlere Produkte → 1–2 kurze Absätze, mehr wenn nötig.
Grundregel: So kurz wie möglich. So ausführlich wie nötig. Kein Fülltext.

PRIORITÄT: Verständlichkeit → Kauffakten → Scannbarkeit → Vertrauen → SEO → Atmosphäre

TONALITÄT
- Warm, klar, direkt – mit echtem Augenzwinkern. Empfehlung einer befreundeten Person die Bescheid weiß.
- Humor ist Pflicht: mindestens eine Stelle die ein Elternteil zum Schmunzeln bringt.
  ✓ Nestchen: „weil Babys Ecken offenbar persönlich nehmen"
  ✓ Wolkenkissen: „Endlich eine Wolke, die man anfassen darf"
  ✓ Mulltuch: „Drei Tücher. Weil eines beim ersten Mal nie reicht."
- Humor nie auf Kosten von Fakten/Sicherheit. Kein Humor bei technischen Daten.
- Keine leeren Superlative. Geduzt (du/dein/euer). Marke 3. Person. Menschlich statt kataloghaft.

SCHREIBPRINZIPIEN
- Nicht erklären wenn intuitiv verständlich. Keine pädagogischen Aspekte erzwingen.
- Kein Ratgeberartikel – moderner E-Commerce.
- Spielzeug: pädagogischen Wert nur wenn wirklich kaufrelevant. Bei offenem/Konstruktionsspielzeug: kurz zeigen WAS Kinder bauen/erfinden können.

<strong>-REGELN
- Nur für Kaufargumente: Alter, Material, Sicherheit, Vorteile. 1–2 pro Absatz. Nicht dekorativ.
- Im ersten Absatz Produktart/Hauptnutzen hervorheben: z.B. <strong>Bio-Baumwoll-Strampler</strong>

LESBARKEIT: Mobile first. Max. 3 Sätze/Absatz. Keine Überschriften im Fließtext. Fließtext + Listen kombinieren.

HTML-STRUKTUR (Pflicht):
<p class="bottom25">[Einstieg: was, für wen, wichtigster Nutzen]</p>
<p class="bottom25">[Hauptteil: kurze Alltagserklärung, Vorteile, opt. Storytelling]</p>
<p><strong>Die wichtigsten Details:</strong></p>
<ul class="bottom25">
<li>...</li>
</ul>

INHALT-REGELN
- Altersangaben: exakt vom Hersteller, niemals schätzen.
- Material (Kleidung/Stoffe: Pflicht). Beschreiben, nicht nur nennen. Zertifikate (FSC/GOTS/EN71) kurz erklären.
- Baby-Sicherheit: schadstoffgeprüft/BPA-frei/PVC-frei nur wenn belegbar.
- Pflegehinweis (nur Kleidung/Stoffe): nur was auffindbar ist, nicht erfinden.
- Sozialer Beweis: Auszeichnungen/Zertifikate prominent wenn vorhanden. Keine erfundenen Signale.
- Limitiert: dezent auf Knappheit hinweisen wenn ja.
- Zubehör: nur real/recherchierbar, kurz im Fließtext.
- Lieferumfang: nur wenn mehrere Bestandteile vorhanden.
- Technische Details: nur wenn Maße/Specs kaufentscheidend.

PFLICHT-CHECK: Material, Bio-Anteil, Zertifizierungen, Füllung, Pflegehinweise, Maße, Herstellung/Land, Lieferumfang → wenn vorhanden, in „Die wichtigsten Details" aufführen.
FORMATTING: kein head/body/div. <p class="bottom25"> und <ul class="bottom25">. Sonderzeichen als HTML-Entities. Eine Box.

════════════════════════════════════════
AUFGABE 2 – meta_description
════════════════════════════════════════
140–155 Zeichen. Struktur: Hauptnutzen + Spec/Maß + Vertrauenssignal + opt. CTA.
Maße einmal, NIE im Title wiederholen. Wien weglassen außer kaufentscheidend.
✓ „Weiches Wolkenkissen von Dear April aus Bio-Baumwollvelvet, 38×55 cm. OCS-zertifiziert. Für das Kinderzimmer, das so aussieht wie auf Pinterest."
✗ „Cloud Cushion Soft White von Dear April. OCS-zertifiziert. Bio-Baumwolle. 38×55 cm. Jetzt entdecken."

════════════════════════════════════════
AUFGABE 3 – title_tag
════════════════════════════════════════
50–60 Zeichen. HERR UND FRAU KLEIN in Großbuchstaben.
- Kategorie/Nutzen vorne: wenn Marke schwächer oder Kategorie das stärkere Keyword
- Marke vorne: wenn starkes Keyword (Stapelstein, Cybex, Stokke, Bugaboo…)
- Keine Maße, Zertifikate, Materialangaben
- Wien nur wenn kaufentscheidend
- "| HERR UND FRAU KLEIN" weglassen wenn dadurch >60 Zeichen

════════════════════════════════════════
AUFGABE 5 – suchbegriffe
════════════════════════════════════════
Max. 240 Zeichen. Nur Substantive. Marke zuerst. Rechtschreibvarianten + Tippfehler.
Zahlen+Einheiten zusammen: "100cm". Keine Zertifikate/Maße/Nachhaltigkeit/Pflege/Ortsbegriffe.
Einzeilig, leerzeichengetrennt. Keine Wortwiederholungen. Lieber weniger, dafür treffsicher.

════════════════════════════════════════
AUFGABE 6 – farbe
════════════════════════════════════════
Dominante Grundfarbe beim ersten Blick. Grundfarbe > Musterfarbe > Designname.
"mehrfarbig" nur wenn wirklich keine Grundfarbe dominiert (Regenbogen, gleichwertige Flächen).
Bei Bezug+Füllung: Farbe des Bezugs zählt.
Orientierung: Morris Songbirds (beiges Canvas, Stickerei)→beige | Cloud Kissen Soft White→weiß | Celeste Sky Blue→blau | Mulltücher Flower Market (buntes Muster)→mehrfarbig
Erlaubte Werte – exakt einen zurückgeben:
beige, blau, braun, gelb, grau, grün, mehrfarbig, orange, rosa, rot, schwarz, türkis, violett, weiß

════════════════════════════════════════
AUFGABE 7 – produktart
════════════════════════════════════════
Exakt einen Begriff aus dieser Liste zurückgeben (unverändert, keine Erklärung):
Accessories, Aufbewahrung, Babyspielsachen, Babywippe, Baden, Beißen, Beleuchtung, Betten, Bettwäsche, Bewegung, Bodies, Cardigans, Care, Decken, Deko, Einzelkinderwagen, Essen, Fahren, Fußsäcke, Geschwisterkinderwagen, Große Spielsachen, Gutscheine, Handschuhe, Hauben, Hochstühle, Holzspielzeug, Hosen, Hüte, Jacken, Kinderautositze, Kinderwagen, Kinderwagen Einzelteil, Kissen, Kleider, Kniestrümpfe, Kommoden, Kurze Hosen, Kuscheltiere, Lätzchen, Leggings, Lernen, Matratzen, Modellbahn, Musik, Nestchen, Overalls, Pullover, Puppen, Pyjamas, Regale, Röcke, Schals, Schlafsäcke, Schnuller, Schränke, Schuhe, Schwimmbekleidung, Socken, Spiele, Spielen, Stillen, Stofftiere, Stoffwindeln, Strampler, Stühle, Sweatshirts, Taschen, Tattoos, Teppich, Teppiche, Tische, Tops, Tragen, Trinken, T-Shirts, Waschen, Wickeltaschen, Wickelunterlagen, Wiegen, Zubehör
Bei unklarer Zuordnung: null

════════════════════════════════════════
AUFGABE 8 – groesse  (NUR für Kleidung)
════════════════════════════════════════
Extrahiere die Größe aus dem Artikelnamen. Nur für Kleidungsgrößen – NICHT für Accessoires, Deko oder Leintücher.
Mapping (exakt verwenden):
0-1M/1M/1m→"50 cm (0M)" | 3M/3m→"62 cm (0-3 M)" | 6M/6m→"68 cm (3-6 M)" | 9M/9m→"74 cm (6-9 M)"
12M/12m→"80 cm (9-12 M)" | 18M/18m/T1→"86 cm (12-18 M)" | 24m/2Y/1-2Y/T2→"92 cm (2 J)"
36m/3Y/T3→"98 cm (3 J)" | 3-4Y→"104 cm (3 J)" | 48m/4Y/4-5Y→"110 cm (4 J)" | 5-6Y→"116 cm (5 J)"
2-3Y→"92 cm (2 J)" | ONE/SIZE/ONE SIZE→""
Regeln: exakt einen Wert aus dem Mapping oder "". Keine Annahmen. Kein null. Kein Zusatztext.`;
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
    groesse:          parsed.groesse          ?? '',
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
    console.error('generate-online-texts-simple error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export default router;
