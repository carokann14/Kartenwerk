// Marker und Textkästen: Formen, Platzierung je Variante, Primitive für Editor und Export
import { capOffset, measureW, wrapText } from '../lib/fonts';
import { clamp } from '../lib/util';
import type { AnnEl, ArrowEl, ArrowEnd, Doc, MarkerEl, MarkerShape, TextBoxEl, Variant } from '../model/types';
import { GEO } from '../geo/geo';
import type { PathPrim, RectPrim, TextPrim } from './elements';

export const SHAPE_LABEL: Record<MarkerShape, string> = { kreis: 'Kreis', quadrat: 'Quadrat', dreieck: 'Dreieck', raute: 'Raute', stern: 'Stern', pin: 'Stecknadel', eigen: 'Eigenes Symbol' };
const f1 = (v: number) => (Math.round(v * 100) / 100).toString();

// ---------- Pfaddaten normalisieren (eigene SVG-Symbole) ----------
/** Zerlegt Pfaddaten, rechnet alles absolut und wendet Maßstab s und Verschiebung (tx, ty) an. */
export function transformPath(d: string, s: number, tx: number, ty: number): string {
  const tok = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, out = '';
  const num = () => parseFloat(tok[i++]);
  const P = (px: number, py: number) => `${f1(px * s + tx)} ${f1(py * s + ty)}`;
  while (i < tok.length) {
    if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'Z') { out += 'Z'; x = sx; y = sy; continue; }
    if (i >= tok.length || /[a-zA-Z]/.test(tok[i])) continue;
    switch (C) {
      case 'M': { x = ox + num(); y = oy + num(); sx = x; sy = y; out += 'M' + P(x, y); cmd = rel ? 'l' : 'L'; break; }
      case 'L': case 'T': { x = ox + num(); y = oy + num(); out += C + P(x, y); break; }
      case 'H': { x = ox + num(); out += 'L' + P(x, y); break; }
      case 'V': { y = oy + num(); out += 'L' + P(x, y); break; }
      case 'C': { const a = [ox + num(), oy + num(), ox + num(), oy + num()]; x = ox + num(); y = oy + num(); out += 'C' + P(a[0], a[1]) + ' ' + P(a[2], a[3]) + ' ' + P(x, y); break; }
      case 'S': case 'Q': { const a = [ox + num(), oy + num()]; x = ox + num(); y = oy + num(); out += C + P(a[0], a[1]) + ' ' + P(x, y); break; }
      case 'A': { const rx = num(), ry = num(), rot = num(), la = num(), sw = num(); x = ox + num(); y = oy + num(); out += `A${f1(rx * s)} ${f1(ry * s)} ${rot} ${la} ${sw} ` + P(x, y); break; }
      default: i++;
    }
  }
  return out;
}
/** Einfarbiges SVG-Symbol lesen: alle Pfade (auch Rechteck, Kreis, Polygon) und die viewBox. */
export function parseSymbol(svgText: string, name: string): MarkerEl['symbol'] {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.querySelector('svg'); if (!svg) throw new Error('Keine SVG-Datei.');
  let vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some(v => !isFinite(v))) vb = [0, 0, parseFloat(svg.getAttribute('width') || '24'), parseFloat(svg.getAttribute('height') || '24')];
  const parts: string[] = [];
  svg.querySelectorAll('path').forEach(p => { const d = p.getAttribute('d'); if (d && p.getAttribute('fill') !== 'none') parts.push(d); });
  svg.querySelectorAll('rect').forEach(r => { const x = +(r.getAttribute('x') || 0), y = +(r.getAttribute('y') || 0), w = +(r.getAttribute('width') || 0), h = +(r.getAttribute('height') || 0); if (w && h && r.getAttribute('fill') !== 'none') parts.push(`M${x} ${y}h${w}v${h}h${-w}z`); });
  svg.querySelectorAll('circle').forEach(c => { const cx = +(c.getAttribute('cx') || 0), cy = +(c.getAttribute('cy') || 0), r = +(c.getAttribute('r') || 0); if (r && c.getAttribute('fill') !== 'none') parts.push(`M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`); });
  svg.querySelectorAll('polygon').forEach(pg => { const pts = (pg.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number); if (pts.length >= 6) parts.push('M' + pts.join(' ') + 'z'); });
  if (!parts.length) throw new Error('Im Symbol wurden keine gefüllten Pfade gefunden.');
  return { d: parts.join(' '), vb: vb as [number, number, number, number], name };
}

