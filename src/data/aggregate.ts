// Daten auf gröbere Gebiete summieren: Gemeinden → Kreise, Länder, Regionen; Wahlkreise → Länder.
// Nur wo die Zuordnung eindeutig ist (Schlüssel desselben Gebietsstands, Länderkennung, eigene Regionen aus Bausteinen).
// Das Ergebnis ist ein Datensatz mit derselben Kennung, denselben Spalten und Gruppen: Farbregeln,
// Beschriftungen und Blasen funktionieren auf der gröberen Ebene unverändert weiter.
import { GEO, GeoSet } from '../geo/geo';
import { keyAt, vg } from '../geo/relate';
import type { Doc } from '../model/types';
import type { Cell, Column, Dataset, DerivedInfo } from './types';

const ORDER = ['lan', 'rbz', 'krs', 'vwg', 'gem'];
const coarser = (a: string, b: string) => ORDER.indexOf(a) < ORDER.indexOf(b);   // a ist gröber als b

/** Ziel je Quellgebiet (−1 = keins) oder null, wenn sich die Ebenen nicht eindeutig zuordnen lassen */
const mapCache = new WeakMap<GeoSet, WeakMap<GeoSet, Int32Array | null>>();
export function areaMapping(from: GeoSet, to: GeoSet): Int32Array | null {
  if (from === to) return null;
  let m = mapCache.get(from); if (!m) { m = new WeakMap(); mapCache.set(from, m); }
  if (m.has(to)) return m.get(to)!;
  const r = computeMapping(from, to);
  m.set(to, r);
  return r;
}
function computeMapping(from: GeoSet, to: GeoSet): Int32Array | null {
  const n = from.areas.length, out = new Int32Array(n).fill(-1);
  // Regionen: Bausteine direkt oder über eine feinere Ebene desselben Stands
  if (to.memberOf && to.meta.base) {
    const base = GEO[to.meta.base]; if (!base) return null;
    const M = to.memberOf, free = (t: number) => t >= 0 && !!to.areas[t].free;
    if (from === base) { for (let i = 0; i < n; i++) { const t = M[i]; out[i] = free(t) ? -1 : t; } return out; }
    const fb = areaMapping(from, base); if (!fb) return null;
    for (let i = 0; i < n; i++) { const b = fb[i]; const t = b >= 0 ? M[b] : -1; out[i] = free(t) ? -1 : t; }
    return out;
  }
  if (from.memberOf) return null;
  // ausdrücklich hinterlegte Zugehörigkeit (z. B. Berliner Wahlbezirk → Wahlkreis, Briefwahlbezirk, Bezirk, Bundestagswahlkreis)
  if (from.areas.some(a => a.par && to.meta.id in a.par)) {
    for (let i = 0; i < n; i++) { const k = from.areas[i].par?.[to.meta.id]; const t = k != null ? to.byId.get(k) : undefined; out[i] = t ?? -1; }
    return out;
  }
  // Länder: jede Ebene kennt ihr Land (auch Wahlkreise)
  if (to.meta.level === 'lan') {
    for (let i = 0; i < n; i++) { const t = to.byId.get(from.areas[i].bl); out[i] = t ?? -1; }
    return out;
  }
  // Verwaltungsebenen desselben Stands über Schlüsselpräfixe
  if (vg(from) && vg(to) && from.meta.file === to.meta.file && coarser(to.meta.level, from.meta.level)) {
    if (to.meta.level === 'vwg' && from.meta.level !== 'gem') return null;
    for (let i = 0; i < n; i++) { const k = keyAt(from, i, to.meta.level); const t = k != null ? to.byId.get(k) : undefined; out[i] = t ?? -1; }
    return out;
  }
  return null;
}
export const canSum = (from: GeoSet | undefined, to: GeoSet | undefined) => !!from && !!to && from !== to && !!areaMapping(from, to);

/** Anteile, Quoten, Mittelwerte: lassen sich nicht addieren */
const RATE = /%|prozent|anteil|quote|beteiligung|rate\b|durchschnitt|mittel|dichte|je\s|pro\s|index|median|verhältnis|\bø/i;
export const isRate = (c: Column) => !c.party && RATE.test(c.label);

