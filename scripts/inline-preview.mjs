// Vorschau-Fassung: eine einzige HTML-Datei mit eingebetteten Geometrien, Schriften und Beispielen
import fs from 'node:fs';
import path from 'node:path';

const dir = 'preview';
const assets = {};
const add = (rel, bin) => { const p = path.join('public', rel); assets[rel.split(path.sep).join('/')] = bin ? fs.readFileSync(p).toString('base64') : fs.readFileSync(p, 'utf8'); };
for (const f of fs.readdirSync('public/data')) add(path.join('data', f), false);
for (const f of fs.readdirSync('public/fonts')) add(path.join('fonts', f), true);
for (const f of fs.readdirSync('public/beispiele')) add(path.join('beispiele', f), true);
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const json = JSON.stringify(assets).replace(/</g, '\\u003c');
html = html.replace('<head>', () => `<head>\n<script>window.__KW_ASSETS__=${json};</script>`);
fs.writeFileSync(path.join(dir, 'kartenwerk-preview.html'), html);
for (const d of ['data', 'fonts', 'beispiele']) fs.rmSync(path.join(dir, d), { recursive: true, force: true });
console.log('preview/kartenwerk-preview.html', (html.length / 1024 / 1024).toFixed(2), 'MB');

// Fassung für ein Claude-Artifact: ohne eigenes Grundgerüst (doctype/html/head/body), Titel zuerst.
// Achtung: Das Bündel enthält selbst Zeichenketten wie "</head><body>" (SheetJS). Deshalb die echten
// Tags von außen suchen: <head> ist das erste, <body> und </body> sind die letzten Vorkommen.
{
  const hs = html.indexOf('<head>'), bs = html.lastIndexOf('<body>'), be = html.lastIndexOf('</body>');
  const he = html.lastIndexOf('</head>', bs);
  if (hs < 0 || bs < 0 || be < bs || he < hs) throw new Error('Grundgerüst der Vorschau nicht gefunden');
  let head = html.slice(hs + 6, he), body = html.slice(bs + 6, be);
  head = head.replace(/<meta charset="utf-8">\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '');
  const title = (head.match(/<title>Kartenwerk<\/title>/) || [''])[0];
  if (title) head = head.replace(title, '');
  const art = `<title>Kartenwerk</title>\n${head}\n${body}`;
  // Plausibilität: Außer dem Grundgerüst darf nichts verloren gehen
  const lost = html.length - art.length;
  if (lost > 2000) throw new Error('Artifact-Fassung ist ' + lost + ' Zeichen kürzer als die Vorschau');
  fs.writeFileSync(path.join(dir, 'kartenwerk.html'), art);
  console.log('preview/kartenwerk.html (Artifact)', (art.length / 1024 / 1024).toFixed(2), 'MB, Differenz', lost, 'Zeichen');
}
