import { loadJSON } from '../lib/assets';
import { BBox, emptyBBox } from '../lib/util';

export type Pt = [number, number];
export type Poly = Pt[][];
export interface GeoMeta {
  id: string; label: string; level: string; levelLabel: string; election: string; year: number; count: number;
  attribution: string; source: string; grid: number; origin: [number, number]; crs: string;
  stand?: string;      // Gebietsstand der Verwaltungsgrenzen, z. B. „01.01.2025“
  keyLen?: number;     // feste Schlüssellänge mit führenden Nullen (Verwaltungsgebiete), sonst Nummern
  showNr?: boolean;    // Nummer vor dem Namen zeigen (Wahlkreise)
  file?: string;       // Datei, deren Topologie sich mehrere Ebenen teilen
  base?: string;       // eigene Einteilung: Gebietsstand der Bausteine
}
export interface Area {
  i: number; id: string; nr: number; name: string; bl: string; area: number; label: Pt; nb: number[]; bbox: BBox;
  ra: number[][][];                  // Ringe als Bogen-Verweise (Topologie)
  kr?: string; bez?: string; ars?: string; free?: boolean;   // Verwaltungsgebiete: Kreis, Bezeichnung, Regionalschlüssel, gemeindefrei
  par?: Record<string, string>;      // übergeordnete Gebiete anderer Gebietsstände (Stand-ID → Kennung), z. B. Wahlbezirk → Wahlkreis
  readonly polys: Poly[]; readonly d: string;   // volle Auflösung, erst bei Bedarf berechnet
}
export interface GeoSet {
  meta: GeoMeta; arcs: Pt[][]; arcOwner: [number, number][]; areas: Area[];
  byId: Map<string, number>; byBl: Record<string, number[]>; all: number[];
  byKr: Record<string, number[]>; krName: Record<string, string>;
  points: number;
  memberOf?: Int32Array;   // eigene Einteilung: Region je Gebiet des Bausteins (-1 = keine)
  memberN?: number[];      // eigene Einteilung: Zahl der Bausteine je Region
}
export interface Shape { name: string; code?: string; polys: Poly[]; bbox: BBox; d: string }
export interface GeoIndexEntry {
  id: string; label: string; level: string; levelLabel: string; election: string; year: number;
  file?: string; part?: string; lazy?: boolean; stand?: string; count?: number;
  hint?: string;       // wofür der Stand passt („aktuell“, „passt zur Bundestagswahl 2025“)
  region?: string;     // Gebiete nur einer Region (z. B. „Berlin“): eigene Gruppe in der Auswahl
}

export const LAENDER: Record<string, [string, string]> = {
  '01': ['Schleswig-Holstein', 'SH'], '02': ['Hamburg', 'HH'], '03': ['Niedersachsen', 'NI'], '04': ['Bremen', 'HB'],
  '05': ['Nordrhein-Westfalen', 'NW'], '06': ['Hessen', 'HE'], '07': ['Rheinland-Pfalz', 'RP'], '08': ['Baden-Württemberg', 'BW'],
  '09': ['Bayern', 'BY'], '10': ['Saarland', 'SL'], '11': ['Berlin', 'BE'], '12': ['Brandenburg', 'BB'],
  '13': ['Mecklenburg-Vorpommern', 'MV'], '14': ['Sachsen', 'SN'], '15': ['Sachsen-Anhalt', 'ST'], '16': ['Thüringen', 'TH'],
};
export const BL_ORDER = Object.keys(LAENDER).sort();
/** Reihenfolge der Ebenen in Auswahllisten, von groß nach klein */
export const LEVEL_ORDER = ['btw-wk', 'lan', 'rbz', 'krs', 'vwg', 'gem', 'be-wk', 'be-bez', 'be-bwb', 'be-wbz'];
/** Schlüssellänge je Verwaltungsebene (ARS-Präfix bzw. AGS bei Gemeinden) */
export const KEY_LEN: Record<string, number> = { lan: 2, rbz: 3, krs: 5, vwg: 9, gem: 8 };

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
    if (!ring.length) continue;
    d += 'M' + ring[0][0] + ' ' + ring[0][1];
    for (let i = 1; i < ring.length; i++) d += 'L' + ring[i][0] + ' ' + ring[i][1];
    d += 'Z';
  }
  return d;
};
export const linesD = (lines: Pt[][]) => {
  let d = '';
  for (const l of lines) { if (!l.length) continue; d += 'M' + l[0][0] + ' ' + l[0][1]; for (let i = 1; i < l.length; i++) d += 'L' + l[i][0] + ' ' + l[i][1]; }
  return d;
};
const ringFrom = (arcs: Pt[][], ring: number[]) => { const pts: Pt[] = []; for (const ai of ring) { const a = ai >= 0 ? arcs[ai] : arcs[~ai].slice().reverse(); for (let i = pts.length ? 1 : 0; i < a.length; i++) pts.push(a[i]); } return pts; };

