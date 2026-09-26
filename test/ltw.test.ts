// Landtagswahlen: Mecklenburg-Vorpommern 2026 – Wahlkreisgrenzen (LAiV) und Ergebnisdatei des Landeswahlleiters (l_wahlkreise.csv)
import fs from 'node:fs';
const assets: Record<string, string> = {};
for (const f of fs.readdirSync('public/data')) assets['data/' + f] = fs.readFileSync('public/data/' + f, 'utf8');
(globalThis as unknown as { window: unknown }).window = { __KW_ASSETS__: assets };
const geoMod = await import('../src/geo/geo');
const { GEO, loadGeo, ensureGeo } = geoMod;
const { readFile } = await import('../src/data/parse');
const { buildDataset, buildTable, defaultSettings, shortTitle, suggestGeoSetAsync } = await import('../src/data/pipeline');
const { datasetFor } = await import('../src/data/aggregate');
const { groupMetrics } = await import('../src/data/derive');
const { defaultDoc } = await import('../src/model/defaults');
const { finerSet, sisterSets, translateFokus } = await import('../src/geo/relate');
const ok = (c: boolean, m: string) => { console.log((c ? 'ok: ' : 'FEHLER: ') + m); if (!c) process.exitCode = 1; };
const buf = (p: string) => { const b = fs.readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };

await loadGeo(); await ensureGeo(['ltw-mv-2026', 'vg-lan-2026', 'vg-gem-2026', 'btw-wk-2025']);
const mv = GEO['ltw-mv-2026'], lan = GEO['vg-lan-2026'];
ok(!!geoMod.GEO_INDEX.find(e => e.id === 'ltw-mv-2026' && e.region === 'Mecklenburg-Vorpommern' && e.lazy), 'Gebietsstand im Verzeichnis, Gruppe Mecklenburg-Vorpommern, nachgeladen');
ok(mv.areas.length === 36 && mv.areas.every(a => a.bl === '13') && mv.meta.showNr, `36 Wahlkreise, alle in MV, mit Nummer (${mv.areas[0].nr} · ${mv.areas[0].name})`);
// Fläche gegen das Land (VG250): Karte 1:250.000, andere Küstenlinie → einige Prozent Abweichung sind zu erwarten
const sumA = mv.areas.reduce((s, a) => s + a.area, 0), landA = lan.areas[lan.byId.get('13')!].area;
ok(Math.abs(sumA / landA - 1) < 0.08, `Fläche der Wahlkreise ${sumA.toFixed(0)} zu Land ${landA.toFixed(0)} (${((sumA / landA - 1) * 100).toFixed(1)} %)`);
// Beschriftungspunkte im Land
const { pointInArea } = await import('../src/geo/relate');
const li = lan.byId.get('13')!;
const outside = mv.areas.filter(a => !pointInArea(lan, li, a.label)).map(a => a.nr);
ok(outside.length === 0, `Beschriftungspunkte im Land (außerhalb: ${outside.join(', ') || 'keiner'})`);

