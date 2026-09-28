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
    const ci = col(main, e.id === 'bevoelkerung' ? /^Insgesamt$/ : e.id === 'arbeitslosigkeit' ? /^Arbeitslose$/ : /^Wahlberechtigte$/);
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
console.log(process.exitCode ? '\nFEHLGESCHLAGEN' : '\nAlle Katalog-Tests bestanden.');