export const GEO: Record<string, GeoSet> = {};
export let GEO_INDEX: GeoIndexEntry[] = [];
export const CONTEXT: { countries: Shape[]; lakes: Shape[] } = { countries: [], lakes: [] };

export interface RawArea { id: string; nr?: number; name: string; bl: string; area: number; label: Pt; nb?: number[]; polys: number[][][]; kr?: string; bez?: string; ars?: string; free?: 1; p?: string[] }
export interface RawSet { meta: GeoMeta; arcs: number[][]; arcOwner: [number, number][]; areas: RawArea[] }
interface RawLevel { level: string; levelLabel: string; label: string; areas: RawArea[]; keyLen?: number }
interface RawFile { meta: Omit<GeoMeta, 'id' | 'label' | 'level' | 'levelLabel' | 'count'>; arcs: number[][]; levels: Record<string, RawLevel>; parents?: string[]; krFrom?: string }

/** Gebiete mit Bogen-Verweisen; Koordinaten und Pfad erst beim ersten Zugriff */
function mkAreas(raws: RawArea[], arcs: Pt[][], arcBox: BBox[], parents?: string[], krFrom?: string): Area[] {
  return raws.map((a, i) => {
    const bb = emptyBBox();
    for (const poly of a.polys) for (const ai of poly[0] || []) { const b = arcBox[ai >= 0 ? ai : ~ai]; if (b[0] < bb[0]) bb[0] = b[0]; if (b[1] < bb[1]) bb[1] = b[1]; if (b[2] > bb[2]) bb[2] = b[2]; if (b[3] > bb[3]) bb[3] = b[3]; }
    let polys: Poly[] | null = null, d: string | null = null;
    const ar: Area = {
      i, id: a.id, nr: a.nr ?? Number(a.id), name: a.name, bl: a.bl, area: a.area, label: a.label, nb: a.nb || [], bbox: bb, ra: a.polys,
      ...(a.kr ? { kr: a.kr } : {}), ...(a.bez ? { bez: a.bez } : {}), ...(a.ars ? { ars: a.ars } : {}), ...(a.free ? { free: true } : {}),
      ...(a.p && parents ? { par: Object.fromEntries(parents.map((pid, k) => [pid, a.p![k]] as [string, string]).filter(x => x[1])) } : {}),
      ...(a.p && parents && krFrom && !a.kr && parents.indexOf(krFrom) >= 0 && a.p[parents.indexOf(krFrom)] ? { kr: a.p[parents.indexOf(krFrom)] } : {}),
      get polys() { return polys ||= a.polys.map(p => p.map(r => ringFrom(arcs, r))); },
      get d() { return d ||= polysD(this.polys); },
    };
    return ar;
  });
}
function finishSet(meta: GeoMeta, arcs: Pt[][], areas: Area[], arcOwner?: [number, number][]): GeoSet {
  if (!arcOwner) {
    const own: number[][] = arcs.map(() => []);
    for (const a of areas) for (const poly of a.ra) for (const ring of poly) for (const ai of ring) { const o = own[ai >= 0 ? ai : ~ai]; if (o[o.length - 1] !== a.i) o.push(a.i); }
    arcOwner = own.map(o => { const u = [...new Set(o)]; return [u.length ? u[0] : -1, u.length > 1 ? u[1] : -1]; });
    const nb = areas.map(() => new Set<number>());
    for (const [x, y] of arcOwner) if (x >= 0 && y >= 0) { nb[x].add(y); nb[y].add(x); }
    areas.forEach((a, i) => { a.nb = [...nb[i]]; });
  }
  const byId = new Map(areas.map(a => [a.id, a.i]));
  const byBl: Record<string, number[]> = {}, byKr: Record<string, number[]> = {};
  for (const a of areas) { (byBl[a.bl] ||= []).push(a.i); if (a.kr) (byKr[a.kr] ||= []).push(a.i); }
  const cmp = (x: number, y: number) => areas[x].nr - areas[y].nr || areas[x].name.localeCompare(areas[y].name, 'de');
  for (const k in byBl) byBl[k].sort(cmp);
  for (const k in byKr) byKr[k].sort(cmp);
  const all = areas.map(a => a.i).sort(cmp);
  let points = 0; for (const a of arcs) points += a.length;
  return { meta: { ...meta, count: areas.length }, arcs, arcOwner, areas, byId, byBl, all, byKr, krName: {}, points };
}
function arcBoxes(arcs: Pt[][]): BBox[] {
  return arcs.map(a => { const b = emptyBBox(); for (const [x, y] of a) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; } return b; });
}

