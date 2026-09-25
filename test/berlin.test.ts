// Berlin 2026: Wahlgebiete und Ergebnisse (vorläufig) – Zuordnung, Briefwahl, Summen gegen die amtlichen Wahlkreis- und Bezirksergebnisse
import fs from 'node:fs';
const assets: Record<string, string> = {};
for (const f of fs.readdirSync('public/data')) assets['data/' + f] = fs.readFileSync('public/data/' + f, 'utf8');
(globalThis as unknown as { window: unknown }).window = { __KW_ASSETS__: assets };
const { GEO, loadGeo, ensureGeo } = await import('../src/geo/geo');
const { readFile } = await import('../src/data/parse');
const { buildDataset, buildTable, defaultSettings } = await import('../src/data/pipeline');
const { datasetFor } = await import('../src/data/aggregate');
const { groupMetrics } = await import('../src/data/derive');
const { defaultDoc } = await import('../src/model/defaults');
const ok = (c: boolean, m: string) => { console.log((c ? 'ok: ' : 'FEHLER: ') + m); if (!c) process.exitCode = 1; };
await loadGeo(); await ensureGeo(['be-wbz-2026']);
const [wbz, bwb, wk, bez] = ['be-wbz-2026', 'be-bwb-2026', 'be-wk-2026', 'be-bez-2026'].map(id => GEO[id]);
ok(wbz.areas.length === 2542 && bwb.areas.length === 1572 && wk.areas.length === 78 && bez.areas.length === 12, `Ebenen: ${wbz.areas.length} Wahlbezirke, ${bwb.areas.length} Briefwahlbezirke, ${wk.areas.length} Wahlkreise, ${bez.areas.length} Bezirke`);
ok(wbz.byKr['01']?.length > 100 && wbz.krName['01'] === 'Mitte' && wk.byKr['12']?.length > 3, `Baum nach Bezirken: Mitte ${wbz.byKr['01'].length} Wahlbezirke, Reinickendorf ${wk.byKr['12'].length} Wahlkreise`);
ok(wk.areas.find(a => a.id === '0101')?.name === 'Mitte 1' && wbz.areas.every(a => a.bl === '11'), 'Namen der Wahlkreise, alle in Berlin');
const buf = (p: string) => { const b = fs.readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
// amtliche Summen aus der Gebietsdatei
const A = fs.readFileSync('data-src/berlin/Datenexport_AGH2026_Zweitstimme_A_BE.csv', 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map(l => l.split(';'));
const AH = A[0], ai = (n: string) => AH.indexOf(n);
const official = (art: string) => new Map(A.slice(1).filter(r => r[ai('Gebietsart')] === art).map(r => [r[ai('Nummer')], { gue: +r[ai('Gueltig')], p04: +r[ai('P04')], p01: +r[ai('P01')] }]));
const offWk = official('Abgeordnetenhauswahlkreis'), offBez = official('Bezirk'), offBtw = official('Bundestagswahlkreis');
const land = official('Bundesland').get('00')!;
for (const mode of ['anteilig', 'gemeinsam'] as const) {
  const raw = await readFile('Datenexport_AGH2026_Zweitstimme_W_BE.csv', buf('data-src/berlin/Datenexport_AGH2026_Zweitstimme_W_BE.csv'));
  const st = defaultSettings(raw); ok(st.preset === 'be-wbz', `Vorlage erkannt: ${st.preset}`);
  st.wbz = { briefwahl: mode }; st.geoSet = mode === 'anteilig' ? 'be-wbz-2026' : 'be-bwb-2026';
  const t = buildTable(raw, st), ds = buildDataset(raw, st, t, 'Test');
  const g = GEO[st.geoSet], grp = ds.groups.find(x => /Zweit/.test(x.label))!;
  ok(ds.report.exact === g.areas.length && ds.report.unknown === 0 && ds.report.missing.length === 0, `${mode}: ${ds.report.exact} von ${g.areas.length} Gebieten zugeordnet, ${ds.report.missing.length} ohne Daten`);
  ok(!!grp && grp.columns.length >= 15 && !!grp.total, `${mode}: Gruppe „${grp?.label}“ mit ${grp?.columns.length} Parteien, Bezug Gültige`);
  const gi = ds.columns.findIndex(c => /^Gültige/.test(c.label)), sum = ds.rows.reduce((s, r) => s + (r[gi] as number), 0);
  ok(Math.abs(sum - land.gue) < 5, `${mode}: gültige Stimmen gesamt ${Math.round(sum)} (amtlich ${land.gue})`);
  const doc = { ...defaultDoc(st.geoSet), datasets: [ds] } as never;
  for (const [to, off, name] of [['be-wk-2026', offWk, 'Wahlkreise'], ['be-bez-2026', offBez, 'Bezirke'], ['btw-wk-2025', offBtw, 'Bundestagswahlkreise']] as const) {
    const d = datasetFor(doc, ds.id, to)!; const G = GEO[to];
    const li = d.columns.findIndex(c => c.label.startsWith('Die Linke')), gg = d.columns.findIndex(c => /^Gültige/.test(c.label));
    let maxDev = 0, n = 0;
    d.rows.forEach((r, k) => { const id = d.rowArea[k]!; const o = off.get(to === 'btw-wk-2025' ? id : id); if (!o) return; n++; maxDev = Math.max(maxDev, Math.abs((r[gg] as number) - o.gue), Math.abs((r[li] as number) - o.p04)); });
    ok(d.geoSet === to && n === (to === 'btw-wk-2025' ? 12 : G.areas.length), `${mode} → ${name}: ${d.rows.length} Zeilen summiert, ${n} amtlich verglichen`);
    ok(mode === 'gemeinsam' ? maxDev === 0 : maxDev <= 2, `${mode} → ${name}: größte Abweichung ${maxDev.toFixed(1)} Stimmen (${mode === 'gemeinsam' ? 'muss 0 sein' : 'Rundung der Schätzung'})`);
  }
  if (mode === 'anteilig') {
    const d = datasetFor(doc, ds.id, 'be-wk-2026')!; const gw = d.groups.find(x => /Zweit/.test(x.label))!;
    const win: Record<string, number> = {}; groupMetrics(d, gw).forEach(m => { const c = d.columns.find(x => x.id === gw.columns[m.win]); const k = c?.label.split(' · ')[0] || '?'; win[k] = (win[k] || 0) + 1; });
    console.log('   Stärkste Partei (Zweitstimmen) je Wahlkreis:', JSON.stringify(win));
  }
}
// Gebietsdatei: Wahlkreise und Bezirke direkt
const rawA = await readFile('Datenexport_AGH2026_Zweitstimme_A_BE.csv', buf('data-src/berlin/Datenexport_AGH2026_Zweitstimme_A_BE.csv'));
const sa = defaultSettings(rawA); ok(sa.preset === 'be-gebiete' && sa.geoSet === 'be-wk-2026', `Gebietsdatei erkannt: ${sa.preset} → ${sa.geoSet}`);
const dsa = buildDataset(rawA, sa, buildTable(rawA, sa), 'A');
ok(dsa.report.exact === 78, `Gebietsdatei: ${dsa.report.exact} Wahlkreise zugeordnet · Titel „${sa.sourceTitle}“`);
sa.be = { ebene: 'Bezirk' }; sa.geoSet = 'be-bez-2026'; const dsb = buildDataset(rawA, sa, buildTable(rawA, sa), 'B');
ok(dsb.report.exact === 12, `Gebietsdatei: ${dsb.report.exact} Bezirke zugeordnet`);
const rawE = await readFile('Datenexport_AGH2026_Erststimme_W_BE.csv', buf('data-src/berlin/Datenexport_AGH2026_Erststimme_W_BE.csv'));
const se = defaultSettings(rawE); const te = buildTable(rawE, se);
ok(te.groups.some(g => g.label === 'Erststimmen') && te.columns.some(c => c.label.startsWith('Einzelbewerbung Mihm')), `Erststimmen: Gruppe erkannt, Einzelbewerbungen benannt · Titel „${se.sourceTitle}“`);
