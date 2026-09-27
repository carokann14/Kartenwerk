// Regionaldatenbank (GENESIS): Flat-File-CSV und Daten-CSV mit Zeitreihe, frühere Kreise, Länder-Datensatz.
// Die Testdateien sind nach dem Aufbau echter Downloads (Tabelle 12411-01-01-4, 26.09.2026) nachgebaut.
import fs from 'node:fs';
const assets: Record<string, string> = {};
for (const f of fs.readdirSync('public/data')) assets['data/' + f] = fs.readFileSync('public/data/' + f, 'utf8');
(globalThis as unknown as { window: unknown }).window = { __KW_ASSETS__: assets };
const { GEO, loadGeo, ensureGeo } = await import('../src/geo/geo');
const { readFile } = await import('../src/data/parse');
const { buildDataset, buildTable, defaultSettings, shortTitle } = await import('../src/data/pipeline');
const { datasetFor } = await import('../src/data/aggregate');
const { colorModel, legendTitleAuto } = await import('../src/render/colorModel');
const { autoSourceText } = await import('../src/render/elements');
const { defaultDoc } = await import('../src/model/defaults');
const { atPeriod, defaultComparePeriod, periodText } = await import('../src/data/time');
const { KREIS_ALT } = await import('../src/data/kreisreformen');
const ok = (c: boolean, m: string) => { console.log((c ? 'ok: ' : 'FEHLER: ') + m); if (!c) process.exitCode = 1; };
const enc = (s: string) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff; return b.buffer; };   // ISO-8859-1 wie die Downloads

await loadGeo(); await ensureGeo(['vg-krs-2026', 'vg-lan-2026']);
const krs = GEO['vg-krs-2026'], lan = GEO['vg-lan-2026'];
const years = Array.from({ length: 20 }, (_, k) => 2006 + k);   // 31.12.2006 … 31.12.2025

// Einwohner je heutigem Kreis (fest) und frühere Kreise, die ihn in älteren Jahren bilden
const base = new Map(krs.areas.map((a, i) => [a.id, 100000 + i * 137]));
const reform = (id: string) => KREIS_ALT[id];
/** Kreise mit Werten in einem Jahr, wie die Regionaldatenbank sie liefert: vor einer Reform die früheren Kreise,
 *  der Nachfolger (neuer Schlüssel) fehlt dann; führt er den alten Schlüssel fort (Wartburgkreis), hat er den Rest. */
