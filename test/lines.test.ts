// M8 · Linie: synthetische Daten (keine Fixtures nötig) – Parteien über die Zeit, Zahlenspalten über die Zeit,
// Sonstige-Bündelung, Raten-Mittelung vs. Summierung, Vorschläge.
import { defaultDoc } from '../src/model/defaults';
import { barNameLines, chartModel, chartPrims, defaultChart, linieAxis } from '../src/render/chart';
import { defaultSource, chartTexts } from '../src/render/chartSource';
import { suggestFor } from '../src/model/suggest';
import { GEO } from '../src/geo/geo';
import type { Dataset, Column, Group } from '../src/data/types';
import type { Doc } from '../src/model/types';

const ok = (c: boolean, m: string) => { console.log((c ? 'ok: ' : 'FEHLER: ') + m); if (!c) process.exitCode = 1; };

const col = (id: string, label: string, kind: 'number' | 'text' = 'number', role: Column['role'] = 'value', party: string | null = null): Column =>
  ({ id, label, kind, role, party, short: null });

// ---------- Datensatz mit Zeitachse: zwei Gebiete, drei Perioden, Parteispalten + eine Ratenspalte ----------
function buildDataset(): Dataset {
  const columns: Column[] = [
    col('name', 'Name', 'text', 'name'),
    col('gueltig', 'Gültige Stimmen', 'number', 'value'),
    col('cdu', 'CDU', 'number', 'value', 'CDU'),
    col('spd', 'SPD', 'number', 'value', 'SPD'),
    col('gruen', 'Grüne', 'number', 'value', 'Grüne'),
    col('sonst', 'Sonstige Parteien', 'number', 'value'),
    col('quote', 'Arbeitslosenquote', 'number', 'value'),
  ];
  const groups: Group[] = [{ id: 'partei', label: 'Parteien', columns: ['cdu', 'spd', 'gruen', 'sonst'], total: 'gueltig', parties: true }];
  const areas = ['A', 'B'];
  const mkRows = (cdu: number[], spd: number[], gruen: number[], sonst: number[], quote: number[]) =>
    areas.map((a, i) => [a, cdu[i] + spd[i] + gruen[i] + sonst[i], cdu[i], spd[i], gruen[i], sonst[i], quote[i]] as (string | number)[]);
  // Periode 1 (2015): CDU stark, Periode 3 (2025): SPD stark, Grüne wachsen, Sonstige klein (< 3 % Schwelle in Summe)
  const p2015 = mkRows([500, 300], [200, 150], [50, 30], [10, 5], [5.0, 7.0]);
  const p2020 = mkRows([350, 250], [300, 250], [100, 80], [15, 8], [6.0, 8.0]);
  const p2025 = mkRows([250, 200], [400, 350], [150, 130], [12, 6], [5.5, 7.5]);
  const rowKeyOf = () => areas.slice();
  const rowAreaOf = () => areas.slice();
  const ds: Dataset = {
    id: 'ds1', name: 'Wahlen Testkreis', fileName: 'test.csv', importedAt: '2026-01-01',
    geoSet: 'test-geo', preset: 'genesis',
    settings: {} as Dataset['settings'],
    columns, groups,
    rows: p2025, rowKey: rowKeyOf(), rowArea: rowAreaOf(),
    report: {} as Dataset['report'],
    time: {
      label: 'Jahr',
      periods: ['2015', '2020', '2025'],
      byPeriod: {
        '2015': { rows: p2015, rowKey: rowKeyOf(), rowArea: rowAreaOf() },
        '2020': { rows: p2020, rowKey: rowKeyOf(), rowArea: rowAreaOf() },
        '2025': { rows: p2025, rowKey: rowKeyOf(), rowArea: rowAreaOf() },
      },
    },
  };
  return ds;
}

const doc0 = defaultDoc('test-geo');
const ds = buildDataset();
const doc: Doc = { ...doc0, datasets: [ds] } as Doc;

