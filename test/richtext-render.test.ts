// Rich-Text: Live-Rendering (textPrims → runs) und Export (textToPath) mit echter Schrift geprüft.
// Aufruf: npx esbuild test/richtext-render.test.ts --bundle --platform=node --format=esm --outfile=/tmp/rtr.test.mjs && node /tmp/rtr.test.mjs
import fs from 'node:fs';
const assets: Record<string, string> = {};
for (const f of fs.readdirSync('public/fonts')) assets['fonts/' + f] = fs.readFileSync('public/fonts/' + f).toString('base64');
(globalThis as unknown as { window: unknown }).window = { __KW_ASSETS__: assets };

const ok = (c: boolean, m: string) => { console.log((c ? 'ok: ' : 'FEHLER: ') + m); if (!c) process.exitCode = 1; };

const { loadFonts } = await import('../src/lib/fonts');
const { setMarkField } = await import('../src/lib/richtext');
const { textBlock, textPrims } = await import('../src/render/elements');
const { textToPath } = await import('../src/export/svg');
const { defaultDoc } = await import('../src/model/defaults');

await loadFonts();

const doc = defaultDoc('btw-wk-2025') as import('../src/model/types').Doc;
const text = 'Die aktuelle Arbeitslosenquote in Deutschland liegt bei 6,4 Prozent.';
const start = text.indexOf('6,4 Prozent'), end = start + '6,4 Prozent'.length;
doc.texts.subtitle.text = text;
doc.texts.subtitle.visible = true;
doc.texts.subtitle.color = 'ink';
doc.texts.subtitle.marks = setMarkField(text, [], start, end, 'b', true);
doc.texts.subtitle.marks = setMarkField(text, doc.texts.subtitle.marks, start, start + 3, 'i', true);
doc.texts.subtitle.marks = setMarkField(text, doc.texts.subtitle.marks, start, end, 'color', '#9E5B0B');

// Zeilenbreite groß genug, damit alles in einer Zeile steht (Fokus dieses Tests: Läufe, nicht Umbruch)
const b = textBlock(doc, 'subtitle', 4000, 1);
ok(b.lines.length === 1 && b.lines[0] === text, 'Unterzeile bleibt bei großer Breite eine Zeile: ' + JSON.stringify(b.lines));

const fakeVariant = { ts: 1, L: { title: { x: 0, y: 0, w: 4000 }, subtitle: { x: 0, y: 0, w: 4000 }, source: { x: 0, y: 0, w: 4000 } } } as unknown as import('../src/model/types').Variant;
const prims = textPrims(doc, 'subtitle', fakeVariant);
ok(!!prims && prims.texts.length === 1, 'genau ein Zeilen-Primitiv für die Unterzeile');
const line = prims!.texts[0];
ok(!!line.runs && line.runs.length === 4, 'die Zeile hat vier Formatierungs-Läufe (normal · fett+kursiv · fett · normal für den Punkt): ' + JSON.stringify(line.runs?.map(r => [r.text, r.cut, r.italic, r.color])));
const [r0, r1, r2, r3] = line.runs!;
ok(r0.cut === 'text' && !r0.italic && r0.color === doc.style.ink, 'erster Lauf: normaler Textschnitt, Grundfarbe');
ok(r1.cut === 'bold' && r1.italic === true && r1.color === '#9E5B0B', '„6,4“: MW Bold, kursiv, eigene Farbe');
ok(r2.cut === 'bold' && !r2.italic && r2.color === '#9E5B0B', '„ Prozent“: MW Bold, eigene Farbe, nicht kursiv');
ok(r3.text === '.' && r3.cut === 'text' && r3.color === doc.style.ink, 'der Schlusspunkt (außerhalb der Auswahl) bleibt normal');

// Export: ein Pfad je Lauf, mit den richtigen Füllfarben; der kursive Lauf trägt eine Scher-Transformation
const svg = textToPath(line);
const paths = [...svg.matchAll(/<path[^>]*>/g)].map(m => m[0]);
ok(paths.length === 4, 'Export erzeugt vier <path>-Elemente (einen je Lauf): ' + paths.length);
ok(paths[0].includes(`fill="${doc.style.ink}"`) && !paths[0].includes('transform'), 'erster Pfad: Grundfarbe, keine Schräglage');
ok(paths[1].includes('fill="#9E5B0B"') && paths[1].includes('transform="matrix('), 'zweiter Pfad: eigene Farbe UND Scher-Transformation (kursiv)');
ok(paths[2].includes('fill="#9E5B0B"') && !paths[2].includes('transform'), 'dritter Pfad: eigene Farbe, keine Schräglage (nicht kursiv)');
ok(paths[3].includes(`fill="${doc.style.ink}"`) && !paths[3].includes('transform'), 'vierter Pfad (Punkt): wieder Grundfarbe, keine Schräglage');

// Ohne Marken bleibt alles wie vorher (ein <path>, kein Umbau der bestehenden Projekte)
doc.texts.title.text = 'Titel ohne Formatierung';
doc.texts.title.visible = true;
const titlePrims = textPrims(doc, 'title', fakeVariant);
ok(!titlePrims!.texts[0].runs, 'Titel ohne Marken bekommt kein runs-Feld (unverändertes Verhalten)');
const titleSvg = textToPath(titlePrims!.texts[0]);
ok([...titleSvg.matchAll(/<path/g)].length === 1, 'Export ohne Marken bleibt bei einem <path> wie bisher');

// Umbruch mit echter Schrift: komplett fett gesetzter Text ist insgesamt breiter, daher bricht er bei einer
// Breite dazwischen früher um als der gleiche Text ohne Formatierung.
const { measureW } = await import('../src/lib/fonts');
const { wrapRich } = await import('../src/lib/richtext');
const shortText = 'kurzer Text bei 6,4 Prozent Anteil';
const boldMarks = setMarkField(shortText, [], 0, shortText.length, 'b', true);
const wPlain = measureW(shortText, 'text', 18), wBold = measureW(shortText, 'bold', 18);
ok(wBold > wPlain, `ganz fett ist breiter als ganz normal (${wBold.toFixed(1)} vs. ${wPlain.toFixed(1)}px)`);
const maxW = (wPlain + wBold) / 2;
const linesPlain = wrapRich(shortText, [], 'text', 18, maxW);
const linesBold = wrapRich(shortText, boldMarks, 'text', 18, maxW);
ok(linesPlain.length === 1 && linesBold.length === 2, `bei gleicher Umbruchbreite bricht die fett formatierte Zeile früher um (ohne: ${linesPlain.length}, mit Fettung: ${linesBold.length})`);
