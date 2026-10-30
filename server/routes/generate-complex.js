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
Achtung: Auch Herstellerwebsites enthalten oft unzulässige Umweltbegriffe. Fakten (Material, Anteil in %, Zertifikat) übernehmen, Werbebegriffe nicht.

GREENWASHING-REGELN (VERBINDLICH, Grundlage: EU-Richtlinie 2024/825 / UWG-Novelle 2026, gültig ab 27.09.2026)
Gelten für JEDES Ausgabefeld (produkttext, html_de, meta_description, title_tag, suchbegriffe) und haben Vorrang vor allen anderen Regeln in diesem Prompt.

1) NIE verwenden – auch nicht wenn Hersteller oder Input sie nennen, auch keine sinngemäßen Varianten, auch nicht auf Englisch:
nachhaltig/sustainable, umweltfreundlich/umweltschonend/umweltbewusst/eco-friendly/environmentally friendly, öko/ökologisch/eco/ecological, grün/green (als Umweltaussage), klimaneutral/CO₂-neutral/klimafreundlich/klimapositiv/CO₂-kompensiert/climate neutral/carbon neutral, ressourcenschonend, natürlich/naturbelassen/aus Naturmaterialien/„was Mutter Natur uns gibt"/natural materials (als Umwelt-/Qualitätsversprechen), verantwortungsvoll/bewusst/fair hergestellt/sozial verantwortlich (ohne unabhängiges Siegel), schadstofffrei/frei von Schadstoffen/ungiftig/giftfrei/ohne Chemikalien/non-toxic/chemical-free, biologisch abbaubar/kompostierbar/recycelbar (ohne konkreten Nachweis für genau dieses Produkt).
Ausnahme: „natürlich" bleibt nur als neutrale Beschreibung erlaubt (Farbe „natur", „natürlicher Look", oder eine konkrete Materialeigenschaft wie „Wolle ist von Natur aus temperaturausgleichend").

