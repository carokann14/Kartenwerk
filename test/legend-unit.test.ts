// Legende: eigenes Zeichen hinter Werten/Bereichen der Klassen-Legende (an/aus, freier Text).
// Aufruf: npx esbuild test/legend-unit.test.ts --bundle --platform=node --format=esm --outfile=/tmp/lu.test.mjs && node /tmp/lu.test.mjs
import fs from 'node:fs';
const assets: Record<string, string> = {};
for (const f of fs.readdirSync('public/data')) assets['data/' + f] = fs.readFileSync('public/data/' + f, 'utf8');
(globalThis as unknown as { window: unknown }).window = { __KW_ASSETS__: assets };

const ok = (c: boolean, m: string) => { console.log((c ? 'ok: ' : 'FEHLER: ') + m); if (!c) process.exitCode = 1; };

const { GEO, loadGeo, ensureGeo } = await import('../src/geo/geo');
const { legendPrims } = await import('../src/render/elements');
const { defaultDoc } = await import('../src/model/defaults');
import type { Dataset, MatchReport } from '../src/data/types';
import type { Doc } from '../src/model/types';

await loadGeo(); await ensureGeo(['vg-lan-2026']);
const lan = GEO['vg-lan-2026'];

// Ein einfacher „Wert“-Datensatz (Arbeitslosenquote), wie ihn ein CSV-Import ergäbe – ohne Einheit im Modell (M4-2p: bisher keine Möglichkeit, ein Zeichen anzuhängen)
const rep: MatchReport = { total: lan.areas.length, exact: lan.areas.length, byName: 0, ambiguous: 0, unknown: 0, duplicate: 0, summary: 0, ignored: 0, ruled: 0, missing: [], nameMismatch: [], issues: [], nullCells: 0, dashCells: 0 };
const ds: Dataset = {
  id: 'ds-alq', name: 'Arbeitslosenquote', fileName: 'alq.csv', importedAt: '2026-09-27', geoSet: 'vg-lan-2026', preset: 'eigene',
  settings: {} as Dataset['settings'],
  columns: [{ id: 'id', label: 'Schlüssel', kind: 'text', role: 'id', party: null, short: null }, { id: 'alq', label: 'Arbeitslosenquote', kind: 'number', role: 'value', party: null, short: null }],
  groups: [], rowKey: lan.areas.map(a => a.id), rowArea: lan.areas.map(a => a.id),
  rows: lan.areas.map((_, i) => [lan.areas[i].id, 3 + i]),   // 3, 4, 5, 6 … Prozent je Land
  report: rep,
};

const doc = defaultDoc('vg-lan-2026') as Doc;
doc.variants = [{ ts: 1, L: { legend: { x: 0, y: 0, w: 0 }, main: { x: 0, y: 0, w: 800, h: 600, view: { cx: 0, cy: 0, k: 1 } } } } as unknown as Doc['variants'][0]];
doc.active = 0;
doc.datasets = [ds];
doc.color = { mode: 'wert', dataset: 'ds-alq', column: 'alq', method: 'gleich', classes: 5, hue: '#2F5D8A' };
doc.fokus = { kind: 'de' };

// Ohne Einstellung: wie bisher kein Zeichen an den Klassengrenzen (die Lücke, die diese Erweiterung schließt)
{
  const p = legendPrims(doc)!;
  const boundaryLabels = p.texts.filter(t => t.cut === 'text' && t.anchor === 'middle').map(t => t.text);
  ok(boundaryLabels.length > 0, 'Klassengrenzen-Beschriftungen vorhanden: ' + JSON.stringify(boundaryLabels));
  ok(boundaryLabels.every(l => !/[%€$]/.test(l)), 'ohne aktiviertes Zeichen bleiben die Grenzen wie bisher ohne Einheit: ' + JSON.stringify(boundaryLabels));
}

// Ein-/Ausschalten allein (ohne Text) ändert nichts – erst mit Text erscheint das Zeichen
doc.legend.unitOn = true;
{
  const p = legendPrims(doc)!;
  const boundaryLabels = p.texts.filter(t => t.cut === 'text' && t.anchor === 'middle').map(t => t.text);
  ok(boundaryLabels.every(l => !/[%€$]/.test(l)), 'an, aber Text leer: weiterhin keine Einheit angehängt: ' + JSON.stringify(boundaryLabels));
}

// Zeichen „%“ gesetzt: erscheint an allen Klassengrenzen der Vorgabe „Unter“
doc.legend.unit = '%';
{
  const p = legendPrims(doc)!;
  const boundaryLabels = p.texts.filter(t => t.cut === 'text' && t.anchor === 'middle').map(t => t.text);
  ok(boundaryLabels.length > 0 && boundaryLabels.every(l => l.endsWith('%')), '„%“ erscheint an jeder Klassengrenze: ' + JSON.stringify(boundaryLabels));
}

// Frei änderbar, z. B. auf „ €“ – nicht auf „%“ festgelegt
doc.legend.unit = ' €';
{
  const p = legendPrims(doc)!;
  const boundaryLabels = p.texts.filter(t => t.cut === 'text' && t.anchor === 'middle').map(t => t.text);
  ok(boundaryLabels.every(l => l.endsWith('€')) && boundaryLabels.every(l => !l.includes('%')), 'Text frei auf „ €“ änderbar (ersetzt „%“, nicht zusätzlich): ' + JSON.stringify(boundaryLabels));
}

// Ausschalten blendet das Zeichen wieder aus, ohne den eingegebenen Text zu verwerfen
doc.legend.unitOn = false;
{
  const p = legendPrims(doc)!;
  const boundaryLabels = p.texts.filter(t => t.cut === 'text' && t.anchor === 'middle').map(t => t.text);
  ok(boundaryLabels.every(l => !/[%€$]/.test(l)), 'ausgeschaltet: keine Einheit mehr, trotz gesetztem Text: ' + JSON.stringify(boundaryLabels));
  ok(doc.legend.unit === ' €', 'der eingegebene Text bleibt beim Ausschalten erhalten (zum späteren Wiedereinschalten)');
}

// „Neben“ (horizontal): dieselbe Einstellung gilt auch für die Bereichsbeschriftungen der einzelnen Kästen
doc.legend.unitOn = true; doc.legend.unit = '%'; doc.legend.orientation = 'horizontal';
{
  const p = legendPrims(doc)!;
  const rangeLabels = p.texts.filter(t => t.color === doc.style.inkSoft && t.anchor === 'start' && /^[<≥]|–/.test(t.text)).map(t => t.text);
  ok(rangeLabels.length > 0 && rangeLabels.every(l => l.includes('%')), '„Neben“: Bereichsbeschriftungen der Kästen tragen ebenfalls das Zeichen: ' + JSON.stringify(rangeLabels));
}