const fileLoads = new Map<string, Promise<void>>();
async function loadFile(file: string): Promise<void> {
  const raw = await loadJSON<RawSet | RawFile>('data/' + file);
  const arcs = raw.arcs.map(decode), boxes = arcBoxes(arcs);
  if ('levels' in raw) {
    const sets: GeoSet[] = [];
    for (const [part, L] of Object.entries(raw.levels)) {
      const e = GEO_INDEX.find(s => s.file === file && s.part === part); if (!e) continue;
      const meta: GeoMeta = { ...raw.meta, id: e.id, label: e.label, level: L.level, levelLabel: L.levelLabel, count: 0, keyLen: L.keyLen ?? KEY_LEN[L.level], showNr: false, file };
      const g = finishSet(meta, arcs, mkAreas(L.areas, arcs, boxes, raw.parents, e.id === raw.krFrom ? undefined : raw.krFrom));
      GEO[e.id] = g; sets.push(g);
    }
    // Kreisnamen für Gebiete unterhalb der Kreise (Baum, Tooltips)
    const krs = sets.find(g => g.meta.level === 'krs') || (raw.krFrom ? GEO[raw.krFrom] : undefined);
    if (krs) { const names: Record<string, string> = {}; for (const a of krs.areas) names[a.id] = a.name; for (const g of sets) g.krName = names; }
  } else {
    const s = raw as RawSet;
    const e = GEO_INDEX.find(x => (x.file || x.id + '.json') === file)!;
    const meta: GeoMeta = { ...s.meta, showNr: true, file };
    GEO[e.id] = finishSet(meta, arcs, mkAreas(s.areas, arcs, boxes), s.arcOwner);
  }
}
/** Gebietsstand aus Rohdaten (Bögen deltakodiert), z. B. für importierte Geodaten im Projekt */
export function setFromRaw(meta: GeoMeta, raw: { arcs: number[][]; areas: RawArea[]; arcOwner?: [number, number][] }): GeoSet {
  const arcs = raw.arcs.map(decode);
  return finishSet(meta, arcs, mkAreas(raw.areas, arcs, arcBoxes(arcs)), raw.arcOwner);
}
const fileOf = (id: string) => { const e = GEO_INDEX.find(s => s.id === id); return e ? (e.file || e.id + '.json') : null; };
/** Lädt die Geometrien der genannten Gebietsstände, falls noch nicht geschehen. */
export async function ensureGeo(ids: (string | null | undefined)[]): Promise<void> {
  const files = new Set<string>();
  for (const id of ids) { if (!id || GEO[id]) continue; const f = fileOf(id); if (!f) throw new Error('Unbekannter Gebietsstand: ' + id); files.add(f); }
  await Promise.all([...files].map(f => { let p = fileLoads.get(f); if (!p) { p = loadFile(f).catch(e => { fileLoads.delete(f); throw e; }); fileLoads.set(f, p); } return p; }));
}
export const geoEntry = (id: string) => GEO_INDEX.find(s => s.id === id);
export const geoLabel = (id: string) => GEO[id]?.meta.label || geoEntry(id)?.label || id;

