import { Router } from 'express';

const router = Router();

// ── Route ──────────────────────────────────────────────────────────────────
// Given a batch of new-order product groups, each with a handful of matched
// examples pulled from the shop's real JTL export, ask the model to infer the
// house naming convention (prefix, casing, separators, how size/color are
// folded in) and generate Artikelnummer/Artikelname/HAN for the new item in
// that same style — rather than applying a fixed formula.
router.post('/', async (req, res) => {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) throw new Error('items array required');

    const prompt = `Du bist ein Experte für Artikel-Namenskonventionen im JTL-Warenwirtschaftssystem von herrundfrauklein.com, einem österreichischen Kinderladen.

Für JEDES neue Produkt bekommst du mehrere echte, bereits im Shop existierende Beispiel-Artikel als Referenz (matchTier zeigt an, wie eng verwandt sie sind: "warengruppe+name" = gleiche Warengruppe UND ähnlicher Produktname — sehr enge Referenz; "warengruppe" = gleiche Warengruppe; "name-similarity" = ähnlicher Produktname, andere Warengruppe; "generic" = keine direkte Übereinstimmung, dient nur als allgemeine Stilprobe des Shops).

PFLICHT: Leite aus den Beispielen das TATSÄCHLICHE Namensschema ab, das dort sichtbar ist — Präfixe/Kürzel, Groß-/Kleinschreibung, Trennzeichen (Leerzeichen, Bindestrich, Unterstrich), Reihenfolge der Bestandteile, ob und wie Größe/Farbe in die Artikelnummer einfließen. Kopiere dieses Muster SO GENAU WIE MÖGLICH auf das neue Produkt — erfinde kein eigenes Schema. Bei matchTier "generic" gibt es keine exakte Vorlage: wende trotzdem den allgemeinen Stil (Groß-/Kleinschreibung, typische Kürzel-Länge, Trennzeichen) an, den du aus den Beispielen erkennst, statt komplett neu zu erfinden. Du MUSST für jedes Produkt eine artikelnummer und einen artikelname zurückgeben — niemals leer lassen.

VERBOTEN: den rohen Eingabe-Namen (Feld "Name") oder das Feld "Info/Material" unverändert oder nahezu unverändert in artikelnummer/artikelname zu übernehmen. Lieferantendaten sind oft unsauber — sie können interne Statuslabels enthalten (z.B. "Noos", "Ongoing Fashion", "NEW", "Carry-over") und die vollständige Materialzusammensetzung in Prozent (z.B. "80% Wool, 17% Polyamide, 3% Elastane"). Diese Statuslabels und Prozentangaben dürfen NIEMALS in artikelnummer oder artikelname erscheinen, außer sie kommen exakt so in einem Referenzartikel vor. artikelname MUSS wie die Referenzartikel aussehen: kurz, ohne Prozent-/Zahlen-Zusammensetzung, ohne Statuslabels — nicht wie das rohe Eingabefeld.

"han" nur befüllen, wenn aus den Beispielen ein klares Formatierungsmuster erkennbar ist (z.B. Padding, Präfix) — HAN ist ein echter Lieferantencode, keine Erfindung. Wenn unklar: leerer String zurückgeben, dann bleibt der vom Nutzer eingegebene HAN-Wert unverändert. Übernimm NIE einfach eine rohe Stilnummer aus dem Eingabefeld als HAN, wenn sie nicht dem in den Beispielen sichtbaren HAN-Muster entspricht (Beispiele zeigen oft ein zusammengesetztes Format wie "Präfix-Stilnummer-0-Farbcode" — eine nackte Zahl wie "33031" ist meist NUR die Stilnummer, nicht der vollständige HAN).

Neue Produkte (${items.length} Stück):
${items.map((it, i) => `${i + 1}. id="${it.id}" | Name: "${it.itemName || ''}" ${it.collection ? `| Kollektion: "${it.collection}" ` : ''}${it.measurement ? `| Maß: "${it.measurement}" ` : ''}${it.infoMaterial ? `| Info/Material: "${it.infoMaterial}" ` : ''}| Farbe: "${it.color || ''}" | Größe: "${it.size || ''}" | Warengruppe: "${it.warengruppe || ''}" | Hersteller: "${it.hersteller || ''}" | matchTier: "${it.matchTier || 'generic'}"
   Referenzartikel aus JTL: ${(it.examples || []).map(ex => `[Artikelnummer="${ex.artikelnummer}" Artikelname="${ex.artikelname}" HAN="${ex.han}"]`).join(', ')}`).join('\n')}

Antworte NUR mit JSON ohne Markdown, exakt ${items.length} Einträge in derselben Reihenfolge wie die Eingabe:
{"results":[{"id":"...","artikelnummer":"...","artikelname":"...","han":"","confidence":"high"|"low"}]}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4.1',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 4096,
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

    const results = Array.isArray(parsed) ? parsed : (parsed.results || parsed.items || Object.values(parsed)[0]);
    if (!Array.isArray(results)) throw new Error('AI response missing results array');

    // Pad if the AI returned fewer results than requested
    while (results.length < items.length) {
      const i = results.length;
      results.push({ id: items[i]?.id || '', artikelnummer: '', artikelname: '', han: '', confidence: 'low' });
    }

    const byId = new Map(results.map(r => [String(r?.id || ''), r]));
    const normalized = items.map((it, i) => {
      const r = byId.get(String(it.id)) || results[i] || {};
      return {
        id: it.id,
        artikelnummer: String(r?.artikelnummer || '').trim(),
        artikelname: String(r?.artikelname || '').trim(),
        han: String(r?.han || '').trim(),
        confidence: r?.confidence === 'high' ? 'high' : 'low',
      };
    });

    res.json({ results: normalized });
  } catch (error) {
    console.error('generate-naming error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export default router;