// ---------- mode: 'partei' ----------
{
  const src = defaultSource(doc, ds, 'linie');
  ok(!!src && src.kind === 'linie' && src.mode === 'partei', `Standardquelle für Linie mit Parteien: ${JSON.stringify(src)}`);
  const spec = { ...defaultChart('linie'), source: src! };
  const m = chartModel({ ...doc, chart: spec } as Doc);
  ok(!m.empty, `kein Fehler: ${m.empty}`);
  ok(!!m.lines && m.lines.length >= 2, `mehrere Linien erzeugt (${m.lines?.length})`);
  ok(m.periods?.length === 3, `drei Zeitpunkte (${m.periods?.join(', ')})`);
  const cdu = m.lines!.find(l => l.label === 'CDU');
  ok(!!cdu, 'CDU-Linie vorhanden');
  if (cdu) {
    ok(cdu.points.length === 3, 'CDU-Linie hat drei Punkte');
    const [p1, , p3] = cdu.points;
    ok(p1.value != null && p3.value != null && p1.value! > p3.value!, `CDU sinkt über die Zeit (${p1.value?.toFixed(1)} → ${p3.value?.toFixed(1)})`);
  }
  // je Periode sollten die Anteile aller (nicht-Sonstige + Sonstige) ~100% ergeben
  for (let i = 0; i < 3; i++) {
    const sum = m.lines!.reduce((s, l) => s + (l.points[i].value ?? 0), 0);
    ok(Math.abs(sum - 100) < 0.5, `Periode ${m.periods![i]}: Anteile ergeben ~100 % (${sum.toFixed(2)})`);
  }
  // bars sollten für die UI-Farbtabelle gespiegelt sein (chartModel-Wrapper)
  ok(m.bars.length === m.lines!.length, 'bars spiegeln lines (Farbtabelle/Vorschau wiederverwendbar)');
  const txt = chartTexts(doc, spec);
  console.log(`   Titel: ${txt?.title} · ${txt?.subtitle}`);
  ok(!!txt?.title && !!txt?.subtitle, 'Titel/Unterzeile für Linie (Parteien) erzeugt');
}

// ---------- mode: 'werte', eine Ratenspalte: nie ungewichtet mitteln, sondern amtlicher Wert der gröberen Ebene ----------
{
  const src = { kind: 'linie' as const, dataset: ds.id, mode: 'werte' as const, columns: ['quote'], scope: { kind: 'alle' as const } };
  const spec = { ...defaultChart('linie'), source: src };
  // ohne Deutschland-Datensatz: keine erfundene Linie, sondern Hinweis
  const m0 = chartModel({ ...doc, chart: spec } as Doc);
  ok(!!m0.empty && /Quoten/.test(m0.empty), `ohne amtlichen Wert kein Mittelwert der Gebiete: ${m0.empty}`);
  // mit Deutschland-Datensatz derselben Datei: dessen Werte
  const de: Dataset = { ...ds, id: 'ds-de', name: 'Wahlen Testkreis · Deutschland', geoSet: '', rows: [['DG', 0, 0, 0, 0, 0, 6.3]], rowKey: ['id:DG'], rowArea: [null],
    time: { label: 'Jahr', periods: ['2015', '2020', '2025'], byPeriod: {
      '2015': { rows: [['DG', 0, 0, 0, 0, 0, 6.1]], rowKey: ['id:DG'], rowArea: [null] },
      '2020': { rows: [['DG', 0, 0, 0, 0, 0, 7.2]], rowKey: ['id:DG'], rowArea: [null] },
      '2025': { rows: [['DG', 0, 0, 0, 0, 0, 6.3]], rowKey: ['id:DG'], rowArea: [null] } } } };
  const doc2 = { ...doc, datasets: [ds, de] } as Doc;
  const m = chartModel({ ...doc2, chart: spec } as Doc);
  ok(!m.empty && m.lines?.length === 1, `mit Deutschland-Datensatz eine Linie: ${m.empty}`);
  const l = m.lines![0];
  ok(l.points.map(p => p.value).join('/') === '6.1/7.2/6.3', `Quote aus dem Deutschland-Datensatz (amtlich), nicht gemittelt: ${l.points.map(p => p.value).join('/')}`);
  ok(m.unit === ' %', 'Arbeitslosenquote wird als % erkannt (isRate)');
  // Deutschland-Datensatz selbst: eine Zeile, direkt
  const m2 = chartModel({ ...doc2, chart: { ...spec, source: { ...src, dataset: 'ds-de' } } } as Doc);
  ok(m2.lines?.[0].points.map(p => p.value).join('/') === '6.1/7.2/6.3', 'Deutschland-Datensatz direkt');
}

