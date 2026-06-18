import { Router } from 'express';

const router = Router();

const buildPrompt = (item) => {
  const A  = item.artikelname   || '';
  const C  = item.markenname    || '';
  const D  = item.beschreibung  || '';
  const W  = item.warengruppe   || '';
  const SCHAURAUM   = item.im_schauraum     || '';
  const PREIS       = item.preisniveau      || '';
  const VARIANTEN   = item.varianten        || '';
  const USPS        = item.usps             || '';
  const AWARDS      = item.auszeichnungen   || '';
  const LIMITIERT   = item.limitiert        || '';

  return `Du bist Texter für herrundfrauklein.com. Antworte nur mit JSON, ohne Markdown.

INPUT
Markenname: "${C}"
Artikelname: "${A}"
Produktkategorie: "${W}"
Im Schauraum: "${SCHAURAUM}"
Preisniveau: "${PREIS}"
Varianten: "${VARIANTEN}"
USPs: "${USPS}"
Auszeichnungen: "${AWARDS}"
Limitiert/Saison: "${LIMITIERT}"
Referenzinformationen: "${D}"

Nutze nur belastbare Informationen. Erfinde nichts. Wenn etwas fehlt, recherchiere es über Herstellerangaben oder die Referenzinformationen; bei Widersprüchen zählt die Herstellerangabe.
  Qualität vor Geschwindigkeit: nimm dir die nötige Zeit für eine saubere, vollständige und präzise Antwort.

JSON-KEYS (alle Pflicht):
"produkttext" | "html_de" | "meta_description" | "title_tag" | "suchbegriffe" | "farbe"

OUTPUT RULES
"html_de": HTML mit fester Struktur: Titel, Einleitung, mehrere Details-Abschnitte, optional FAQ.
"produkttext": derselbe Inhalt als Plaintext ohne HTML.
"meta_description": 140–155 Zeichen, Hauptnutzen plus eine relevante Spezifikation plus ein kurzes Vertrauenssignal.
"title_tag": 50–60 Zeichen, Marke oder Kategorie vorne, keine Maße oder Zertifikate.
"suchbegriffe": bis 240 Zeichen, Marke zuerst, nur treffende Substantive.
"farbe": die dominante Grundfarbe aus der ersten Wahrnehmung, exakt ein Wert.

HTML STRUCTURE
<h2><strong>[Produkttitel]</strong></h2>
<p class="bottom25">[Einleitung: was, für wen, Hauptnutzen. Altersbereich/Nutzungsdauer hier nennen.]</p>
<hr style="border:none;border-top:1px solid #e0e0e0;margin:10px 0;">
<details><summary><strong>[Starkes Produktargument als Titel]</strong></summary><p class="bottom25">...</p></details>
<hr style="border:none;border-top:1px solid #e0e0e0;margin:10px 0;">
<details><summary><strong>Materialien &amp; Verarbeitung</strong></summary><p class="bottom25">...</p></details>
<hr style="border:none;border-top:1px solid #e0e0e0;margin:10px 0;">
<details><summary><strong>Technische Daten &amp; Kompatibilit&auml;t</strong></summary><p class="bottom25">...</p></details>
<hr style="border:none;border-top:1px solid #e0e0e0;margin:10px 0;">
<details><summary><strong>Lieferumfang</strong></summary><p class="bottom25">...</p></details>

Only add sections that make sense for the product. Keep sections short and do not repeat the same fact in multiple sections.
If the product is complex enough, add an FAQ at the end with real parent questions.

FAQ FORMAT
<hr style="border:none;border-top:1px solid #e0e0e0;margin:10px 0;"><h2><strong>H&auml;ufige Fragen</strong></h2><details><summary><strong>[Echte Elternfrage]</strong></summary><p class="bottom25">[2–3 Sätze, direkt, keine Marketingsprache.]</p></details>

Keep the HTML output visually consistent with this structure.

CONTENT RULES

  `;
};

const generateForItem = async (item, apiKey) => {
  const prompt = buildPrompt(item);
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4.1',
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
