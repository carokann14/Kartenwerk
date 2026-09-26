// Welche Gebiete zeigt welcher Rahmen? Fokus, Umfeld, Insets, Grenzlinien
import { GEO, GEO_INDEX, GeoSet, LAENDER, areaLabel, bboxOfIds } from '../geo/geo';
import { areaAt } from '../geo/relate';
import type { Doc, Fokus } from '../model/types';
import { datasetFor } from '../data/aggregate';

export const geoOf = (doc: Doc): GeoSet => GEO[doc.geoSet];

export function fokusIdx(doc: Doc, f: Fokus = doc.fokus): number[] {
  const g = geoOf(doc);
  if (f.kind === 'de') return g.all;
  if (f.kind === 'land') return g.byBl[f.bl] || [];
  if (f.kind === 'kreis') return g.byKr[f.kr] || [];
  if (f.kind === 'area') { const i = g.byId.get(f.id); return i == null ? [] : [i]; }
  return f.ids.map(id => g.byId.get(id)).filter((x): x is number => x != null);
}
/** Grenzen der Gruppierungsebene: Kreise, in Berlin die Bezirke, in Bayern die Wahlkreise über den Stimmkreisen */
export const krLinesLabel = (g: GeoSet) => (g.meta.level.startsWith('be-') ? 'Bezirksgrenzen' : g.meta.level.startsWith('ltw-') ? 'Wahlkreisgrenzen' : 'Kreisgrenzen');
/** Fokus „alles“: Deutschland, bei importierten Geodaten deren Name */
export const allLabel = (g: GeoSet) => (g.meta.level === 'user' ? g.meta.label : g.meta.level.startsWith('be-') ? 'Berlin' : g.meta.level.startsWith('ltw-') ? GEO_INDEX.find(e => e.id === g.meta.id)?.region || 'Deutschland' : 'Deutschland');
export function fokusLabel(doc: Doc, f: Fokus = doc.fokus): string {
  const g = geoOf(doc);
  if (f.kind === 'de') return allLabel(g);
  if (f.kind === 'land') return LAENDER[f.bl]?.[0] || f.bl;
  if (f.kind === 'kreis') return g.krName[f.kr] || 'Kreis ' + f.kr;
  if (f.kind === 'area') { const i = g.byId.get(f.id); return i == null ? f.id : areaLabel(g, i); }
  if (f.label) return `${f.label} (${f.ids.length} ${g.meta.levelLabel})`;
  return `${f.ids.length} Gebiete, frei kombiniert`;
}
function parentIdx(doc: Doc): number[] {
  const g = geoOf(doc), f = doc.fokus;
  if (f.kind === 'de') return [];
  if (f.kind === 'land') return g.all;
  if (f.kind === 'kreis') return g.byBl[f.kr.slice(0, 2)] || g.all;
  const F = fokusIdx(doc);
  // Gemeinden: Umfeld ist der Kreis, wenn alle Fokusgebiete darin liegen
  const krs = new Set(F.map(i => g.areas[i].kr).filter(Boolean));
  if (krs.size === 1 && F.every(i => g.areas[i].kr)) { const K = g.byKr[[...krs][0]!] || []; if (K.length > F.length) return K; }
  const bls = new Set(F.map(i => g.areas[i].bl));
  if (f.kind === 'area' || bls.size === 1) return g.byBl[[...bls][0]] || g.all;
  return g.all;
}
export function umfeldIdx(doc: Doc): number[] {
  const g = geoOf(doc), F = new Set(fokusIdx(doc));
  let base: number[] = [];
  if (doc.umfeld === 'neighbors') { const s = new Set<number>(); for (const i of F) for (const j of g.areas[i].nb) s.add(j); base = [...s]; }
  else if (doc.umfeld === 'parent') base = parentIdx(doc);
  else if (doc.umfeld === 'all') base = g.all;
  return base.filter(i => !F.has(i));
}

