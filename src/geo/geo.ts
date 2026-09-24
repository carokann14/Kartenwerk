import { loadJSON } from '../lib/assets';
import { BBox, emptyBBox } from '../lib/util';

export type Pt = [number, number];
export type Poly = Pt[][];
export interface GeoMeta {
  id: string; label: string; level: string; levelLabel: string; election: string; year: number; count: number;
  attribution: string; source: string; grid: number; origin: [number, number]; crs: string;
}
export interface Area { i: number; id: string; nr: number; name: string; bl: string; area: number; label: Pt; nb: number[]; polys: Poly[]; bbox: BBox; d: string }
export interface GeoSet {
  meta: GeoMeta; arcs: Pt[][]; arcOwner: [number, number][]; areas: Area[];
  byId: Map<string, number>; byBl: Record<string, number[]>; all: number[];
}
export interface Shape { name: string; code?: string; polys: Poly[]; bbox: BBox; d: string }
export interface GeoIndexEntry { id: string; label: string; level: string; levelLabel: string; election: string; year: number }

export const LAENDER: Record<string, [string, string]> = {
  '01': ['Schleswig-Holstein', 'SH'], '02': ['Hamburg', 'HH'], '03': ['Niedersachsen', 'NI'], '04': ['Bremen', 'HB'],
  '05': ['Nordrhein-Westfalen', 'NW'], '06': ['Hessen', 'HE'], '07': ['Rheinland-Pfalz', 'RP'], '08': ['Baden-Württemberg', 'BW'],
  '09': ['Bayern', 'BY'], '10': ['Saarland', 'SL'], '11': ['Berlin', 'BE'], '12': ['Brandenburg', 'BB'],
  '13': ['Mecklenburg-Vorpommern', 'MV'], '14': ['Sachsen', 'SN'], '15': ['Sachsen-Anhalt', 'ST'], '16': ['Thüringen', 'TH'],
};
export const BL_ORDER = Object.keys(LAENDER).sort();

const decode = (enc: number[]): Pt[] => { const pts: Pt[] = []; let x = 0, y = 0; for (let i = 0; i < enc.length; i += 2) { x += enc[i]; y += enc[i + 1]; pts.push([x, y]); } return pts; };
export const bboxOf = (polys: Poly[], bb: BBox = emptyBBox()): BBox => {
  for (const poly of polys) for (const ring of poly) for (const [x, y] of ring) {
    if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (x > bb[2]) bb[2] = x; if (y > bb[3]) bb[3] = y;
  }
  return bb;
};
export const polysD = (polys: Poly[]) => {
  let d = '';
  for (const poly of polys) for (const ring of poly) {
    d += 'M' + ring[0][0] + ' ' + ring[0][1];
    for (let i = 1; i < ring.length; i++) d += 'L' + ring[i][0] + ' ' + ring[i][1];
    d += 'Z';
  }
  return d;
};
export const linesD = (lines: Pt[][]) => {
  let d = '';
  for (const l of lines) { d += 'M' + l[0][0] + ' ' + l[0][1]; for (let i = 1; i < l.length; i++) d += 'L' + l[i][0] + ' ' + l[i][1]; }
  return d;
};

export const GEO: Record<string, GeoSet> = {};
export let GEO_INDEX: GeoIndexEntry[] = [];
export const CONTEXT: { countries: Shape[]; lakes: Shape[] } = { countries: [], lakes: [] };

interface RawSet { meta: GeoMeta; arcs: number[][]; arcOwner: [number, number][]; areas: { id: string; nr: number; name: string; bl: string; area: number; label: Pt; nb: number[]; polys: number[][][] }[] }
export async function loadGeo() {
  const idx = await loadJSON<{ sets: GeoIndexEntry[] }>('data/index.json');
  GEO_INDEX = idx.sets;
  await Promise.all(idx.sets.map(async s => {
    const raw = await loadJSON<RawSet>(`data/${s.id}.json`);
    const arcs = raw.arcs.map(decode);
    const ringFromArcs = (ring: number[]) => { const pts: Pt[] = []; for (const ai of ring) { const a = ai >= 0 ? arcs[ai] : arcs[~ai].slice().reverse(); for (let i = pts.length ? 1 : 0; i < a.length; i++) pts.push(a[i]); } return pts; };
    const areas: Area[] = raw.areas.map((a, i) => {
      const polys = a.polys.map(poly => poly.map(ringFromArcs));
      return { i, id: a.id, nr: a.nr, name: a.name, bl: a.bl, area: a.area, label: a.label, nb: a.nb, polys, bbox: bboxOf(polys), d: polysD(polys) };
    });
    const byId = new Map(areas.map(a => [a.id, a.i]));
    const byBl: Record<string, number[]> = {};
    for (const a of areas) (byBl[a.bl] ||= []).push(a.i);
    for (const bl in byBl) byBl[bl].sort((x, y) => areas[x].nr - areas[y].nr);
    const all = areas.map(a => a.i).sort((x, y) => areas[x].nr - areas[y].nr);
    GEO[s.id] = { meta: raw.meta, arcs, arcOwner: raw.arcOwner, areas, byId, byBl, all };
  }));
  const ctx = await loadJSON<{ countries: { name: string; code: string; polys: number[][][] }[]; lakes: { name: string; polys: number[][][] }[] }>('data/context.json');
  const mk = (c: { name: string; code?: string; polys: number[][][] }): Shape => { const polys = c.polys.map(p => p.map(decode)); return { name: c.name, code: c.code, polys, bbox: bboxOf(polys), d: polysD(polys) }; };
  CONTEXT.countries = ctx.countries.map(mk);
  CONTEXT.lakes = ctx.lakes.map(mk);
}

export const bboxOfIds = (g: GeoSet, ids: number[]): BBox => {
  const bb = emptyBBox();
  for (const i of ids) { const b = g.areas[i].bbox; bb[0] = Math.min(bb[0], b[0]); bb[1] = Math.min(bb[1], b[1]); bb[2] = Math.max(bb[2], b[2]); bb[3] = Math.max(bb[3], b[3]); }
  return bb;
};
export const areaLabel = (g: GeoSet, i: number) => `${g.areas[i].nr} ${g.areas[i].name}`;
