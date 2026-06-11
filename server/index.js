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

// ── classify-products ──────────────────────────────────────────────────────────
app.post('/api/classify-products', async (req, res) => {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

    const { items, warengruppeOptions, farbeOptions, artOptions, groesseOptions } = req.body;
    const sizes = req.body.sizes ? req.body.sizes.map(s => s ? s.toLowerCase().replace(/\s+/g, '') : '') : [];
    if (!items || !Array.isArray(items) || items.length === 0) throw new Error('items array is required');

    const prompt = `You are a product classifier for a children's clothing and accessories store.

For each item name below, choose the BEST matching value from each of these lists. You MUST only use values from these exact lists.

**Warengruppe** (product group): ${JSON.stringify(warengruppeOptions)}
**Farbe** (color): ${JSON.stringify(farbeOptions)}
**Art** (type): ${JSON.stringify(artOptions)}
**Größe** (size): ${JSON.stringify(groesseOptions)}

Rules:
- Extract color from the item name if present (e.g. "pink" → "rosa", "blue" → "blau", "red" → "rot", "green" → "grün", "white" → "weiß", "black" → "schwarz", "grey/gray" → "grau", "brown" → "braun", "yellow" → "gelb", "orange" → "orange", "purple" → "violett", "turquoise" → "türkis", "beige" → "beige", "multicolor/bunt" → "mehrfärbig")
- If no color is detectable, leave Farbe empty
- If no size is detectable from the name, leave Größe empty
- For Art, match the product type (e.g. "tshirt"/"t-shirt" → "T-Shirts", "jacket" → "Jacken", "pants/trousers" → "Hosen", "dress" → "Kleider", "shoes" → "Schuhe", "socks" → "Socken", "hat" → "Hüte", "body/bodysuit" → "Bodies", "overall" → "Overalls", "leggings" → "Leggings", "pullover/sweater" → "Pullover", "cardigan" → "Cardigans", "sweatshirt" → "Sweatshirts", "shorts" → "Kurze Hosen", "romper" → "Strampler", "pajama/pyjama" → "Pyjamas", "scarf" → "Schals", "gloves" → "Handschuhe", "bag" → "Taschen", "toy" → "Spielen", "blanket" → "Decken", "sleeping bag" → "Schlafsäcke")
- For Warengruppe, classify into the broader category

Items to classify (with their size values):
${items.map((item, i) => `${i + 1}. ${item}${sizes && sizes[i] ? ` [Size: ${sizes[i]}]` : ''}`).join('\n')}

IMPORTANT for Größe: When a size value is provided in brackets, match it to the closest option from the Größe list. For example: "62" → "62 cm (0-3 M)", "86" → "86 cm (12-18 M)", "98" → "98 cm (3 J)". Match by the numeric cm value.

Respond ONLY with a JSON object (no markdown, no code fences) with exactly one key: "classifications". The value must be an array where each element has exactly these keys: "warengruppe", "farbe", "art", "groesse". Use empty string "" when no match is found.

Example response:
{"classifications":[{"warengruppe":"Kleidung Basics","farbe":"rosa","art":"T-Shirts","groesse":""},{"warengruppe":"Schuhe","farbe":"blau","art":"Schuhe","groesse":""}]}`;

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
      body: JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.2 }),
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

    const prompt = `You are a translator for a children's product store. You translate product names between German and English.

For each article name below, provide:
1. "de" — the German version of the full article name. If the input is already German, return it as-is. If it contains English product type words, translate ONLY the product type word to German (e.g. "Jacket" → "Jacke", "Trousers" → "Hose") while keeping brand names, model names, and descriptive words unchanged.
2. "en" — the English version of the full article name. Translate ONLY the German product type word to English (e.g. "Jacke" → "Jacket", "Hose" → "Trousers") while keeping brand names, model names, color names, and other descriptive words unchanged. If you cannot determine a meaningful English translation, return an empty string "".

IMPORTANT RULES:
- Only translate the product type word (the first word that describes what the item IS, e.g. Jacke, Hose, Kleid, Schuh, etc.)
- Keep brand names, model identifiers, color names, size indicators EXACTLY as they are
- German words "mit", "zum", "aus" must always be lowercase
- If the name has no recognizable product type, return the original for "de" and empty string for "en"
- Never return "NAN" or "nan" — use empty string "" instead

Article names to translate:
${articleNames.map((name, i) => `${i + 1}. "${name}"`).join('\n')}

Respond ONLY with a JSON array (no markdown, no code fences). Each element must have exactly these keys: "de", "en".

Example:
Input: ["Jacke Geo3/5 hazel brown", "Stroller Organizer mint"]
Output: [{"de":"Jacke Geo3/5 hazel brown","en":"Jacket Geo3/5 hazel brown"},{"de":"Stroller Organizer mint","en":"Stroller Organizer mint"}]`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.2 }),
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