// ---------- Nachbarländer ----------
// Gebietsstände, die nur einen Teil Deutschlands abdecken (Landtagswahlkreise, Berlin, importierte Geodaten, Regionen daraus),
// zeigen die übrigen Länder als Umfeld. Die Flächen kommen aus den Verwaltungsgrenzen (VG250, Ebene Länder).
const coverCache = new WeakMap<GeoSet, Set<string>>();
const coveredBl = (g: GeoSet) => { let s = coverCache.get(g); if (!s) { s = new Set(g.areas.map(a => a.bl)); coverCache.set(g, s); } return s; };
/** Deckt der Gebietsstand nur einen Teil der Länder ab? */
export const isRegional = (g: GeoSet | undefined) => !!g && g.meta.level !== 'lan' && coveredBl(g).size > 0 && coveredBl(g).size < 16;
/** Gebietsstand der Länder für das Umfeld: ein schon geladener, sonst der zum Jahr passende */
export function laenderSetFor(g: GeoSet | undefined): string | null {
  if (!isRegional(g)) return null;
  const c = GEO_INDEX.filter(e => e.level === 'lan'); if (!c.length) return null;
  const loaded = c.find(e => GEO[e.id]); if (loaded) return loaded.id;
  return (c.filter(e => e.year <= g!.meta.year).sort((a, b) => b.year - a.year)[0] || [...c].sort((a, b) => b.year - a.year)[0]).id;
}
/** Nachbarländer, wie sie gezeichnet werden (null: abgeschaltet, nicht nötig oder noch nicht geladen) */
export function laenderCtx(doc: Doc): { g: GeoSet; idx: number[] } | null {
  if (!doc.layers.laender) return null;
  const g = geoOf(doc), id = laenderSetFor(g); if (!id || !GEO[id]) return null;
  const L = GEO[id], cov = coveredBl(g);
  return { g: L, idx: L.all.filter(i => !cov.has(L.areas[i].id)) };
}

// Detail-Lupen je Gebietsstand
export const INSET_DEFS: Record<string, { label: string; pick: (g: GeoSet) => number[] }> = {
  berlin: { label: 'Berlin', pick: g => g.byBl['11'] || [] },
  hamburg: { label: 'Hamburg', pick: g => g.byBl['02'] || [] },
  muenchen: { label: 'München', pick: g => g.areas.filter(a => /^München-(Nord|Ost|Süd|West)/.test(a.name)).map(a => a.i) },
  koeln: { label: 'Köln', pick: g => g.areas.filter(a => /^Köln (I|II|III)$/.test(a.name)).map(a => a.i) },
  frankfurt: { label: 'Frankfurt', pick: g => g.areas.filter(a => /^Frankfurt am Main/.test(a.name)).map(a => a.i) },
  bremen: { label: 'Bremen', pick: g => g.byBl['04'] || [] },
};
export const insetIdx = (doc: Doc) => (INSET_DEFS[doc.inset.preset] || INSET_DEFS.berlin).pick(geoOf(doc));
export const insetLabel = (doc: Doc) => (INSET_DEFS[doc.inset.preset] || INSET_DEFS.berlin).label;

