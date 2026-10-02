// Elementbaum (M11 · Etappe 1): feste Objekte, Prüfen und Ergänzen, Migration älterer Projekte, Reihenfolge im Export
import fs from 'node:fs';
const assets: Record<string, string> = {};
for (const f of fs.readdirSync('public/data')) assets['data/' + f] = fs.readFileSync('public/data/' + f, 'utf8');
for (const f of fs.readdirSync('public/fonts')) assets['fonts/' + f] = fs.readFileSync('public/fonts/' + f).toString('base64');
(globalThis as unknown as { window: unknown }).window = { __KW_ASSETS__: assets };
const ok = (c: boolean, m: string) => { console.log((c ? 'ok: ' : 'FEHLER: ') + m); if (!c) process.exitCode = 1; };

const { defaultNodes, ensureNodes, flatNodes } = await import('../src/model/nodes');
const { defaultDoc, normalizeDoc } = await import('../src/model/defaults');
const { loadGeo, ensureGeo } = await import('../src/geo/geo');
const { loadFonts } = await import('../src/lib/fonts');
const { makeVariant } = await import('../src/model/layout');
const { buildExportSvg } = await import('../src/export/svg');
type GNode = import('../src/model/types').GNode;
const ids = (n: GNode[]) => flatNodes(n).map(x => x.id).join(',');

ok(ids(defaultNodes('map')) === 'main,inset,legend,title,subtitle,source,logo,ann', 'Karte: feste Objekte in der Reihenfolge des bisherigen Exports');
ok(ids(defaultNodes('chart')) === 'main,legend,title,subtitle,source,logo,ann' && defaultNodes('chart')[0].type === 'chart', 'Diagramm: Diagramm statt Karte, keine Lupe');
const def = defaultNodes('map');
ok(ensureNodes(def, 'map') === def, 'fehlerfreier Baum bleibt dasselbe Objekt');
const broken: GNode[] = [{ id: 'title', type: 'text' }, { id: 'main', type: 'map' }, { id: 'title', type: 'text' }, { id: 'xyz', type: 'text' }, { id: 'logo', type: 'map' }];
const fixed = ensureNodes(broken, 'map');
ok(ids(fixed) === 'title,main,inset,legend,subtitle,source,logo,ann', 'doppelte und unbekannte Objekte entfernt, fehlende an ihrer Stelle ergänzt: ' + ids(fixed));
ok(fixed.find(n => n.id === 'logo')!.type === 'logo', 'falsche Art berichtigt');
ok(ids(ensureNodes(defaultNodes('map'), 'chart')) === 'main,legend,title,subtitle,source,logo,ann' && ensureNodes(defaultNodes('map'), 'chart')[0].type === 'chart', 'Karte → Diagramm: Lupe entfällt, Hauptobjekt wird Diagramm');
const grouped: GNode[] = [{ id: 'g1', type: 'group', children: [{ id: 'title', type: 'text' }, { id: 'subtitle', type: 'text' }] }, ...defaultNodes('map').filter(n => n.id !== 'title' && n.id !== 'subtitle')];
ok(ensureNodes(grouped, 'map') === grouped && ids(grouped) === 'title,subtitle,main,inset,legend,source,logo,ann', 'Gruppen bleiben erhalten, ihre Objekte zählen mit');
ok(ids(ensureNodes([{ id: 'g', type: 'group', children: [] }], 'map')) === ids(defaultNodes('map')), 'leere Gruppe entfällt');
ok(ids(ensureNodes(undefined, 'map')) === ids(defaultNodes('map')), 'ohne Baum: Vorgabe');

// Migration: Projekt der Version 2 ohne Baum, mit einer zweiten Grafik (Diagramm)
const v2 = defaultDoc('btw-wk-2025') as unknown as Record<string, unknown> & { graphics: { id: string; name: string; kind: string }[]; pageData: Record<string, Record<string, unknown>> };
delete v2.nodes; v2.version = 2;
v2.graphics.push({ id: 'g-ch', name: 'Balken', kind: 'chart' });
const snap = Object.fromEntries(Object.entries(defaultDoc('btw-wk-2025')).filter(([k]) => k !== 'nodes')); v2.pageData['g-ch'] = snap;
const n = normalizeDoc(v2 as never);
ok(n.version === 3 && ids(n.nodes) === ids(defaultNodes('map')), 'Version 2 → 3: aktive Karte bekommt die festen Objekte');
ok(ids(n.pageData['g-ch'].nodes!) === ids(defaultNodes('chart')), 'weitere Grafik (Diagramm) bekommt ihren eigenen Baum');

// Export folgt der Reihenfolge des Baums
await loadGeo(); await ensureGeo(['btw-wk-2025']); await loadFonts().catch(() => undefined);
const d = defaultDoc('btw-wk-2025');
d.variants = [makeVariant(d, '4:5')];
const svg1 = buildExportSvg(d);
ok(svg1.indexOf('id="Hauptkarte"') < svg1.indexOf('id="Titel"') && svg1.indexOf('id="Legende"') < svg1.indexOf('id="Titel"'), 'Vorgabe: Karte und Legende vor dem Titel');
d.nodes = [{ id: 'title', type: 'text' }, ...d.nodes.filter(x => x.id !== 'title')];
const svg2 = buildExportSvg(d);
ok(svg2.indexOf('id="Titel"') < svg2.indexOf('id="Hauptkarte"'), 'Titel nach hinten gelegt: steht im Export vor (unter) der Karte');
ok(svg2.length === svg1.length, 'nur die Reihenfolge ändert sich, nicht der Inhalt');
