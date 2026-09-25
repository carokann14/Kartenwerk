// Geodateien einlesen: Shapefile (.shp/.dbf/.prj/.cpg, auch als ZIP), GeoJSON, KML/KMZ, GeoPackage.
// Ergebnis sind Ebenen mit Flächen (Polygone in den Koordinaten der Datei) und Attributen. Punkte und Linien werden gezählt, nicht übernommen.
import { unzipEntries } from '../data/parse';
import { Polys, readGpkg, wkbPolys } from './gpkg';

export type Prop = string | number | null;
export interface RawFeature { props: Record<string, Prop>; polys: Polys }
export interface GeoLayer {
  name: string; file: string; format: string;
  fields: string[]; features: RawFeature[];
  skipped: { other: number; empty: number };
  wkt: string | null; code: string | null;   // Angaben zum Koordinatensystem aus der Datei
  bbox: [number, number, number, number];
}
export interface InFile { name: string; buf: ArrayBuffer }

const base = (n: string) => n.split('/').pop()!.replace(/\.[^.]+$/, '');
const ext = (n: string) => (n.match(/\.([^.\/]+)$/)?.[1] || '').toLowerCase();

function bboxOf(fs: RawFeature[]): GeoLayer['bbox'] {
  const b: GeoLayer['bbox'] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of fs) for (const poly of f.polys) for (const r of poly) for (const [x, y] of r) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
  return b;
}
const ringArea = (r: number[][]) => { let s = 0; for (let i = 0, n = r.length; i < n; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % n]; s += x1 * y2 - x2 * y1; } return s / 2; };
function inRing(p: number[], r: number[][]) {
  let c = false; const [x, y] = p;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; }
  return c;
}
/** Shapefile-Ringe zu Polygonen ordnen: Außenringe im Uhrzeigersinn, Löcher dagegen; Löcher zum kleinsten umschließenden Außenring */
function groupRings(rings: number[][][]): Polys {
  const rs = rings.filter(r => r.length >= 3);
  if (rs.length <= 1) return rs.map(r => [r]);
  const a = rs.map(ringArea);
  let outerSign = -1;                                   // Uhrzeigersinn bei y nach oben = negative Fläche
  if (!a.some(x => x < 0)) outerSign = 1;               // Datei hält sich nicht an die Regel: alles sind Außenringe
  const outers = rs.map((r, i) => ({ r, i, A: Math.abs(a[i]) })).filter(o => Math.sign(a[o.i]) === outerSign || outerSign === 1);
  const polys = new Map<number, number[][][]>(outers.map(o => [o.i, [o.r]]));
  for (let i = 0; i < rs.length; i++) {
    if (polys.has(i)) continue;
    const host = outers.filter(o => inRing(rs[i][0], o.r)).sort((x, y) => x.A - y.A)[0];
    if (host) polys.get(host.i)!.push(rs[i]); else polys.set(i, [rs[i]]);
  }
  return [...polys.values()];
}

