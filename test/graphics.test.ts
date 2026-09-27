// Mappe (M7 · Etappe 1): alte Projekte werden zur Mappe mit einer Grafik; übrige Grafiken werden mit normalisiert
import fs from 'node:fs';
const assets: Record<string, string> = {};
for (const f of fs.readdirSync('public/data')) assets['data/' + f] = fs.readFileSync('public/data/' + f, 'utf8');
(globalThis as unknown as { window: unknown }).window = { __KW_ASSETS__: assets };
const { defaultDoc, normalizeDoc } = await import('../src/model/defaults');
const { GRAPHIC_KEYS, docForGraphic, pickGraphic } = await import('../src/model/graphicKeys');
const ok = (c: boolean, m: string) => { console.log((c ? 'ok: ' : 'FEHLER: ') + m); if (!c) process.exitCode = 1; };
const old = defaultDoc('btw-wk-2025') as unknown as Record<string, unknown>;
delete old.graphics; delete old.page; delete old.pageData; old.version = 1;
const n = normalizeDoc(old as never);
ok(n.version === 2 && n.graphics.length === 1 && n.graphics[0].kind === 'map' && n.page === 0 && Object.keys(n.pageData).length === 0, 'altes Projekt → Mappe mit einer Grafik „Karte“');
// zweite Grafik mit altem Stand (ohne neuere Felder)
const snap = pickGraphic(n) as Record<string, unknown>;
const legacy = JSON.parse(JSON.stringify(snap)); delete legacy.legend.simple; delete legacy.layers.laender;
const two = { ...n, graphics: [...n.graphics, { id: 'g2', name: 'Karte 2', kind: 'map' }], pageData: { g2: legacy } };
const m = normalizeDoc(two as never);
ok(m.pageData.g2.legend!.simple === false && m.pageData.g2.layers!.laender === false, 'übrige Grafik wird ebenfalls normalisiert (Legende, Ebenen)');
ok(Object.keys(m.pageData.g2).sort().join() === [...GRAPHIC_KEYS].sort().join(), 'übrige Grafik enthält genau die Grafikfelder');
const view = docForGraphic(m, 1);
ok(view.page === 1 && view.datasets === m.datasets && view.texts === m.pageData.g2.texts, 'docForGraphic: geteilte Daten, eigene Texte');
