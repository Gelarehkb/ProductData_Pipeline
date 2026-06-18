import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import generateSimple from './routes/generate-simple.js';
import generateComplex from './routes/generate-complex.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || process.env.API_PORT || 3001;

// ── Static reference data ──────────────────────────────────────────────────────
const WARENGRUPPE = ["Accessoires","Care","Deko","Dienstleistungen","Essen/Trinken","Fahren","Fahrräder","Gutscheine","Homeware","KiWa","KiWa Zubehör","Kleidung Basics","Kleidung Funktion","Kleidung Mode","Medien","Möbel","Schuhe","Spielzeug Baby","Spielzeug Kind","Spielzeug Kleinkind","Taschen","Tragen"];
const FARBE = ["beige","blau","braun","gelb","grau","grün","mehrfärbig","orange","rosa","rot","schwarz","türkis","violett","weiß"];
const ART = ["Accessories","Aufbewahrung","Babyspielsachen","Babywippe","Baden","Beißen","Beleuchtung","Betten","Bettwäsche","Bewegung","Bodies","Cardigans","Care","Decken","Deko","Einzelkinderwagen","Essen","Fahren","Fußsäcke","Geschwisterkinderwagen","Große Spielsachen","Gutscheine","Handschuhe","Hauben","Hochstühle","Holzspielzeug","Hosen","Hüte","Jacken","Autositze","Kinderwagen","Kinderwagen Einzelteil","Kissen","Kleider","Kniestrümpfe","Kommoden","Kurze Hosen","Kuscheltiere","Lätzchen","Leggings","Lernen","Matratzen","Modellbahn","Musik","Nestchen","Overalls","Pullover","Puppen","Pyjamas","Regale","Röcke","Schals","Schlafsäcke","Schnuller","Schränke","Schuhe","Schwimmbekleidung","Socken","Spiele","Spielen","Stillen","Stofftiere","Stoffwindeln","Strampler","Stühle","Sweatshirts","Taschen","Tattoos","Teppich","Teppiche","Tische","Tops","Tragen","Trinken","T-Shirts","Waschen","Wickeltaschen","Wickelunterlagen","Wiegen","Zubehör"];
const GROESSE = ["50 cm (0M)","62 cm (0-3M)","68 cm (3-6M)","74 cm (6-9M)","80 cm (9-12M)","86 cm (12-18M)","92 cm (2J)","98 cm (3J)","104 cm (4J)","110 cm (5J)","116 cm (6J)","120 cm (6J)","128 cm (6J)"];

