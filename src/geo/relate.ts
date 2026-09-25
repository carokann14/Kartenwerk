// Beziehungen zwischen Ebenen: Fokus beim Ebenenwechsel übernehmen, Gebiete einer anderen Ebene finden.
// Verwaltungsebenen desselben Stands hängen über ihre Schlüssel zusammen (AGS/ARS-Präfixe),
// alles andere (Wahlkreise ↔ Gemeinden, verschiedene Stände) wird räumlich über Beschriftungspunkte bestimmt.
import { GEO, GEO_INDEX, GeoSet, LAENDER, Pt, areaLabel, polysAt } from './geo';
import { EG } from './regions';
import { UG } from './userGeo';
import type { Doc, Fokus } from '../model/types';

/** Länder mit Regierungsbezirken (in den anderen steht auf dieser Ebene das Land) */
const RBZ_LAENDER = new Set(['05', '06', '08', '09']);
const ORDER = ['lan', 'rbz', 'krs', 'vwg', 'gem'];
export const vg = (g: GeoSet) => !!g.meta.keyLen && ORDER.includes(g.meta.level);

/** Schlüssel eines Verwaltungsgebiets auf einer (gleich groben oder gröberen) Ebene */
export function keyAt(g: GeoSet, i: number, level: string): string | null {
  const a = g.areas[i], L = g.meta.level;
  if (L === level) return a.id;
  const ags = L === 'gem' ? a.id : null, base = a.id;
  switch (level) {
    case 'lan': return base.slice(0, 2);
    case 'rbz': { if (L === 'lan') return null; const ll = base.slice(0, 2); return RBZ_LAENDER.has(ll) ? base.slice(0, 3) : ll + '0'; }
    case 'krs': return L === 'lan' || L === 'rbz' ? null : base.slice(0, 5);
    case 'vwg': return L === 'gem' ? (a.ars || '').slice(0, 9) || null : null;
    case 'gem': return ags;
  }
  return null;
}
const finer = (a: string, b: string) => ORDER.indexOf(a) < ORDER.indexOf(b);   // b ist feiner als a

// ---------- räumlich ----------
function inRing(p: Pt, r: Pt[]) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
export function pointInArea(g: GeoSet, i: number, p: Pt): boolean {
  const b = g.areas[i].bbox;
  if (p[0] < b[0] || p[0] > b[2] || p[1] < b[1] || p[1] > b[3]) return false;
  let c = false;
  for (const poly of polysAt(g, i, g.points > 150000 ? 2 : 0)) for (const ring of poly) if (inRing(p, ring)) c = !c;
  return c;
}
/** Gebiet der Ebene g, in dem der Punkt liegt */
export function areaAt(g: GeoSet, p: Pt): number | null {
  for (const i of g.all) if (pointInArea(g, i, p)) return i;
  return null;
}
const meanArea = (g: GeoSet) => g.areas.reduce((s, a) => s + a.area, 0) / Math.max(1, g.areas.length);