export async function loadGeo() {
  const idx = await loadJSON<{ sets: GeoIndexEntry[] }>('data/index.json');
  GEO_INDEX = idx.sets;
  await ensureGeo(idx.sets.filter(s => !s.lazy).map(s => s.id));
  const ctx = await loadJSON<{ countries: { name: string; code: string; polys: number[][][] }[]; lakes: { name: string; polys: number[][][] }[] }>('data/context.json');
  const mk = (c: { name: string; code?: string; polys: number[][][] }): Shape => { const polys = c.polys.map(p => p.map(decode)); return { name: c.name, code: c.code, polys, bbox: bboxOf(polys), d: polysD(polys) }; };
  CONTEXT.countries = ctx.countries.map(mk);
  CONTEXT.lakes = ctx.lakes.map(mk);
}

// ---------- Detailstufen ----------
// Große Gebietsstände (Gemeinden) werden je nach Maßstab vereinfacht gezeichnet.
// Jeder Bogen wird für sich vereinfacht (Endpunkte bleiben), so bleiben Nachbarflächen deckungsgleich.
export function dp(pts: Pt[], tol: number): Pt[] {
  const n = pts.length; if (n <= 2) return pts;
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const stack: number[] = [0, n - 1], t2 = tol * tol;
  while (stack.length) {
    const b = stack.pop()!, a = stack.pop()!;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let best = -1, bd = t2;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let d2: number;
      if (L === 0) d2 = (px - ax) ** 2 + (py - ay) ** 2;
      else { const c = (px - ax) * dy - (py - ay) * dx; d2 = c * c / L; }
      if (d2 > bd) { bd = d2; best = i; }
    }
    if (best > 0) { keep[best] = 1; stack.push(a, best, best, b); }
  }
  const out: Pt[] = []; for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
  // geschlossene Bögen (Inseln) nicht zu Strichen zusammenfallen lassen
  if (out.length < 4 && pts[0][0] === pts[n - 1][0] && pts[0][1] === pts[n - 1][1] && n >= 4) { const s = Math.floor((n - 1) / 3); return [pts[0], pts[s], pts[2 * s], pts[n - 1]]; }
  return out;
}
const LOD_MIN_POINTS = 150000;
const lodArcs = new WeakMap<Pt[][], Map<number, Pt[][]>>();
const lodD = new WeakMap<GeoSet, Map<number, (string | undefined)[]>>();
/** Toleranz im Kartenraster für einen Maßstab (k = px je Rastereinheit); 0 = volle Auflösung */
export function lodTol(g: GeoSet, k: number, zoom = 1): number {
  if (g.points < LOD_MIN_POINTS) return 0;
  const t = 0.45 / (k * Math.max(1, Math.min(zoom, 4)));
  if (t < 1.5) return 0;
  return 2 ** Math.floor(Math.log2(t));   // Stufen, damit der Zwischenspeicher trifft
}
export function arcsAt(g: GeoSet, tol: number): Pt[][] {
  if (!tol) return g.arcs;
  let m = lodArcs.get(g.arcs); if (!m) { m = new Map(); lodArcs.set(g.arcs, m); }
  let a = m.get(tol); if (!a) { a = g.arcs.map(x => dp(x, tol)); m.set(tol, a); }
  return a;
}
export function polysAt(g: GeoSet, i: number, tol: number): Poly[] {
  if (!tol) return g.areas[i].polys;
  const arcs = arcsAt(g, tol);
  return g.areas[i].ra.map(p => p.map(r => ringFrom(arcs, r)));
}
export function areaD(g: GeoSet, i: number, tol = 0): string {
  if (!tol) return g.areas[i].d;
  let m = lodD.get(g); if (!m) { m = new Map(); lodD.set(g, m); }
  let c = m.get(tol); if (!c) { c = new Array(g.areas.length); m.set(tol, c); }
  return c[i] ??= polysD(polysAt(g, i, tol));
}
export const arcLines = (g: GeoSet, idx: number[], tol = 0): Pt[][] => { const a = arcsAt(g, tol); return idx.map(i => a[i]); };