const derivedCache = new WeakMap<Dataset, WeakMap<GeoSet, Dataset>>();
export function deriveDataset(ds: Dataset, from: GeoSet, to: GeoSet): Dataset | null {
  const map = areaMapping(from, to); if (!map) return null;
  let m = derivedCache.get(ds); if (!m) { m = new WeakMap(); derivedCache.set(ds, m); }
  const hit = m.get(to); if (hit) return hit;
  const nc = ds.columns.length;
  const role = ds.columns.map(c => c.role === 'value' && c.kind === 'number' ? (isRate(c) ? 'rate' : 'sum') : c.role === 'id' ? 'id' : c.role === 'name' ? 'name' : 'same');
  // eine Zeile je Quellgebiet; gemeinsam ausgezählte Gebiete tragen dieselbe Summe → je Gruppe nur einmal zählen
  const J = ds.joint || {};
  const groupTargets = new Map<string, Map<number, number>>();
  const firstRow = new Map<string, number>();
  ds.rowArea.forEach((a, r) => { if (a && !firstRow.has(a)) firstRow.set(a, r); });
  for (const [a] of firstRow) {
    const key = J[a]; if (!key) continue;
    const i = from.byId.get(a); const t = i != null ? map[i] : -1; if (t < 0) continue;
    let c = groupTargets.get(key); if (!c) { c = new Map(); groupTargets.set(key, c); }
    c.set(t, (c.get(t) || 0) + 1);
  }
  const groupTo = new Map<string, number>(); let split = 0;
  for (const [key, c] of groupTargets) { const best = [...c].sort((x, y) => y[1] - x[1])[0]; groupTo.set(key, best[0]); if (c.size > 1) split++; }
  const acc = new Map<number, { sum: Float64Array; has: Uint8Array; same: Cell[]; mixed: Uint8Array; n: number }>();
  let unassigned = 0, sources = 0;
  const counted = new Set<string>();
  for (const [a, r] of firstRow) {
    const i = from.byId.get(a); if (i == null) continue;
    let t = map[i];
    const key = J[a];
    if (key) { if (counted.has(key)) continue; counted.add(key); t = groupTo.get(key) ?? t; }
    if (t < 0) { unassigned++; continue; }
    sources++;
    let x = acc.get(t);
    if (!x) { x = { sum: new Float64Array(nc), has: new Uint8Array(nc), same: new Array(nc).fill(null), mixed: new Uint8Array(nc), n: 0 }; acc.set(t, x); }
    const row = ds.rows[r];
    for (let k = 0; k < nc; k++) {
      const v = row[k];
      if (role[k] === 'sum') { if (typeof v === 'number') { x.sum[k] += v; x.has[k] = 1; } }
      else if (role[k] === 'same') { if (x.n === 0) x.same[k] = v; else if (x.same[k] !== v) x.mixed[k] = 1; }
    }
    x.n++;
  }
  // Zielgebiete, in denen Bausteine ohne Daten liegen (unbewohnte, gemeindefreie Gebiete zählen nicht)
  const gaps = new Uint8Array(to.areas.length);
  const withRow = new Set(firstRow.keys()); if (ds.alias) for (const a of Object.keys(ds.alias)) withRow.add(a);
  for (let i = 0; i < from.areas.length; i++) { const t = map[i]; if (t < 0) continue; if (!withRow.has(from.areas[i].id) && !from.areas[i].free) gaps[t] = 1; }
  const rows: Cell[][] = [], keys: string[] = [];
  const r1 = (v: number) => Math.round(v * 1000) / 1000;
  for (const t of to.all) {
    const x = acc.get(t); if (!x) continue;
    const a = to.areas[t];
    rows.push(ds.columns.map((_, k) => role[k] === 'id' ? a.id : role[k] === 'name' ? a.name : role[k] === 'sum' ? (x.has[k] ? r1(x.sum[k]) : null) : role[k] === 'rate' ? null : (x.mixed[k] ? null : x.same[k])));
    keys.push(a.id);
  }
  let partial = 0; for (const t of acc.keys()) if (gaps[t]) partial++;
  const info: DerivedInfo = { from: from.meta.id, sources, targets: rows.length, unassigned, partial, rates: ds.columns.filter((c, k) => role[k] === 'rate').map(c => c.label), split };
  const missing = to.all.filter(t => !acc.has(t) && !to.areas[t].free).map(t => to.areas[t].id);
  const out: Dataset = {
    ...ds, geoSet: to.meta.id, rows, rowKey: keys, rowArea: [...keys], joint: undefined, alias: undefined, derived: info,
    report: { ...ds.report, total: rows.length, exact: rows.length, byName: 0, ambiguous: 0, unknown: 0, duplicate: 0, summary: 0, ignored: 0, ruled: 0, missing, nameMismatch: [], issues: [], included: 0 },
  };
  m.set(to, out);
  return out;
}

/** Datensatz für die Karte: passt er zum Gebietsstand, unverändert; sonst, wo möglich, auf die Gebiete der Karte summiert. */
export function datasetFor(doc: Doc, id: string | null | undefined, geoId: string = doc.geoSet): Dataset | null {
  if (!id) return null;
  const ds = doc.datasets.find(d => d.id === id); if (!ds) return null;
  if (ds.geoSet === geoId) return ds;
  const from = GEO[ds.geoSet], to = GEO[geoId];
  return (from && to && deriveDataset(ds, from, to)) || ds;
}
/** Datensätze, die auf der Karte nutzbar sind (eigener Gebietsstand oder summierbar), in dieser Form */
export function usableDatasets(doc: Doc, geoId: string = doc.geoSet): Dataset[] {
  return doc.datasets.map(d => datasetFor(doc, d.id, geoId)!).filter(d => d.geoSet === geoId);
}