// ---------- mode: 'werte', eine Nicht-Ratenspalte (Summierung über die Zeilen) ----------
{
  const src = { kind: 'linie' as const, dataset: ds.id, mode: 'werte' as const, columns: ['gueltig'], scope: { kind: 'alle' as const } };
  const spec = { ...defaultChart('linie'), source: src };
  const m = chartModel({ ...doc, chart: spec } as Doc);
  ok(!m.empty, `kein Fehler bei Summenspalte: ${m.empty}`);
  const l = m.lines![0];
  // 2015: 500+300+200+150+50+30+10+5 = 1245
  const sum2015 = 500 + 300 + 200 + 150 + 50 + 30 + 10 + 5;
  ok(Math.abs((l.points[0].value ?? 0) - sum2015) < 0.01, `2015 summiert (keine Rate): ${l.points[0].value} = ${sum2015}?`);
}

// ---------- mehrere Zahlenspalten gleichzeitig: eigene Farbe je Linie ----------
{
  const src = { kind: 'linie' as const, dataset: ds.id, mode: 'werte' as const, columns: ['cdu', 'spd'], scope: { kind: 'alle' as const } };
  const spec = { ...defaultChart('linie'), source: src };
  const m = chartModel({ ...doc, chart: spec } as Doc);
  ok(m.lines?.length === 2, 'zwei Linien für zwei Zahlenspalten');
  ok(m.lines![0].color !== m.lines![1].color, 'unterschiedliche Farben ohne Parteizuordnung (LINE_HUES)');
}

// ---------- Fehlerfall: Datensatz ohne Zeitachse ----------
{
  const dsNoTime: Dataset = { ...ds, time: undefined };
  const docNoTime: Doc = { ...doc, datasets: [dsNoTime] } as Doc;
  const src = defaultSource(docNoTime, dsNoTime, 'linie');
  ok(src === null, 'ohne Zeitachse keine Standardquelle für Linie');
  const spec = { ...defaultChart('linie'), source: { kind: 'linie' as const, dataset: dsNoTime.id, mode: 'partei' as const, group: 'partei', scope: { kind: 'alle' as const } } };
  const m = chartModel({ ...docNoTime, chart: spec } as Doc);
  ok(!!m.empty, `Fehlermeldung ohne Zeitachse: ${m.empty}`);
}

// ---------- Vorschläge (suggest.ts): Linie sollte für Zeitreihen-Datensätze mit Gebieten vorgeschlagen werden ----------
// suggestFor unterscheidet „eigene Tabelle/Deutschland-Wert“ (kein GEO-Eintrag) von „Wahlergebnis mit Gebieten“
// (GEO-Eintrag vorhanden) – nur Letzteres nimmt den Zweig, der Linien-Vorschläge macht. Ein minimaler GEO-Stub
// genügt, da alle Zugriffe darauf optional verketten (GEO[ds.geoSet]?.…).
{
  (GEO as Record<string, unknown>)['test-geo'] = { meta: { level: 'test', levelLabel: 'Testgebiete' }, byId: new Map(), areas: [] };
  const sugs = suggestFor(doc, ds.id);
  const linie = sugs.find(s => s.icon === 'linie');
  ok(!!linie, `Linien-Vorschlag vorhanden: ${sugs.map(s => s.label).join(' | ')}`);
  delete (GEO as Record<string, unknown>)['test-geo'];
}

