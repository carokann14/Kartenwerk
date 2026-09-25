// Schraffuren: Zuordnung zu Gebieten und Geometrie (Linien und Punkte) für Editor, Legende und Export
import { datasetFor } from '../data/aggregate';
import { areaRowIndex, colIndex } from '../data/derive';
import type { Doc, HatchPattern, HatchRule, HatchStyle } from '../model/types';
import { ColorModel, colorModel, fillOf } from './colorModel';
import { fokusIdx, geoOf } from './scene';

export const PATTERN_LABEL: Record<HatchPattern, string> = { diag: 'Schräg /', diag2: 'Schräg \\', kreuz: 'Kreuz', horizontal: 'Waagrecht', vertikal: 'Senkrecht', punkte: 'Punkte' };
/** Richtung der Linien in Grad (SVG, y nach unten). */
export const PATTERN_ANGLES: Record<HatchPattern, number[]> = { diag: [-45], diag2: [45], kreuz: [-45, 45], horizontal: [0], vertikal: [90], punkte: [-45] };

export interface HatchMap { byArea: (string | null)[]; counts: Record<string, number>; styles: Map<string, HatchStyle> }
const cache = new WeakMap<Doc, HatchMap>();

function ruleHits(doc: Doc, cm: ColorModel, r: HatchRule): (i: number) => boolean {
  const g = geoOf(doc);
  if (r.source === 'nodata') {
    if (!cm.dataset || cm.mismatch || doc.color.mode === 'none') return () => false;
    return i => cm.cls[i] < 0 && !g.areas[i].free && !doc.overrides[doc.geoSet + ':' + g.areas[i].id];
  }
  const ds = datasetFor(doc, r.dataset);
  if (!ds || ds.geoSet !== doc.geoSet) return () => false;
  const ci = colIndex(ds, r.column); if (ci < 0) return () => false;
  const rows = areaRowIndex(ds), vals = new Set(r.values);
  return i => {
    const row = rows.get(g.areas[i].id); if (row == null) return false;
    const v = ds.rows[row][ci];
    if (r.op === 'in') return v != null && vals.has(String(v).trim());
    if (typeof v !== 'number' || r.num == null) return false;
    return r.op === 'lt' ? v < r.num : v > r.num;
  };
}
/** Welche Schraffur trägt welches Gebiet? Manuelle Zuweisung vor Datenregeln, erste passende Regel gewinnt. */
export function hatchMap(doc: Doc): HatchMap {
  const hit = cache.get(doc); if (hit) return hit;
  const g = geoOf(doc), n = g.areas.length, cm = colorModel(doc);
  const styles = new Map(doc.hatches.map(h => [h.id, h]));
  const byArea: (string | null)[] = new Array(n).fill(null);
  const rules = doc.hatchRules.filter(r => styles.has(r.hatch)).map(r => ({ r, test: ruleHits(doc, cm, r) }));
  for (let i = 0; i < n; i++) {
    const key = doc.geoSet + ':' + g.areas[i].id;
    if (key in doc.hatchAssign) { const h = doc.hatchAssign[key]; byArea[i] = h && styles.has(h) ? h : null; continue; }
    for (const { r, test } of rules) if (test(i)) { byArea[i] = r.hatch; break; }
  }
  const counts: Record<string, number> = {};
  for (const i of fokusIdx(doc)) { const h = byArea[i]; if (h) counts[h] = (counts[h] || 0) + 1; }
  const res = { byArea, counts, styles };
  cache.set(doc, res);
  return res;
}
/** Füllfarbe eines Gebiets einschließlich Schraffur mit eigener Grundfläche. */
export function areaFill(doc: Doc, cm: ColorModel, i: number): string {
  if (doc.layers.hatches) { const hm = hatchMap(doc), h = hm.byArea[i]; const st = h ? hm.styles.get(h) : null; if (st?.bg) return st.bg; }
  return fillOf(doc, cm, i);
}

// ---------- Geometrie ----------
type P = number[];
const rot = (p: P, c: number, s: number): P => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];