// ---------- Formen ----------
/** Pfad einer Markerform, zentriert auf (cx, cy), Durchmesser s. Die Stecknadel steht mit der Spitze auf dem Punkt. */
export function markerD(m: Pick<MarkerEl, 'shape' | 'symbol'>, cx: number, cy: number, s: number): string {
  const r = s / 2;
  switch (m.shape) {
    case 'quadrat': return `M${f1(cx - r * 0.9)} ${f1(cy - r * 0.9)}h${f1(1.8 * r)}v${f1(1.8 * r)}h${f1(-1.8 * r)}z`;
    case 'dreieck': { const h = r * 1.1; return `M${f1(cx)} ${f1(cy - h)}L${f1(cx + h * 0.94)} ${f1(cy + h * 0.62)}L${f1(cx - h * 0.94)} ${f1(cy + h * 0.62)}z`; }
    case 'raute': return `M${f1(cx)} ${f1(cy - r * 1.15)}L${f1(cx + r * 0.9)} ${f1(cy)}L${f1(cx)} ${f1(cy + r * 1.15)}L${f1(cx - r * 0.9)} ${f1(cy)}z`;
    case 'stern': { let d = ''; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.48 : r * 1.12; d += (k ? 'L' : 'M') + f1(cx + rr * Math.cos(a)) + ' ' + f1(cy + rr * Math.sin(a)); } return d + 'z'; }
    case 'pin': {
      // Tropfen mit Loch, Spitze bei (cx, cy)
      const R = r * 0.78, c = cy - r * 1.55, h = R * 0.42;
      return `M${f1(cx)} ${f1(cy)}C${f1(cx - R * 0.35)} ${f1(cy - R * 0.55)} ${f1(cx - R)} ${f1(c + R * 0.62)} ${f1(cx - R)} ${f1(c)}A${f1(R)} ${f1(R)} 0 1 1 ${f1(cx + R)} ${f1(c)}C${f1(cx + R)} ${f1(c + R * 0.62)} ${f1(cx + R * 0.35)} ${f1(cy - R * 0.55)} ${f1(cx)} ${f1(cy)}Z`
        + `M${f1(cx - h)} ${f1(c)}a${f1(h)} ${f1(h)} 0 1 0 ${f1(2 * h)} 0a${f1(h)} ${f1(h)} 0 1 0 ${f1(-2 * h)} 0z`;
    }
    case 'eigen': {
      if (!m.symbol) return markerD({ shape: 'kreis', symbol: null }, cx, cy, s);
      const [vx, vy, vw, vh] = m.symbol.vb, sc = s / Math.max(vw, vh);
      return transformPath(m.symbol.d, sc, cx - (vx + vw / 2) * sc, cy - (vy + vh / 2) * sc);
    }
    default: return `M${f1(cx - r)} ${f1(cy)}a${f1(r)} ${f1(r)} 0 1 0 ${f1(2 * r)} 0a${f1(r)} ${f1(r)} 0 1 0 ${f1(-2 * r)} 0z`;
  }
}
/** Ausdehnung der Form um den Ankerpunkt (für Beschriftung und Auswahl) */
const shapeBox = (m: MarkerEl, cx: number, cy: number, s: number) => m.shape === 'pin' ? [cx - s * 0.4, cy - s * 1.95, cx + s * 0.4, cy] : [cx - s * 0.58, cy - s * 0.58, cx + s * 0.58, cy + s * 0.58];

// ---------- Platzierung ----------
export interface AnnItem {
  id: string; el: AnnEl; frame: 'main' | 'inset' | 'board';
  paths: PathPrim[]; rects: RectPrim[]; texts: TextPrim[];
  body: [number, number, number, number];            // Auswahl-Rahmen des Körpers (Marker bzw. Kasten)
  label: [number, number, number, number] | null;    // Rahmen der Beschriftung (Marker)
  anchor: [number, number];                          // Ankerpunkt auf der Grafik
  arrow?: ArrowGeom;                                 // nur Pfeile: Geometrie für Griffe
}
const styleColor = (doc: Doc, c: string) => (c === 'ink' ? doc.style.ink : c === 'inkSoft' ? doc.style.inkSoft : c);
function toBoard(v: Variant, id: 'main' | 'inset', at: [number, number]): [number, number] {
  const F = v.L[id], w = F.view;
  return [F.x + (at[0] - w.cx) * w.k + F.w / 2, F.y + (at[1] - w.cy) * w.k + F.h / 2];
}
const inFrame = (v: Variant, id: 'main' | 'inset', p: [number, number]) => { const F = v.L[id]; return p[0] >= F.x && p[0] <= F.x + F.w && p[1] >= F.y && p[1] <= F.y + F.h; };