// Ergebnisdatei
const raw = await readFile('l_wahlkreise.csv', buf('data-src/ltw/mv-2026/l_wahlkreise.csv'));
const st = defaultSettings(raw);
ok(st.preset === 'ltw-mv' && st.geoSet === 'ltw-mv-2026' && st.headerStart === 5, `Vorlage erkannt: ${st.preset} → ${st.geoSet}, Kopfzeile ${st.headerStart + 1}`);
ok(st.sourceTitle === 'Landtagswahl Mecklenburg-Vorpommern 2026, vorläufiges Ergebnis, Stand 21.09.2026' && st.attribution === 'Der Landeswahlleiter Mecklenburg-Vorpommern', `Titel „${st.sourceTitle}“, Urheber „${st.attribution}“`);
ok(shortTitle(st.sourceTitle) === 'Landtagswahl Mecklenburg-Vorpommern 2026, vorläufig', `Datensatzname „${shortTitle(st.sourceTitle)}“`);
const t = buildTable(raw, st);
t.notes.forEach(n => console.log('   ' + n));
ok(t.body.length === 36 && !t.summary.some(Boolean), `${t.body.length} Zeilen, keine Summenzeilen`);
ok(t.notes.some(n => n.startsWith('Summe der Wahlkreise stimmt')), 'Summe der Wahlkreise = Landesergebnis (alle Spalten)');
const g1 = t.groups.find(g => g.label === 'Erststimmen'), g2 = t.groups.find(g => g.label === 'Zweitstimmen');
ok(!!g1 && !!g2 && !!g1.total && !!g2.total, `Gruppen: Erststimmen (${g1?.columns.length} Wahlvorschläge), Zweitstimmen (${g2?.columns.length})`);
ok(g2!.columns.length === 19 && g1!.columns.length === 14, 'Zweitstimmen: 19 Parteien mit Stimmen; Erststimmen: 14 Wahlvorschläge (inkl. Einzelbewerber)');
const ds = buildDataset(raw, st, t, shortTitle(st.sourceTitle));
const rep = ds.report;
ok(rep.exact === 36 && rep.unknown === 0 && rep.duplicate === 0 && rep.missing.length === 0, `Zuordnung: ${rep.exact} exakt, ${rep.duplicate} doppelt, ${rep.missing.length} ohne Daten`);
ok(rep.nameMismatch.length === 0, `Namen passen (Abweichungen: ${rep.nameMismatch.map(x => x.dataName + ' ≠ ' + x.geoName).join('; ') || 'keine'})`);
const col = (lbl: string) => ds.columns.findIndex(c => c.label === lbl);
const wk1 = ds.rows[ds.rowArea.indexOf('1')];
ok(wk1[col('SPD · Zweitstimmen')] === 11589 && wk1[col('AfD · Erststimmen')] === 10165 && wk1[col('FREIE WÄHLER · Erststimmen')] == null && wk1[col('Wahlbeteiligung')] === 76.8, 'Greifswald: SPD 11.589 Zweitstimmen, AfD 10.165 Erststimmen, Freie Wähler (x) fehlend, Beteiligung 76,8');
// stärkste Partei je Wahlkreis
for (const g of [g2!, g1!]) {
  const grp = ds.groups.find(x => x.label === g.label)!;
  const win: Record<string, number> = {}; groupMetrics(ds, grp).forEach(m => { const c = ds.columns.find(x => x.id === grp.columns[m.win]); const k = c?.label.split(' · ')[0] || '?'; win[k] = (win[k] || 0) + 1; });
  console.log(`   Stärkste Partei (${g.label}) je Wahlkreis:`, JSON.stringify(win));
}
// Summe aufs Land (Länderebene)
const doc = { ...defaultDoc('ltw-mv-2026'), datasets: [ds] } as never;
const dl = datasetFor(doc, ds.id, 'vg-lan-2026')!;
const r13 = dl.rows[dl.rowArea.indexOf('13')];
ok(r13[dl.columns.findIndex(c => c.label === 'Gültige Stimmen · Zweitstimmen')] === 1015323 && r13[dl.columns.findIndex(c => c.label === 'AfD · Zweitstimmen')] === 388026, 'Summe aufs Land: 1.015.323 gültige Zweitstimmen, AfD 388.026 (wie Landeszeile)');

