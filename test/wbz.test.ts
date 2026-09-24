// Wahlbezirksstatistik → Gemeinden: Summen bleiben erhalten, Zuordnung zu VG250 01.01.2025
// Aufruf: npx esbuild test/wbz.test.ts --bundle --platform=node --format=esm --outfile=/tmp/wbz.test.mjs && node /tmp/wbz.test.mjs
import fs from 'node:fs';
const assets: Record<string, string> = {};
for (const f of ['index.json', 'vg250-2025.json', 'btw-wk-2025.json', 'btw-wk-2021.json', 'context.json']) assets['data/' + f] = fs.readFileSync('public/data/' + f, 'utf8');
(globalThis as unknown as { window: unknown }).window = { __KW_ASSETS__: assets };
const { readFile } = await import('../src/data/parse');
const { aggregateWbz } = await import('../src/data/wbz');
const { buildDataset, buildTable, defaultSettings, suggestGeoSetAsync } = await import('../src/data/pipeline');
const { loadGeo, ensureGeo, GEO } = await import('../src/geo/geo');
const ok = (c: unknown, m: string) => { if (!c) { console.error('FEHLER:', m); process.exitCode = 1; } else console.log('ok:', m); };
await loadGeo();
const buf = fs.readFileSync('data-src/btw25_wbz.zip');
const raw = await readFile('btw25_wbz.zip', buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const st = defaultSettings(raw);
ok(st.preset === 'bwl-wbz', 'Vorlage erkannt: ' + st.preset);
// Summen: Rohdaten (alle Bezirke) = zusammengefasste Gemeinden, in beiden Verfahren
const cells = raw.sheets[0].cells, H = cells[st.headerStart].map(String), gz = H.indexOf('Gültige - Zweitstimmen');
let rawSum = 0; for (let r = st.headerStart + 1; r < cells.length; r++) rawSum += Number(cells[r][gz]) || 0;
for (const mode of ['anteilig', 'gemeinsam'] as const) {
  const w = aggregateWbz(cells, st.headerStart, mode), c = w.header.indexOf('Gültige - Zweitstimmen');
  // gemeinsam: jede Gruppe nur einmal zählen
  const seen = new Set<string>(); let sum = 0;
  for (const r of w.body) { const j = w.joint[String(r[0])]; if (j) { if (seen.has(j)) continue; seen.add(j); } sum += r[c] as number; }
  ok(Math.abs(sum - rawSum) < (mode === 'anteilig' ? 0.05 * w.body.length : 1), `${mode}: Summe gültige Zweitstimmen ${Math.round(sum)} = Rohdaten ${rawSum}`);
}
const t = buildTable(raw, st);
const sug = await suggestGeoSetAsync(t, st, raw.fileName);
ok(sug.id === 'vg-gem-2025', 'Gebietsstand vorgeschlagen: ' + sug.id + ' (' + sug.reason + ')');
await ensureGeo([sug.id]); st.geoSet = sug.id;
const ds = buildDataset(raw, st, t, 'BTW 2025 Gemeinden');
const r = ds.report, g = GEO[sug.id];
const free = new Set(g.areas.filter(a => a.free).map(a => a.id));
const miss = r.missing.filter(id => !free.has(id));
console.log('Bericht', { exact: r.exact, unknown: r.unknown, ambiguous: r.ambiguous, duplicate: r.duplicate, included: r.included, missing: r.missing.length, missingBewohnt: miss.length });
ok(r.unknown === 0 && r.ambiguous === 0 && r.duplicate === 0, 'alle Zeilen eindeutig zugeordnet');
ok(miss.length <= 2, 'bewohnte Gemeinden ohne Daten: ' + miss.length + ' ' + miss.slice(0, 5).map(id => g.areas[g.byId.get(id)!].name).join(', '));
ok(!!ds.alias?.['01051008'], 'Bergewöhrden in Hennstedt enthalten');
// Kreise: btw2025kreis.csv
{
  const kb = fs.readFileSync('data-src/btw2025kreis.csv');
  const kraw = await readFile('btw2025kreis.csv', kb.buffer.slice(kb.byteOffset, kb.byteOffset + kb.byteLength));
  const kst = defaultSettings(kraw); ok(kst.preset === 'bwl-kreis', 'Kreis-Vorlage erkannt');
  const kt = buildTable(kraw, kst); const ks = await suggestGeoSetAsync(kt, kst, kraw.fileName);
  ok(ks.id === 'vg-krs-2025', 'Kreise 2025 vorgeschlagen: ' + ks.id); await ensureGeo([ks.id]); kst.geoSet = ks.id;
  const kds = buildDataset(kraw, kst, kt, 'BTW 2025 Kreise');
  ok(kds.report.exact === 400 && kds.report.missing.length === 0 && kds.report.unknown === 0, `Kreise: ${kds.report.exact} zugeordnet, ${kds.report.missing.length} ohne Daten`);
  ok(kds.groups.some(x => x.label === 'Zweitstimmen' && x.columns.length > 20), 'Gruppe Zweitstimmen mit Parteien');
}