// ---------- Shapefile ----------
function readShp(buf: ArrayBuffer): { shapes: (Polys | null | 'other')[] } {
  const dv = new DataView(buf); const shapes: (Polys | null | 'other')[] = [];
  if (dv.getInt32(0, false) !== 9994) throw new Error('Die .shp-Datei ist beschädigt.');
  let p = 100;
  while (p + 12 <= buf.byteLength) {
    const len = dv.getInt32(p + 4, false) * 2, c = p + 8, t = dv.getInt32(c, true);
    if (t === 0) shapes.push(null);
    else if (t === 5 || t === 15 || t === 25) {
      const np = dv.getInt32(c + 36, true), n = dv.getInt32(c + 40, true), pts = c + 44 + 4 * np;
      const parts: number[] = []; for (let k = 0; k < np; k++) parts.push(dv.getInt32(c + 44 + 4 * k, true));
      const rings = parts.map((s, k) => { const e = k + 1 < np ? parts[k + 1] : n, r: number[][] = []; for (let i = s; i < e; i++) r.push([dv.getFloat64(pts + 16 * i, true), dv.getFloat64(pts + 16 * i + 8, true)]); return r; });
      shapes.push(groupRings(rings));
    } else shapes.push('other');
    p = c + len;
  }
  return { shapes };
}
const CPG: Record<string, string> = { 'utf-8': 'utf-8', utf8: 'utf-8', '65001': 'utf-8', '1252': 'windows-1252', 'ansi 1252': 'windows-1252', 'windows-1252': 'windows-1252', 'iso-8859-1': 'iso-8859-1', '88591': 'iso-8859-1', 'iso 88591': 'iso-8859-1', 'latin1': 'iso-8859-1', 'iso-8859-15': 'iso-8859-15' };
function readDbf(buf: ArrayBuffer, cpg: string | null): { fields: string[]; rows: Record<string, Prop>[] } {
  const u = new Uint8Array(buf), dv = new DataView(buf);
  const n = dv.getUint32(4, true), hl = dv.getUint16(8, true), rl = dv.getUint16(10, true);
  const fs: { name: string; type: string; len: number; dec: number; off: number }[] = [];
  let off = 1;
  for (let p = 32; p + 32 <= hl && u[p] !== 0x0d; p += 32) {
    let e = p; while (e < p + 11 && u[e]) e++;
    const f = { name: new TextDecoder('windows-1252').decode(u.subarray(p, e)).trim(), type: String.fromCharCode(u[p + 11]), len: u[p + 16], dec: u[p + 17], off };
    fs.push(f); off += f.len;
  }
  // Kodierung: .cpg, sonst UTF-8 versuchen, sonst Windows-1252
  let enc = cpg ? CPG[cpg.trim().toLowerCase()] || null : null;
  if (!enc) { try { new TextDecoder('utf-8', { fatal: true }).decode(u.subarray(hl, hl + n * rl)); enc = 'utf-8'; } catch { enc = 'windows-1252'; } }
  const td = new TextDecoder(enc);
  const rows: Record<string, Prop>[] = [];
  for (let i = 0; i < n; i++) {
    const r = hl + i * rl, o: Record<string, Prop> = {};
    for (const f of fs) {
      const s = td.decode(u.subarray(r + f.off, r + f.off + f.len)).replace(/\0+$/, '').trim();
      if (!s) o[f.name] = null;
      else if ((f.type === 'N' || f.type === 'F') && f.dec > 0 && /^-?[\d.]+(e[+-]?\d+)?$/i.test(s)) o[f.name] = parseFloat(s);
      else o[f.name] = s;
    }
    rows.push(o);
  }
  return { fields: fs.map(f => f.name), rows };
}
function shapefileLayer(name: string, file: string, shp: ArrayBuffer, dbf: ArrayBuffer | null, prj: string | null, cpg: string | null): GeoLayer {
  const { shapes } = readShp(shp);
  const d = dbf ? readDbf(dbf, cpg) : { fields: [], rows: [] };
  const features: RawFeature[] = []; const skipped = { other: 0, empty: 0 };
  shapes.forEach((s, i) => {
    if (s === 'other') { skipped.other++; return; }
    if (!s || !s.length) { skipped.empty++; return; }
    features.push({ props: d.rows[i] || {}, polys: s });
  });
  return { name, file, format: 'Shapefile', fields: d.fields, features, skipped, wkt: prj, code: null, bbox: bboxOf(features) };
}

// ---------- GeoJSON ----------
function geojsonLayer(name: string, file: string, text: string): GeoLayer {
  let j: { type?: string; features?: unknown[]; crs?: { properties?: { name?: string } }; geometry?: unknown; objects?: unknown };
  try { j = JSON.parse(text); } catch { throw new Error('Die Datei ist kein gültiges JSON.'); }
  if (j.type === 'Topology') throw new Error('TopoJSON wird noch nicht unterstützt. Bitte als GeoJSON oder Shapefile exportieren.');
  const feats: { properties?: Record<string, unknown>; geometry?: { type: string; coordinates?: unknown; geometries?: unknown[] } | null }[] =
    j.type === 'FeatureCollection' ? (j.features || []) as never : j.type === 'Feature' ? [j as never] : j.type ? [{ properties: {}, geometry: j as never }] : [];
  const features: RawFeature[] = []; const skipped = { other: 0, empty: 0 }; const fields = new Set<string>();
  const polysOf = (g: { type: string; coordinates?: unknown; geometries?: unknown[] } | null | undefined, out: Polys) => {
    if (!g) return;
    if (g.type === 'Polygon') out.push((g.coordinates as number[][][]).map(r => r.map(p => [p[0], p[1]])));
    else if (g.type === 'MultiPolygon') for (const pl of g.coordinates as number[][][][]) out.push(pl.map(r => r.map(p => [p[0], p[1]])));
    else if (g.type === 'GeometryCollection') for (const x of g.geometries || []) polysOf(x as never, out);
    else skipped.other++;
  };
  for (const f of feats) {
    const polys: Polys = []; polysOf(f.geometry, polys);
    if (!polys.length) { if (!f.geometry) skipped.empty++; continue; }
    const props: Record<string, Prop> = {};
    for (const [k, v] of Object.entries(f.properties || {})) { fields.add(k); props[k] = v == null ? null : typeof v === 'number' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v); }
    features.push({ props, polys });
  }
  return { name, file, format: 'GeoJSON', fields: [...fields], features, skipped, wkt: null, code: j.crs?.properties?.name || null, bbox: bboxOf(features) };
}