function kreiseIn(year: number): [string, string, number][] {
  const stich = `${year}-12-31`;
  const olds = Object.entries(KREIS_ALT).filter(([, e]) => stich < e.bis);
  const out = new Map<string, [string, number]>();
  const oldVal = new Map<string, number>();
  for (const a of krs.areas) {
    const preds = olds.filter(([, e]) => e.to.some(x => x[0] === a.id));
    if (!preds.length) { out.set(a.id, [a.name, base.get(a.id)!]); continue; }
    const cont = preds.some(([, e]) => e.add);
    const part = Math.round(base.get(a.id)! / (preds.length + (cont ? 1 : 0)));
    if (cont) out.set(a.id, [a.name, base.get(a.id)! - part * preds.length]);
    for (const [o] of preds) oldVal.set(o, (oldVal.get(o) || 0) + part);
  }
  for (const [o, v] of oldVal) out.set(o, [KREIS_ALT[o].name, v]);
  return [...out.entries()].map(([k, [n, v]]) => [k, n, v]);
}
const rows: string[] = ['statistics_code;statistics_label;time_code;time_label;time;1_variable_code;1_variable_label;1_variable_attribute_code;1_variable_attribute_label;2_variable_code;2_variable_label;2_variable_attribute_code;2_variable_attribute_label;value;value_unit;value_variable_code;value_variable_label'];
const dcsvData: Record<string, Record<number, [number, number, number]>> = {};
const names: Record<string, string> = {};
for (const y of years) {
  const K = kreiseIn(y);
  const byLand: Record<string, number> = {};
  let de = 0;
  for (const [k, n, v] of K) {
    const w = Math.round(v * 0.51), m = v - w;
    for (const [code, lbl, val] of [['', 'Insgesamt', v], ['GESM', 'männlich', m], ['GESW', 'weiblich', w]] as const)
      rows.push(`12411;Fortschreibung des Bevölkerungsstandes;STAG;Stichtag;${y}-12-31;KREISE;Kreise und kreisfreie Städte;${k};${n};GES;Geschlecht;${code};${lbl};${val};Anzahl;BEVSTD;Bevölkerungsstand`);
    (dcsvData[k] ||= {})[y] = [v, m, w]; names[k] = n;
    byLand[k.slice(0, 2)] = (byLand[k.slice(0, 2)] || 0) + v; de += v;
  }
  for (const [l, v] of Object.entries(byLand)) {
    rows.push(`12411;Fortschreibung des Bevölkerungsstandes;STAG;Stichtag;${y}-12-31;DLAND;Bundesländer;${l};${lan.areas[lan.byId.get(l)!].name};GES;Geschlecht;;Insgesamt;${v};Anzahl;BEVSTD;Bevölkerungsstand`);
    (dcsvData[l] ||= {})[y] = [v, v - Math.round(v * 0.51), Math.round(v * 0.51)]; names[l] = lan.areas[lan.byId.get(l)!].name;
  }
  rows.push(`12411;Fortschreibung des Bevölkerungsstandes;STAG;Stichtag;${y}-12-31;DINSG;Deutschland;DG;Deutschland;GES;Geschlecht;;Insgesamt;${de};Anzahl;BEVSTD;Bevölkerungsstand`);
}
// ---------- Flat-File-CSV ----------
const rawF = await readFile('12411-01-01-4_flat.csv', enc(rows.join('\n') + '\n'));
const stF = defaultSettings(rawF);
ok(stF.preset === 'genesis', `Flat-File-CSV erkannt (${stF.preset})`);
ok(/Tabelle 12411-01-01-4/.test(stF.sourceTitle) && /dl-de\/by-2-0/.test(stF.sourceTitle), `Quelle „${stF.sourceTitle}“, Urheber „${stF.attribution}“`);
stF.geoSet = 'vg-krs-2026';
const tF = buildTable(rawF, stF);
tF.notes.forEach(n => console.log('   ' + n));
ok(tF.columns.map(c => c.label).join('|') === 'Schlüssel|Name|Insgesamt|männlich|weiblich', `Spalten ${tF.columns.map(c => c.label).join(', ')}`);
const dsF = buildDataset(rawF, stF, tF, shortTitle(stF.sourceTitle));
ok(dsF.report.exact === krs.areas.length && dsF.report.unknown === 0, `neueste Periode: ${dsF.report.exact} Kreise über Schlüssel, ${dsF.report.unknown} unbekannt`);
ok(!!dsF.time && dsF.time.periods.length === 20 && dsF.time.label === 'Stichtag', `Zeitreihe: ${dsF.time?.periods.length} Stichtage (${dsF.time?.label})`);
const T = dsF.time!;
const val = (p: string, id: string, col = 2) => { const r = T.byPeriod[p]; const i = r.rowArea.indexOf(id); return i < 0 ? null : r.rows[i][col]; };
// Eisenach (bis 2021) + Wartburgkreis = heutiger Wartburgkreis; Göttingen + Osterode (bis 2016)
ok(Math.abs((val('2019-12-31', '16063') as number) - base.get('16063')!) <= 2, `2019: Wartburgkreis = alter Wartburgkreis + Eisenach (${val('2019-12-31', '16063')} = ${base.get('16063')})`);
ok(T.merged?.['2019-12-31']?.includes('16063') && !T.estimated?.['2019-12-31']?.length, '2019: Wartburgkreis als zusammengelegt markiert, nichts geschätzt');
ok(Math.abs((val('2014-12-31', '03159') as number) - base.get('03159')!) <= 2, `2014: Göttingen = Göttingen + Osterode (${val('2014-12-31', '03159')})`);
// MV 2010: Demmin anteilig → geschätzt
const e2010 = T.estimated?.['2010-12-31'] || [];
ok(e2010.includes('13071') && e2010.includes('13075'), `2010: Seenplatte und Vorpommern-Greifswald geschätzt (${e2010.join(', ')})`);
ok(val('2012-12-31', '13071') === base.get('13071') && !T.estimated?.['2012-12-31'], '2012: MV unverändert, nichts geschätzt');
// Sachsen 2007 (vor der Reform 2008): alle heutigen Kreise wieder vollständig
const sn2007 = krs.areas.filter(a => a.id.startsWith('14')).map(a => a.id);
ok(sn2007.every(id => val('2007-12-31', id) != null), `2007: alle ${sn2007.length} sächsischen Kreise aus früheren Kreisen gebildet`);
ok(T.periods.every(p => T.byPeriod[p].rows.length === krs.areas.length), `jede Periode hat alle Kreise (${T.periods.map(p => T.byPeriod[p].rows.length).join(',')})`);
// ---------- Daten-CSV (Zeit in den Spalten) ----------
const hdr1 = ['', '', ...years.flatMap(() => ['Stichtag', 'Stichtag', 'Stichtag'])];
const hdr2 = ['', '', ...years.flatMap(y => [`31.12.${y}`, `31.12.${y}`, `31.12.${y}`])];
const hdr3 = ['', '', ...years.flatMap(() => ['Insgesamt', 'männlich', 'weiblich'])];
const keys = Object.keys(dcsvData).sort((a, b) => a.length - b.length || a.localeCompare(b));
const lines = ['Tabelle: 12411-01-01-4', 'Bevölkerung nach Geschlecht - Stichtag 31.12. - regionale;;', 'Tiefe: Kreise und krfr. Städte;;', 'Fortschreibung des Bevölkerungsstandes;;', 'Bevölkerungsstand (Anzahl);;', hdr1.join(';'), hdr2.join(';'), hdr3.join(';'),
  ...keys.map(k => [k, (k.length === 2 ? '  ' : '      ') + names[k], ...years.flatMap(y => dcsvData[k][y] ? dcsvData[k][y].map(String) : ['-', '-', '-'].map(() => '.'))].join(';')),
  '__________', '"© Statistische Ämter des Bundes und der Länder, Deutschland, 2026.', 'Dieses Werk ist lizenziert unter der Datenlizenz Deutschland', '- Namensnennung - Version 2.0."', 'Stand: 26.09.2026 / 20:26:11'];