/** Gebiete der Ebene `to`, die zu den Gebieten `ids` der Ebene `from` gehören */
export function relateIds(from: GeoSet, idx: number[], to: GeoSet): number[] {
  if (!idx.length) return [];
  if (from === to) return idx;
  // eigene Einteilungen: über ihre Bausteine
  if (from.memberOf && from.meta.base && GEO[from.meta.base]) {
    const base = GEO[from.meta.base], M = from.memberOf, R = new Set(idx);
    const bi = base.all.filter(i => R.has(M[i]));
    return to === base ? bi : relateIds(base, bi, to);
  }
  if (to.memberOf && to.meta.base && GEO[to.meta.base]) {
    const base = GEO[to.meta.base], M = to.memberOf;
    const bi = from === base ? idx : relateIds(from, idx, base);
    const out = new Set<number>(); for (const i of bi) if (M[i] >= 0) out.add(M[i]);
    return [...out];
  }
  const S = new Set(idx);
  if (vg(from) && vg(to) && from.meta.file === to.meta.file) {
    const Lf = from.meta.level, Lt = to.meta.level;
    if (Lt === Lf) return idx;
    if (finer(Lf, Lt) && !(Lf === 'vwg' && Lt !== 'gem')) {
      const keys = new Set(idx.map(i => from.areas[i].id));
      return to.all.filter(t => { const k = keyAt(to, t, Lf); return k != null && keys.has(k); });
    }
    if (!finer(Lf, Lt) && !(Lt === 'vwg' && Lf !== 'gem')) {
      const keys = new Set(idx.map(i => keyAt(from, i, Lt)).filter((k): k is string => !!k));
      return to.all.filter(t => keys.has(to.areas[t].id));
    }
  }
  // räumlich: feinere Zielebene → deren Beschriftungspunkte in den Quellgebieten; gröbere → Zielgebiete mit Quellpunkten
  const inner = () => {
    const bb = idx.reduce((b, i) => { const x = from.areas[i].bbox; return [Math.min(b[0], x[0]), Math.min(b[1], x[1]), Math.max(b[2], x[2]), Math.max(b[3], x[3])]; }, [Infinity, Infinity, -Infinity, -Infinity]);
    return to.all.filter(t => { const p = to.areas[t].label; if (p[0] < bb[0] || p[0] > bb[2] || p[1] < bb[1] || p[1] > bb[3]) return false; for (const i of S) if (pointInArea(from, i, p)) return true; return false; });
  };
  const outer = () => { const out = new Set<number>(); for (const i of idx) { const t = areaAt(to, from.areas[i].label); if (t != null) out.add(t); } return [...out]; };
  if (meanArea(to) <= meanArea(from) * 1.2) { const r = inner(); return r.length ? r : outer(); }
  return outer();
}

/** Fokus als Menge in die schlichteste Form bringen (Deutschland, Land, Kreis, Gebiet, freie Auswahl) */
export function normFokusIdx(g: GeoSet, idx: number[]): Fokus {
  const u = [...new Set(idx)];
  if (!u.length || u.length === g.areas.length) return { kind: 'de' };
  if (u.length === 1) return { kind: 'area', id: g.areas[u[0]].id };
  const set = new Set(u);
  const bl = g.areas[u[0]].bl, L = g.byBl[bl] || [];
  if (!g.memberOf && L.length === set.size && L.every(i => set.has(i))) return { kind: 'land', bl };
  const kr = g.areas[u[0]].kr;
  if (kr && g.meta.level !== 'krs') { const K = g.byKr[kr] || []; if (K.length === set.size && K.every(i => set.has(i))) return { kind: 'kreis', kr }; }
  return { kind: 'custom', ids: u.map(i => g.areas[i].id).sort((a, b) => +a - +b || a.localeCompare(b)) };
}

/** Fokus beim Wechsel der Ebene übernehmen */
export function translateFokus(f: Fokus, from: GeoSet, to: GeoSet): Fokus {
  if (f.kind === 'de') return f;
  const custom = !!(from.memberOf || to.memberOf);   // Regionen: Land und Kreis über die Bausteine übersetzen
  if (f.kind === 'land' && !custom) return to.byBl[f.bl]?.length ? f : { kind: 'de' };
  if (f.kind === 'kreis' && !custom) {
    if (to.byKr[f.kr]?.length && to.meta.level !== 'krs') return f;
    if (to.meta.level === 'krs' && to.byId.has(f.kr)) return { kind: 'area', id: f.kr };
  }
  const src = f.kind === 'land' ? from.byBl[f.bl] || [] : f.kind === 'kreis' ? from.byKr[f.kr] || [] : f.kind === 'area' ? [from.byId.get(f.id)].filter((x): x is number => x != null) : f.ids.map(id => from.byId.get(id)).filter((x): x is number => x != null);
  const res = relateIds(from, src, to);
  if (!res.length) return { kind: 'de' };
  const nf = normFokusIdx(to, res);
  // Herkunft merken, wenn aus einem einzelnen Gebiet eine freie Auswahl wird („Gemeinden in Wahlkreis 211“)
  if (nf.kind === 'custom') { const lbl = f.kind === 'custom' ? f.label : f.kind === 'area' ? areaLabel(from, src[0]) : f.kind === 'kreis' ? from.krName[f.kr] : f.kind === 'land' ? LAENDER[f.bl]?.[0] : undefined; if (lbl) nf.label = lbl; }
  return nf;
}