export type FrameId = 'main' | 'inset';
export interface FrameSets { F: Set<number>; U: Set<number>; list: number[] }
export function frameSets(doc: Doc, id: FrameId): FrameSets {
  if (id === 'main') { const F = fokusIdx(doc); return { F: new Set(F), U: new Set(umfeldIdx(doc)), list: F }; }
  const ids = insetIdx(doc), F = new Set(ids), g = geoOf(doc);
  return { F, U: new Set(g.all.filter(i => !F.has(i))), list: ids };
}
/** Gebiete mit gemeinsamem Ergebnis im Datensatz der Farbregel (z. B. gemeinsam ausgezählte Briefwahl) */
export function jointOf(doc: Doc): Record<string, string> | null {
  const id = (doc.color as { dataset?: string }).dataset; if (!id) return null;
  const ds = datasetFor(doc, id);
  return ds && ds.geoSet === doc.geoSet && ds.joint ? ds.joint : null;
}
/** Grenzlinien eines Rahmens als Bogen-Indizes (gezeichnet je nach Maßstab mit arcLines) */
export interface Meshes { wk: number[]; wkU: number[]; kr: number[]; land: number[]; outline: number[]; fokus: number[]; linesMode: boolean }
const meshCache = new WeakMap<GeoSet, Map<string, Meshes>>();   // je Gebietsstand (Regionen werden bei Änderungen neu gebaut)
export function frameMeshes(doc: Doc, id: FrameId, sets: FrameSets = frameSets(doc, id)): Meshes {
  const linesMode = id === 'main' && doc.umfeldStyle === 'lines';
  const J = jointOf(doc);
  const key = [doc.geoSet, id, JSON.stringify(doc.fokus), doc.umfeld, linesMode, id === 'inset' ? doc.inset.preset : '', J ? (doc.color as { dataset?: string }).dataset : ''].join('|');
  const g = geoOf(doc), { F, U } = sets;
  let mc = meshCache.get(g); if (!mc) { mc = new Map(); meshCache.set(g, mc); }
  const hit = mc.get(key); if (hit) return hit;
  const vis = (i: number) => i >= 0 && (F.has(i) || U.has(i));
  const big = g.areas.length > 1500;
  const wk: number[] = [], wkU: number[] = [], kr: number[] = [], land: number[] = [], outline: number[] = [], fokus: number[] = [];
  for (let ai = 0; ai < g.arcs.length; ai++) {
    const [a, b] = g.arcOwner[ai];
    if (a < 0) continue;                       // Bogen gehört nicht zu dieser Ebene (z. B. Gemeindegrenze in einer Kreiskarte)
    const va = vis(a), vb = vis(b);
    if (va && vb) {
      const A = g.areas[a], B = g.areas[b];
      if (J && J[A.id] && J[A.id] === J[B.id]) continue;   // gemeinsames Ergebnis: eine Fläche, keine innere Grenze
      if (A.bl !== B.bl) land.push(ai);
      else if (A.kr && B.kr && A.kr !== B.kr) kr.push(ai);
      else if (big && U.has(a) && U.has(b)) continue;        // Gemeinden im Umfeld: nur Kreis- und Landesgrenzen, sonst zu unruhig
      else if (linesMode && (U.has(a) || U.has(b))) wkU.push(ai);
      else wk.push(ai);
    } else if (va || vb) outline.push(ai);
    const fa = F.has(a), fb = b >= 0 && F.has(b);
    if (fa !== fb) fokus.push(ai);
  }
  const m = { wk, wkU, kr, land, outline, fokus, linesMode };
  if (mc.size > 40) mc.clear();
  mc.set(key, m);
  return m;
}
export const fokusBBox = (doc: Doc) => bboxOfIds(geoOf(doc), fokusIdx(doc));
export const insetBBox = (doc: Doc) => bboxOfIds(geoOf(doc), insetIdx(doc));

/** Innere Grenzen eines Gebietsstands (für Überlagerungen), einmal je Stand berechnet */
const innerCache = new WeakMap<GeoSet, number[]>();
export function innerArcs(g: GeoSet): number[] {
  let r = innerCache.get(g); if (r) return r;
  // Regionen: Grenzen zwischen neutralen Restflächen (Landesgrenzen) gehören nicht zur Einteilung
  const fr = (i: number) => !!g.memberOf && !!g.areas[i].free;
  r = []; for (let ai = 0; ai < g.arcs.length; ai++) { const [a, b] = g.arcOwner[ai]; if (a >= 0 && b >= 0 && a !== b && !(fr(a) && fr(b))) r.push(ai); }
  innerCache.set(g, r); return r;
}
/** Sichtbare Überlagerungen mit geladenen Geometrien (nicht die Ebene der Karte selbst) */
export const activeOverlays = (doc: Doc) => (doc.overlays || []).filter(o => o.visible && GEO[o.geoSet] && o.geoSet !== doc.geoSet);