// Ohne Vorlage (allgemeine Tabelle, nur Zweitstimmen): Namen führen zu den Landtagswahlkreisen statt zu den Bundestagswahlkreisen 1–36
{
  const lines = fs.readFileSync('data-src/ltw/mv-2026/l_wahlkreise.csv', 'latin1').split(/\r?\n/).filter(l => /;A;\d+;/.test(l) && l.split(';')[9] === '2' && !/;A;99;/.test(l));
  const csv = 'Nr;Wahlkreis;SPD;AfD;CDU\n' + lines.map(l => { const c = l.split(';'); return [c[2], c[3], c[12], c[13], c[14]].join(';'); }).join('\n');
  const raw2 = await readFile('mv.csv', new TextEncoder().encode(csv).buffer as ArrayBuffer);
  const s2 = defaultSettings(raw2); const t2 = buildTable(raw2, s2);
  const sug = await suggestGeoSetAsync(t2, s2, 'mv.csv');
  ok(s2.preset === 'allgemein' && sug.id === 'ltw-mv-2026', `Allgemeine Tabelle: Vorschlag ${sug.id} (${sug.reason})`);
}
// Navigation: Drilldown in die Gemeinden, Schnellwahl bei Fokus MV, Fokus beim Wechsel
ok(finerSet(mv, 0) === 'vg-gem-2026', `Drilldown Wahlkreis → ${finerSet(mv, 0)}`);
const btw = GEO['btw-wk-2025'];
const dmv = { ...defaultDoc('btw-wk-2025'), fokus: { kind: 'land', bl: '13' } } as never;
ok(sisterSets(btw, dmv).some(x => x.id === 'ltw-mv-2026' && x.region === 'Mecklenburg-Vorpommern'), 'Schnellwahl „Landtagswahlkreise“ bei Fokus Mecklenburg-Vorpommern');
const dbe = { ...defaultDoc('btw-wk-2025'), fokus: { kind: 'land', bl: '11' } } as never;
ok(!sisterSets(btw, dbe).some(x => x.id === 'ltw-mv-2026'), 'nicht bei Fokus Berlin');
const f = translateFokus({ kind: 'area', id: '1' }, mv, lan);
ok(f.kind === 'area' && f.id === '13', `Fokus Wahlkreis Greifswald → Länder: ${JSON.stringify(f)}`);
// Nachbarländer als Umfeld regionaler Gebietsstände
{
  const { isRegional, laenderCtx, laenderSetFor, allLabel } = await import('../src/render/scene');
  const { autoSourceText } = await import('../src/render/elements');
  const { normalizeDoc } = await import('../src/model/defaults');
  ok(isRegional(mv) && !isRegional(btw) && !isRegional(lan), 'regional: Landtagswahlkreise MV ja, Bundestagswahlkreise und Länder nein');
  ok(laenderSetFor(mv) === 'vg-lan-2026' && allLabel(mv) === 'Mecklenburg-Vorpommern', `Länder für das Umfeld: ${laenderSetFor(mv)}; „alles“ heißt ${allLabel(mv)}`);
  const d0 = { ...defaultDoc('ltw-mv-2026'), datasets: [ds] } as never as import('../src/model/types').Doc;
  const lc = laenderCtx(d0)!;
  ok(lc.idx.length === 15 && !lc.idx.some(i => lc.g.areas[i].id === '13'), `${lc.idx.length} Nachbarländer, ohne Mecklenburg-Vorpommern`);
  ok(/Nachbarländer: Gebietsstand 01\.01\.2026, © BKG \(2026\)/.test(autoSourceText(d0)), 'Quellenzeile nennt das BKG für die Nachbarländer');
  ok(laenderCtx({ ...d0, layers: { ...d0.layers, laender: false } }) === null && !/Nachbarländer/.test(autoSourceText({ ...d0, layers: { ...d0.layers, laender: false } })), 'abgeschaltet: nicht gezeichnet, nicht in der Quellenzeile');
  ok(laenderCtx({ ...defaultDoc('btw-wk-2025') } as never) === null, 'Bundestagswahlkreise: keine Nachbarländer');
  const old = JSON.parse(JSON.stringify(d0)); delete old.layers.laender; delete old.style.laender;
  const n = normalizeDoc(old);
  ok(n.layers.laender === false && n.style.laender === '#E2DDD2' && defaultDoc().layers.laender === true, 'ältere Projekte: Nachbarländer aus (Aussehen bleibt), neue Projekte: an; Farben ergänzt');
}
// Weitere Länder: Vorlagen für die Ergebnisdateien (Niedersachsen, Nordrhein-Westfalen, Rheinland-Pfalz)
for (const [file, preset, geoId, n, ms] of [
  ['ni-2022/Landtagswahlen-NI.txt', 'ltw-ni', 'ltw-ni-2022', 87, 0],
  ['nw-2022/Landtagswahlen-NW.txt', 'ltw-nw', 'ltw-nw-2022', 128, 0],
  ['rp-2026/Endgueltiges_Ergebnis_LW_2026_Wahlkreise.xlsx', 'ltw-rp', 'ltw-rp-2026', 52, 0],
] as const) {
  await ensureGeo([geoId]);
  const r = await readFile(file.split('/')[1], buf('data-src/ltw/' + file));
  const st2 = defaultSettings(r);
  ok(st2.preset === preset && st2.geoSet === geoId, `${file}: Vorlage ${st2.preset} → ${st2.geoSet} · „${st2.sourceTitle}“ · ${st2.attribution}`);
  const t2 = buildTable(r, st2); t2.notes.forEach(x => console.log('   ' + x));
  const d2 = buildDataset(r, st2, t2, shortTitle(st2.sourceTitle));
  const g1 = d2.groups.find(g => g.label === 'Erststimmen'), g2 = d2.groups.find(g => g.label === 'Zweitstimmen');
  ok(d2.report.exact === n && d2.report.unknown === 0 && d2.report.duplicate === 0 && d2.report.missing.length === 0 && d2.report.nameMismatch.length === ms, `${preset}: ${d2.report.exact}/${n} zugeordnet, ${d2.report.nameMismatch.length} Namensabweichungen${d2.report.nameMismatch.length ? ' (' + d2.report.nameMismatch.slice(0, 3).map(x => x.dataName + ' ≠ ' + x.geoName).join('; ') + ')' : ''}`);
  ok(!!g1?.total && !!g2?.total && g1.columns.length >= 5 && g2.columns.length >= 5, `${preset}: Gruppen Erststimmen (${g1?.columns.length}) und Zweitstimmen (${g2?.columns.length}) mit Bezug`);
  ok(!t2.notes.some(x => /^Achtung/.test(x)), `${preset}: keine Abweichung zum Landesergebnis gemeldet`);
  const gz = d2.columns.findIndex(c => c.label === 'Gültige Stimmen · Zweitstimmen');
  console.log('   gültige Zweitstimmen gesamt:', d2.rows.reduce((a, row) => a + ((row[gz] as number) || 0), 0).toLocaleString('de-DE'));
  for (const g of [g2!, g1!]) { const win: Record<string, number> = {}; groupMetrics(d2, g).forEach(m => { const c = d2.columns.find(x => x.id === g.columns[m.win]); const k = c?.label.split(' · ')[0] || '?'; win[k] = (win[k] || 0) + 1; }); console.log(`   Stärkste (${g.label}):`, JSON.stringify(win)); }
}
