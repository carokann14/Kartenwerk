// Welche Gebiete zeigt welcher Rahmen? Fokus, Umfeld, Insets, Grenzlinien
import { GEO, GeoSet, LAENDER, Pt, bboxOfIds } from '../geo/geo';
import type { Doc, Fokus } from '../model/types';

export const geoOf = (doc: Doc): GeoSet => GEO[doc.geoSet];

export function fokusIdx(doc: Doc, f: Fokus = doc.fokus): number[] {
  const g = geoOf(doc);
  if (f.kind === 'de') return g.all;
  if (f.kind === 'land') return g.byBl[f.bl] || [];
  if (f.kind === 'area') { const i = g.byId.get(f.id); return i == null ? [] : [i]; }
  return f.ids.map(id => g.byId.get(id)).filter((x): x is number => x != null);
}
export function fokusLabel(doc: Doc, f: Fokus = doc.fokus): string {
  const g = geoOf(doc);
  if (f.kind === 'de') return 'Deutschland';
  if (f.kind === 'land') return LAENDER[f.bl]?.[0] || f.bl;
  if (f.kind === 'area') { const i = g.byId.get(f.id); return i == null ? f.id : `${g.areas[i].nr} ${g.areas[i].name}`; }
  return `${f.ids.length} Gebiete, frei kombiniert`;
}
function parentIdx(doc: Doc): number[] {
  const g = geoOf(doc), f = doc.fokus;
  if (f.kind === 'de') return [];
  if (f.kind === 'land') return g.all;
  const F = fokusIdx(doc);
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
export interface Meshes { wk: Pt[][]; wkU: Pt[][]; land: Pt[][]; outline: Pt[][]; fokus: Pt[][]; linesMode: boolean }
const meshCache = new Map<string, Meshes>();
export function frameMeshes(doc: Doc, id: FrameId, sets: FrameSets = frameSets(doc, id)): Meshes {
  const linesMode = id === 'main' && doc.umfeldStyle === 'lines';
  const key = [doc.geoSet, id, JSON.stringify(doc.fokus), doc.umfeld, linesMode, id === 'inset' ? doc.inset.preset : ''].join('|');
  const hit = meshCache.get(key); if (hit) return hit;
  const g = geoOf(doc), { F, U } = sets;
  const vis = (i: number) => F.has(i) || U.has(i);
  const wk: Pt[][] = [], wkU: Pt[][] = [], land: Pt[][] = [], outline: Pt[][] = [], fokus: Pt[][] = [];
  for (let ai = 0; ai < g.arcs.length; ai++) {
    const [a, b] = g.arcOwner[ai];
    const va = vis(a), vb = b >= 0 && vis(b);
    if (va && vb) {
      if (g.areas[a].bl !== g.areas[b].bl) land.push(g.arcs[ai]);
      else if (linesMode && (U.has(a) || U.has(b))) wkU.push(g.arcs[ai]);
      else wk.push(g.arcs[ai]);
    } else if (va || vb) outline.push(g.arcs[ai]);
    const fa = F.has(a), fb = b >= 0 && F.has(b);
    if (fa !== fb) fokus.push(g.arcs[ai]);
  }
  const m = { wk, wkU, land, outline, fokus, linesMode };
  if (meshCache.size > 40) meshCache.clear();
  meshCache.set(key, m);
  return m;
}
export const fokusBBox = (doc: Doc) => bboxOfIds(geoOf(doc), fokusIdx(doc));
export const insetBBox = (doc: Doc) => bboxOfIds(geoOf(doc), insetIdx(doc));
