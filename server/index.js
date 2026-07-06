import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import generateSimple from './routes/generate-simple.js';
import generateComplex from './routes/generate-complex.js';
import mapCategories from './routes/map-categories.js';

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
      model: 'gpt-4.1-nano',
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

    const prompt = `You restructure product names for a children's store. The FULL product type (all words that describe what the object IS) must come first, followed by brand/model, then other attributes. Also extract any color.

Rules:
- Identify ALL words that together form the product type (e.g. "Long Sleeve Jacket", "Rain Pants", "Snow Suit", "High Chair", "Changing Table", "Sleeping Bag") and move them ALL to the front as a group — never split a multi-word product type.
- Keep brand names, model codes, and non-type descriptors after the product type, in their original relative order.
- Use Title Case for every word.
- Extract any color word into "color" (lowercase). Remove it from the name. Colors: red, blue, green, yellow, black, white, grey, gray, brown, pink, orange, purple, violet, turquoise, beige, navy, mint, sand, cream, ivory, olive, camel, stone, sage, forest, hazel, burgundy, and their German equivalents (rosa, blau, grün, gelb, schwarz, weiß, grau, braun, rot, türkis, violett).
- If no clear product type, keep original word order (just apply Title Case) and still extract color.
- NEVER return an empty name — if unsure, return the original name in Title Case.
- You MUST return exactly ${items.length} results, one per input item, in the same order.

Items (${items.length} total):
${items.map((it, i) => `${i + 1}. ${it}`).join('\n')}

Respond ONLY with JSON: {"results":[{"name":"...","color":"..."},...]}
No markdown. Exactly ${items.length} elements.

Examples:
"nori jacket long sleeve red" → {"name":"Jacket Long Sleeve Nori","color":"red"}
"Stainless Table Nori" → {"name":"Table Nori Stainless","color":""}
"rain pants kids navy 2024" → {"name":"Rain Pants Kids 2024","color":"navy"}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4.1-nano',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
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
      const parsed = JSON.parse(content);
      results = Array.isArray(parsed) ? parsed : (parsed.results || parsed.items || Object.values(parsed)[0]);
      if (!Array.isArray(results)) throw new Error('Not an array');
    } catch {
      throw new Error('AI returned invalid JSON');
    }

    // Safety: ensure count matches — pad with originals if short
    while (results.length < items.length) {
      const i = results.length;
      results.push({ name: items[i], color: '' });
    }
    results = results.slice(0, items.length);

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

    const prompt = `You are a product name translator for a children's store in Austria.

Your ONLY job: identify the English word(s) that describe WHAT THE OBJECT IS (the product type), translate them to German, and leave everything else exactly as-is.

TRANSLATE only the product-type word(s):
jacket→Jacke, trousers/pants→Hose, t-shirt→T-Shirt, shirt→Shirt, dress→Kleid, shoes→Schuhe, boots→Stiefel, sneakers→Sneaker, coat→Mantel, vest→Weste, sweater→Pullover, cardigan→Cardigan, overall→Overall, bodysuit→Body, leggings→Leggings, shorts→Shorts, skirt→Rock, tights→Strumpfhose, socks→Socken, hat→Mütze, cap→Cap, scarf→Schal, gloves→Handschuhe, bag→Tasche, backpack→Rucksack, sleeping bag→Schlafsack, blanket→Decke, stroller→Kinderwagen, carrier→Tragehilfe, toy→Spielzeug, pacifier→Schnuller, table→Tisch, chair→Stuhl, shelf→Regal, crib→Gitterbett, mattress→Matratze, pillow→Kissen, blanket→Decke, swimsuit→Badeanzug, swim shorts→Badehose

LEAVE UNCHANGED (copy character-for-character):
- Everything else: brand names, model names, version codes, numbers, patterns (e.g. "Geo3/5", "SS24", "Pro"), colors (e.g. navy, hazel, forest, sage, camel, stone, sand), adjectives, descriptors

If the name is already German, return it unchanged.

Product names:
${articleNames.map((name, i) => `${i + 1}. ${name}`).join('\n')}

Respond ONLY with a JSON array of strings, same order, no markdown:
["result1","result2",...]`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4.1-nano', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.1 }),
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

    let names;
    try {
      const parsed = JSON.parse(content);
      names = Array.isArray(parsed)
        ? parsed
        : (parsed.translations || parsed.names || parsed.results || Object.values(parsed));
      if (!Array.isArray(names)) throw new Error('Not an array');
    } catch {
      throw new Error('AI returned invalid JSON');
    }

    const translations = names.map((n, i) => ({
      de: typeof n === 'string' && n.toLowerCase() !== 'nan' ? n : articleNames[i],
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
app.use('/api/map-categories', mapCategories);

// Serve built frontend in production
if (isProd) {
  app.use(express.static(join(__dirname, '../dist')));
  app.get('*', (_req, res) => res.sendFile(join(__dirname, '../dist/index.html')));
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('OPENAI_API_KEY configured:', !!process.env.OPENAI_API_KEY);
});