export const bboxOfIds = (g: GeoSet, ids: number[]): BBox => {
  const bb = emptyBBox();
  for (const i of ids) { const b = g.areas[i].bbox; bb[0] = Math.min(bb[0], b[0]); bb[1] = Math.min(bb[1], b[1]); bb[2] = Math.max(bb[2], b[2]); bb[3] = Math.max(bb[3], b[3]); }
  return bb;
};
/** Anzeigename eines Gebiets: Wahlkreise mit Nummer, Verwaltungsgebiete mit Namen */
export const areaTitle = (g: GeoSet, i: number) => { const a = g.areas[i]; return g.meta.showNr ? `${a.nr} · ${a.name}` : a.name; };
export const areaLabel = (g: GeoSet, i: number) => g.meta.showNr ? `${g.areas[i].nr} ${g.areas[i].name}` : g.areas[i].name;
/** Zusatz für Listen und Tooltips: Land, bei Gemeinden auch der Kreis */
const PLURAL: Record<string, string> = { 'btw-wk': 'Wahlkreise', lan: 'Länder', rbz: 'Bezirke', krs: 'Kreise', vwg: 'Verbände', gem: 'Gemeinden', 'be-wk': 'Wahlkreise', 'be-bez': 'Bezirke', 'be-bwb': 'Briefwahlbezirke', 'be-wbz': 'Wahlbezirke' };
const SINGULAR: Record<string, string> = { 'btw-wk': 'Wahlkreis', lan: 'Land', rbz: 'Bezirk', krs: 'Kreis', vwg: 'Verband', gem: 'Gemeinde', 'be-wk': 'Wahlkreis', 'be-bez': 'Bezirk', 'be-bwb': 'Briefwahlbezirk', 'be-wbz': 'Wahlbezirk' };
/** „12 Kreise“, „1 Gemeinde“ */
export const countLabel = (n: number, level: string) => `${n.toLocaleString('de-DE')} ${n === 1 ? SINGULAR[level] || 'Gebiet' : PLURAL[level] || 'Gebiete'}`;
export function areaContext(g: GeoSet, i: number): string {
  const a = g.areas[i], land = LAENDER[a.bl]?.[0] || a.bl;
  if (g.memberN && g.meta.base) { const n = countLabel(g.memberN[i] || 0, GEO[g.meta.base]?.meta.level || ''); return a.free ? `ohne Region · ${n} · ${land}` : n; }
  if (a.kr && g.meta.level !== 'krs') { const k = g.krName[a.kr]; if (k && k !== a.name) return `${k} · ${land}`; }
  return land;
}
/** Schlüssel aus einer Datentabelle auf die Kennung des Gebietsstands bringen */
export function normKey(meta: Pick<GeoMeta, 'keyLen' | 'level'>, raw: string): string {
  const s = raw.trim().replace(/\s+/g, '');
  if (!meta.keyLen) return s.replace(/^0+(?=\d)/, '');
  if (!/^\d+$/.test(s)) return s;
  const L = meta.keyLen;
  if (s.length === 12) {                       // Regionalschlüssel (ARS)
    if (meta.level === 'gem') return s.slice(0, 5) + s.slice(9);
    return s.slice(0, L);
  }
  if (s.length < L) return s.padStart(L, '0');
  return s;
}

/** Gebiete zu Flächen zusammenfassen: innere Grenzen entfallen, die Außenränder werden zu Ringen aus Bögen verkettet
 *  (für eigene Gebiete und für den Export, eine Fläche je Farbe). */