function markerItem(doc: Doc, v: Variant, m: MarkerEl, frame: 'main' | 'inset', p: [number, number], withLabel: boolean): AnnItem {
  const ts = v.ts, s = m.size * ts, [cx, cy] = p;
  const paths: PathPrim[] = [{ d: markerD(m, cx, cy, s), fill: m.fill, ...(m.strokeW > 0 ? { stroke: m.stroke, width: m.strokeW } : {}) }];
  const body = shapeBox(m, cx, cy, s) as [number, number, number, number];
  const texts: TextPrim[] = [];
  let label: AnnItem['label'] = null;
  const lines = m.label.split('\n').map(x => x.trim()).filter(Boolean);
  if (withLabel && lines.length) {
    const size = m.labelSize * ts, lh = size * 1.18, gap = size * 0.35;
    const w = Math.max(...lines.map(l => measureW(l, m.labelCut, size))), h = lines.length * lh;
    const off = v.ann[m.id] || [0, 0];
    let x0: number, y0: number, anchor: TextPrim['anchor'];
    const midY = m.shape === 'pin' ? (body[1] + body[3]) / 2 - s * 0.35 : cy;
    if (m.labelPos === 'l') { anchor = 'end'; x0 = body[0] - gap; y0 = midY - h / 2; }
    else if (m.labelPos === 'o') { anchor = 'middle'; x0 = cx; y0 = body[1] - gap - h; }
    else if (m.labelPos === 'u') { anchor = 'middle'; x0 = cx; y0 = body[3] + gap; }
    else { anchor = 'start'; x0 = body[2] + gap; y0 = midY - h / 2; }
    x0 += off[0]; y0 += off[1];
    const left = anchor === 'start' ? x0 : anchor === 'end' ? x0 - w : x0 - w / 2;
    label = [left - 2, y0 - 1, left + w + 2, y0 + h + 1];
    lines.forEach((t, k) => texts.push({ x: x0, y: y0 + k * lh + lh / 2 + capOffset(m.labelCut, size), text: t, cut: m.labelCut, size, color: doc.style.ink, anchor, halo: m.labelHalo }));
    if (Math.hypot(off[0], off[1]) > 18) {
      const tx = clamp(cx, label[0], label[2]), ty = clamp(cy, label[1], label[3]);
      paths.unshift({ d: `M${f1(cx)} ${f1(cy)}L${f1(tx)} ${f1(ty)}`, fill: 'none', stroke: doc.style.ink, width: 0.9 });
    }
  }
  return { id: m.id, el: m, frame, paths, rects: [], texts, body, label, anchor: p };
}
function textItem(doc: Doc, v: Variant, t: TextBoxEl): AnnItem | null {
  const ts = v.ts, size = t.size * ts, lh = size * 1.3, pad = t.pad;
  let A: [number, number];
  if (t.anchor === 'map') { A = toBoard(v, 'main', t.at); if (!inFrame(v, 'main', A) && !t.leader) { /* Anker außerhalb: Kasten bleibt sichtbar */ } }
  else A = [t.at[0] * v.w, t.at[1] * v.h];
  const off = v.ann[t.id] || (t.anchor === 'map' && t.leader ? [18, -18 - lh] : [0, 0]);
  const lines = t.width > 0 ? wrapText(t.text, t.cut, size, Math.max(20, t.width - 2 * pad)) : t.text.split('\n');
  const tw = Math.max(1, ...lines.map(l => measureW(l, t.cut, size)));
  const w = (t.width > 0 ? t.width : tw + 2 * pad), h = lines.length * lh + 2 * pad;
  const x = A[0] + off[0], y = A[1] + off[1];
  const rects: RectPrim[] = [], paths: PathPrim[] = [], texts: TextPrim[] = [];
  if (t.anchor === 'map' && t.leader && inFrame(v, 'main', A)) {
    const px = clamp(A[0], x, x + w), py = clamp(A[1], y, y + h);
    if (Math.hypot(px - A[0], py - A[1]) > 3) paths.push({ d: `M${f1(A[0])} ${f1(A[1])}L${f1(px)} ${f1(py)}`, fill: 'none', stroke: doc.style.ink, width: 1 });
    paths.push({ d: `M${f1(A[0] - 2.4)} ${f1(A[1])}a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0 -4.8 0z`, fill: doc.style.ink });
  }
  if (t.bg || t.border) paths.push({ d: `M${f1(x)} ${f1(y)}h${f1(w)}v${f1(h)}h${f1(-w)}z`, fill: t.bg || 'none', ...(t.border ? { stroke: t.border, width: 1 } : {}) });
  const tx = t.align === 'middle' ? x + w / 2 : t.align === 'end' ? x + w - pad : x + pad;
  lines.forEach((l, k) => texts.push({ x: tx, y: y + pad + k * lh + lh / 2 + capOffset(t.cut, size), text: l, cut: t.cut, size, color: styleColor(doc, t.color), anchor: t.align }));
  return { id: t.id, el: t, frame: t.anchor === 'map' ? 'main' : 'board', paths, rects, texts, body: [x, y, x + w, y + h], label: null, anchor: A };
}
// ---------- Pfeile ----------
export interface ArrowGeom { p0: [number, number]; p1: [number, number]; c: [number, number] | null; mid: [number, number]; d: string; heads: string[] }
type EndInfo = { p: [number, number]; box?: [number, number, number, number]; r?: number };
function resolveEnd(v: Variant, e: ArrowEnd, byId: Map<string, AnnItem>): EndInfo | null {
  if (e.kind === 'map') return { p: toBoard(v, 'main', e.at) };
  if (e.kind === 'board') return { p: [e.at[0] * v.w, e.at[1] * v.h] };
  if (e.kind === 'area') {
    const [gs, id] = [e.key.slice(0, e.key.indexOf(':')), e.key.slice(e.key.indexOf(':') + 1)];
    const g = GEO[gs]; const i = g?.byId.get(id); if (!g || i == null) return null;
    return { p: toBoard(v, 'main', g.areas[i].label) };
  }
  const it = byId.get(e.id); if (!it) return null;
  if (it.el.type === 'marker') { const b = it.body; return { p: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], r: Math.max(b[2] - b[0], b[3] - b[1]) / 2 }; }
  const b = it.body; return { p: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], box: b };
}
/** Punkt am Rand eines verbundenen Elements, in Richtung des Punkts q */
function edgePoint(e: EndInfo, q: [number, number], gap: number): [number, number] {
  const [px, py] = e.p, dx = q[0] - px, dy = q[1] - py, L = Math.hypot(dx, dy) || 1;
  if (e.r != null) { const r = e.r + gap; return [px + dx / L * r, py + dy / L * r]; }
  if (e.box) {
    const hw = (e.box[2] - e.box[0]) / 2 + gap, hh = (e.box[3] - e.box[1]) / 2 + gap;
    const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
    return [px + dx * Math.min(t, 1), py + dy * Math.min(t, 1)];
  }
  return e.p;
}
export function arrowGeom(v: Variant, a: ArrowEl, byId: Map<string, AnnItem>): ArrowGeom | null {
  const A = resolveEnd(v, a.from, byId), B = resolveEnd(v, a.to, byId);
  if (!A || !B) return null;
  const ts = v.ts, w = a.width * ts, gap = a.gap * ts;
  const dx = B.p[0] - A.p[0], dy = B.p[1] - A.p[1], len = Math.hypot(dx, dy) || 1;
  const c: [number, number] | null = a.bend ? [(A.p[0] + B.p[0]) / 2 - dy / len * a.bend * len, (A.p[1] + B.p[1]) / 2 + dx / len * a.bend * len] : null;
  let p0 = edgePoint(A, c || B.p, gap), p1 = edgePoint(B, c || A.p, gap);
  const headLen = (6 + w * 2.6) * a.headSize, heads: string[] = [];
  const head = (tip: [number, number], from: [number, number]) => {
    const ux = tip[0] - from[0], uy = tip[1] - from[1], L = Math.hypot(ux, uy) || 1, nx = ux / L, ny = uy / L, hw = headLen * 0.46;
    const bx = tip[0] - nx * headLen, by = tip[1] - ny * headLen;
    heads.push(`M${f1(tip[0])} ${f1(tip[1])}L${f1(bx - ny * hw)} ${f1(by + nx * hw)}L${f1(tip[0] - nx * headLen * 0.78)} ${f1(tip[1] - ny * headLen * 0.78)}L${f1(bx + ny * hw)} ${f1(by - nx * hw)}z`);
    return [tip[0] - nx * headLen * 0.7, tip[1] - ny * headLen * 0.7] as [number, number];
  };
  const tangentEnd = c || p0, tangentStart = c || p1;
  if (a.head === 'end' || a.head === 'both') p1 = head(p1, tangentEnd);
  if (a.head === 'start' || a.head === 'both') p0 = head(p0, tangentStart);
  const d = c ? `M${f1(p0[0])} ${f1(p0[1])}Q${f1(c[0])} ${f1(c[1])} ${f1(p1[0])} ${f1(p1[1])}` : `M${f1(p0[0])} ${f1(p0[1])}L${f1(p1[0])} ${f1(p1[1])}`;
  const mid: [number, number] = c ? [0.25 * p0[0] + 0.5 * c[0] + 0.25 * p1[0], 0.25 * p0[1] + 0.5 * c[1] + 0.25 * p1[1]] : [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
  return { p0, p1, c, mid, d, heads };
}
function arrowItem(doc: Doc, v: Variant, a: ArrowEl, byId: Map<string, AnnItem>): AnnItem | null {
  const g = arrowGeom(v, a, byId); if (!g) return null;
  const w = a.width * v.ts;
  const paths: PathPrim[] = [{ d: g.d, fill: 'none', stroke: a.color, width: +w.toFixed(2), cap: 'round', ...(a.dash ? { dash: `${f1(w * 3.2)} ${f1(w * 2.4)}` } : {}) }];
  for (const h of g.heads) paths.push({ d: h, fill: a.color });
  const xs = [g.p0[0], g.p1[0], g.mid[0]], ys = [g.p0[1], g.p1[1], g.mid[1]];
  return { id: a.id, el: a, frame: 'board', paths, rects: [], texts: [], body: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], label: null, anchor: g.p0, arrow: g };
}
/** Mittelpunkte beider Enden (vor dem Abstand zu Elementen), für das Biegen per Griff */
export function arrowRawEnds(doc: Doc, v: Variant, a: ArrowEl): [[number, number], [number, number]] {
  const byId = new Map(annItems(doc, v).filter(it => it.frame !== 'inset' && it.el.type !== 'arrow').map(it => [it.id, it]));
  const A = resolveEnd(v, a.from, byId), B = resolveEnd(v, a.to, byId);
  return [A?.p || [0, 0], B?.p || [0, 0]];
}
/** Alle sichtbaren Elemente einer Variante, in Stapelreihenfolge. Pfeile werden nach den übrigen Elementen berechnet. */
export function annItems(doc: Doc, v: Variant): AnnItem[] {
  const main = new Map<string, AnnItem>(), perEl = new Map<string, AnnItem[]>();
  for (const el of doc.els) {
    if (el.hidden || el.type === 'arrow') continue;
    const list: AnnItem[] = [];
    if (el.type === 'marker') {
      const p = toBoard(v, 'main', el.at);
      if (inFrame(v, 'main', p)) { const it = markerItem(doc, v, el, 'main', p, true); list.push(it); main.set(el.id, it); }
      if (el.inset && doc.inset.visible) { const q = toBoard(v, 'inset', el.at); if (inFrame(v, 'inset', q)) list.push(markerItem(doc, v, el, 'inset', q, false)); }
    } else { const it = textItem(doc, v, el); if (it) { list.push(it); main.set(el.id, it); } }
    perEl.set(el.id, list);
  }
  const out: AnnItem[] = [];
  for (const el of doc.els) {
    if (el.hidden) continue;
    if (el.type === 'arrow') { const it = arrowItem(doc, v, el, main); if (it) out.push(it); }
    else out.push(...(perEl.get(el.id) || []));
  }
  return out;
}
export const elName = (el: AnnEl) => el.type === 'marker' ? (el.label.split('\n')[0] || el.place?.name.split(',')[0] || 'Marker') : el.type === 'text' ? (el.text.split('\n')[0].slice(0, 32) || 'Textkasten') : 'Pfeil';
export { toBoard };