const rawD = await readFile('12411-01-01-4.csv', enc(lines.join('\n') + '\n'));
const stD = defaultSettings(rawD);
ok(stD.preset === 'genesis' && stD.sourceTitle === 'Regionaldatenbank Deutschland, Tabelle 12411-01-01-4 „Bevölkerung nach Geschlecht“ (Stand 26.09.2026), dl-de/by-2-0' && stD.attribution === 'Statistische Ämter des Bundes und der Länder', `Daten-CSV: „${stD.sourceTitle}“ · „${stD.attribution}“`);
ok(shortTitle(stD.sourceTitle) === 'Bevölkerung nach Geschlecht', `Datensatzname „${shortTitle(stD.sourceTitle)}“`);
stD.geoSet = 'vg-krs-2026';
const tD = buildTable(rawD, stD), dsD = buildDataset(rawD, stD, tD, 'Bevölkerung');
ok(dsD.report.exact === krs.areas.length && dsD.time?.periods.length === 20, `Daten-CSV: ${dsD.report.exact} Kreise, ${dsD.time?.periods.length} Stichtage`);
const same = T.periods.every(p => { const a = T.byPeriod[p], b = dsD.time!.byPeriod[p]; return a.rowArea.every((id, i) => JSON.stringify(a.rows[i].slice(2)) === JSON.stringify(b.rows[b.rowArea.indexOf(id)].slice(2))); });
ok(same, 'Daten-CSV und Flat-File-CSV ergeben dieselben Werte in allen Perioden');
// ---------- Länder ----------
const stL = { ...stF, geoSet: 'vg-lan-2026' }, dsL = buildDataset(rawF, stL, buildTable(rawF, stL), 'Länder');
ok(dsL.report.exact === 16 && dsL.time?.periods.length === 20 && !dsL.time.merged, `Länder: ${dsL.report.exact} Länder, ${dsL.time?.periods.length} Stichtage, nichts zusammengelegt`);
// ---------- Karte: Periode wählen, Veränderung ----------
const doc = { ...defaultDoc('vg-krs-2026'), datasets: [dsF], color: { mode: 'wert', dataset: dsF.id, column: 'c2', method: 'rund', classes: 5, hue: '#2F5D8A' } } as ReturnType<typeof defaultDoc>;
const cm1 = colorModel(doc);
ok(cm1.valueOf(krs.byId.get('16063')!) === base.get('16063'), 'Karte zeigt ohne Auswahl den neuesten Stichtag');
const doc2 = { ...doc, periodSel: { [dsF.id]: '2010-12-31' } };
const d2 = datasetFor(doc2, dsF.id)!;
ok(d2.period === '2010-12-31' && d2 === atPeriod(dsF, '2010-12-31'), 'datasetFor liefert die gewählte Periode (zwischengespeichert)');
ok(/geschätzt/.test(autoSourceText(doc2)), `Quellenzeile 2010: „${autoSourceText(doc2).slice(0, 220)}…“`);
ok(!/geschätzt/.test(autoSourceText(doc)), 'Quellenzeile 2025 ohne Schätzhinweis');
const b = defaultComparePeriod(dsF)!;
ok(b === '2015-12-31', `Vergleich Standard: ${periodText(b)}`);
const doc3 = { ...doc, color: { mode: 'veraenderung', dataset: dsF.id, kind: 'wert', party: 'AfD', a: { dataset: dsF.id, group: '', column: 'c2', period: '2025-12-31' }, b: { dataset: dsF.id, group: '', column: 'c2', period: b }, rel: true, palette: 'blaurot', classes: 6, step: null } } as unknown as ReturnType<typeof defaultDoc>;
const cm3 = colorModel(doc3);
ok(cm3.valueOf(krs.byId.get('16063')!) === 0 && cm3.diverging?.against === '31.12.2015', `Veränderung 2015–2025: Wartburgkreis ${cm3.valueOf(krs.byId.get('16063')!)} %, gegenüber „${cm3.diverging?.against}“`);
ok(legendTitleAuto(doc3, cm3) === 'Insgesamt · Veränderung 2015–2025', `Legendentitel „${legendTitleAuto(doc3, cm3)}“`);
// ---------- Anteil (nicht addierbar) bei zusammengelegten Kreisen leer ----------
const rows2 = rows.map((l, i) => i === 0 ? l : l);
const rate = rows2.filter(l => /;Insgesamt;/.test(l)).map(l => l.replace(/;Insgesamt;(\d+);Anzahl;BEVSTD;Bevölkerungsstand$/, (_m, v) => `;Insgesamt;${(+v % 97 / 10).toFixed(1).replace('.', ',')};Prozent;ANTW;Anteil weiblich`));
const rawR = await readFile('12411-99_flat.csv', enc([rows[0], ...rows.slice(1), ...rate].join('\n')));
const stR = { ...defaultSettings(rawR), geoSet: 'vg-krs-2026' }, tR = buildTable(rawR, stR);
ok(tR.columns.some(c => c.label === 'Anteil weiblich (Prozent) · Insgesamt') || tR.columns.some(c => /Anteil weiblich/.test(c.label)), `mehrere Merkmale: ${tR.columns.slice(2).map(c => c.label).join(' | ')}`);
const dsR = buildDataset(rawR, stR, tR, 'mit Anteil'), ci = tR.columns.findIndex(c => /Anteil weiblich/.test(c.label));
const rv = (p: string, id: string) => { const r = dsR.time!.byPeriod[p]; return r.rows[r.rowArea.indexOf(id)][ci]; };
ok(rv('2019-12-31', '16063') == null && rv('2019-12-31', '16061') != null, `Anteil 2019: zusammengelegter Wartburgkreis leer (${rv('2019-12-31', '16063')}), Kreis 16061 behält Wert (${rv('2019-12-31', '16061')})`);
for (const p of T.periods) { const a = T.byPeriod[p], b2 = dsD.time!.byPeriod[p]; const bad = a.rowArea.filter((id, i) => JSON.stringify(a.rows[i].slice(2)) !== JSON.stringify(b2.rows[b2.rowArea.indexOf(id)]?.slice(2))); if (bad.length) { console.log('   Abweichung', p, bad.slice(0, 3), a.rows[a.rowArea.indexOf(bad[0])], b2.rows[b2.rowArea.indexOf(bad[0])]); break; } }
fs.writeFileSync('data-src/.tmp/12411-01-01-4_flat.csv', Buffer.from(enc(rows.join('\n') + '\n')));
fs.writeFileSync('data-src/.tmp/12411-01-01-4.csv', Buffer.from(enc(lines.join('\n') + '\n')));
