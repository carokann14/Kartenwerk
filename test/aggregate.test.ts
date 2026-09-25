// Summieren auf gröbere Ebenen und eigene Regionen: Gemeinden → Kreise/Länder/Regionen, Wahlkreise → Länder
// Aufruf: npx esbuild test/aggregate.test.ts --bundle --platform=node --format=esm --outfile=/tmp/agg.test.mjs && node /tmp/agg.test.mjs
import fs from 'node:fs';
const assets: Record<string, string> = {};
for (const f of fs.readdirSync('public/data')) if (f.endsWith('.json')) assets['data/' + f] = fs.readFileSync('public/data/' + f, 'utf8');
(globalThis as unknown as { window: unknown }).window = { __KW_ASSETS__: assets };
const { readFile } = await import('../src/data/parse');
const { buildDataset, buildTable, defaultSettings, suggestGeoSetAsync } = await import('../src/data/pipeline');
const { loadGeo, ensureGeo, GEO } = await import('../src/geo/geo');
const { deriveDataset, areaMapping, isRate } = await import('../src/data/aggregate');
const { regionGeo } = await import('../src/geo/regions');
const { relateIds, translateFokus } = await import('../src/geo/relate');
const { areaRowIndex } = await import('../src/data/derive');
const ok = (c: unknown, m: string) => { if (!c) { console.error('FEHLER:', m); process.exitCode = 1; } else console.log('ok:', m); };
await loadGeo();
await ensureGeo(['vg-gem-2025', 'vg-krs-2025', 'vg-lan-2025', 'vg-vwg-2025', 'vg-rbz-2025']);
const load = async (file: string, name: string, mode?: 'anteilig' | 'gemeinsam') => {
  const b = fs.readFileSync(file);
  const raw = await readFile(file.split('/').pop()!, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const st = defaultSettings(raw); if (mode && st.wbz) st.wbz.briefwahl = mode;
  const t = buildTable(raw, st); const s = await suggestGeoSetAsync(t, st, raw.fileName); await ensureGeo([s.id]); st.geoSet = s.id;
  return buildDataset(raw, st, t, name);
};
const col = (ds: { columns: { id: string; label: string }[] }, label: string) => ds.columns.findIndex(c => c.label === label);
const sumCol = (ds: { rows: unknown[][] }, k: number) => ds.rows.reduce((s, r) => s + (typeof r[k] === 'number' ? r[k] as number : 0), 0);

const kreis = await load('data-src/btw2025kreis.csv', 'Kreise');
const kz = col(kreis, 'Gültige · Zweitstimmen'), kafd = col(kreis, 'AfD · Zweitstimmen');
console.log('Kreis-Spalten', kz, kafd, kreis.columns.slice(0, 6).map(c => c.label));
for (const mode of ['gemeinsam', 'anteilig'] as const) {
  const gem = await load('data-src/btw25_wbz.zip', 'Gemeinden ' + mode, mode);
  const gz = col(gem, 'Gültige · Zweitstimmen'), gafd = gem.columns.findIndex(c => c.party === 'AfD' && /Zweit/.test(c.label));
  // Gemeinden → Kreise
  const t0 = performance.now();
  ok(gz >= 0 && gafd >= 0, 'Spalten gefunden: ' + gz + ', ' + gafd);
  const dk = deriveDataset(gem, GEO['vg-gem-2025'], GEO['vg-krs-2025'])!;
  const ms = performance.now() - t0;
  ok(dk && dk.rows.length === 400, `${mode}: 400 Kreise summiert in ${ms.toFixed(0)} ms (Quellen ${dk.derived!.sources}, ohne Ziel ${dk.derived!.unassigned}, Lücken ${dk.derived!.partial}, geteilt ${dk.derived!.split})`);
  const ki = areaRowIndex(kreis);
  let maxDiff = 0, worst = '';
  for (let r = 0; r < dk.rows.length; r++) {
    const id = dk.rowArea[r]!, kr = ki.get(id); if (kr == null) continue;
    const a = dk.rows[r][gz] as number, b = kreis.rows[kr][kz] as number, d = Math.abs(a - b);
    if (!(d <= maxDiff)) { maxDiff = d; worst = `${id} ${a} vs ${b}`; }
  }
  ok(maxDiff < (mode === 'anteilig' ? 2 : 0.01), `${mode}: gültige Zweitstimmen je Kreis = Kreisergebnis (größte Abweichung ${maxDiff.toFixed(2)} ${worst})`);
  let maxA = 0; for (let r = 0; r < dk.rows.length; r++) { const kr = ki.get(dk.rowArea[r]!); if (kr == null) continue; maxA = Math.max(maxA, Math.abs((dk.rows[r][gafd] as number) - (kreis.rows[kr][kafd] as number))); }
  ok(maxA < (mode === 'anteilig' ? 2 : 0.01), `${mode}: AfD-Zweitstimmen je Kreis stimmen (größte Abweichung ${maxA.toFixed(2)})`);
  // Gemeinden → Länder
  const dl = deriveDataset(gem, GEO['vg-gem-2025'], GEO['vg-lan-2025'])!;
  ok(dl.rows.length === 16 && Math.abs(sumCol(dl, gz) - 49649512) < 5, `${mode}: 16 Länder, Summe ${Math.round(sumCol(dl, gz))}`);
  // Gemeinden → Verbände, Bezirke
  const dv = deriveDataset(gem, GEO['vg-gem-2025'], GEO['vg-vwg-2025'])!;
  ok(dv && Math.abs(sumCol(dv, gz) - 49649512) < 5, `${mode}: ${dv.rows.length} Gemeindeverbände, Summe ${Math.round(sumCol(dv, gz))}, geteilte Gruppen ${dv.derived!.split}`);
  const dr = deriveDataset(gem, GEO['vg-gem-2025'], GEO['vg-rbz-2025'])!;
  ok(dr && dr.rows.length === GEO['vg-rbz-2025'].areas.length, `${mode}: ${dr.rows.length} Bezirke`);
  // Eigene Region „Ruhrgebiet“ aus Kreisen, Daten aus Gemeinden
  const RUHR = ['05911', '05913', '05914', '05915', '05916', '05954', '05962', '05978', '05911', '05112', '05113', '05117', '05119', '05170', '05512', '05513', '05562'];
  const rs = { id: 'test', name: 'Test', base: 'vg-krs-2025', rest: false, restName: 'Übriges Gebiet', regions: [{ id: '1', name: 'Ruhrgebiet', members: RUHR }, { id: '2', name: 'Berlin', members: ['11000'] }] };
  const t1 = performance.now(); const eg = regionGeo(rs)!; GEO['eg:test'] = eg; const ms1 = performance.now() - t1;
  ok(eg.areas.filter(a => !a.free).length === 2 && eg.areas.filter(a => a.free).length === 15, `Region gebaut in ${ms1.toFixed(0)} ms: ${eg.areas.map(a => a.name + (a.free ? '*' : '')).slice(0, 4).join(', ')} … (${eg.areas.length} Flächen)`);
  const dRegion = deriveDataset(gem, GEO['vg-gem-2025'], eg)!;
  const kSum = RUHR.filter((x, i, A) => A.indexOf(x) === i).reduce((s, id) => s + (kreis.rows[ki.get(id)!][kz] as number), 0);
  const rr = areaRowIndex(dRegion).get('1')!;
  ok(dRegion.rows.length === 2 && Math.abs((dRegion.rows[rr][gz] as number) - kSum) < (mode === 'anteilig' ? 3 : 0.01), `${mode}: Ruhrgebiet aus Gemeinden ${Math.round(dRegion.rows[rr][gz] as number)} = Summe der Kreise ${kSum}`);
  ok(dRegion.derived!.unassigned > 5000, `${mode}: Gemeinden außerhalb der Regionen nicht gezählt (${dRegion.derived!.unassigned})`);
  // Übriges Gebiet als Region: alles zusammen = Bund
  const rs2 = { ...rs, id: 'test2', rest: true };
  const eg2 = regionGeo(rs2)!; GEO['eg:test2'] = eg2;
  const d2 = deriveDataset(kreis, GEO['vg-krs-2025'], eg2)!;
  ok(d2.rows.length === 3 && Math.abs(sumCol(d2, kz) - 49649512) < 1, `Kreise → 3 Regionen mit Rest, Summe ${sumCol(d2, kz)}`);
  if (mode === 'anteilig') {
    // Fokus-Übersetzung: Region → Gemeinden → Region
    const ids = relateIds(eg, [eg.byId.get('1')!], GEO['vg-gem-2025']);
    ok(ids.length > 40, `Ruhrgebiet besteht aus ${ids.length} Gemeinden`);
    const back = translateFokus({ kind: 'custom', ids: ids.map(i => GEO['vg-gem-2025'].areas[i].id) }, GEO['vg-gem-2025'], eg);
    ok(back.kind === 'area' && back.id === '1', 'zurück übersetzt: ' + JSON.stringify(back).slice(0, 60));
    const land = translateFokus({ kind: 'land', bl: '05' }, GEO['vg-krs-2025'], eg);
    ok(land.kind === 'custom' && land.ids.includes('1') && land.ids.includes('rest-05'), 'Land NRW → Ruhrgebiet + Rest NRW: ' + JSON.stringify(land).slice(0, 80));
    ok(areaMapping(GEO['vg-krs-2025'], GEO['vg-gem-2025']) === null, 'keine Zuordnung von grob nach fein');
  }
}
// Wahlkreise → Länder (Ergebnisse je Wahlkreis)
{
  const wk = await load('public/beispiele/btw2025_kerg2.csv', 'WK');
  const g = GEO[wk.geoSet];
  const d = deriveDataset(wk, g, GEO['vg-lan-2025'])!;
  const zi = wk.columns.findIndex(c => /Gültige/.test(c.label) && /Zweit/.test(c.label) && !/Vorperiode/.test(c.label));
  ok(d && d.rows.length === 16, `Wahlkreise → 16 Länder (${wk.geoSet}), Summe ${zi >= 0 ? sumCol(d, zi) : '?'}`);
  ok(zi < 0 || Math.abs(sumCol(d, zi) - 49649512) < 1, 'Bundessumme aus Wahlkreisen');
  const rates = wk.columns.filter(isRate).map(c => c.label);
  console.log('nicht addierbar:', rates.slice(0, 6), 'Spalten gesamt', wk.columns.length);
}
// Große Einteilung: alle Gemeinden nach Kreisen gruppiert → muss den Kreisen entsprechen
{
  const gem = GEO['vg-gem-2025'], krs = GEO['vg-krs-2025'];
  const regions = krs.all.map(i => ({ id: String(i + 1), name: krs.areas[i].name, members: gem.byKr[krs.areas[i].id]?.map(j => gem.areas[j].id) || [] }));
  const t = performance.now(); const eg = regionGeo({ id: 'big', name: 'Kreise nachgebaut', base: 'vg-gem-2025', rest: false, restName: 'Rest', regions })!; const ms = performance.now() - t;
  const nFree = eg.areas.filter(a => a.free).length;
  let maxRel = 0; for (const a of eg.areas) { if (a.free) continue; const k = krs.areas.find(x => x.name === a.name)!; maxRel = Math.max(maxRel, Math.abs(a.area - k.area) / k.area); }
  ok(eg.areas.length - nFree === 400 && maxRel < 0.001, `400 Kreise aus Gemeinden nachgebaut in ${ms.toFixed(0)} ms (Rest ${nFree}, größte Flächenabweichung ${(maxRel * 100).toFixed(3)} %)`);
  const rings = eg.areas.reduce((s, a) => s + a.ra.length, 0), kr = krs.areas.reduce((s, a) => s + a.ra.reduce((t, p) => t + p.length, 0), 0);
  ok(Math.abs(rings - kr) <= 5, `Ringe: ${rings} (Kreise: ${kr})`);
}