/** Linien einer Richtung innerhalb von Ringen (gerade-ungerade-Regel), Abstand s, verankert am Ursprung der Grafik. */
function scanLines(rings: P[][], angle: number, s: number): P[][] {
  const a = angle * Math.PI / 180, c = Math.cos(-a), sn = Math.sin(-a);
  const R = rings.map(r => r.map(p => rot(p, c, sn)));
  let y0 = Infinity, y1 = -Infinity;
  for (const r of R) for (const p of r) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  if (!isFinite(y0)) return [];
  const out: P[][] = [], cb = Math.cos(a), sb = Math.sin(a);
  for (let k = Math.ceil(y0 / s - 0.5); (k + 0.5) * s <= y1; k++) {
    const y = (k + 0.5) * s, xs: number[] = [];
    for (const r of R) for (let j = 0, m = r.length; j < m; j++) {
      const p = r[j], q = r[(j + 1) % m];
      if ((p[1] <= y) !== (q[1] <= y)) xs.push(p[0] + (y - p[1]) / (q[1] - p[1]) * (q[0] - p[0]));
    }
    xs.sort((u, v) => u - v);
    for (let j = 0; j + 1 < xs.length; j += 2) if (xs[j + 1] - xs[j] > 0.2) out.push([rot([xs[j], y], cb, sb), rot([xs[j + 1], y], cb, sb)]);
  }
  return out;
}
function inside(rings: P[][], x: number, y: number) {
  let c = false;
  for (const r of rings) for (let j = 0, m = r.length, k = m - 1; j < m; k = j++) {
    const [xi, yi] = r[j], [xk, yk] = r[k];
    if ((yi > y) !== (yk > y) && x < (xk - xi) * (y - yi) / (yk - yi) + xi) c = !c;
  }
  return c;
}
function dots(rings: P[][], s: number): P[] {
  const a = -45 * Math.PI / 180, c = Math.cos(-a), sn = Math.sin(-a);
  const R = rings.map(r => r.map(p => rot(p, c, sn)));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of R) for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const out: P[] = [], cb = Math.cos(a), sb = Math.sin(a);
  if (!isFinite(x0)) return out;
  for (let y = (Math.ceil(y0 / s - 0.5) + 0.5) * s; y <= y1; y += s)
    for (let x = (Math.ceil(x0 / s - 0.5) + 0.5) * s; x <= x1; x += s)
      if (inside(R, x, y)) out.push(rot([x, y], cb, sb));
  return out;
}
const f1 = (v: number) => (Math.round(v * 10) / 10).toString();
/** Pfaddaten einer Schraffur für Ringe in Grafik-Koordinaten. Linien: Strich, Punkte: Fläche. */
export function hatchPathD(style: HatchStyle, rings: P[][]): string {
  const s = Math.max(1.5, style.spacing);
  if (style.pattern === 'punkte') {
    const r = Math.max(0.3, style.width);
    return dots(rings, s).map(([x, y]) => `M${f1(x - r)} ${f1(y)}a${f1(r)} ${f1(r)} 0 1 0 ${f1(2 * r)} 0a${f1(r)} ${f1(r)} 0 1 0 ${f1(-2 * r)} 0z`).join('');
  }
  let d = '';
  for (const ang of PATTERN_ANGLES[style.pattern]) for (const [p, q] of scanLines(rings, ang, s)) d += `M${f1(p[0])} ${f1(p[1])}L${f1(q[0])} ${f1(q[1])}`;
  return d;
}
export const rectRing = (x: number, y: number, w: number, h: number): P[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/** SVG-Muster für den Editor. k = Maßstab der Karte (px je Einheit), damit Abstand und Stärke in px der Grafik gelten. */
export function patternSpec(style: HatchStyle, k: number) {
  const s = Math.max(1.5, style.spacing) / k, w = Math.max(0.2, style.width) / k;
  const ang = PATTERN_ANGLES[style.pattern][0];
  if (style.pattern === 'punkte') return { s, ang, lines: [] as string[], dot: w };
  const lines = [`M0 ${s / 2}H${s}`];
  if (style.pattern === 'kreuz') lines.push(`M${s / 2} 0V${s}`);
  return { s, ang, lines, dot: 0, w };
}