export function mergedArcRings(g: GeoSet, ids: Iterable<number>): number[][] {
  const S = new Set(ids); if (!S.size) return [];
  const used: number[] = [];
  for (const i of S) for (const poly of g.areas[i].ra) for (const ring of poly) for (const ai of ring) {
    const k = ai >= 0 ? ai : ~ai, [a, b] = g.arcOwner[k];
    if (a >= 0 && b >= 0 && a !== b && S.has(a) && S.has(b)) continue;   // innere Grenze
    used.push(ai);
  }
  const end0 = (ai: number) => { const a = g.arcs[ai >= 0 ? ai : ~ai]; return ai >= 0 ? a[0] : a[a.length - 1]; };
  const end1 = (ai: number) => { const a = g.arcs[ai >= 0 ? ai : ~ai]; return ai >= 0 ? a[a.length - 1] : a[0]; };
  const key = (p: Pt) => p[0] + ',' + p[1];
  const byStart = new Map<string, number[]>();
  for (const ai of used) { const k = key(end0(ai)); const L = byStart.get(k); if (L) L.push(ai); else byStart.set(k, [ai]); }
  const done = new Set<number>(), rings: number[][] = [];
  for (const first of used) {
    if (done.has(first)) continue;
    const ring: number[] = []; let cur = first; const start = key(end0(first));
    for (let guard = 0; guard < used.length + 1; guard++) {
      done.add(cur); ring.push(cur);
      const end = key(end1(cur));
      if (end === start) break;
      const next = (byStart.get(end) || []).find(x => !done.has(x));
      if (next == null) break;
      cur = next;
    }
    rings.push(ring);
  }
  return rings;
}
export function mergedRings(g: GeoSet, ids: Iterable<number>, tol = 0): Pt[][] {
  const arcs = arcsAt(g, tol);
  return mergedArcRings(g, ids).map(r => ringFrom(arcs, r)).filter(r => r.length >= 4);
}

/** Eigene Einteilung: Regionen aus Gebieten eines Gebietsstands, als eigener Gebietsstand auf derselben Topologie.
 *  `free` = neutrale Restfläche (übrige Bausteine ohne Region, keine Daten). */
export interface RegionDef { id: string; name: string; members: number[]; free?: boolean }
export function buildRegionSet(id: string, label: string, base: GeoSet, defs: RegionDef[]): GeoSet {
  const memberOf = new Int32Array(base.areas.length).fill(-1);
  const raws: RawArea[] = [];
  for (const r of defs) {
    if (!r.members.length) continue;
    const k = raws.length;
    for (const i of r.members) memberOf[i] = k;
    const rings = mergedArcRings(base, r.members);
    // Beschriftung: Punkt des Bausteins, der dem Schwerpunkt der Region am nächsten liegt
    let sa = 0, sx = 0, sy = 0; for (const i of r.members) { const a = base.areas[i]; sa += a.area; sx += a.label[0] * a.area; sy += a.label[1] * a.area; }
    const cx = sx / (sa || 1), cy = sy / (sa || 1);
    let best = r.members[0], bd = Infinity; for (const i of r.members) { const [x, y] = base.areas[i].label, dd = (x - cx) ** 2 + (y - cy) ** 2; if (dd < bd) { bd = dd; best = i; } }
    const bls: Record<string, number> = {}; for (const i of r.members) bls[base.areas[i].bl] = (bls[base.areas[i].bl] || 0) + base.areas[i].area;
    const nr = /^\d+$/.test(r.id) ? +r.id : 10000 + k;
    raws.push({ id: r.id, nr, name: r.name, bl: Object.entries(bls).sort((x, y) => y[1] - x[1])[0]?.[0] || '00', area: Math.round(sa * 10) / 10, label: base.areas[best].label, polys: rings.map(rg => [rg]), ...(r.free ? { free: 1 as const } : {}) });
  }
  const meta: GeoMeta = { ...base.meta, id, label, level: 'custom', levelLabel: 'Regionen', count: 0, keyLen: undefined, showNr: false, base: base.meta.id };
  const g = finishSet(meta, base.arcs, mkAreas(raws, base.arcs, arcBoxes(base.arcs)));
  g.memberOf = memberOf;
  g.memberN = raws.map(() => 0); for (const k of memberOf) if (k >= 0) g.memberN[k]++;
  return g;
}
