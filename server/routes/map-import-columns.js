import { Router } from 'express';

const router = Router();

// Target fields the Smart page's order-file rows need. Description allows
// multiple source columns (joined), everything else is a single column.
const SINGLE_FIELDS = ['ItemName', 'color', 'Size', 'EAN', 'HAN', 'EK', 'VK', 'Menge', 'Collection', 'Measurement', 'InfoMaterial'];

// ── Route ──────────────────────────────────────────────────────────────────
// Given a raw file's header row plus a few sample data rows, ask the model to
// map each of our target fields to a header index — no manual mapping UI.
router.post('/', async (req, res) => {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

    const { headers, sampleRows } = req.body;
    if (!headers || !Array.isArray(headers) || headers.length === 0) throw new Error('headers array required');
    const rows = Array.isArray(sampleRows) ? sampleRows.slice(0, 5) : [];

    const prompt = `Du ordnest die Spalten einer hochgeladenen Bestelldatei (Excel/CSV eines Lieferanten) automatisch den Zielfeldern eines Produktimports zu, ohne dass der Nutzer manuell zuordnen muss.

Zielfelder und ihre Bedeutung:
- ItemName: Produktname / Artikelbezeichnung
- color: Farbe
- Size: Größe
- EAN: EAN/Barcode/GTIN
- HAN: Lieferanten-Artikelnummer/SKU/Style-Nummer
- EK: Einkaufspreis/Netto-Preis/Kosten
- VK: Verkaufspreis/Brutto-Preis/UVP
- Menge: Bestellmenge/Anzahl/Stückzahl
- Collection: Kollektion/Serie/Marke
- Measurement: Maß/Abmessung
- InfoMaterial: Material/Info/Zusammensetzung
- Description: Beschreibung/Details/Freitext (kann auf MEHRERE Spalten verteilt sein — z.B. wenn es getrennte Spalten für Kurz- und Langbeschreibung gibt)

Spaltenüberschriften (Index beginnt bei 0):
${headers.map((h, i) => `${i}: "${h}"`).join('\n')}

${rows.length > 0 ? `Beispiel-Datenzeilen:\n${rows.map((r, i) => `Zeile ${i + 1}: ${headers.map((h, ci) => `${h}="${(r[ci] ?? '').toString().slice(0, 40)}"`).join(' | ')}`).join('\n')}\n` : ''}
Ordne jedes Zielfeld dem passenden Spalten-Index zu. Wenn eine Spalte eindeutig nicht existiert, setze null (bzw. leeres Array bei Description). Jede Quellspalte darf nur einem Feld zugeordnet werden (außer eine Spalte passt zu keinem Feld). Nutze den Spalteninhalt (Beispieldaten), nicht nur den Namen, wenn der Header mehrdeutig ist.

Antworte NUR mit JSON ohne Markdown:
{"mapping":{"ItemName":<index|null>,"color":<index|null>,"Size":<index|null>,"EAN":<index|null>,"HAN":<index|null>,"EK":<index|null>,"VK":<index|null>,"Menge":<index|null>,"Collection":<index|null>,"Measurement":<index|null>,"InfoMaterial":<index|null>,"Description":[<index>,...]}}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`OpenAI error [${response.status}]: ${txt}`);
    }

    const data = await response.json();
    let content = data?.choices?.[0]?.message?.content || '';
    content = content.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('AI returned invalid JSON');
    }

    const raw = parsed?.mapping || parsed;
    const validIdx = (v) => (Number.isInteger(v) && v >= 0 && v < headers.length ? v : null);

    const mapping = {};
    SINGLE_FIELDS.forEach(f => { mapping[f] = validIdx(raw?.[f]); });
    mapping.Description = Array.isArray(raw?.Description) ? raw.Description.filter(v => validIdx(v) !== null) : [];

    res.json({ mapping });
  } catch (error) {
    console.error('map-import-columns error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export default router;
