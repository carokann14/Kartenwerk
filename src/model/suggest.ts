// Vorschläge aus Daten (M7): welche Karten und Diagramme passen zu einem Datensatz? Regelbasiert, ohne KI.
// Jeder Vorschlag beschreibt eine fertige Grafik (Farbregel bzw. Diagrammquelle, Titel, Unterzeile).
import type { Dataset } from '../data/types';
import type { ChartSource, ChartType, ColorRule, Doc, GraphicKind } from './types';
import { GEO } from '../geo/geo';
import { isRate } from '../data/aggregate';
import { defaultComparePeriod, latestPeriod, periodText, periodYear } from '../data/time';
import { autoRule } from './actions';
import { chartModel, defaultChart } from '../render/chart';
import { chartTexts, defaultSource, isOwnTable, numCols, partyGroups } from '../render/chartSource';

export interface Suggestion {
  id: string;
  kind: GraphicKind;
  type?: ChartType;               // Diagramm
  icon: 'gebiete' | 'saeulen' | 'gewinne' | 'balken' | 'linie';
  label: string;                  // „Karte: stärkste Partei je Wahlkreis“
  hint: string;                   // ein Satz, warum bzw. was
  name: string;                   // Name der Grafik in der Leiste
  geoSet?: string; color?: ColorRule;
  source?: ChartSource;
  title: string; subtitle: string;
}

const SING: Record<string, string> = { 'btw-wk': 'Wahlkreis', lan: 'Land', rbz: 'Regierungsbezirk', krs: 'Kreis', vwg: 'Gemeindeverband', gem: 'Gemeinde', custom: 'Region', 'be-wk': 'Wahlkreis', 'be-bez': 'Bezirk', 'be-wbz': 'Wahlbezirk', 'be-bwb': 'Briefwahlbezirk' };
const sing = (ds: Dataset) => { const l = GEO[ds.geoSet]?.meta.level || ''; return SING[l] || (l.startsWith('ltw-') ? 'Wahlkreis' : 'Gebiet'); };
const when = (ds: Dataset) => (ds.time ? `${ds.time.label === 'Jahr' ? '' : ds.time.label + ' '}${periodText(latestPeriod(ds)!)}` : '');
const short = (l: string, n = 42) => (l.length > n ? l.slice(0, n - 1).trimEnd() + '…' : l);
const join = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(', ');

/** Diagramm-Vorschlag: Standardquelle, Titel aus chartTexts */
function chartSug(doc: Doc, ds: Dataset, type: ChartType, src: ChartSource, label: string, hint: string, name: string): Suggestion | null {
  const spec = { ...defaultChart(type), source: src };
  const probe = { ...doc, chart: spec } as Doc;
  const m = chartModel(probe);
  if (m.empty || (type === 'linie' ? !m.bars.length : m.bars.length < 2)) return null;
  const tx = chartTexts(probe, spec) || { title: ds.name, subtitle: '' };
  return { id: `${type}-${src.kind}`, kind: 'chart', type, icon: type, label, hint, name, source: src, title: tx.title, subtitle: tx.subtitle };
}

/** Partei mit der größten Veränderung (Betrag) zwischen Ergebnis und Vergleich, für die Veränderungskarte */
function biggestMover(doc: Doc, src: Extract<ChartSource, { kind: 'partei' }>): { party: string; label: string; delta: number } | null {
  const m = chartModel({ ...doc, chart: { ...defaultChart('gewinne'), source: src } } as Doc);
  const b = m.bars.filter(x => x.party && !x.other).sort((a, c) => Math.abs(c.value) - Math.abs(a.value))[0];
  return b ? { party: b.party!, label: b.label, delta: b.value } : null;
}

