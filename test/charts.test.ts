// M7 · Diagramme: Parteiergebnis aus echter Regionaldatenbank-Wahltabelle, Deutschland-Datensatz, eigene Tabelle, Vorschläge
import fs from 'node:fs';
const assets: Record<string, string> = {};
for (const f of fs.readdirSync('public/data')) assets['data/' + f] = fs.readFileSync('public/data/' + f, 'utf8');
(globalThis as unknown as { window: unknown }).window = { __KW_ASSETS__: assets };
const { loadGeo, ensureGeo } = await import('../src/geo/geo');
const { readFile } = await import('../src/data/parse');
const { buildDataset, buildTable, defaultSettings, genesisDeDataset } = await import('../src/data/pipeline');
const { defaultDoc } = await import('../src/model/defaults');
const { chartModel, defaultChart } = await import('../src/render/chart');
const { defaultSource, chartTexts } = await import('../src/render/chartSource');
const { suggestFor } = await import('../src/model/suggest');
const { tableDataset } = await import('../src/ui/TableEditor');
const ok = (c: boolean, m: string) => { console.log((c ? 'ok: ' : 'FEHLER: ') + m); if (!c) process.exitCode = 1; };
const DIR = process.env.RDB || 'data-src/rdb';
await loadGeo(); await ensureGeo(['vg-krs-2025', 'vg-lan-2025']);
const load = async (prefix: string) => { const f = fs.readdirSync(DIR).find(x => x.startsWith(prefix))!; const b = fs.readFileSync(`${DIR}/${f}`); return readFile(f, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer); };
type Doc = ReturnType<typeof defaultDoc>;
const fmt = (bars: { label: string; value: number; cmp: number | null }[]) => bars.map(b => `${b.label} ${b.value.toFixed(1)}${b.cmp != null ? ' (' + b.cmp.toFixed(1) + ')' : ''}`).join(' · ');

