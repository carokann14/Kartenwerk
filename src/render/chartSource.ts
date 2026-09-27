// Datenquellen für Diagramme: Standardquelle je Datensatz und Art, Vergleichswerte, Standardtexte
import type { Dataset } from '../data/types';
import type { ChartSource, ChartSpec, ChartType, Doc } from '../model/types';
import { isRate } from '../data/aggregate';
import { latestPeriod, periodText, periodYear } from '../data/time';
import { partyOf } from '../data/parties';
import { GEO } from '../geo/geo';

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
/** Art, die zu einer Quelle passt (Gebiete → Balken) */
export const typeFor = (src: ChartSource | null, want: ChartType): ChartType => (src?.kind === 'gebiete' ? 'balken' : want === 'balken' && src?.kind === 'partei' ? 'saeulen' : want);
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
  const col = ds.columns.find(c => c.id === src.column)?.label || '', cmp = ds.columns.find(c => c.id === src.cmp)?.label || '';
  const pct = looksLikeParties(ds) || /%|prozent|anteil/i.test(col);
  if (spec.type === 'gewinne') return { title: ds.name, subtitle: `Veränderung ${col} gegenüber ${cmp}${pct ? ', in Prozentpunkten' : ''}` };
  return { title: ds.name, subtitle: [pct && 'In Prozent', src.cmp && spec.showCmp && cmp ? `${col}, zum Vergleich ${cmp}` : col].filter(Boolean).join(', ') };
}
export const looksLikeParties = (ds: Dataset) => { const nc = Math.max(0, ds.columns.findIndex(c => c.role === 'name')); return ds.rows.filter(r => partyOf(String(r[nc] ?? ''))).length >= 2; };
