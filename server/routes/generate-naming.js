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

VERBOTEN: die rohen Eingabefelder "Name", "Kollektion" oder "Info/Material" unverändert oder nahezu unverändert in artikelnummer/artikelname zu übernehmen. Lieferantendaten sind oft unsauber — JEDES dieser Felder kann interne Lager-/Sortimentsstatus-Labels enthalten (z.B. "Noos", "NOOS", "Ongoing Fashion", "NEW", "Carry-over", "Core", "Repeat") oder die vollständige Materialzusammensetzung in Prozent (z.B. "80% Wool, 17% Polyamide, 3% Elastane") oder eine reine Stil-/Referenznummer ohne beschreibende Wörter (z.B. "33031"). Diese Statuslabels, Prozentangaben und nackten Nummern dürfen NIEMALS in artikelnummer oder artikelname erscheinen, außer sie kommen exakt so in einem Referenzartikel vor. Wenn das Feld "Name" nur aus einer Zahl oder einem Statuslabel besteht (kein echter Produktname), hast du KEINE verlässliche Produktbezeichnung — orientiere dich dann ausschließlich am Muster und Produkttyp der Referenzartikel (Warengruppe + Größe/Farbe-Kontext), niemals am rohen Namen. artikelname MUSS wie die Referenzartikel aussehen: kurz, beschreibend, ohne Prozent-/Zahlen-Zusammensetzung, ohne Statuslabels, ohne nackte Stilnummern.

HAN-Regeln: HAN ist ein echter Lieferantencode, keine Erfindung. Übernimm NIE einfach eine rohe Stilnummer aus dem Eingabefeld als HAN, wenn sie nicht dem in den Beispielen sichtbaren HAN-Muster entspricht. Prüfe die HAN-Werte ALLER Referenzartikel gemeinsam: zeigen mehrere Beispiele dasselbe Präfix und dieselbe Stilnummer mit nur einem abweichenden letzten Segment pro Farbe (z.B. "40-33031-0-188", "40-33031-0-250", "40-33031-0-489" — Präfix "40", Stilnummer "33031", letztes Segment je Farbe unterschiedlich), dann ist "Präfix-Stilnummer" sicher ableitbar, aber das farbspezifische letzte Segment für eine NEUE, in den Beispielen nicht vorkommende Farbe ist NICHT zuverlässig vorhersagbar (es ist ein interner, nicht aus der Farbe ableitbarer Zähler). In diesem Fall: setze han auf das sicher ableitbare "Präfix-Stilnummer-0-" gefolgt von "?" (z.B. "40-33031-0-?") und setze confidence auf "low", damit klar erkennbar ist, dass der Wert manuell vervollständigt werden muss — erfinde NIE eine plausibel aussehende Zahl für das letzte Segment. Ist gar kein Muster erkennbar, gib leeren String zurück (dann bleibt der vom Nutzer eingegebene HAN-Wert unverändert) und setze confidence auf "low".

STRIKTE FORMATREGELN für artikelnummer und artikelname (gelten für JEDES Produkt, unabhängig vom matchTier):
- Kein Wort und keine Zahl darf innerhalb desselben Felds mehrfach vorkommen — auch nicht in unterschiedlicher Groß-/Kleinschreibung (z.B. "Navy navy" oder "86 86" sind IMMER falsch). Baue das Feld aus den einzelnen Bestandteilen (Name, Farbe, Größe, Präfix) so zusammen, wie es die Referenzartikel zeigen, aber füge nie einen Bestandteil hinzu, der im Ergebnis schon enthalten ist.
- Übernimm NIEMALS das Eingabeformat dieses Prompts (Anführungszeichen, das Zeichen "|", Feldbezeichner wie "Name:", "Kollektion:", "Maß:", "Farbe:", "Größe:") in artikelnummer oder artikelname — diese Strukturzeichen dienen nur dir zum Lesen der Eingabe und dürfen im Ergebnis nicht auftauchen.
- Übernimm Groß-/Kleinschreibung, Leerzeichen und Trennzeichen exakt so, wie sie in den Referenzartikeln vorkommen — erfinde keine eigene Formatierung.

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