// ---------- Wahl (14111): Kreise, Länder, Deutschland ----------
{
  const raw = await load('14111');
  const st = { ...defaultSettings(raw), geoSet: 'vg-krs-2025' };
  const ds = buildDataset(raw, st, buildTable(raw, st), 'Bundestagswahl');
  const stL = { ...st, geoSet: 'vg-lan-2025' }, dl = buildDataset(raw, stL, buildTable(raw, stL), 'Bundestagswahl · Länder');
  const de = genesisDeDataset(raw, st, ds, 'Bundestagswahl · Deutschland');
  ok(!!de && de.geoSet === '' && de.rows.length === 1, `Deutschland-Datensatz: ${de?.rows.length} Zeile, ${de?.time?.periods.length} Perioden (${de?.time?.periods.join(', ')})`);
  ok(JSON.stringify(de!.time!.periods) === JSON.stringify(ds.time!.periods), 'Deutschland hat dieselben Perioden wie die Kreise');
  const doc: Doc = { ...defaultDoc('vg-krs-2025'), datasets: [ds, dl, de!] } as Doc;
  const src = defaultSource(doc, ds, 'saeulen');
  ok(src?.kind === 'partei' && !!src.cmp, `Standardquelle Kreise: ${JSON.stringify(src)}`);
  const m = (d: Doc) => chartModel(d);
  const spec = { ...defaultChart('saeulen'), source: src };
  const mk = m({ ...doc, chart: spec } as Doc);
  console.log(`   Kreise:      ${fmt(mk.bars)} · ${mk.curLabel} gegen ${mk.cmpLabel}`);
  const sum = mk.bars.reduce((a, b) => a + b.value, 0);
  ok(Math.abs(sum - 100) < 0.05, `Anteile ergeben 100 % (${sum.toFixed(2)})`);
  ok(mk.bars[mk.bars.length - 1].label === 'Sonstige' && mk.bars.slice(0, -1).every((b, i, a) => i === 0 || a[i - 1].value >= b.value), 'nach Größe sortiert, Sonstige am Ende');
  ok(mk.bars.every(b => b.cmp != null), 'jede Säule hat einen Vergleichswert');
  ok(Math.abs(mk.bars.reduce((a, b) => a + (b.cmp || 0), 0) - 100) < 0.05, 'Vergleichswerte ergeben 100 %');
  // Deutschland-Datensatz und Länder liefern dasselbe Ergebnis
  for (const other of [de!, dl]) {
    const s2 = defaultSource(doc, other, 'saeulen')!;
    const mo = m({ ...doc, chart: { ...spec, source: s2 } } as Doc);
    const dev = Math.max(...mk.bars.map(b => Math.abs(b.value - (mo.bars.find(x => x.key === b.key)?.value ?? NaN))));
    console.log(`   ${other.name.padEnd(12).slice(-12)}: ${fmt(mo.bars)}`);
    ok(dev < 0.05, `${other.name}: gleiche Anteile wie die Summe der Kreise (größte Abweichung ${dev.toFixed(3)} Pkt.)`);
  }
  // Gewinne und Verluste
  const mg = m({ ...doc, chart: { ...defaultChart('gewinne'), source: src } } as Doc);
  console.log(`   Gewinne:     ${mg.bars.map(b => `${b.label} ${b.value > 0 ? '+' : ''}${b.value.toFixed(1)}`).join(' · ')}`);
  ok(Math.abs(mg.bars.reduce((a, b) => a + b.value, 0)) < 0.05, 'Gewinne und Verluste gleichen sich aus (Summe 0)');
  // Ausschnitt ein Land
  const mb = m({ ...doc, chart: { ...spec, source: { ...src!, scope: { kind: 'land', bl: '14' } } } } as Doc);
  console.log(`   Sachsen:     ${fmt(mb.bars)}`);
  ok(mb.bars[0].label === 'AfD' || mb.bars.length > 3, 'Ausschnitt Sachsen gerechnet');
  console.log(`   Texte: ${JSON.stringify(chartTexts({ ...doc, chart: spec } as Doc, spec))}`);
  const sg = suggestFor(doc, ds.id);
  console.log(`   Vorschläge Kreise: ${sg.map(s => s.label + ' → „' + s.title + '“').join(' | ')}`);
  ok(sg[0]?.id === 'map-sieger' && sg.some(s => s.type === 'saeulen') && sg.some(s => s.type === 'gewinne') && sg.some(s => s.id === 'map-veraenderung'), 'Vorschläge: Sieger-Karte, Säulen, Gewinne, Veränderungskarte');
  const sd = suggestFor(doc, de!.id);
  console.log(`   Vorschläge Deutschland: ${sd.map(s => s.label).join(' | ')}`);
  ok(sd.length >= 2 && sd.every(s => s.kind === 'chart'), 'Deutschland: nur Diagramme');
}
// ---------- Zahlen (13211): Balken Top 10, Wert- und Veränderungskarte ----------
{
  const raw = await load('13211');
  const st = { ...defaultSettings(raw), geoSet: 'vg-krs-2025' };
  const ds = buildDataset(raw, st, buildTable(raw, st), 'Arbeitslose');
  const doc: Doc = { ...defaultDoc('vg-krs-2025'), datasets: [ds] } as Doc;
  const src = defaultSource(doc, ds, 'balken');
  const mb = chartModel({ ...doc, chart: { ...defaultChart('balken'), source: src } } as Doc);
  console.log(`   Top 10: ${fmt(mb.bars)} · Einheit „${mb.unit}“`);
  ok(src?.kind === 'gebiete' && mb.bars.length === 10 && mb.bars.every((b, i, a) => i === 0 || a[i - 1].value >= b.value), 'Balken: 10 Kreise, absteigend');
  const sg = suggestFor(doc, ds.id);
  console.log(`   Vorschläge: ${sg.map(s => s.label + ' → „' + s.title + '“ / ' + s.subtitle).join(' | ')}`);
  ok(sg[0]?.id === 'map-wert' && sg.some(s => s.type === 'balken') && sg.some(s => s.id === 'map-veraenderung') === (ds.time!.periods.length > 1), `Vorschläge: Wertkarte, Balken${ds.time!.periods.length > 1 ? ', Veränderung' : ' (nur ein Jahr: keine Veränderung)'}`);
}
// ---------- eigene Tabelle ----------
{
  const t = tableDataset('Umfrage', ['Partei', 'Sept.', 'Aug.'], [['CDU/CSU', '26', '27'], ['AfD', '25,5', '24'], ['SPD', '14', '15'], ['Grüne', '11', '11,5'], ['Linke', '10', '9'], ['BSW', '3', '3'], ['Sonstige', '10,5', '10,5'], ['', '', '']]);
  ok(t.rows.length === 7 && t.rows[1][1] === 25.5 && t.columns[1].kind === 'number', `Tabelle: ${t.rows.length} Zeilen, deutsche Zahlen („25,5“ → ${t.rows[1][1]})`);
  const doc: Doc = { ...defaultDoc('vg-krs-2025'), datasets: [t] } as Doc;
  const src = defaultSource(doc, t, 'saeulen');
  const m1 = chartModel({ ...doc, chart: { ...defaultChart('saeulen'), source: src } } as Doc);
  console.log(`   Säulen: ${fmt(m1.bars)} · Einheit „${m1.unit}“`);
  ok(m1.bars[0].label === 'CDU/CSU' && m1.bars[m1.bars.length - 1].label === 'Sonstige' && m1.bars.filter(b => b.party && !b.other).length === 6, 'Parteien erkannt, sortiert, Sonstige am Ende');
  const m2 = chartModel({ ...doc, chart: { ...defaultChart('gewinne'), source: src } } as Doc);
  ok(m2.bars.find(b => b.label === 'AfD')!.value === 1.5, `Gewinne: AfD ${m2.bars.find(b => b.label === 'AfD')!.value}`);
  const sg = suggestFor(doc, t.id);
  console.log(`   Vorschläge: ${sg.map(s => s.label).join(' | ')}`);
  ok(sg.length >= 2 && sg[0].type === 'saeulen', 'Vorschläge: Säulen zuerst');
  const plain = tableDataset('Institute', ['Institut', 'Wert'], [['Forsa', '12'], ['INSA', '14'], ['Allensbach', '9']]);
  const sp = suggestFor({ ...doc, datasets: [plain] } as Doc, plain.id);
  ok(sp[0]?.type === 'balken', `ohne Parteien: ${sp.map(s => s.label).join(' | ')}`);
}
