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

// ── classify-products helpers ──────────────────────────────────────────────────

const WARENGRUPPE_SET = new Set(WARENGRUPPE);
const FARBE_SET = new Set(FARBE);
const ART_SET = new Set(ART);
const GROESSE_SET = new Set(GROESSE);

function validateClassification(c) {
  return {
    warengruppe: WARENGRUPPE_SET.has(c?.warengruppe) ? c.warengruppe : '',
    farbe:       FARBE_SET.has(c?.farbe)             ? c.farbe       : '',
    art:         ART_SET.has(c?.art)                 ? c.art         : '',
    groesse:     GROESSE_SET.has(c?.groesse)          ? c.groesse     : '',
  };
}

async function classifyChunk(items, sizes, apiKey) {
  const prompt = `You are a strict product classifier for a children's store (Austria/Germany).

CRITICAL RULES — violating any rule is a failure:
1. Every field must be EXACTLY one string from the allowed list, or "" if no match.
2. NEVER invent values. NEVER use synonyms. Copy the exact string from the list.
3. Classify based on what the product IS — not what surrounds it in the order.
4. You must return exactly ${items.length} entries in the same order as the input.

═══ ALLOWED VALUES ═══

Warengruppe (pick ONE or ""):
${WARENGRUPPE.join(' | ')}

Farbe (pick ONE or ""):
${FARBE.join(' | ')}

Art (pick ONE or ""):
${ART.join(' | ')}

Größe (pick ONE or ""):
${GROESSE.join(' | ')}

═══ CLASSIFICATION GUIDE ═══

WARENGRUPPE — mandatory, almost always has a match:
• Ball, Spielzeug, Puzzle, Lernspiel, Kuscheltier, Puppe, Holzspielzeug → "Spielzeug Kind"
• Rasseln, Beißringe, Babyspielzeug (0-12M) → "Spielzeug Baby"
• Spielzeug 1-3J, Lauflernhilfe, Babywippe → "Spielzeug Kleinkind"
• T-Shirt, Body, Strampler, Socken, Unterwäsche, Basis-Kleidung → "Kleidung Basics"
• Regenjacke, Fleece, Schneehose, Outdoorjacke, Funktionskleidung → "Kleidung Funktion"
• Kleid, modische Jacke, Hose (Mode), Pullover, Cardigan → "Kleidung Mode"
• Schuhe, Stiefel, Sandalen, Hausschuhe, Sneaker → "Schuhe"
• Mütze, Handschuhe, Schal, Sonnenhut, Stirnband → "Accessoires"
• Rucksack, Tasche, Wickeltasche, Turnbeutel → "Taschen"
• Kinderwagen, Buggy, Bugaboo, Cybex, Stokke → "Fahren"
• Fahrrad, Laufrad, Roller, Scooter → "Fahrräder"
• Tragehilfe, Babytrage, Sling, Manduca → "Tragen"
• Bett, Wickelkommode, Regal, Kleiderschrank, Schreibtisch → "Möbel"
• Kinderzimmer-Deko, Lampe, Teppich, Kissen → "KiWa" or "KiWa Zubehör"
• Pflege, Creme, Shampoo, Badezubehör → "Care"
• Buch, Hörspiel, Tonie, DVD → "Medien"
• Schüssel, Teller, Trinkflasche, Besteck → "Homeware"
• Babynahrung, Snack → "Essen/Trinken"
• Autositz, Kindersitz → "Fahren"
• Gutschein → "Gutscheine"

ART — mandatory, pick the most specific match:
• Ball, Spielzeug (generic) → "Spielen"
• Kuscheltier → "Kuscheltiere" | Stofftier → "Stofftiere" | Puppe → "Puppen"
• Holzspielzeug → "Holzspielzeug" | Puzzle/Brettspiel → "Spiele" | Musik → "Musik"
• Babyspielsachen (Rassel, Beißring, Mobile) → "Babyspielsachen"
• T-Shirt, Top → "T-Shirts" | Sweatshirt → "Sweatshirts" | Pullover/Sweater → "Pullover"
• Jacke/Jacket → "Jacken" | Cardigan/Strickjacke → "Cardigans"
• Hose/Pants/Trousers → "Hosen" | Shorts/Kurze Hose → "Kurze Hosen" | Leggings → "Leggings"
• Kleid/Dress → "Kleider" | Rock/Skirt → "Röcke"
• Body/Bodysuit → "Bodies" | Strampler/Romper → "Strampler" | Overall → "Overalls"
• Pyjama/Schlafanzug → "Pyjamas" | Schlafsack (Baby) → "Schlafsäcke"
• Schuhe/Shoes → "Schuhe" | Socken/Socks → "Socken" | Kniestrümpfe → "Kniestrümpfe"
• Mütze/Hat/Beanie → "Hauben" | Sonnenhut/Cap → "Hüte" | Schal/Scarf → "Schals" | Handschuhe/Gloves → "Handschuhe"
• Rucksack/Backpack → "Taschen" | Tasche/Bag → "Taschen" | Wickeltasche → "Wickeltaschen"
• Kinderwagen (Einzel) → "Einzelkinderwagen" | Geschwisterwagen → "Geschwisterkinderwagen"
• Autositz/Autokindersitz → "Autositze" | Fußsack/Footmuff → "Fußsäcke"
• Decke/Blanket → "Decken" | Bettwäsche → "Bettwäsche" | Nestchen → "Nestchen"
• Bett/Crib/Gitterbett → "Betten" | Wiege → "Wiegen" | Matratze → "Matratzen"
• Kommode/Wickelkommode → "Kommoden" | Regal → "Regale" | Schrank → "Schränke"
• Tisch → "Tische" | Stuhl/Chair → "Stühle" | Hochstuhl → "Hochstühle"
• Schnuller/Pacifier → "Schnuller" | Lätzchen/Bib → "Lätzchen" | Stoffwindel → "Stoffwindeln"
• Schwimmanzug/Badehose → "Schwimmbekleidung"
• Teppich → "Teppiche" | Kissen → "Kissen" | Lampe/Nachtlicht → "Beleuchtung"
• Trinkflasche/Becher → "Trinken" | Teller/Schüssel → "Essen"

FARBE — only if color is explicitly named in the product name:
pink/rose→rosa | blue/blau→blau | red/rot→rot | green/grün→grün | white/weiß→weiß
black/schwarz→schwarz | grey/gray/grau→grau | brown/braun→braun | yellow/gelb→gelb
purple/violet/lila→violett | turquoise/türkis→türkis | orange→orange | beige→beige
navy→blau | multicolor/bunt/mehrfärbig→mehrfärbig | sand/cream/ivory/stone→beige
Leave "" if no color word in name.

GRÖßE — only if a size code appears in the name:
Match to closest: 50→"50 cm (0M)" | 62→"62 cm (0-3M)" | 68→"68 cm (3-6M)"
74→"74 cm (6-9M)" | 80→"80 cm (9-12M)" | 86→"86 cm (12-18M)" | 92→"92 cm (2J)"
98→"98 cm (3J)" | 104→"104 cm (4J)" | 110→"110 cm (5J)" | 116→"116 cm (6J)"
128→"128 cm (6J)" | T1→"86 cm (12-18M)" | T2→"92 cm (2J)" | T3→"98 cm (3J)"
Leave "" if no size in name.

═══ ITEMS TO CLASSIFY ═══
${items.map((item, i) => `${i + 1}. ${item}${sizes[i] ? ` [Größe im Namen: ${sizes[i]}]` : ''}`).join('\n')}

Respond ONLY with valid JSON (no markdown):
{"classifications":[{"warengruppe":"...","farbe":"...","art":"...","groesse":"..."},...]}
Exactly ${items.length} entries, same order as input. Use "" for no match.`;

  let response = null;
  let lastErr = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4.1',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0,
      }),
    });
    if (response.ok) break;
    lastErr = await response.text();
    if (response.status === 503 || response.status === 429) {
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    break;
  }

  if (!response || !response.ok) throw new Error(`OpenAI API error [${response?.status ?? 500}]: ${lastErr}`);

  const data = await response.json();
  let content = data?.choices?.[0]?.message?.content || '';
  content = content.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

  const parsed = JSON.parse(content);
  const raw = Array.isArray(parsed) ? parsed : parsed.classifications;
  if (!Array.isArray(raw)) throw new Error('Missing classifications array');

  // Validate every value against the allowed lists — bad values become ""
  const validated = raw.map(validateClassification);

  // Pad to chunk length in case AI returned fewer
  while (validated.length < items.length) validated.push({ warengruppe: '', farbe: '', art: '', groesse: '' });
  return validated.slice(0, items.length);
}

