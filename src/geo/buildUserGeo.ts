// Eingelesene Flächen → Gebietsstand im Kartenwerk-Format: Raster (UTM 32, 10 m), gemeinsame Grenzen als Bögen,
// bogenweise vereinfacht (Nachbarn bleiben deckungsgleich), Beschriftungspunkt, Fläche, Land.
import { topology } from 'topojson-server';
import polylabel from 'polylabel';
import { GEO, Pt, RawArea, dp } from './geo';
import { Crs, toGridFn } from './crs';
import { areaAt } from './relate';
import type { GeoLayer, Prop } from './readers';

export interface UserGeoOpts {
  crs: Crs; idField: string | null; nameField: string | null;
  tol: number;                 // Vereinfachung in Rasterzellen (1 = 10 m)
}
export interface UserGeoRaw { arcs: number[][]; areas: RawArea[]; keyLen?: number }
export interface UserGeoReport {
  areas: number; features: number;
  merged: string[];            // Kennungen, die in mehreren Zeilen vorkamen (zu einer Fläche zusammengefasst)
  noId: number;                // Zeilen ohne Kennung (fortlaufend nummeriert)
  dropped: number;             // Flächen, die im 10-m-Raster verschwinden
  outside: number;             // Beschriftungspunkt außerhalb Deutschlands
  points: number; bytes: number;
}

const deltaEnc = (pts: Pt[]) => { const r: number[] = []; let px = 0, py = 0; for (const [x, y] of pts) { r.push(x - px, y - py); px = x; py = y; } return r; };
const ringArea = (r: Pt[]) => { let s = 0; for (let i = 0, n = r.length; i < n; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % n]; s += x1 * y2 - x2 * y1; } return s / 2; };
const str = (v: Prop | undefined) => (v == null ? '' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(v)) : String(v)).trim();

/** Flächen auf das Raster bringen und säubern (doppelte Punkte, geschlossene Ringe, zu kleine Ringe) */
function toGridPolys(polys: number[][][][], f: (x: number, y: number) => [number, number]): Pt[][][] {
  const out: Pt[][][] = [];
  for (const poly of polys) {
    const rings: Pt[][] = [];
    for (const r of poly) {
      const g: Pt[] = [];
      for (const [x, y] of r) { const p = f(x, y), q = g[g.length - 1]; if (!q || q[0] !== p[0] || q[1] !== p[1]) g.push(p); }
      if (g.length > 1 && g[0][0] === g[g.length - 1][0] && g[0][1] === g[g.length - 1][1]) g.pop();
      if (g.length < 3 || Math.abs(ringArea(g)) < 0.5) continue;
      g.push([g[0][0], g[0][1]]);
      rings.push(g);
    }
    if (rings.length && rings[0].length) out.push(rings);
  }
  return out;
}