// ---------- Achse: bei 0 beginnen (Standard), Wertebereich, eigene Grenzen ----------
{
  const vals = [5.0, 6.0, 7.5, 8.0];
  const a0 = linieAxis(vals, {});
  ok(a0.niceMin === 0 && a0.niceMax >= 8, `Standard: Achse beginnt bei 0 (${a0.niceMin}–${a0.niceMax})`);
  const a1 = linieAxis(vals, { axisZero: false });
  ok(a1.niceMin === 5 && a1.niceMax === 8 && a1.step === 0.5, `ohne 0: Achse folgt den Werten (${a1.niceMin}–${a1.niceMax}, Schritt ${a1.step})`);
  const a2 = linieAxis(vals, { axisMin: 4, axisMax: 10 });
  ok(a2.niceMin === 4 && a2.niceMax === 10, `eigene Grenzen 4–10 (${a2.niceMin}–${a2.niceMax})`);
  const a3 = linieAxis(vals, { axisZero: false, axisMax: 12 });
  ok(a3.niceMin === 5 && a3.niceMax === 12, `nur obere Grenze eigen, untere automatisch (${a3.niceMin}–${a3.niceMax})`);
  const a4 = linieAxis(vals, { axisMin: 9, axisMax: 3 });
  ok(a4.niceMin === 0 && a4.niceMax >= 8, 'min ≥ max wird ignoriert (Automatik)');
  const a5 = linieAxis([6, 6, 6], { axisZero: false });
  ok(a5.niceMin < 6 && a5.niceMax > 6, `gleiche Werte: Achse bekommt Spielraum (${a5.niceMin}–${a5.niceMax})`);
  const a6 = linieAxis([], {});
  ok(isFinite(a6.niceMin) && isFinite(a6.niceMax) && a6.niceMax > a6.niceMin, 'keine Werte: gültige Achse');
  // gezeichnet: y-Beschriftungen der Achse
  const src = { kind: 'linie' as const, dataset: ds.id, mode: 'werte' as const, columns: ['gueltig'], scope: { kind: 'alle' as const } };
  const v = { L: { main: { x: 100, y: 200, w: 880, h: 800 } }, ts: 1 } as never;
  const yTicks = (patch: object) => chartPrims({ ...doc, chart: { ...defaultChart('linie'), source: src, ...patch } } as Doc, v).texts.filter(t => t.anchor === 'end' && /^[\d.,]+$/.test(t.text)).map(t => t.text);
  const t0 = yTicks({}), t1 = yTicks({ axisZero: false }), t2 = yTicks({ axisMin: 1000, axisMax: 1600 });
  ok(t0.includes('0'), `Standard zeigt 0 an der Achse: ${t0.join(' ')}`);
  ok(!t1.includes('0') && t1.length >= 3, `ohne 0-Bedingung fehlt die 0: ${t1.join(' ')}`);
  ok(t2.length >= 3 && t2[0].replace(/\D/g, '') === '1000' && t2[t2.length - 1].replace(/\D/g, '') === '1600', `eigene Grenzen 1000–1600 gezeichnet: ${t2.join(' ')}`);
}

// ---------- Zeitachse: viele Zeitpunkte → Beschriftung dünnt sich aus, letzter Zeitpunkt bleibt ----------
{
  const years = Array.from({ length: 30 }, (_, i) => String(2000 + i));
  const byPeriod = Object.fromEntries(years.map(y => [y, ds.time!.byPeriod['2025']]));
  const ds30: Dataset = { ...ds, id: 'ds30', time: { label: 'Jahr', periods: years, byPeriod } };
  const d30 = { ...doc, datasets: [ds30] } as Doc;
  const src = { kind: 'linie' as const, dataset: 'ds30', mode: 'werte' as const, columns: ['gueltig'], scope: { kind: 'alle' as const } };
  const v = { L: { main: { x: 100, y: 200, w: 880, h: 800 } }, ts: 1 } as never;
  const xl = (d: Doc) => chartPrims(d, v).texts.filter(t => t.anchor === 'middle' && /^\d{4}$/.test(t.text)).map(t => t.text);
  const l30 = xl({ ...d30, chart: { ...defaultChart('linie'), source: src } } as Doc), l3 = xl({ ...doc, chart: { ...defaultChart('linie'), source: { ...src, dataset: ds.id } } } as Doc);
  ok(l30.length >= 4 && l30.length < 30 && l30[l30.length - 1] === '2029', `30 Jahre: ${l30.length} Beschriftungen, letzte ${l30[l30.length - 1]} (${l30.join(' ')})`);
  ok(l3.join() === '2015,2020,2025', `3 Jahre: alle beschriftet (${l3.join(' ')})`);
}

// ---------- Balkenbeschriftung: lange Namen brechen um statt gekürzt zu werden ----------
{
  const long = barNameLines('Mecklenburg-Vorpommern', 200, 24, 60);
  ok(long.length === 2 && long[0] === 'Mecklenburg-' && long[1] === 'Vorpommern', `langer Name mit Bindestrich: ${long.join(' / ')}`);
  ok(barNameLines('Bad Tölz-Wolfratshausen', 200, 24, 60).join('|') === 'Bad Tölz-|Wolfratshausen', 'Umbruch nach dem letzten passenden Bindestrich');
  ok(barNameLines('Mecklenburg-Vorpommern', 200, 24, 30).length === 1 && barNameLines('Mecklenburg-Vorpommern', 200, 24, 30)[0].endsWith('…'), 'niedrige Zeile: wie bisher gekürzt');
  ok(barNameLines('Bremen', 200, 24, 60).join() === 'Bremen', 'kurzer Name unverändert');
}

console.log(process.exitCode ? '\nFEHLGESCHLAGEN' : '\nAlle Linie-Tests bestanden.');
