// Regionaldatenbank: echte Downloads (Flat-File-CSV) aus Kartenwerk-Daten/Regionaldatenbank
import fs from 'node:fs';
const assets: Record<string, string> = {};
for (const f of fs.readdirSync('public/data')) assets['data/' + f] = fs.readFileSync('public/data/' + f, 'utf8');
(globalThis as unknown as { window: unknown }).window = { __KW_ASSETS__: assets };
const { GEO, loadGeo, ensureGeo } = await import('../src/geo/geo');
const { readFile } = await import('../src/data/parse');
const { buildDataset, buildTable, defaultSettings, shortTitle, suggestGeoSetAsync } = await import('../src/data/pipeline');
const { autoRule } = await import('../src/model/actions');
const { colorModel, legendTitleAuto } = await import('../src/render/colorModel');
const { autoSourceText } = await import('../src/render/elements');
const { defaultDoc } = await import('../src/model/defaults');
const ok = (c: boolean, m: string) => { console.log((c ? 'ok: ' : 'FEHLER: ') + m); if (!c) process.exitCode = 1; };
const DIR = process.env.RDB || 'data-src/rdb';
await loadGeo(); await ensureGeo(['vg-krs-2026', 'vg-lan-2026', 'vg-krs-2025']);
for (const f of fs.readdirSync(DIR).filter(x => /\.csv$/.test(x))) {
  console.log(`\n=== ${f}`);
  const b = fs.readFileSync(`${DIR}/${f}`); const raw = await readFile(f, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  const st = defaultSettings(raw);
  const t0 = buildTable(raw, st);
  const sug = await suggestGeoSetAsync(t0, st, f); st.geoSet = sug.id;
  const t = buildTable(raw, st); t.notes.forEach(n => console.log('   ' + n));
  const ds = buildDataset(raw, st, t, shortTitle(st.sourceTitle));
  const r = ds.report;
  ok(st.preset === 'genesis', `Vorlage ${st.preset} · Karte ${st.geoSet} (${sug.reason}) · Name „${ds.name}“`);
  console.log(`   Quelle: ${st.attribution} · ${st.sourceTitle}`);
  console.log(`   Spalten (${t.columns.length - 2}): ${t.columns.slice(2, 9).map(c => c.label + (c.party ? ' [' + c.party + ']' : '')).join(' | ')}${t.columns.length > 9 ? ' …' : ''}`);
  console.log(`   Gruppen: ${ds.groups.map(g => `${g.label} (${g.columns.length})`).join(', ') || '–'}`);
  ok(r.unknown === 0 && r.ambiguous === 0 && r.duplicate === 0, `Zuordnung: ${r.exact} über Kennung, ${r.byName} Name, ${r.unknown} unbekannt, ${r.duplicate} doppelt, ${r.missing.length} ohne Daten`);
  console.log(`   Zeit: ${ds.time?.label} ${ds.time?.periods.join(', ')} · zusammengelegt ${JSON.stringify(Object.fromEntries(Object.entries(ds.time?.merged || {}).map(([k, v]) => [k, v.length])))} · geschätzt ${JSON.stringify(Object.fromEntries(Object.entries(ds.time?.estimated || {}).map(([k, v]) => [k, v.length])))}`);
  const doc = { ...defaultDoc(st.geoSet), datasets: [ds] } as ReturnType<typeof defaultDoc>; doc.color = autoRule(ds);
  const cm = colorModel(doc);
  console.log(`   Farbregel ${doc.color.mode} · Legende „${legendTitleAuto(doc, cm)}“ · ohne Daten ${cm.missing} · Einträge ${cm.entries.map(e => e.label + ' ' + e.count).join(', ')} · Grenzen ${cm.breaks.join(' / ')}`);
  console.log(`   Quellenzeile: ${autoSourceText(doc).slice(0, 200)}`);
  if (ds.time && ds.time.periods.length > 1) for (const p of ds.time.periods) { const rp = ds.time.byPeriod[p]; console.log(`   ${p}: ${rp.rows.length} Kreise`); }
  const stL = { ...st, geoSet: 'vg-lan-2026' }, dsL = buildDataset(raw, stL, buildTable(raw, stL), 'L');
  ok(dsL.report.exact === 16, `Länder: ${dsL.report.exact}`);
}
// Summe der Kreise = Land, in jeder Periode (erste Zahlenspalte, nur summierbare Werte)
{
  const f = fs.readdirSync(DIR).find(x => x.startsWith('14111'))!;
  const b = fs.readFileSync(`${DIR}/${f}`); const raw = await readFile(f, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  const st = { ...defaultSettings(raw), geoSet: 'vg-krs-2025' }, t = buildTable(raw, st), ds = buildDataset(raw, st, t, 'K');
  const stL = { ...st, geoSet: 'vg-lan-2025' }; await ensureGeo(['vg-lan-2025']); const dl = buildDataset(raw, stL, buildTable(raw, stL), 'L');
  const g = GEO['vg-krs-2025'];
  for (const p of ds.time!.periods) {
    const r = ds.time!.byPeriod[p], rl = dl.time!.byPeriod[p]; const sum: Record<string, number> = {};
    r.rowArea.forEach((a, i) => { const bl = g.areas[g.byId.get(a!)!].bl; sum[bl] = (sum[bl] || 0) + ((r.rows[i][2] as number) || 0); });
    const dev = rl.rowArea.map((a, i) => [a, (sum[a!] || 0) / (rl.rows[i][2] as number) - 1] as const).filter(([, d]) => Math.abs(d) > 0.001);
    ok(!dev.length, `${p}: Wahlberechtigte je Land = Summe der Kreise${dev.length ? ' – Abweichung ' + dev.map(([a, d]) => `${a} ${(d * 100).toFixed(2)} %`).join(', ') : ''}`);
  }
}