// ---------- KML ----------
function kmlLayer(name: string, file: string, text: string): GeoLayer {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Die KML-Datei ist fehlerhaft.');
  const kids = (el: Element, tag: string) => Array.from(el.getElementsByTagName('*')).filter(x => x.localName === tag);
  const coords = (el: Element | undefined) => (el?.textContent || '').trim().split(/\s+/).filter(Boolean).map(t => { const [x, y] = t.split(',').map(Number); return [x, y]; }).filter(p => isFinite(p[0]) && isFinite(p[1]));
  const features: RawFeature[] = []; const skipped = { other: 0, empty: 0 }; const fields = new Set<string>(['Name']);
  for (const pm of kids(doc.documentElement, 'Placemark')) {
    const polys: Polys = [];
    for (const pg of kids(pm, 'Polygon')) {
      const outer = kids(pg, 'outerBoundaryIs')[0], inner = kids(pg, 'innerBoundaryIs');
      const o = coords(outer && kids(outer, 'coordinates')[0]); if (o.length < 3) continue;
      polys.push([o, ...inner.map(ib => coords(kids(ib, 'coordinates')[0])).filter(r => r.length >= 3)]);
    }
    if (!polys.length) { if (kids(pm, 'Point').length || kids(pm, 'LineString').length) skipped.other++; else skipped.empty++; continue; }
    const props: Record<string, Prop> = { Name: kids(pm, 'name')[0]?.textContent?.trim() || null };
    for (const d of kids(pm, 'Data')) { const k = d.getAttribute('name') || ''; if (k) { fields.add(k); props[k] = kids(d, 'value')[0]?.textContent?.trim() ?? null; } }
    for (const d of kids(pm, 'SimpleData')) { const k = d.getAttribute('name') || ''; if (k) { fields.add(k); props[k] = d.textContent?.trim() ?? null; } }
    features.push({ props, polys });
  }
  return { name, file, format: 'KML', fields: [...fields], features, skipped, wkt: null, code: 'EPSG:4326', bbox: bboxOf(features) };
}

// ---------- GeoPackage ----------
function gpkgLayers(file: string, buf: ArrayBuffer): GeoLayer[] {
  return readGpkg(buf).map(L => {
    const features: RawFeature[] = []; const skipped = { other: 0, empty: 0 };
    for (const r of L.rows) {
      if (r.polys && (r.polys as Polys).length) features.push({ props: r.props as Record<string, Prop>, polys: r.polys });
      else if (r.other) skipped.other++; else skipped.empty++;
    }
    return { name: L.name, file, format: 'GeoPackage', fields: L.fields, features, skipped, wkt: L.wkt, code: L.srs, bbox: bboxOf(features) };
  });
}

/** Dateien (auch mehrere, auch ZIP) zu Ebenen. Shapefile-Teile werden über den Dateinamen zusammengeführt. */
export async function readGeoFiles(files: InFile[]): Promise<GeoLayer[]> {
  // ZIP und KMZ entpacken
  const all: InFile[] = [];
  for (const f of files) {
    const e = ext(f.name);
    if (e === 'zip' || e === 'kmz') {
      for (const x of await unzipEntries(f.buf)) {
        if (/(^|\/)__MACOSX\//.test(x.name) || x.name.endsWith('/')) continue;
        if (/\.(shp|dbf|prj|cpg|geojson|json|kml|gpkg)$/i.test(x.name)) all.push({ name: x.name, buf: await x.read() });
      }
    } else all.push(f);
  }
  const txt = (b: ArrayBuffer) => new TextDecoder('utf-8').decode(b).replace(/^﻿/, '');
  const layers: GeoLayer[] = [];
  const shpBase = new Map<string, Partial<Record<'shp' | 'dbf' | 'prj' | 'cpg', ArrayBuffer>>>();
  for (const f of all) {
    const e = ext(f.name);
    if (e === 'shp' || e === 'dbf' || e === 'prj' || e === 'cpg') { const k = f.name.replace(/\.[^.]+$/, '').toLowerCase(); const o = shpBase.get(k) || {}; o[e] = f.buf; shpBase.set(k, o); }
    else if (e === 'geojson' || e === 'json') layers.push(geojsonLayer(base(f.name), f.name, txt(f.buf)));
    else if (e === 'kml') layers.push(kmlLayer(base(f.name), f.name, txt(f.buf)));
    else if (e === 'gpkg') layers.push(...gpkgLayers(f.name, f.buf));
  }
  for (const [k, o] of shpBase) {
    if (!o.shp) { if (o.dbf) throw new Error(`Zur Datei „${base(k)}.dbf“ fehlt die .shp-Datei mit den Geometrien.`); continue; }
    layers.push(shapefileLayer(base(k), base(k) + '.shp', o.shp, o.dbf || null, o.prj ? txt(o.prj) : null, o.cpg ? txt(o.cpg) : null));
  }
  if (!layers.length) throw new Error('Keine Geodaten gefunden. Unterstützt: Shapefile (.shp mit .dbf, gern als ZIP), GeoJSON, KML/KMZ, GeoPackage.');
  return layers;
}
export { wkbPolys };
