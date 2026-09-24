// Legendenmodell: automatische Einträge aus Farbregel und Schraffuren, dazu die Bearbeitungen aus doc.legend
import type { Doc, HatchStyle, MarkerEl } from '../model/types';
import { colorModel, legendTitleAuto, partyColor } from './colorModel';
import { hatchMap } from './hatch';
import { partyDef, partyOf } from '../data/parties';

export type ColorTarget = { type: 'party'; key: string } | { type: 'category'; key: string } | { type: 'hatch'; id: string } | { type: 'extra'; id: string } | { type: 'markers'; key: string } | { type: 'nodata' } | null;
export interface LegEntry {
  key: string; label: string; auto: string; color: string; count: number | null;
  kind: 'fill' | 'hatch' | 'line' | 'nodata' | 'marker'; hatch: HatchStyle | null; bg: string | null; marker?: MarkerEl;
  hidden: boolean; target: ColorTarget; removable: boolean;
}
export interface LegModel {
  main: 'matrix' | 'list' | 'bar' | null;
  title: string; titleAuto: string;
  rows: LegEntry[];      // Parteien bzw. Kategorien (Matrix oder Liste)
  more: LegEntry[];      // Schraffuren, keine Daten, eigene Einträge
  caption: { key: 'caption'; auto: string; text: string; hidden: boolean } | null;
  ovNote: { key: 'ov'; text: string; hidden: boolean } | null;
}
const cache = new WeakMap<Doc, LegModel | null>();

function ordered(list: LegEntry[], order: string[]) {
  const rank = (e: LegEntry, i: number) => { const k = order.indexOf(e.key); return k >= 0 ? k : order.length + i; };
  return list.map((e, i) => ({ e, r: rank(e, i) })).sort((a, b) => a.r - b.r).map(x => x.e);
}
export function legendModel(doc: Doc): LegModel | null {
  if (cache.has(doc)) return cache.get(doc)!;
  const res = compute(doc); cache.set(doc, res); return res;
}
function compute(doc: Doc): LegModel | null {
  const cm = colorModel(doc), c = doc.color, L = doc.legend;
  const hasData = c.mode !== 'none' && !cm.mismatch && !!cm.dataset;
  const markerGroups = new Map<string, MarkerEl[]>();
  for (const e of doc.els) if (e.type === 'marker' && !e.hidden && e.legend.trim()) { const k = e.legend.trim(); markerGroups.set(k, [...(markerGroups.get(k) || []), e]); }
  if (!hasData && !markerGroups.size && !L.extra.length) return null;
  const hidden = new Set(L.hidden);
  const lab = (key: string, auto: string) => L.labels[key] ?? auto;
  const mk = (key: string, auto: string, rest: Partial<LegEntry>): LegEntry => ({ key, auto, label: lab(key, auto), color: '#000', count: null, kind: 'fill', hatch: null, bg: null, hidden: hidden.has(key), target: null, removable: false, ...rest });
  const main: LegModel['main'] = !hasData ? null : c.mode === 'siegerStaerke' ? 'matrix' : c.mode === 'sieger' || c.mode === 'kategorie' ? 'list' : 'bar';
  const rows: LegEntry[] = main === 'bar' || !main ? [] : cm.entries.map(e => {
    const isParty = !!partyDef(e.key) || (c.mode !== 'kategorie' && !!partyOf(e.key));
    return mk('k:' + e.key, e.label, { color: e.color, count: e.count, target: isParty ? { type: 'party', key: partyDef(e.key) ? e.key : partyOf(e.key)!.key } : { type: 'category', key: e.key } });
  });
  // Schraffuren (ohne die Schraffur für „keine Daten“, die steckt im eigenen Eintrag)
  const more: LegEntry[] = [];
  const hm = doc.layers.hatches ? hatchMap(doc) : null;
  const ndRule = doc.hatchRules.find(r => r.source === 'nodata');
  const ndHatch = hm && ndRule ? hm.styles.get(ndRule.hatch) || null : null;
  if (hm) for (const h of doc.hatches) {
    if (h.id === ndHatch?.id || !hm.counts[h.id]) continue;
    more.push(mk('h:' + h.id, h.name, { kind: 'hatch', hatch: h, bg: h.bg, color: h.color, count: hm.counts[h.id], target: { type: 'hatch', id: h.id } }));
  }
  for (const [k, ms] of markerGroups) more.push(mk('m:' + k, k, { kind: 'marker', marker: ms[0], color: ms[0].fill, count: ms.length, target: { type: 'markers', key: k } }));
  if (hasData && cm.missing) more.push(mk('nodata', 'keine Daten', { kind: 'nodata', color: doc.style.noData, hatch: ndHatch, count: cm.missing, target: { type: 'nodata' } }));
  if (hasData && cm.free) more.push(mk('free', 'gemeindefreies Gebiet', { kind: 'fill', color: doc.style.noData, count: cm.free, target: { type: 'nodata' } }));
  for (const x of L.extra) {
    const hs = x.kind === 'hatch' ? doc.hatches.find(h => h.id === x.hatch) || null : null;
    more.push(mk('x:' + x.id, x.label, { label: x.label, kind: x.kind, color: x.color, hatch: hs, bg: hs?.bg ?? null, target: { type: 'extra', id: x.id }, removable: true }));
  }
  const capAuto = !hasData ? '' : c.mode === 'siegerStaerke' ? (c.basis === 'anteil' ? 'Anteil der stärksten Partei in %' : 'Vorsprung auf Platz 2 in Prozentpunkten') : c.mode === 'anteil' ? 'Anteil in %' : '';
  const caption = capAuto || L.caption ? { key: 'caption' as const, auto: capAuto, text: L.caption ?? capAuto, hidden: hidden.has('caption') } : null;
  const nOv = Object.keys(doc.overrides).filter(k => k.startsWith(doc.geoSet + ':')).length;
  const ovNote = nOv ? { key: 'ov' as const, text: `${nOv} Gebiet${nOv > 1 ? 'e' : ''} manuell eingefärbt`, hidden: hidden.has('ov') } : null;
  const titleAuto = hasData ? legendTitleAuto(doc, cm) : 'Legende';
  return { main, title: L.title || titleAuto, titleAuto, rows: ordered(rows, L.order), more: ordered(more, L.order), caption, ovNote };
}
/** Farbe eines Eintrags ändern: Partei (projektweit), Kategorie, Schraffur, eigener Eintrag oder „keine Daten“. */
export function entryColorSetter(t: ColorTarget): ((d: Doc, v: string) => void) | null {
  if (!t) return null;
  if (t.type === 'party') return (d, v) => { d.partyColors[t.key] = v; };
  if (t.type === 'category') return (d, v) => { d.categoryColors[t.key] = v; };
  if (t.type === 'hatch') return (d, v) => { const h = d.hatches.find(x => x.id === t.id); if (h) h.color = v; };
  if (t.type === 'extra') return (d, v) => { const x = d.legend.extra.find(e => e.id === t.id); if (x) x.color = v; };
  if (t.type === 'markers') return (d, v) => { for (const e of d.els) if (e.type === 'marker' && e.legend.trim() === t.key) e.fill = v; };
  return (d, v) => { d.style.noData = v; };
}
export { partyColor };