/** Nächstfeinere Ebene für den Drilldown (gleicher Stand; Wahlkreise → Gemeinden) */
export function finerSet(g: GeoSet, i?: number): string | null {
  if (g.meta.base) return g.meta.base;   // Regionen → ihre Bausteine
  const L = g.meta.level;
  // Berlin: Gemeinde Berlin → Bezirke → Wahlkreise → Wahlbezirke (Abgeordnetenhauswahl)
  if (L === 'gem' && i != null && g.areas[i]?.bl === '11') { const b = GEO_INDEX.find(e => e.level === 'be-bez'); if (b) return b.id; }
  const be: Record<string, string> = { 'be-bez': 'be-wk', 'be-wk': 'be-wbz', 'be-bwb': 'be-wbz' };
  if (be[L]) return GEO_INDEX.find(e => e.level === be[L] && e.file === g.meta.file)?.id || null;
  const next: Record<string, string> = { lan: 'krs', rbz: 'krs', krs: 'gem', vwg: 'gem', 'btw-wk': 'gem' };
  const lv = next[L]; if (!lv) return null;
  const cands = GEO_INDEX.filter(e => e.level === lv).sort((a, b) => b.year - a.year);
  const same = g.meta.file ? cands.find(e => e.file === g.meta.file) : cands.find(e => e.year === g.meta.year);
  return (same || cands[0])?.id || null;
}
/** Passende Gebietsstände anderer Ebenen für die Schnellwahl (gleicher Stand bzw. Wahljahr) */
const fokusIdxOf = (doc: Doc, g: GeoSet): number[] => {
  const f = doc.fokus;
  if (f.kind === 'de') return g.all;
  if (f.kind === 'land') return g.byBl[f.bl] || [];
  if (f.kind === 'kreis') return g.byKr[f.kr] || [];
  if (f.kind === 'area') { const i = g.byId.get(f.id); return i == null ? [] : [i]; }
  return f.ids.map(id => g.byId.get(id)).filter((x): x is number => x != null);
};
export function sisterSets(g: GeoSet, doc?: Doc): { id: string; label: string; custom?: boolean; region?: string }[] {
  const year = g.meta.year, out: { id: string; label: string; custom?: boolean; region?: string }[] = [];
  const LBL: Record<string, string> = { 'btw-wk': 'Wahlkreise', lan: 'Länder', rbz: 'Bezirke', krs: 'Kreise', vwg: 'Verbände', gem: 'Gemeinden' };
  for (const lv of ['btw-wk', 'lan', 'rbz', 'krs', 'vwg', 'gem']) {
    const c = GEO_INDEX.filter(e => e.level === lv);
    if (!c.length) continue;
    const pick = (lv === g.meta.level ? c.find(e => e.id === g.meta.id) : null) || (g.meta.file ? c.find(e => e.file === g.meta.file) : null) || c.find(e => e.year === year) || [...c].sort((a, b) => b.year - a.year)[0];
    out.push({ id: pick.id, label: LBL[lv] || pick.levelLabel });
  }
  // Regionen wie Berlin: nur, wenn Karte oder Fokus dort liegen
  const bls = doc ? new Set(fokusIdxOf(doc, g).map(i => g.areas[i].bl)) : new Set<string>();
  for (const e of GEO_INDEX) {
    if (!e.region || out.some(o => o.id === e.id)) continue;
    const bl = Object.entries(LAENDER).find(([, v]) => v[0] === e.region)?.[0];
    if (e.file === g.meta.file || (bl && bls.size === 1 && bls.has(bl))) out.push({ id: e.id, label: e.levelLabel.replace(' (Abgeordnetenhaus)', ' AGH'), region: e.region });
  }
  // importierte Geodaten (räumlich zugeordnet) und eigene Einteilungen auf derselben Kartengrundlage
  for (const u of doc?.geodata || []) if (GEO[UG + u.id]) out.push({ id: UG + u.id, label: u.label, custom: true });
  for (const rs of doc?.regions || []) { const b = GEO[rs.base]; if (b && (b.meta.file === g.meta.file || rs.base === g.meta.id)) out.push({ id: EG + rs.id, label: rs.name, custom: true }); }
  return out;
}
export const geoById = (id: string) => GEO[id];
