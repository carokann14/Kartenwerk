// M8 · Kennzahlen-Katalog: jeden Eintrag für Kreise und Länder übernehmen, Summen und Zeitachsen prüfen.
//   npx esbuild test/katalog.test.ts --bundle --platform=node --format=esm --outfile=/tmp/katalog.test.mjs && node /tmp/katalog.test.mjs
import fs from 'node:fs';
const assets: Record<string, string> = {};
for (const f of fs.readdirSync('public/data')) assets['data/' + f] = fs.readFileSync('public/data/' + f, 'utf8');
for (const f of fs.readdirSync('public/katalog')) assets['katalog/' + f] = f.endsWith('.json') ? fs.readFileSync('public/katalog/' + f, 'utf8') : fs.readFileSync('public/katalog/' + f).toString('base64');
(globalThis as unknown as { window: unknown }).window = { __KW_ASSETS__: assets };
const { loadGeo, GEO } = await import('../src/geo/geo');
const { loadKatalog, importKatalog, katalogSpan } = await import('../src/data/katalog');
const { defaultDoc } = await import('../src/model/defaults');
const { suggestFor } = await import('../src/model/suggest');
const { chartModel, defaultChart } = await import('../src/render/chart');
const { defaultSource } = await import('../src/render/chartSource');
const { deriveAltersgruppen, AGE_GROUPS, deriveAnteile, deriveJe, popLookup } = await import('../scripts/katalog-derive');
const { isRate } = await import('../src/data/aggregate');
const ok = (c: boolean, m: string) => { console.log((c ? 'ok: ' : 'FEHLER: ') + m); if (!c) process.exitCode = 1; };
type Doc = ReturnType<typeof defaultDoc>;
await loadGeo();