/** Singular für Legende und Ebenenliste: „Wahlkreisgrenze“, „Kreisgrenze“ … */
export function overlayName(geoSet: string, plural = false): string {
  const m = GEO[geoSet]?.meta; if (!m) return 'Grenzen';
  if (m.base || m.level === 'user') return plural ? 'Grenzen: ' + m.label : m.label;
  const S: Record<string, [string, string]> = { 'btw-wk': ['Wahlkreisgrenze', 'Wahlkreisgrenzen'], lan: ['Landesgrenze', 'Landesgrenzen'], rbz: ['Bezirksgrenze', 'Bezirksgrenzen'], krs: ['Kreisgrenze', 'Kreisgrenzen'], vwg: ['Grenze der Gemeindeverbände', 'Grenzen der Gemeindeverbände'], gem: ['Gemeindegrenze', 'Gemeindegrenzen'] };
  const n = S[m.level]?.[plural ? 1 : 0] || 'Grenzen';
  return m.level === 'btw-wk' ? `${n} ${m.year}` : n;
}

/** Linien einer Überlagerung. Wahlkreise über Gemeinden werden aus den Gemeindegrenzen abgeleitet
 *  (Wahlkreise bestehen aus Gemeinden), damit die Linien genau auf den Gemeindegrenzen liegen.
 *  Nur in Städten mit mehreren Wahlkreisen gelten die Linien der Wahlkreiskarte. */
export interface OverlayPart { set: GeoSet; arcs: number[] }
const derivedCache = new WeakMap<GeoSet, WeakMap<GeoSet, OverlayPart[]>>();
export function overlayParts(base: GeoSet, og: GeoSet): OverlayPart[] {
  if (!(og.meta.level === 'btw-wk' && base.meta.level === 'gem')) return [{ set: og, arcs: innerArcs(og) }];
  let m = derivedCache.get(base); if (!m) { m = new WeakMap(); derivedCache.set(base, m); }
  const hit = m.get(og); if (hit) return hit;
  // Städte mit mehreren Wahlkreisen: enthalten mehrere Wahlkreis-Beschriftungspunkte
  const wkGem = og.areas.map(w => areaAt(base, w.label));
  const cnt = new Map<number, number>(); for (const gi of wkGem) if (gi != null) cnt.set(gi, (cnt.get(gi) || 0) + 1);
  const split = new Set([...cnt].filter(([, n]) => n > 1).map(([gi]) => gi));
  const wkOf: (number | null)[] = base.areas.map(a => split.has(a.i) ? -1 - a.i : areaAt(og, a.label));
  // Beschriftungspunkt außerhalb der (gröberen) Wahlkreiskarte, etwa an Küsten: Wahlkreis der Nachbarn übernehmen
  for (let pass = 0; pass < 3; pass++) for (const a of base.areas) {
    if (wkOf[a.i] != null) continue;
    const c = new Map<number, number>(); for (const j of a.nb) { const w = wkOf[j]; if (w != null && w >= 0) c.set(w, (c.get(w) || 0) + 1); }
    const best = [...c].sort((x, y) => y[1] - x[1])[0]; if (best) wkOf[a.i] = best[0];
  }
  for (const a of base.areas) if (wkOf[a.i] == null) wkOf[a.i] = -1e9 - a.i;
  const gArcs: number[] = [];
  for (let ai = 0; ai < base.arcs.length; ai++) { const [a, b] = base.arcOwner[ai]; if (a >= 0 && b >= 0 && wkOf[a] !== wkOf[b]) gArcs.push(ai); }
  const wArcs: number[] = [];
  for (const ai of innerArcs(og)) { const [x, y] = og.arcOwner[ai]; const gx = wkGem[x], gy = wkGem[y]; if (gx != null && gx === gy && split.has(gx)) wArcs.push(ai); }
  const res = [{ set: base, arcs: gArcs }, { set: og, arcs: wArcs }];
  m.set(og, res);
  return res;
}