// ── classify-products ──────────────────────────────────────────────────────────
app.post('/api/classify-products', async (req, res) => {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

    const { items } = req.body;
    const sizes = req.body.sizes ? req.body.sizes.map(s => s ? s.toLowerCase().replace(/\s+/g, '') : '') : [];
    if (!items || !Array.isArray(items) || items.length === 0) throw new Error('items array is required');

    // Chunk into batches of 20 and process in parallel — prevents truncation on large orders
    const CHUNK = 20;
    const chunks = [];
    for (let i = 0; i < items.length; i += CHUNK) {
      chunks.push({ items: items.slice(i, i + CHUNK), sizes: sizes.slice(i, i + CHUNK) });
    }

    const chunkResults = await Promise.all(
      chunks.map(c => classifyChunk(c.items, c.sizes, OPENAI_API_KEY))
    );

    const classifications = chunkResults.flat();
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


// ── find-product-link (OpenAI Responses API web search) ───────────────────────

/** Server-side cache keyed by "han:brand" (lowercased). "" = confirmed no-result. */
const productLinkServerCache = new Map();

app.post('/api/find-product-link', async (req, res) => {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });

    const { han, brand } = req.body;
    if (!han?.trim()) return res.status(400).json({ error: 'han is required' });

    const cacheKey = `${han.trim().toLowerCase()}:${(brand || '').trim().toLowerCase()}`;
    if (productLinkServerCache.has(cacheKey)) {
      const cached = productLinkServerCache.get(cacheKey);
      return res.json({ url: cached || null, cached: true });
    }

    const brandPart = (brand || '').trim();
    const query = brandPart
      ? `${brandPart} ${han.trim()} Produktseite OR Hersteller site`
      : `${han.trim()} Produktseite Hersteller`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        tools: [{ type: 'web_search_preview' }],
        input: `Find the single most relevant product page URL for this article:
HAN/Article number: ${han.trim()}${brandPart ? `\nBrand: ${brandPart}` : ''}
Return only the direct URL of the most authoritative product page (prefer the brand's own website or a major retailer). Output only the URL, nothing else.`,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API [${response.status}]: ${text.slice(0, 300)}`);
    }

    const data = await response.json();

    // Extract first URL from url_citation annotations in the message output
    let url = null;
    for (const item of data?.output ?? []) {
      if (item.type === 'message') {
        for (const content of item.content ?? []) {
          // Check annotations first (cited URLs)
          for (const ann of content.annotations ?? []) {
            if (ann.type === 'url_citation' && ann.url) { url = ann.url; break; }
          }
          if (url) break;
          // Fallback: extract from plain text if it looks like a URL
          if (!url && content.text) {
            const m = content.text.match(/https?:\/\/[^\s"'<>)]+/);
            if (m) url = m[0];
          }
        }
      }
      if (url) break;
    }

    productLinkServerCache.set(cacheKey, url ?? '');
    res.json({ url });
  } catch (err) {
    console.error('find-product-link error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── extract-product-types (JTL Import product-name dictionary) ────────────────
app.post('/api/extract-product-types', async (req, res) => {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

    const { names } = req.body;
    if (!names || !Array.isArray(names) || names.length === 0) throw new Error('names array is required');

    const prompt = `You extract the product-type name from German/English children's-store article names.

Rules:
- Return ONLY the word(s) that describe WHAT THE OBJECT IS (e.g. "Schlafsack", "Wollmütze", "Strampler", "Sleeping Bag").
- Ignore color, size, material, brand, and variant/model details.
- The product type is usually the first or second word of the name.
- Use Title Case.
- You MUST return exactly ${names.length} results, one per input item, in the same order.

Items (${names.length} total):
${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}

Respond ONLY with JSON: {"results":["...", ...]}
No markdown. Exactly ${names.length} elements.`;

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
      results = Array.isArray(parsed) ? parsed : (parsed.results || parsed.names || Object.values(parsed)[0]);
      if (!Array.isArray(results)) throw new Error('Not an array');
    } catch {
      throw new Error('AI returned invalid JSON');
    }

    while (results.length < names.length) results.push(names[results.length]);
    results = results.slice(0, names.length);

    res.json({ results });
  } catch (error) {
    console.error('extract-product-types error:', error);
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