export function suggestFor(doc: Doc, dsId: string): Suggestion[] {
  const ds = doc.datasets.find(d => d.id === dsId); if (!ds) return [];
  const out: (Suggestion | null)[] = [];
  const pg = partyGroups(ds), nc = numCols(ds);
  const geo = !!ds.geoSet && !!GEO[ds.geoSet];

  if (!geo || isOwnTable(ds)) {
    // Eigene Tabelle bzw. Deutschland-Werte: nur Diagramme
    const src = defaultSource(doc, ds, 'saeulen');
    if (src?.kind === 'partei') {
      out.push(chartSug(doc, ds, 'saeulen', src, 'Säulen: Ergebnis', src.cmp ? 'Stimmenanteile in Parteifarben, daneben schmal der Vergleichswert.' : 'Stimmenanteile in Parteifarben.', 'Ergebnis'));
      if (src.cmp) out.push(chartSug(doc, ds, 'gewinne', src, 'Säulen: Gewinne und Verluste', 'Veränderung in Prozentpunkten gegenüber dem Vergleichswert.', 'Gewinne und Verluste'));
    } else if (src?.kind === 'tabelle') {
      const parties = chartModel({ ...doc, chart: { ...defaultChart('saeulen'), source: src } } as Doc).bars.filter(b => b.party).length >= 2;
      const one = { ...src, cmp: null };
      if (parties) {
        out.push(chartSug(doc, ds, 'saeulen', src, 'Säulen: Ergebnis', src.cmp ? 'Parteien in ihren Farben, zweite Spalte schmal daneben als Vergleich.' : 'Parteien in ihren Farben, sortiert nach Größe.', 'Ergebnis'));
        if (src.cmp) out.push(chartSug(doc, ds, 'gewinne', src, 'Säulen: Gewinne und Verluste', `Differenz „${nc[0]?.label}“ gegenüber „${nc[1]?.label}“.`, 'Gewinne und Verluste'));
        out.push(chartSug(doc, ds, 'balken', one, 'Balken: sortiert', 'Waagerechte Balken, gut bei vielen oder langen Namen.', 'Balken'));
      } else {
        out.push(chartSug(doc, ds, 'balken', one, 'Balken: sortiert', 'Waagerechte Balken, nach Größe sortiert.', 'Balken'));
        out.push(chartSug(doc, ds, 'saeulen', one, 'Säulen', 'Senkrechte Säulen, nach Größe sortiert.', 'Säulen'));
        if (nc.length >= 2) out.push(chartSug(doc, ds, 'gewinne', src.cmp ? src : { ...src, cmp: nc[1].id }, 'Säulen: Veränderung', `Differenz „${nc[0].label}“ gegenüber „${nc[1].label}“.`, 'Veränderung'));
      }
    }
    return dedupe(out);
  }

  const S = sing(ds);
  if (pg.length) {
    // Wahlergebnis mit Gebieten
    const rule = autoRule(ds) as Extract<ColorRule, { mode: 'siegerStaerke' }>;
    const grp = ds.groups.find(g => g.id === rule.group);
    out.push({ id: 'map-sieger', kind: 'map', icon: 'gebiete', label: `Karte: stärkste Partei je ${S}`, hint: 'Farbe der stärksten Partei, kräftiger bei höherem Anteil.', name: 'Stärkste Partei',
      geoSet: ds.geoSet, color: rule, title: `Stärkste Partei je ${S}`,
      subtitle: `${grp && grp.label !== 'Stimmen' && !ds.name.includes(grp.label) ? grp.label + ', ' : ''}${ds.name}${ds.time ? ' ' + periodText(latestPeriod(ds)!) : ''}. Je kräftiger die Farbe, desto höher der Anteil der stärksten Partei.` });
    const src = defaultSource(doc, ds, 'saeulen');
    if (src?.kind === 'partei') {
      out.push(chartSug(doc, ds, 'saeulen', src, 'Säulen: Gesamtergebnis', src.cmp ? 'Summe über alle Gebiete, daneben schmal der Vergleichswert.' : 'Summe über alle Gebiete in Parteifarben.', 'Ergebnis'));
      if (src.cmp) {
        out.push(chartSug(doc, ds, 'gewinne', src, 'Säulen: Gewinne und Verluste', 'Veränderung in Prozentpunkten gegenüber dem Vergleichswert.', 'Gewinne und Verluste'));
        // Karte: Veränderung der Partei, die sich am stärksten bewegt hat
        const mv = biggestMover(doc, src);
        if (mv) {
          const a = { dataset: ds.id, group: src.group, column: '', ...(src.period ? { period: src.period } : {}) };
          const b = { dataset: src.cmp.dataset, group: src.cmp.group, column: '', ...(src.cmp.period ? { period: src.cmp.period } : {}) };
          const vs = src.cmp.period ? String(periodYear(src.cmp.period)) : src.cmp.dataset === ds.id ? 'der Vorwahl' : doc.datasets.find(d => d.id === src.cmp!.dataset)?.name || '';
          out.push({ id: 'map-veraenderung', kind: 'map', icon: 'gebiete', label: `Karte: Gewinne und Verluste ${mv.label}`, hint: `Die Partei mit der größten Veränderung (${mv.delta > 0 ? '+' : '−'}${Math.abs(mv.delta).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Pkt.), je ${S}.`, name: `Veränderung ${mv.label}`,
            geoSet: ds.geoSet, color: { mode: 'veraenderung', dataset: ds.id, kind: 'anteil', party: mv.party, a, b, rel: false, palette: 'partei', classes: 6, step: null },
            title: `${mv.label}: Gewinne und Verluste`, subtitle: `${grp?.label || 'Anteil'} gegenüber ${vs}, in Prozentpunkten, je ${S}` });
        }
      }
    }
    if (ds.time && ds.time.periods.length >= 2) {
      const lsrc = defaultSource(doc, ds, 'linie');
      if (lsrc) out.push(chartSug(doc, ds, 'linie', lsrc, 'Linie: Entwicklung über die Zeit', 'Anteile je Partei über alle Wahltage bzw. Zeitpunkte.', 'Entwicklung'));
    }
    const bl = defaultSource(doc, ds, 'balken');
    if (bl?.kind === 'gebiete') out.push(chartSug(doc, ds, 'balken', bl, `Balken: Top 10 der ${GEO[ds.geoSet]?.meta.levelLabel || 'Gebiete'}`, 'Die zehn höchsten Werte einer Spalte, zum Beispiel Wahlbeteiligung.', 'Top 10'));
    return dedupe(out);
  }

  if (nc.length) {
    const col = nc.find(c => isRate(c)) || nc[0];
    out.push({ id: 'map-wert', kind: 'map', icon: 'gebiete', label: `Karte: ${short(col.label)} je ${S}`, hint: 'Werte in Farbstufen, hell = niedrig, dunkel = hoch.', name: short(col.label, 28),
      geoSet: ds.geoSet, color: { mode: 'wert', dataset: ds.id, column: col.id, method: 'rund', classes: 5, hue: '#2F5D8A' },
      title: ds.time ? ds.name : col.label, subtitle: join(ds.time && col.label, when(ds), `je ${S}`) });
    const bl = defaultSource(doc, ds, 'balken');
    if (bl?.kind === 'gebiete') {
      const top = { ...bl, column: col.id };
      out.push(chartSug(doc, ds, 'balken', top, 'Balken: Top 10', `Die zehn ${GEO[ds.geoSet]?.meta.levelLabel || 'Gebiete'} mit den höchsten Werten.`, 'Top 10'));
      out.push(chartSug(doc, ds, 'balken', { ...top, select: 'bottom' }, 'Balken: die letzten 10', 'Die zehn niedrigsten Werte.', 'Letzte 10'));
    }
    if (ds.time && ds.time.periods.length >= 2) {
      const a = latestPeriod(ds)!, b = defaultComparePeriod(ds, a)!;
      out.push({ id: 'map-veraenderung', kind: 'map', icon: 'gebiete', label: `Karte: Veränderung ${periodText(b)} bis ${periodText(a)}`, hint: 'Zu- und Abnahme in Prozent, blau = Rückgang, rot = Zunahme.', name: 'Veränderung',
        geoSet: ds.geoSet, color: { mode: 'veraenderung', dataset: ds.id, kind: 'wert', party: 'AfD', a: { dataset: ds.id, group: '', column: col.id, period: a }, b: { dataset: ds.id, group: '', column: col.id, period: b }, rel: true, palette: 'blaurot', classes: 6, step: null },
        title: `${col.label}: Veränderung`, subtitle: `${periodText(b)} bis ${periodText(a)}, in Prozent, je ${S}` });
      const lsrc = defaultSource(doc, ds, 'linie');
      if (lsrc) out.push(chartSug(doc, ds, 'linie', lsrc, 'Linie: Entwicklung über die Zeit', `${col.label} über die Zeit.`, 'Entwicklung'));
    }
    return dedupe(out);
  }
  // nur Kategorien
  const rule = autoRule(ds);
  if (rule.mode !== 'none') out.push({ id: 'map-kat', kind: 'map', icon: 'gebiete', label: `Karte: Kategorien je ${S}`, hint: 'Eine Farbe je Wert.', name: 'Karte', geoSet: ds.geoSet, color: rule, title: ds.name, subtitle: `je ${S}` });
  return dedupe(out);
}
function dedupe(xs: (Suggestion | null)[]): Suggestion[] {
  const seen = new Set<string>(), out: Suggestion[] = [];
  for (const x of xs) { if (!x) continue; let id = x.id; while (seen.has(id)) id += '+'; seen.add(id); out.push({ ...x, id }); }
  return out;
}