2) Konkrete Umweltaussagen NUR mit Nachweis für genau dieses Produkt, sonst weglassen:
- Bio/Organic/kbA/kbT/Bio-Baumwolle/Bio-Wolle → nur mit GOTS/OCS für dieses Produkt; nur auf den zertifizierten Teil mit Anteil in % beziehen („Bezug aus 100 % Bio-Baumwolle (GOTS)", NICHT „Bio-Kinderwagen")
- recycelt/recycled/RPET → nur mit GRS/RCS oder klarer Herstellerangabe mit %; Teil + Anteil nennen („Außenstoff aus 100 % recyceltem Polyester"), NIE pauschal „aus recyceltem Material" fürs ganze Produkt
- FSC/PEFC → nur wenn das Produkt selbst gelabelt ist (nicht nur Markenlizenz oder „mainly FSC"): „Holz aus FSC-zertifizierter Forstwirtschaft (FSC® C…)"
- OEKO-TEX® STANDARD 100 → nur mit gültigem Zertifikat; belegt NUR die Schadstoffprüfung, NIE daraus „bio", „nachhaltig" oder „recycelt" ableiten
- bluesign® → nur laut Herstellerangabe; belegt Chemikalien-/Prozessmanagement, KEINEN Recyclinganteil
- PFC-/BPA-/PVC-/phthalatfrei → nur mit konkreter Herstellerangabe für dieses Produkt, sachlich in den technischen Daten
- Made in … → exakt wie vom Hersteller angegeben
Zertifikate generell: nur unabhängige, öffentlich zugängliche Systeme, keine eigenen Marken-Siegel; wenn bekannt Zertifikatsnummer nennen; Zertifikat nur auf den abgedeckten Teil beziehen (z. B. Bezug, nicht das ganze Produkt); ein Zertifikat der Marke ist kein Beleg für Produkte, die es nicht abdeckt.

3) Weitere Verbote:
- Gesetzliche Pflichten (EN 71, CE, REACH, „erfüllt alle Sicherheitsstandards") nicht als Vorteil bewerben – sachlich in den technischen Daten nennen ist ok, aber nicht in meta_description oder title_tag und nicht hervorgehoben
- Keine Zukunftsversprechen („bis 2030 klimaneutral") und keine CO₂-Kompensations-Aussagen
- Unternehmensaussagen der Marke (Ökostrom, Audits, „Marke X setzt sich für die Umwelt ein") nicht auf das Produkt übertragen
- Langlebigkeit/Reparierbarkeit/Haltbarkeit nur mit konkreten Herstellerangaben (z. B. Garantiedauer, Ersatzteile erhältlich), nicht als Umweltargument
- KEINE Umweltaussage in "title_tag" oder "suchbegriffe". Bio/Organic dort nur, wenn das gesamte textile Produkt GOTS/OCS-zertifiziert ist
- Keine Umweltaussage in Abschnitts-/Summary-Titeln innerhalb von "html_de" (nicht „Nachhaltig gemacht", „Natürlich gut")

4) Wenn kein Nachweis vorliegt: Aussage ersatzlos weglassen, Material neutral nennen („Polyester" statt „recyceltes Polyester", „Baumwolle" statt „Bio-Baumwolle", „Holz" statt „FSC-Holz"). Lieber eine konkrete, überprüfbare Eigenschaft nennen (Material, Maß, Funktion, Pflege) als eine Umweltaussage.

5) Greenwashing-Check vor der Ausgabe: Enthält ein Feld einen Begriff aus Punkt 1? → entfernen. Ist jede Bio-/Recycling-/FSC-/OEKO-TEX-Aussage belegt und auf den richtigen Produktteil bezogen? → sonst entfernen. Wird eine gesetzliche Pflicht als Vorteil dargestellt? → neutral formulieren. Ist eine Aussage unsicher: nicht ausgeben – stattdessen als allerletzten Satz von "produkttext" eine Zeile „Prüfhinweis Greenwashing: ..." ergänzen.

JSON-KEYS (alle Pflicht):
"produkttext" | "html_de" | "meta_description" | "title_tag" | "suchbegriffe" | "farbe"

OUTPUT RULES
"html_de": HTML mit fester Struktur: Titel, Einleitung, mehrere Details-Abschnitte, optional FAQ. Keine Umweltaussagen ohne Nachweis (siehe Greenwashing-Regeln).
"produkttext": derselbe Inhalt als Plaintext ohne HTML. Keine Umweltaussagen ohne Nachweis (siehe Greenwashing-Regeln); ggf. letzter Satz "Prüfhinweis Greenwashing: ...".
"meta_description": 140–155 Zeichen, Hauptnutzen plus eine relevante Spezifikation plus ein kurzes Vertrauenssignal. Vertrauenssignal = belegtes Zertifikat/Auszeichnung/Testergebnis, kein Umweltbegriff (siehe Greenwashing-Regeln).
"title_tag": 50–60 Zeichen, Marke oder Kategorie vorne, keine Maße oder Zertifikate, keine Umweltaussagen (siehe Greenwashing-Regeln).
"suchbegriffe": bis 240 Zeichen, Marke zuerst, nur treffende Substantive, keine Umweltbegriffe (siehe Greenwashing-Regeln).
"farbe": die dominante Grundfarbe aus der ersten Wahrnehmung, exakt ein Wert.

HTML STRUCTURE
<h2><strong>[Produkttitel]</strong></h2>
<p class="bottom25">[Einleitung: was, für wen, Hauptnutzen. Altersbereich/Nutzungsdauer hier nennen.]</p>
<hr style="border:none;border-top:1px solid #e0e0e0;margin:10px 0;">
<details><summary><strong>[Starkes Produktargument als Titel]</strong></summary><p class="bottom25">...</p></details>
<hr style="border:none;border-top:1px solid #e0e0e0;margin:10px 0;">
<details><summary><strong>Materialien &amp; Verarbeitung</strong></summary><p class="bottom25">...</p></details>
<hr style="border:none;border-top:1px solid #e0e0e0;margin:10px 0;">
<details><summary><strong>Technische Daten &amp; Kompatibilit&auml;t</strong></summary><ul class="bottom25"><li>...</li><li>...</li></ul></details>
<hr style="border:none;border-top:1px solid #e0e0e0;margin:10px 0;">
<details><summary><strong>Lieferumfang</strong></summary><ul class="bottom25"><li>...</li></ul></details>

Füge nur Abschnitte hinzu, die für das Produkt sinnvoll sind. Halte die Abschnitte kurz und wiederhole dieselbe Information nicht in mehreren Abschnitten.
Technische Daten, Kompatibilität und Lieferumfang immer als Bullet-Liste (<ul><li>) ausgeben, niemals als Fließtext-Absatz.
Wenn das Produkt komplex genug ist, füge am Ende ein FAQ mit echten Elternfragen hinzu.

FAQ-FORMAT
<hr style="border:none;border-top:1px solid #e0e0e0;margin:10px 0;"><h2><strong>H&auml;ufige Fragen</strong></h2><details><summary><strong>[Echte Elternfrage]</strong></summary><p class="bottom25">[2–3 Sätze, direkt, keine Marketingsprache.]</p></details>

Auch in FAQs gelten die Greenwashing-Regeln – keine Frage/Antwort wie „Ist das Produkt nachhaltig?".
Halte die HTML-Ausgabe visuell konsistent mit dieser Struktur.

CONTENT RULES
- Nur bestätigte Fakten verwenden. Erfinde nichts.
- Warm, direkt, geduzt (Du/Dir/Dein) – niemals "Sie"/"Ihr".
- Übersetze jedes Merkmal in einen konkreten Nutzen für den Kunden statt es nur aufzuzählen (nicht "Material: Massivholz", sondern was das für den Kunden im Alltag bedeutet).
- Jeder Abschnitt braucht einen erkennbaren roten Faden zum Produktnutzen, keine reine Faktenliste.
- Keine generischen Textbausteine oder Floskeln, die auf jedes beliebige Produkt passen würden – jeder Text muss produktspezifisch klingen.
- Ein leichter humorvoller Satz, wenn er natürlich passt.
- Keine Superlative ohne Beleg.

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
