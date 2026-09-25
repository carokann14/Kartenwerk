// Blasen: flächenproportionale Kreise an den Beschriftungspunkten der Gebiete
import { datasetFor } from '../data/aggregate';
import { areaRowIndex, colIndex } from '../data/derive';
import { niceStep } from '../lib/color';
import type { Doc, Variant } from '../model/types';
import { colorModel, fillOf } from './colorModel';
import { FrameId, frameSets, geoOf, jointOf } from './scene';

export interface BubbleItem { i: number; x: number; y: number; r: number; fill: string; v: number }
export interface BubbleSet { items: BubbleItem[]; ref: number; unitR: number; label: string }
const NODATA_FILL = '#B3AC9F';

/** Kreise eines Rahmens in Rahmenkoordinaten, größte zuerst (kleine liegen oben) */
export function bubbleSet(doc: Doc, id: FrameId, v: Variant): BubbleSet | null {
  const b = doc.bubbles; if (!b || !b.visible) return null;
  if (id === 'inset' && !doc.inset.visible) return null;
  const ds = datasetFor(doc, b.dataset); if (!ds || ds.geoSet !== doc.geoSet) return null;
  const ci = colIndex(ds, b.column); if (ci < 0) return null;
  const g = geoOf(doc), F = v.L[id], cm = colorModel(doc), J = jointOf(doc);
  const rows = areaRowIndex(ds);
  const { list } = frameSets(doc, id);
  const vals: { i: number; v: number }[] = [];
  const seenRow = new Set<number>(), seenJoint = new Set<string>();
  // größte Gebiete zuerst, damit bei gemeinsamen Ergebnissen die Blase im größten Gebiet sitzt
  for (const i of [...list].sort((x, y) => g.areas[y].area - g.areas[x].area)) {
    const r = rows.get(g.areas[i].id); if (r == null || seenRow.has(r)) continue;
    const j = J?.[g.areas[i].id]; if (j) { if (seenJoint.has(j)) continue; seenJoint.add(j); }
    seenRow.add(r);
    const x = ds.rows[r][ci]; if (typeof x === 'number' && x > 0) vals.push({ i, v: x });
  }
  if (!vals.length) return null;
  const ref = b.ref && b.ref > 0 ? b.ref : Math.max(...vals.map(x => x.v));
  const unitR = b.maxR * v.ts;
  const items = vals.map(({ i, v: val }) => {
    const [gx, gy] = g.areas[i].label;
    const f = b.color === 'regel' ? (cm.cls[i] >= 0 || doc.overrides[doc.geoSet + ':' + g.areas[i].id] ? fillOf(doc, cm, i) : NODATA_FILL) : b.color;
    return { i, v: val, x: (gx - F.view.cx) * F.view.k + F.w / 2, y: (gy - F.view.cy) * F.view.k + F.h / 2, r: unitR * Math.sqrt(val / ref), fill: f };
  }).filter(it => it.r >= 0.9).sort((a, b2) => b2.r - a.r);   // unter knapp 1 px nicht zu sehen, nur Dateigröße
  const label = b.title.trim() || ds.columns[ci]?.label || 'Wert';
  return { items, ref, unitR, label };
}
/** Werte für die Legende: der Bezugswert und zwei kleinere runde Werte */
export function bubbleLegendValues(ref: number): number[] {
  const round = (x: number) => { const s = niceStep(x / 2); return Math.max(s, Math.round(x / s) * s); };
  const big = round(ref), mid = round(ref / 4), small = round(ref / 20);
  return [...new Set([big, mid, small])].filter(x => x > 0).sort((a, b) => b - a);
}
export const circleD = (cx: number, cy: number, r: number) => `M${(cx - r).toFixed(1)} ${cy.toFixed(1)}a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(2 * r).toFixed(1)} 0a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-2 * r).toFixed(1)} 0z`;
