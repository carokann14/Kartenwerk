// Datenquellen für Diagramme: Standardquelle je Datensatz und Art, Vergleichswerte, Standardtexte
import type { Dataset } from '../data/types';
import type { ChartSource, ChartSpec, ChartType, Doc } from '../model/types';
import { isRate } from '../data/aggregate';
import { latestPeriod, periodText, periodYear } from '../data/time';
import { partyOf } from '../data/parties';
import { GEO } from '../geo/geo';
import { chartModel } from './chart';

export type Cmp = NonNullable<Extract<ChartSource, { kind: 'partei' }>['cmp']>;
export interface CmpOption { value: Cmp; label: string }
const baseLabel = (l: string) => l.replace(/\s*\(Vorperiode\)\s*$/, '').trim();
export const partyGroups = (ds: Dataset) => ds.groups.filter(g => g.parties && !/Vorperiode/.test(g.label));
export const isOwnTable = (ds: Dataset) => ds.preset === 'eigene';
export const numCols = (ds: Dataset) => ds.columns.filter(c => c.kind === 'number' && c.role === 'value');
/** Mögliche Vergleichswerte zu einer Parteigruppe: Vorperiode, andere Jahre, andere Datensätze mit gleicher Gruppe */
export function cmpOptions(doc: Doc, ds: Dataset, groupId: string, period?: string | null): CmpOption[] {
  const grp = ds.groups.find(g => g.id === groupId); if (!grp) return [];
  const out: CmpOption[] = [];
  for (const g of ds.groups) if (g.parties && g.id !== grp.id && /Vorperiode/.test(g.label) && baseLabel(g.label) === grp.label) out.push({ value: { dataset: ds.id, group: g.id }, label: 'Vorwahl (aus derselben Datei)' });
  if (ds.time) {
    const cur = period || latestPeriod(ds);
    for (const p of [...ds.time.periods].reverse()) if (p !== cur) out.push({ value: { dataset: ds.id, group: grp.id, period: p }, label: `${ds.time.label} ${periodText(p)}` });
  }
  for (const o of doc.datasets) {
    if (o.id === ds.id) continue;
    const og = o.groups.find(g => g.parties && g.label === grp.label);
    if (og && (o.geoSet === ds.geoSet || !o.geoSet || !ds.geoSet || GEO[o.geoSet]?.meta.level === GEO[ds.geoSet]?.meta.level)) out.push({ value: { dataset: o.id, group: og.id }, label: o.name });
  }
  return out;
}
/** Standardquelle für einen Datensatz und eine Diagrammart */
export function defaultSource(doc: Doc, ds: Dataset, type: ChartType): ChartSource | null {
  if (type === 'sitze') {
    // eigene Tabelle: Spalte „Sitze“/„Mandate“ direkt; Prozente (Summe ~100) bzw. Kommazahlen → Rechner
    if (isOwnTable(ds)) {
      const nc = numCols(ds); if (!nc.length || ds.rows.length < 1) return null;
      const seat = nc.find(c => /sitz|mandat/i.test(c.label));
      if (seat) return { kind: 'sitze', from: 'tabelle', dataset: ds.id, column: seat.id, calc: null };
      const col = nc[0], ci = ds.columns.indexOf(col);
      const vals = ds.rows.map(r => r[ci]).filter((v): v is number => typeof v === 'number');
      const sum = vals.reduce((a, b) => a + b, 0);
      const pct = /%|prozent|anteil|umfrage/i.test(col.label) || (sum > 90 && sum < 110) || vals.some(v => v % 1 !== 0);
      return { kind: 'sitze', from: 'tabelle', dataset: ds.id, column: col.id, calc: pct ? { seats: defaultSeats(ds), threshold: 5 } : null };
    }
    const pg = partyGroups(ds); if (!pg.length) return null;
    const grp = pg.find(g => /Zweit/.test(g.label)) || pg.find(g => /Gesamt/.test(g.label)) || pg[0];
    return { kind: 'sitze', from: 'wahl', dataset: ds.id, group: grp.id, scope: { kind: 'alle' }, period: null, calc: { seats: defaultSeats(ds), threshold: 5 } };
  }
  if (type === 'linie') {
    if (!ds.time || ds.time.periods.length < 2) return null;
    const pg = partyGroups(ds);
    if (pg.length) { const grp = pg.find(g => /Zweit/.test(g.label)) || pg.find(g => /Gesamt/.test(g.label)) || pg[0]; return { kind: 'linie', dataset: ds.id, mode: 'partei', group: grp.id, scope: { kind: 'alle' } }; }
    const nc = numCols(ds); if (!nc.length) return null;
    const col = nc.find(c => isRate(c)) || nc[0];
    return { kind: 'linie', dataset: ds.id, mode: 'werte', columns: [col.id], scope: { kind: 'alle' } };
  }
  if (isOwnTable(ds)) {
    const nc = numCols(ds); if (!nc.length) return null;
    return { kind: 'tabelle', dataset: ds.id, column: nc[0].id, cmp: type === 'gewinne' || nc.length > 1 ? nc[1]?.id || null : null };
  }
  const pg = partyGroups(ds);
  if (pg.length && type !== 'balken') {
    const grp = pg.find(g => /Zweit/.test(g.label)) || pg.find(g => /Gesamt/.test(g.label)) || pg[0];
    const period = ds.time ? latestPeriod(ds) : null;
    const opts = cmpOptions(doc, ds, grp.id, period);
    const pref = opts.find(o => !o.value.period && o.value.dataset === ds.id) || opts.find(o => o.value.period) || opts[0];
    return { kind: 'partei', dataset: ds.id, group: grp.id, scope: { kind: 'alle' }, period, cmp: pref ? pref.value : null };
  }
  const nc = numCols(ds); if (!nc.length) return null;
  if (!ds.geoSet) return { kind: 'tabelle', dataset: ds.id, column: nc[0].id, cmp: null };
  const col = nc.find(c => isRate(c)) || nc[0];
  return { kind: 'gebiete', dataset: ds.id, column: col.id, period: ds.time ? latestPeriod(ds) : null, select: 'top', n: 10, scope: { kind: 'alle' } };
}
/** Sitze im Rechner: Bundestag 630 (seit 2025), Landtage und Berlin als Vorschlag 100 – im Schritt „Diagramm“ änderbar */
export const defaultSeats = (ds: Dataset) => (/^(ltw-|be-)/.test(ds.geoSet) ? 100 : 630);
/** „A“, „A und B“, „A, B und C“ */
export const joinDe = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} und ${xs[xs.length - 1]}`);
/** Art, die zu einer Quelle passt (Gebiete → Balken) */
export const typeFor = (src: ChartSource | null, want: ChartType): ChartType => (src?.kind === 'sitze' ? 'sitze' : src?.kind === 'linie' ? 'linie' : src?.kind === 'gebiete' ? 'balken' : want === 'balken' && src?.kind === 'partei' ? 'saeulen' : want);
/** Standard-Titel und -Unterzeile für ein neues Diagramm */
export function chartTexts(doc: Doc, spec: ChartSpec): { title: string; subtitle: string } | null {
  const src = spec.source; if (!src) return null;
  const ds = doc.datasets.find(d => d.id === src.dataset); if (!ds) return null;
  const year = (p?: string | null) => (p ? String(periodYear(p)) : ds.name.match(/\b(19|20)\d\d\b/)?.[0] || '');
  const lvl = GEO[ds.geoSet]?.meta.levelLabel || 'Gebiete';
  if (src.kind === 'partei') {
    const g = ds.groups.find(x => x.id === src.group)?.label || '';
    const scope = src.scope.kind === 'alle' ? '' : ' (Ausschnitt)';
    const name = ds.name.replace(/,.*$/, '');
    if (spec.type === 'gewinne') {
      const cmpDs = src.cmp ? doc.datasets.find(d => d.id === src.cmp!.dataset) : null;
      const vs = src.cmp?.period ? periodYear(src.cmp.period) : cmpDs && cmpDs.id !== ds.id ? cmpDs.name : 'der Vorwahl';
      return { title: `Gewinne und Verluste`, subtitle: `${name}${src.period ? ' ' + year(src.period) : ''}, ${g} gegenüber ${vs}, in Prozentpunkten${scope}` };
    }
    return { title: `${name}${src.period && !name.includes(year(src.period)) ? ' ' + year(src.period) : ''}`, subtitle: `${g} in Prozent${scope}` };
  }
  if (src.kind === 'gebiete') {
    const raw = ds.columns.find(c => c.id === src.column)?.label || '';
    const pct = /\((Prozent|%)\)/.test(raw), col = raw.replace(/\s*\((Prozent|%)\)/, '');
    const n = src.select === 'alle' ? '' : `${src.n} ${lvl} mit den ${src.select === 'top' ? 'höchsten' : 'niedrigsten'} Werten`;
    return { title: col, subtitle: [n, pct && 'in Prozent', src.period ? (ds.time?.label === 'Jahr' ? '' : ds.time?.label + ' ') + periodText(src.period) : ''].filter(Boolean).join(', ') };
  }
  if (src.kind === 'sitze') {
    const S = chartModel({ ...doc, chart: spec } as Doc).seats;
    if (!S) return { title: 'Sitzverteilung', subtitle: ds.name };
    const name = ds.name.replace(/\s·\s(Länder|Deutschland)$/, '').replace(/:.*$/, '').trim();
    const g = src.from === 'wahl' ? ds.groups.find(x => x.id === src.group)?.label || '' : '';
    const when = src.from === 'wahl' ? year(src.period || (ds.time ? ds.time.periods[ds.time.periods.length - 1] : null)) : '';
    const how = S.calc ? `${S.total} Sitze nach Sainte-Laguë, ${S.calc.threshold.toLocaleString('de-DE')}-%-Hürde` : `${S.total} Sitze`;
    const head = [name && !name.includes(when) ? `${name}${when ? ' ' + when : ''}` : name, g].filter(Boolean).join(', ');
    const sub = `${head ? head + ': ' : ''}${how}, Mehrheit ab ${S.majority}${S.calc ? ' (Projektion)' : ''}`;
    if (S.coalition) {
      const labs = S.groups.filter(x => S.coalition!.keys.includes(x.key)).sort((a, b) => b.seats - a.seats).map(x => x.label);
      return { title: `${joinDe(labs)}: ${S.coalition.seats} Sitze`, subtitle: S.coalition.reached ? sub : `${sub} – es fehlen ${S.majority - S.coalition.seats}` };
    }
    return { title: S.calc ? 'Sitzverteilung (Projektion)' : 'Sitzverteilung', subtitle: sub };
  }
  if (src.kind === 'linie') {
    const scope = src.scope.kind === 'alle' ? '' : ' (Ausschnitt)';
    const span = ds.time ? `${periodYear(ds.time.periods[0])}–${periodYear(ds.time.periods[ds.time.periods.length - 1])}` : '';
    // Name ohne Zusatz der Ebene („· Länder“) und ohne Untertitel („Bundestagswahlen: Zweitstimmen“ → „Bundestagswahlen“)
    const name = ds.name.replace(/\s·\s(Länder|Deutschland)$/, '').replace(/,.*$/, '').replace(/:.*$/, '').trim();
    if (src.mode === 'partei') {
      const g = ds.groups.find(x => x.id === src.group)?.label || '';
      return { title: `${name} ${span}`.trim(), subtitle: `${g} in Prozent${scope}` };
    }
    const raw = src.columns.map(id => ds.columns.find(c => c.id === id)?.label).filter((x): x is string => !!x);
    const pct = raw.length > 0 && raw.every(l => /\((Prozent|%)\)/.test(l));
    const labs = raw.map(l => l.replace(/\s*\((Prozent|%)\)/, '')).join(', ');
    return { title: labs || name, subtitle: [span, pct && 'in Prozent'].filter(Boolean).join(', ') + scope };
  }
  const col = ds.columns.find(c => c.id === src.column)?.label || '', cmp = ds.columns.find(c => c.id === src.cmp)?.label || '';
  const pct = looksLikeParties(ds) || /%|prozent|anteil/i.test(col);
  if (spec.type === 'gewinne') return { title: ds.name, subtitle: `Veränderung ${col} gegenüber ${cmp}${pct ? ', in Prozentpunkten' : ''}` };
  return { title: ds.name, subtitle: [pct && 'In Prozent', src.cmp && spec.showCmp && cmp ? `${col}, zum Vergleich ${cmp}` : col].filter(Boolean).join(', ') };
}
export const looksLikeParties = (ds: Dataset) => { const nc = Math.max(0, ds.columns.findIndex(c => c.role === 'name')); return ds.rows.filter(r => partyOf(String(r[nc] ?? ''))).length >= 2; };
