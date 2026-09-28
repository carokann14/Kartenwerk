// M8 · Linie: synthetische Daten (keine Fixtures nötig) – Parteien über die Zeit, Zahlenspalten über die Zeit,
// Sonstige-Bündelung, Raten-Mittelung vs. Summierung, Vorschläge.
import { defaultDoc } from '../src/model/defaults';
import { chartModel, defaultChart } from '../src/render/chart';
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

// ---------- mode: 'werte', eine Ratenspalte (Mittelung statt Summierung) ----------
{
  const src = { kind: 'linie' as const, dataset: ds.id, mode: 'werte' as const, columns: ['quote'], scope: { kind: 'alle' as const } };
  const spec = { ...defaultChart('linie'), source: src };
  const m = chartModel({ ...doc, chart: spec } as Doc);
  ok(!m.empty, `kein Fehler bei Ratenspalte: ${m.empty}`);
  ok(m.lines?.length === 1, 'eine Linie für eine Zahlenspalte');
  const l = m.lines![0];
  // 2015: (5.0+7.0)/2 = 6.0; 2020: (6.0+8.0)/2 = 7.0; 2025: (5.5+7.5)/2 = 6.5 – Mittelwert, nicht Summe
  ok(Math.abs((l.points[0].value ?? 0) - 6.0) < 0.01, `2015 gemittelt (Rate), nicht summiert: ${l.points[0].value}`);
  ok(Math.abs((l.points[1].value ?? 0) - 7.0) < 0.01, `2020 gemittelt: ${l.points[1].value}`);
  ok(Math.abs((l.points[2].value ?? 0) - 6.5) < 0.01, `2025 gemittelt: ${l.points[2].value}`);
  ok(m.unit === ' %', 'Arbeitslosenquote wird als % erkannt (isRate)');
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

console.log(process.exitCode ? '\nFEHLGESCHLAGEN' : '\nAlle Linie-Tests bestanden.');