// ── classify-products ──────────────────────────────────────────────────────────
app.post('/api/classify-products', async (req, res) => {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

    const { items } = req.body;
    const sizes = req.body.sizes ? req.body.sizes.map(s => s ? s.toLowerCase().replace(/\s+/g, '') : '') : [];
    if (!items || !Array.isArray(items) || items.length === 0) throw new Error('items array is required');

    const prompt = `You are a product classifier for a children's clothing and accessories store.

For each item, choose the BEST matching value from each list. Use ONLY values from these exact lists.

Warengruppe: ${JSON.stringify(WARENGRUPPE)}
Farbe: ${JSON.stringify(FARBE)}
Art: ${JSON.stringify(ART)}
Größe: ${JSON.stringify(GROESSE)}

Rules:
- Farbe: extract color from name (pink→rosa, blue→blau, red→rot, green→grün, white→weiß, black→schwarz, grey/gray→grau, brown→braun, yellow→gelb, purple→violett, turquoise→türkis, multicolor/bunt→mehrfärbig). Leave empty if no color found.
- Größe: match size in brackets to closest cm value (e.g. 62→"62 cm (0-3M)", 86→"86 cm (12-18M)"). T1→"86 cm (12-18M)", T2→"92 cm (2J)". Leave empty if no size.
- Art: match product type (t-shirt→T-Shirts, jacket→Jacken, pants→Hosen, dress→Kleider, shoes→Schuhe, socks→Socken, body/bodysuit→Bodies, overall→Overalls, leggings→Leggings, pullover/sweater→Pullover, cardigan→Cardigans, sweatshirt→Sweatshirts, shorts→Kurze Hosen, romper/strampler→Strampler, pajama→Pyjamas, scarf→Schals, gloves→Handschuhe, bag→Taschen, toy→Spielen, blanket→Decken, sleeping bag→Schlafsäcke).
- Warengruppe: choose the broader product group.

Items:
${items.map((item, i) => `${i + 1}. ${item}${sizes[i] ? ` [Size: ${sizes[i]}]` : ''}`).join('\n')}

Respond ONLY with JSON, no markdown: {"classifications":[{"warengruppe":"...","farbe":"...","art":"...","groesse":"..."},...]}
Use "" when no match. One entry per item in order.`;

    const bodyPayload = JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    let response = null;
    let lastErr = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: bodyPayload,
      });
      if (response.ok) break;
      lastErr = await response.text();
      if (response.status === 503 || response.status === 429) {
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      break;
    }

    if (!response || !response.ok) {
      throw new Error(`OpenAI API error [${response?.status ?? 500}]: ${lastErr}`);
    }

    const data = await response.json();
    let content = data?.choices?.[0]?.message?.content || '';
    content = content.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    let classifications;
    try {
      const parsed = JSON.parse(content);
      classifications = Array.isArray(parsed) ? parsed : parsed.classifications;
      if (!Array.isArray(classifications)) throw new Error('Missing classifications array');
    } catch {
      throw new Error('AI returned invalid JSON');
    }

    res.json({ classifications });
  } catch (error) {
    console.error('classify-products error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// ── restructure-names ──────────────────────────────────────────────────────────
app.post('/api/restructure-names', async (req, res) => {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) throw new Error('items array is required');

    const prompt = `You restructure product names so the MAIN ITEM TYPE comes first, followed by the brand/model name, then descriptive attributes. Also extract any color word found in the name.

Rules:
- Move the main noun (item type like "Table", "Chair", "Lamp", "T-Shirt", "Jacket", "Bag", "Shoes", "Dress") to the FRONT.
- Keep the rest of the words in their original order after the item type.
- Use Title Case for each word.
- Extract any color word (English or German) from the name into a separate "color" field, lowercase. Remove it from the name.
  Colors include: red, blue, green, yellow, black, white, grey/gray, brown, pink, orange, purple, violet, turquoise, beige, navy, mint, sand, cream, ivory, rosa, blau, grün, gelb, schwarz, weiß, grau, braun, rot, türkis, violett.
- If no color, return empty string for color.
- If you cannot identify a clear item type, keep the name as-is (just Title Case) and still extract color.

Items:
${items.map((it, i) => `${i + 1}. ${it}`).join('\n')}

Respond ONLY with a JSON array (no markdown, no code fences). Each element MUST have exactly: {"name": "...", "color": "..."}.

Example input: "Nori Table stainless red"
Example output element: {"name": "Table Nori Stainless", "color": "red"}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4.1-nano', messages: [{ role: 'user', content: prompt }], temperature: 0.2 }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return res.status(429).json({ error: 'Rate limit exceeded' });
      const txt = await response.text();
      throw new Error(`OpenAI error [${status}]: ${txt}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';
    content = content.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    let results;
    try {
      results = JSON.parse(content);
    } catch {
      throw new Error('AI returned invalid JSON');
    }

    res.json({ results });
  } catch (error) {
    console.error('restructure-names error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// ── translate-article-names ────────────────────────────────────────────────────
app.post('/api/translate-article-names', async (req, res) => {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

    const { articleNames } = req.body;
    if (!articleNames || !Array.isArray(articleNames) || articleNames.length === 0) {
      throw new Error('articleNames array is required');
    }

    const prompt = `You are a translator for a children's product store.

Each input is a product name WITHOUT color — color is never included. For each name, provide:
1. "de" — German version. If already German, return as-is. If English product type word found, translate ONLY that word (e.g. "Jacket" → "Jacke", "Trousers" → "Hose", "Dress" → "Kleid"). Keep brand names, model names, and all other words unchanged.
2. "en" — English version. Translate ONLY the German product type word (e.g. "Jacke" → "Jacket"). Keep everything else unchanged. Return "" if no meaningful translation exists.

Rules:
- Translate ONLY the product type word (what the item IS). Nothing else.
- Keep brand names and model identifiers exactly as-is.
- German words "mit", "zum", "aus" must be lowercase.
- Never return "NAN" or "nan" — use "" instead.

Article names:
${articleNames.map((name, i) => `${i + 1}. "${name}"`).join('\n')}

Respond ONLY with a JSON array, no markdown: [{"de":"...","en":"..."},...]

Example:
Input: ["Jacket Geo3/5", "Stroller Organizer"]
Output: [{"de":"Jacke Geo3/5","en":"Jacket Geo3/5"},{"de":"Stroller Organizer","en":"Stroller Organizer"}]`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4.1-nano', messages: [{ role: 'user', content: prompt }], temperature: 0.2 }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return res.status(429).json({ error: 'Rate limit exceeded' });
      const txt = await response.text();
      throw new Error(`OpenAI error [${status}]: ${txt}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';
    content = content.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    let translations;
    try {
      const parsed = JSON.parse(content);
      translations = Array.isArray(parsed) ? parsed : (parsed.translations || parsed.results);
      if (!Array.isArray(translations)) throw new Error('Not an array');
    } catch {
      throw new Error('AI returned invalid JSON');
    }

    translations = translations.map(t => ({
      de: t.de && t.de.toLowerCase() !== 'nan' ? t.de : '',
      en: t.en && t.en.toLowerCase() !== 'nan' ? t.en : '',
    }));

    res.json({ translations });
  } catch (error) {
    console.error('translate-article-names error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});


app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/generate-online-texts-simple', generateSimple);
app.use('/api/generate-online-texts-complex', generateComplex);

// Serve built frontend in production
if (isProd) {
  app.use(express.static(join(__dirname, '../dist')));
  app.get('*', (_req, res) => res.sendFile(join(__dirname, '../dist/index.html')));
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('OPENAI_API_KEY configured:', !!process.env.OPENAI_API_KEY);
});
