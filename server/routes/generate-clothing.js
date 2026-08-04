import { Router } from 'express';

const router = Router();

const buildPrompt = (item) => {
  const BRAND        = item.markenname   || '';
  const NAME         = item.artikelname  || '';
  const DESC         = item.beschreibung || '';
  const WG            = item.warengruppe  || '';
  const INFOMATERIAL = item.infoMaterial || '';

  return `Du bist Texter für herrundfrauklein.com. Antworte nur mit JSON, ohne Markdown.

INPUT
brand name: "${BRAND}"
product name: "${NAME}"
description: "${DESC}"
Warengruppe: "${WG}"
${INFOMATERIAL ? `Info/Material: "${INFOMATERIAL}"` : ''}

Nutze zusätzlich, sofern vorhanden, die Angaben aus Info/Material als weitere Faktenquelle (z. B. für Material, Passform oder Pflegehinweise), gleichrangig mit description. Erfinde nichts, das nicht aus description oder Info/Material hervorgeht.

JSON-KEYS (alle Pflicht):
"produkttext" | "html_de" | "meta_description" | "title_tag" | "suchbegriffe" | "farbe"

"html_de" wird nach den REGELN unten erstellt. "produkttext" ist derselbe Inhalt als Plaintext ohne HTML-Tags (Listen als Zeilen mit "- ").
"meta_description": 140–155 Zeichen, Nutzen plus eine relevante Spezifikation plus ein Vertrauenssignal.
"title_tag": 50–60 Zeichen, Marke oder Kategorie vorne, keine Maße oder Zertifikate.
"suchbegriffe": bis 240 Zeichen, Marke zuerst, nur treffende Substantive.
"farbe": die dominante Grundfarbe, exakt ein Wert.

REGELN FÜR "html_de"

Analysiere den Text aus der description-Spalte und schreibe einen neuen deutschen Produkttext für den Onlineshop herrundfrauklein.com, einen Onlineshop mit Ware für Babys und Kinder. Wenn description ein Link ist, lies alle Informationen über den Artikel von der Webseite aus, jedoch keine Preise oder Anbieterinformationen, die sich nicht explizit auf den Artikel beziehen. Insgesamt soll die Sprache ansprechend und warm sein und die Eltern als Käufer ansprechen. Als Inspiration für deinen Schreibstil kannst du auch andere Quellen anschauen, wie andere Onlineshops für Kinder, Kinderbücher etc. Füge außerdem eine Liste mit dem Titel "Die wichtigsten Details:" hinzu, in der wichtige technische Details gelistet sind, die nicht zwangsläufig im Text vorkommen müssen, sowie ein paar inhaltliche Details. Die Listeneinträge sollen ohne Titel auskommen. Trage nicht alle Informationen aus dem Text in die Liste ein, sondern nur die wichtigsten. Nenne in der Liste keine anderen verfügbaren Farb- oder Größenvariationen. Füge eventuell noch eine Liste mit dem Titel "Pflegehinweise:" hinzu. Benutze als Artikelnamen den Wert aus product name oder passe ihn so an, dass er sprachlich und im Fließtext Sinn ergibt. Wenn der Artikelname zum Beispiel "Pullover Bio-Baumwolle" heißt, dann schreibe eher nicht "Der Pullover Bio-Baumwolle", sondern "Der Pullover aus Bio-Baumwolle". Der beschriebene Artikel ist für das Kind des Lesers. Der Leser soll geduzt werden, zum Beispiel mit "du" und "dein". Anstatt "uns" oder "wir" nenne den Markennamen aus brand name und schreibe in der dritten Person. Wichtig: Der Markenname aus brand name und der Produktname aus product name sollen jeweils bold bzw. strong markiert sein. Beginne den Text sofort ohne Überschrift und nicht so häufig mit "Hey Du", "Entdecke", "Verwöhne", "Tauche ein" oder "Lerne …". Versuche, keine Übertreibungen wie "perfekt" zu benutzen. Erwähne in oder nach der Einführung den Produktnamen und den Markennamen. Nenne den Produktnamen mit Marke jedoch nicht öfter als jeweils zweimal. Trenne den Haupttext in ein bis zwei Absätze, die NICHT mit derselben Formulierung beginnen sollen. Der generierte Text soll, falls möglich, nicht länger sein als die Referenzinformationen aus description.

Erstelle einen kurzen, warmen und hochwertigen deutschen Produkttext für Kinderkleidung. Der Text richtet sich an Erwachsene, die das Produkt für ein Kind kaufen. Beschreibe daher, wie das Kleidungsstück am Kind sitzt, aussieht und sich im Alltag bewährt. Formuliere niemals so, als würde der Leser das Produkt selbst tragen.

Schreibe einen Absatz mit 2–4 kurzen Sätzen. Erkläre zuerst klar, um welches Kleidungsstück es sich handelt, für welches Kind oder Alter es geeignet ist, sofern diese Information vorhanden ist, und was es besonders macht. Der Text soll leicht, lebendig und gerne etwas verspielt klingen, aber nicht übertrieben, kitschig oder kataloghaft. Duze den Leser. Vermeide leere Werbewörter, Wiederholungen und allgemeine Aussagen ohne konkreten Produktbezug. Verwende ausschließlich Informationen aus description (und Info/Material) und erfinde keine Eigenschaften.

Ergänze danach immer <p><strong>Die wichtigsten Details:</strong></p> und eine kurze Liste mit den wichtigsten Produktangaben. Verwende dafür <ul><li>...</li></ul>. Die Materialzusammensetzung muss immer als eigener Bulletpoint enthalten sein. Ist im Input keine Materialangabe vorhanden, lass ihn weg. Nenne außerdem, sofern vorhanden, Passform, Farbe, besondere Verarbeitung, Zertifizierungen und Pflegehinweise. Jeder Bulletpoint soll nur eine Information enthalten.

Für "html_de" gilt außerdem: Verwende für Absätze <p>...</p>. Setze <strong> sparsam und nur für besonders wichtige Kaufargumente ein. Konvertiere Sonderzeichen im Text in HTML-Entities, aber verändere die HTML-Tags nicht. Keine weiteren Überschriften, keine Erklärungen, keine Markdown-Codeblöcke oder Backticks und keine <html>-, <head>-, <body>-, <meta>- oder <div>-Tags.

`;
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
    console.error('generate-online-texts-clothing error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export default router;