const K = await loadKatalog();
ok(K.entries.length >= 4, `Katalog: ${K.entries.length} Einträge (${K.entries.map(e => e.id).join(', ')})`);
const col = (ds: { columns: { id: string; label: string }[] }, re: RegExp) => ds.columns.findIndex(c => re.test(c.label));
const sum = (ds: { rows: unknown[][] }, ci: number) => ds.rows.reduce((a: number, r) => a + (typeof r[ci] === 'number' ? r[ci] as number : 0), 0);
for (const e of K.entries) {
  for (const level of ['krs', 'lan'] as const) {
    const list = await importKatalog(e, level);
    const [main] = list, de = list.find(d => !d.geoSet), lan = list.find(d => GEO[d.geoSet]?.meta.level === 'lan');
    const lvl = GEO[main.geoSet]?.meta.level;
    console.log(`   ${e.id} · ${level}: ${list.map(d => `${d.name} [${d.geoSet || 'ohne Gebiet'}, ${d.rows.length} Zeilen, ${d.time?.periods.length ?? 1} Perioden]`).join(' | ')}`);
    ok(lvl === level, `${e.id} · ${level}: Hauptdatensatz auf ${lvl} (${katalogSpan(e)})`);
    ok(list.length === (level === 'krs' ? 3 : 2), `${e.id} · ${level}: ${list.length} Datensätze (Haupt${level === 'krs' ? ', Länder' : ''}, Deutschland)`);
    ok(main.rows.length === (level === 'krs' ? 400 : 16) || (level === 'krs' && main.rows.length >= 399), `${e.id} · ${level}: ${main.rows.length} Gebiete mit Werten, ${main.report.unknown} unbekannt`);
    ok((main.time?.periods.length ?? 1) === e.periods.length, `${e.id} · ${level}: alle ${e.periods.length} Perioden übernommen`);
    ok(!!de && de.rows.length === 1, `${e.id} · ${level}: Deutschland-Datensatz`);
    ok(/abgerufen am/.test(main.settings.sourceTitle), `${e.id}: Quellenzeile „${main.settings.sourceTitle}“`);
    // Summen: Kreise bzw. Länder ergeben Deutschland (neueste Periode, Anzahl-Spalte)
    const ci = col(main, e.id === 'bevoelkerung' ? /^Insgesamt$/ : e.id === 'arbeitslosigkeit' ? /^Arbeitslose$/ : e.id === 'altersgruppen' ? /^Bevölkerung$/ : e.id === 'einkommen' ? /^Verfügbares Einkommen der privaten Haushalte/ : /^Wahlberechtigte$/);
    if (ci >= 0 && de) {
      const s = sum(main, ci), d = de.rows[0][ci] as number;
      ok(Math.abs(s - d) / d < 0.002, `${e.id} · ${level}: Summe „${main.columns[ci].label}“ ${s.toLocaleString('de-DE')} = Deutschland ${d.toLocaleString('de-DE')}`);
    }
    if (level === 'krs') ok(!!lan && lan.rows.length === 16, `${e.id}: Länder-Datensatz mit 16 Ländern`);
    // Vorschläge: bei mehreren Perioden eine Linie
    const doc = { ...defaultDoc(main.geoSet), datasets: list } as Doc;
    const sug = suggestFor(doc, main.id);
    ok(sug.length > 0 && (e.periods.length < 2 || sug.some(s => s.icon === 'linie')), `${e.id} · ${level}: Vorschläge ${sug.map(s => s.label).join(' | ')}`);
  }
}
// Linie aus dem Deutschland-Datensatz der Bundestagswahlen: Zweitstimmen seit 1994
{
  const e = K.entries.find(x => x.id === 'bundestagswahlen')!;
  const list = await importKatalog(e, 'lan'), de = list.find(d => !d.geoSet)!;
  const doc = { ...defaultDoc(''), datasets: list } as Doc;
  const src = defaultSource(doc, de, 'linie')!;
  const m = chartModel({ ...doc, chart: { ...defaultChart('linie'), source: src } } as Doc);
  const cdu = m.lines?.find(l => /CDU/.test(l.label)), spd = m.lines?.find(l => l.label === 'SPD');
  console.log('   ' + (m.lines || []).map(l => `${l.label}: ${l.points.map(p => p.value?.toFixed(1)).join(' ')}`).join('\n   '));
  ok(m.periods?.length === 9 && !!cdu && !!spd, `Linie Bundestagswahlen Deutschland: ${m.periods?.length} Wahltage, ${m.lines?.length} Linien`);
  ok(!!cdu && Math.abs((cdu.points[cdu.points.length - 1].value ?? 0) - 28.5) < 0.2, `CDU/CSU 2025: ${cdu?.points[cdu.points.length - 1].value?.toFixed(1)} % (amtlich 28,5 %)`);
  ok(!!spd && Math.abs((spd.points[0].value ?? 0) - 36.4) < 0.2, `SPD 1994: ${spd?.points[0].value?.toFixed(1)} % (amtlich 36,4 %)`);
}
// Altersgruppen: berechnete Anteile stimmen, sind gekennzeichnet und werden nicht addiert (Rate)
{
  const e = K.entries.find(x => x.id === 'altersgruppen')!;
  ok(!!e.note && /berechnet/i.test(e.hint), 'Altersgruppen: Hinweis „berechnet“ im Katalog');
  const [main, lan, de] = await importKatalog(e, 'krs');
  const cs = ['unter 18', '18 bis unter 65', '65 Jahre'].map(t => col(main, new RegExp(`^Anteil an der Bevölkerung, berechnet \\(%\\) · ${t}`)));
  const cn = ['unter 18', '18 bis unter 65', '65 Jahre'].map(t => col(main, new RegExp(`^Bevölkerung · ${t}`)));
  const ct = col(main, /^Bevölkerung$/);
  ok(cs.every(i => i >= 0) && cn.every(i => i >= 0) && ct >= 0, `Altersgruppen: Spalten ${main.columns.map(c => c.label).join(' | ')}`);
  ok(main.rows.every(r => Math.abs(cs.reduce((a, i) => a + (r[i] as number), 0) - 100) < 0.2), 'Anteile ergeben je Kreis 100 %');
  ok(main.rows.every(r => cn.reduce((a, i) => a + (r[i] as number), 0) === r[ct]), 'Altersgruppen ergeben je Kreis die Bevölkerung');
  ok(cs.every(i => /%/.test(main.columns[i].label) && /berechnet/.test(main.columns[i].label)), 'Anteilsspalten als „berechnet“ und in % benannt');
  const shareDE = de.rows[0][col(de, /^Anteil an der Bevölkerung, berechnet \(%\) · 65 Jahre/)] as number;
  ok(shareDE > 20 && shareDE < 26, `Deutschland: 65 und älter ${shareDE} % (plausibel 20–26 %)`);
  const kr = { ...defaultDoc(main.geoSet), datasets: [main, lan, de] } as Doc;
  const src = { kind: 'gebiete' as const, dataset: main.id, column: main.columns[cs[2]].id, period: main.time!.periods[0], select: 'top' as const, n: 5, scope: { kind: 'alle' as const } };
  const m = chartModel({ ...kr, chart: { ...defaultChart('balken'), source: src } } as Doc);
  ok(!m.empty && m.bars.length === 5 && m.bars.every(b => b.value != null && b.value! > 20), `Balken: 5 Kreise mit dem höchsten Anteil ab 65 (${m.bars.map(b => b.label + ' ' + b.value?.toFixed(1)).join(', ')})`);
}
// Ableitung im Kleinen: Sperrvermerke („.“) lassen das Gebiet aus, feste Reihenfolge
{
  const cols = { value: 0, unit: 1, vcode: 2, vlabel: 3, time: 4, region: { code: 5, attr: 6, label: 7 }, age: { code: 8, attr: 9, label: 10 }, sex: null, levels: ['DINSG', 'DLAND', 'KREISE'] };
  const mk = (area: string, attr: string, v: string) => [v, 'Anzahl', 'BEVSTD', 'Bevölkerung', '2025-12-31', area === 'DG' ? 'DINSG' : 'DLAND', area, '', 'ALTX20', attr, ''];
  const ages = AGE_GROUPS.flatMap(g => g.members);
  const full = (area: string, n: number) => [mk(area, '', String(n * ages.length)), ...ages.map(a => mk(area, a, String(n)))];
  const rowsIn = [...full('02', 10), ...full('01', 20), ...full('03', 30).map((r, i) => (i === 3 ? [...r.slice(0, 0), '.', ...r.slice(1)] : r))];
  const out = deriveAltersgruppen(rowsIn, cols);
  ok(out.length === 2 * 7, `Ableitung: 2 Gebiete × 7 Zeilen, das Gebiet mit Sperrvermerk fehlt (${out.length})`);
  ok(out[0][6] === '01' && out[7][6] === '02', 'Ableitung: feste Reihenfolge nach Gebiet');
  const u18 = out.find(r => r[6] === '01' && r[9] === 'ALTU18' && r[2] === 'BEVANT')!;
  ok(u18[0] === '29,4', `Ableitung: 5 von 17 gleich großen Gruppen = ${u18[0]} %`);
}
// Neue Einträge (BIP, Bürgergeld, Pkw): Spalten, Stadtstaaten als Kreis, berechnete Spalten gekennzeichnet und nicht addierbar
{
  const get = async (id: string) => { const e = K.entries.find(x => x.id === id)!; const [main, lan, de] = await importKatalog(e, 'krs'); console.log(`   ${id}: ${main.columns.map(c => c.label).join(' | ')}`); return { e, main, lan, de }; };
  const hasArea = (ds: { rowArea?: string[]; rows: unknown[][] }, id: string) => (ds as unknown as { rowArea: string[] }).rowArea?.includes(id);
  // BIP
  {
    const { main, de } = await get('bip');
    ok(main.columns.length === 5, `BIP: ${main.columns.length - 2} Werte`);
    const vals = main.columns.slice(2), rate = vals.filter(c => isRate(c as never)), sums = vals.filter(c => !isRate(c as never));
    ok(rate.length === 2 && sums.length === 1 && /Tsd\. EUR/.test(sums[0].label), `BIP: „je erwerbstätige Person“ und „pro Kopf“ gelten als Quote, nur das BIP insgesamt wird addiert (${sums.map(c => c.label).join('')})`);
    ok(hasArea(main as never, '02000') && hasArea(main as never, '11000'), 'BIP: Hamburg (02000) und Berlin (11000) als Kreis vorhanden');
    const ci = col(main, /^Bruttoinlandsprodukt \(Tsd/), v = de.rows[0][ci] as number;
    ok(v > 4_000_000_000 && v < 5_000_000_000, `BIP Deutschland ${v.toLocaleString('de-DE')} Tsd. EUR`);
  }
  // Pkw: Anteile und Pkw je 1.000 Einwohner
  {
    const { e, main, de } = await get('pkw');
    ok(!!e.note && /berechnet/.test(e.hint), 'Pkw: Hinweis „berechnet“ im Katalog');
    const ct = col(main, /^Personenkraftwagen nach Kraftstoffarten · Insgesamt/), ce = col(main, /Elektro/), calc = main.columns.map((c, i) => [c, i] as const).filter(([c]) => /berechnet/.test(c.label));
    const cs = col(main, /^Anteil am Pkw-Bestand, berechnet \(%\) · Elektro/), cj = col(main, /^Pkw je 1\.000 Einwohner, berechnet/);
    ok(ct >= 0 && ce >= 0 && cs >= 0 && cj >= 0, 'Pkw: Spalten Insgesamt, Elektro, Anteil Elektro, Pkw je 1.000 Einwohner');
    ok(calc.every(([c]) => isRate(c as never)), `Pkw: alle ${calc.length} berechneten Spalten gelten als Quote (nicht addierbar)`);
    ok(main.rows.every(r => typeof r[cs] !== 'number' || ((r[cs] as number) >= 0 && (r[cs] as number) <= 100)), 'Pkw: Anteile liegen zwischen 0 und 100 %');
    const dt = de.rows[0][ct] as number, dsE = de.rows[0][cs] as number, dj = de.rows[0][cj] as number;
    ok(Math.abs(dsE - (de.rows[0][ce] as number) / dt * 100) < 0.06, `Pkw Deutschland: Elektro-Anteil ${dsE} % = Elektro / Insgesamt`);
    ok(dj > 520 && dj < 680, `Pkw Deutschland: ${dj} Pkw je 1.000 Einwohner (plausibel 520–680)`);
    ok(Math.abs(sum(main, ct) - dt) / dt < 0.002, `Pkw: Summe der Kreise ${sum(main, ct).toLocaleString('de-DE')} = Deutschland ${dt.toLocaleString('de-DE')}`);
  }
  // Bürgergeld
  {
    const { e, main, de } = await get('buergergeld');
    ok(!!e.note && /berechnet/.test(e.hint), 'Bürgergeld: Hinweis „berechnet“ im Katalog');
    const calc = main.columns.map((c, i) => [c, i] as const).filter(([c]) => /^Anteil an der Bevölkerung, berechnet/.test(c.label));
    ok(calc.length === 7 && calc.every(([c]) => isRate(c as never)), `Bürgergeld: ${calc.length} berechnete Anteilsspalten, nicht addierbar`);
    ok(main.columns.some(c => /Hilfe z\. Lebensunt/.test(c.label) && !/erwerbsf/.test(c.label)), 'Bürgergeld: verschachtelte Spaltenköpfe richtig (Hilfe zum Lebensunterhalt ohne „erwerbsf.“)');
    const ia = calc[0][1], v = de.rows[0][ia] as number;
    ok(v > 7 && v < 10, `Bürgergeld Deutschland: Mindestsicherung insgesamt ${v} % der Bevölkerung (plausibel 7–10 %)`);
  }
}
// Zusatzspalten im Kleinen: Anteil an Insgesamt, je Einwohner mit dem letzten Stand am oder vor dem Stichtag
{
  const ctx = { value: 0, unit: 1, vcode: 2, vlabel: 3, time: 4, region: { code: 5, attr: 6, label: 7 }, cls: { code: 8, attr: 9, label: 10 }, levels: ['DINSG', 'DLAND', 'KREISE'] };
  const mk = (area: string, attr: string, v: string, time = '2026-01-01') => [v, 'Anzahl', 'W1', 'Pkw', time, 'KREISE', area, '', 'K', attr, attr || 'Insgesamt'];
  const rows = [mk('01001', '', '200'), mk('01001', 'E', '50'), mk('01001', 'B', '.'), mk('01002', '', '.'), mk('01002', 'E', '5')];
  const a = deriveAnteile(rows, ctx, { label: 'Anteil', code: 'A' });
  ok(a.length === 1 && a[0][0] === '25,0' && a[0][1] === '%' && a[0][2] === 'A', `Anteile: nur Gebiete mit Insgesamt und Zahl (${a.map(r => r[0]).join(', ')})`);
  const pr = [['KREISE', '01001', '2025-12-31', '1000'], ['KREISE', '01001', '2024-12-31', '900'], ['KREISE', '01002', '2025-12-31', '10']];
  const pc = { value: 3, time: 2, region: { code: 0, attr: 1, label: -1 }, others: [] as { code: number; attr: number; label: number }[], levels: ['DINSG', 'DLAND', 'KREISE'] };
  const pop = popLookup(pr, pc);
  ok(pop('01001', '2026-01-01') === 1000 && pop('01001', '2025-06-30') === 900 && pop('01001', '2025') === 1000 && pop('01001', '2023-12-31') === undefined && pop('99999', '2025') === undefined, 'Bevölkerung: letzter Stand am oder vor dem Stichtag');
  const j = deriveJe(rows, ctx, pop, { kind: 'je-einwohner', per: 1000, only: 'total', unit: '', code: 'J', label: 'je 1.000' });
  ok(j.length === 1 && j[0][0] === '200,0' && j[0][3] === 'je 1.000', `Je Einwohner: nur „Insgesamt“, ${j.map(r => r[0]).join(', ')}`);
}
console.log(process.exitCode ? '\nFEHLGESCHLAGEN' : '\nAlle Katalog-Tests bestanden.');