export function buildUserGeo(layer: GeoLayer, o: UserGeoOpts): { raw: UserGeoRaw; report: UserGeoReport } {
  const f = toGridFn(o.crs);
  // 1. Zeilen nach Kennung zusammenfassen
  const groups = new Map<string, { id: string; name: string; polys: number[][][][] }>();
  const merged = new Set<string>(); let noId = 0;
  layer.features.forEach((ft, k) => {
    let id = o.idField ? str(ft.props[o.idField]) : '';
    if (!id) { id = String(k + 1); if (o.idField) noId++; }
    const name = (o.nameField ? str(ft.props[o.nameField]) : '') || id;
    const g = groups.get(id);
    if (g) { g.polys.push(...ft.polys); merged.add(id); } else groups.set(id, { id, name, polys: [...ft.polys] });
  });
  // 2. Raster
  const items: { id: string; name: string; polys: Pt[][][] }[] = []; let dropped = 0;
  for (const g of groups.values()) { const polys = toGridPolys(g.polys, f); if (polys.length) items.push({ id: g.id, name: g.name, polys }); else dropped++; }
  if (!items.length) throw new Error('Nach dem Umrechnen bleiben keine Flächen übrig. Stimmt das Koordinatensystem?');
  // 3. Topologie: gemeinsame Grenzen werden zu gemeinsamen Bögen
  const fc = { type: 'FeatureCollection' as const, features: items.map((it, k) => ({ type: 'Feature' as const, properties: { k }, geometry: { type: 'MultiPolygon' as const, coordinates: it.polys } })) };
  const topo = topology({ a: fc } as never) as unknown as { arcs: Pt[][]; objects: { a: { geometries: { type: string; arcs?: number[][] | number[][][]; properties: { k: number } }[] } } };
  // 4. bogenweise vereinfachen
  const arcs0 = topo.arcs.map(a => (o.tol > 0 ? dp(a, o.tol) : a));
  const ringPts = (ring: number[]) => { const pts: Pt[] = []; for (const ai of ring) { const a = ai >= 0 ? arcs0[ai] : arcs0[~ai].slice().reverse(); for (let i = pts.length ? 1 : 0; i < a.length; i++) pts.push(a[i]); } return pts; };
  // 5. Gebiete; nicht benutzte Bögen fallen weg
  const used = new Map<number, number>(); const arcsOut: Pt[][] = [];
  const remap = (ai: number) => { const k = ai >= 0 ? ai : ~ai; let n = used.get(k); if (n == null) { n = arcsOut.length; used.set(k, n); arcsOut.push(arcs0[k]); } return ai >= 0 ? n : ~n; };
  const wk = GEO['btw-wk-2025'] || Object.values(GEO).find(g => g.meta.level === 'btw-wk');
  let outside = 0;
  const areas: RawArea[] = [];
  for (const geom of topo.objects.a.geometries) {
    const it = items[geom.properties.k];
    const polysArcs = (geom.type === 'Polygon' ? [geom.arcs as number[][]] : (geom.arcs as number[][][]) || []);
    let area = 0, best: Pt[][] | null = null, bestA = -1; const keep: number[][][] = [];
    for (const poly of polysArcs) {
      const rings = poly.map(ringPts);
      const aOut = Math.abs(ringArea(rings[0] || []));
      if (aOut < 0.5) continue;                                         // durch die Vereinfachung verschwunden
      let holes = 0; const kr: number[][] = [poly[0]];
      for (let r = 1; r < poly.length; r++) { const ah = Math.abs(ringArea(rings[r])); if (ah >= 0.5) { holes += ah; kr.push(poly[r]); } }
      area += aOut - holes; keep.push(kr);
      if (aOut > bestA) { bestA = aOut; best = [rings[0], ...kr.slice(1).map(ringPts)]; }
    }
    if (!keep.length || !best) { dropped++; continue; }
    const prec = Math.max(0.5, Math.sqrt(bestA) / 60);
    const lp = polylabel(best as unknown as number[][][], prec);
    const label: Pt = [Math.round(lp[0]), Math.round(lp[1])];
    let bl = '';
    if (wk) {
      const i = areaAt(wk, label);
      if (i != null) bl = wk.areas[i].bl;
      else { outside++; let bd = Infinity; for (const a of wk.areas) { const d = (a.label[0] - label[0]) ** 2 + (a.label[1] - label[1]) ** 2; if (d < bd) { bd = d; bl = a.bl; } } }
    }
    areas.push({ id: it.id, name: it.name, bl: bl || '00', area: Math.round(area * 100 / 1e6 * 1000) / 1000, label, polys: keep.map(p => p.map(r => r.map(remap))) });
  }
  // 6. Nummern und Schlüssellänge: rein numerische Kennungen gleicher Länge mit führenden Nullen behalten ihre Länge
  const allNum = areas.every(a => /^\d+$/.test(a.id));
  const lens = new Set(areas.map(a => a.id.length));
  const keyLen = allNum && lens.size === 1 && areas.some(a => a.id.startsWith('0')) ? [...lens][0] : undefined;
  if (allNum && !keyLen) for (const a of areas) a.id = a.id.replace(/^0+(?=\d)/, '');
  areas.forEach((a, k) => { a.nr = allNum && a.id.length <= 15 ? Number(a.id) : k + 1; });
  const raw: UserGeoRaw = { arcs: arcsOut.map(deltaEnc), areas, ...(keyLen ? { keyLen } : {}) };
  const points = arcsOut.reduce((s, a) => s + a.length, 0);
  return { raw, report: { areas: areas.length, features: layer.features.length, merged: [...merged], noId, dropped, outside, points, bytes: JSON.stringify(raw).length } };
}
