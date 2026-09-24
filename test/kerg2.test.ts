import fs from 'node:fs';
const assets: Record<string, string> = {};
for (const f of fs.readdirSync('public/data')) assets['data/' + f] = fs.readFileSync('public/data/' + f, 'utf8');
(globalThis as any).window = { __KW_ASSETS__: assets };
const { loadGeo, GEO } = await import('../src/geo/geo');
const { readFile } = await import('../src/data/parse');
const { defaultSettings, buildTable, suggestGeoSet, buildDataset, shortTitle } = await import('../src/data/pipeline');
const { groupMetrics } = await import('../src/data/derive');
await loadGeo();
const f = process.argv[2] || 'public/beispiele/btw2025_kerg2.csv';
const buf = fs.readFileSync(f);
const raw = await readFile('kerg2.csv', buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
const st = defaultSettings(raw);
const t = buildTable(raw, st);
const sug = suggestGeoSet(t); st.geoSet = sug.id;
const ds = buildDataset(raw, st, t, shortTitle(st.sourceTitle, 'x'));
console.log('preset', st.preset, '| title', st.sourceTitle, '| short', ds.name, '| attr', st.attribution, '| geo', sug);
console.log('cols', t.columns.length, t.columns.filter(c => c.role !== 'value').map(c => `${c.label}[${c.role}/${c.kind}]`).join(' | '));
console.log('groups', t.groups.map(g => `${g.label}: ${g.columns.length} cols, total=${t.columns.find(c => c.id === g.total)?.label}`));
const r = ds.report;
console.log('report', { total: r.total, exact: r.exact, byName: r.byName, amb: r.ambiguous, unk: r.unknown, dup: r.duplicate, summary: r.summary, missing: r.missing.length, nameMismatch: r.nameMismatch.length });
for (const g of ds.groups.filter(x => !/Vorp/.test(x.label))) {
  const gm = groupMetrics(ds, g); const wins: Record<string, number> = {};
  gm.forEach(m => { const c = ds.columns.find(c => c.id === g.columns[m.win]); const k = c?.short || c?.label || '?'; wins[k] = (wins[k] || 0) + 1; });
  console.log('Sieger', g.label, wins);
}
const cat = ds.columns.find(c => /Direktmandat/.test(c.label));
if (cat) { const i = ds.columns.indexOf(cat); const cnt: Record<string, number> = {}; ds.rows.forEach(rw => { const v = String(rw[i]); cnt[v] = (cnt[v] || 0) + 1; }); console.log(cat.label, cnt); }
for (const g of ds.groups.filter(x => /Vorp/.test(x.label))) {
  const gm = groupMetrics(ds, g); const wins: Record<string, number> = {};
  gm.forEach(m => { const c = ds.columns.find(c => c.id === g.columns[m.win]); const k = c?.short || c?.label || '?'; wins[k] = (wins[k] || 0) + 1; });
  console.log('Sieger', g.label, wins);
}
