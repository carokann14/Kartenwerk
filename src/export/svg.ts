// Flaches SVG 1.1 für Canva: alles als Pfade, keine Transparenz, kein CSS
import { CONTEXT, GEO, Pt, Poly, bboxOfIds } from '../geo/geo';
import { textPathD, measureW } from '../lib/fonts';
import { esc, svgId } from '../lib/util';
import type { BBox } from '../lib/util';
import type { Doc } from '../model/types';
import { colorModel, fillOf } from '../render/colorModel';
import { activeVariant, labelPrims, layoutLabels, legendPrims, Prims, TextPrim, textPrims } from '../render/elements';
import { FrameId, frameMeshes, frameSets, insetIdx, insetLabel } from '../render/scene';

const q1 = (v: number) => Math.round(v * 10);
function relD(rings: number[][][], closed: boolean) {
  let d = '';
  for (const r of rings) {
    if (r.length < (closed ? 3 : 2)) continue;
    let px = q1(r[0][0]), py = q1(r[0][1]);
    d += 'M' + px / 10 + ' ' + py / 10 + 'l';
    let first = true;
    for (let k = 1; k < r.length; k++) {
      const x = q1(r[k][0]), y = q1(r[k][1]), dx = x - px, dy = y - py;
      if (!dx && !dy) continue;
      const sx = String(dx / 10), sy = String(dy / 10);
      d += (first || sx[0] === '-' ? sx : ' ' + sx) + (sy[0] === '-' ? sy : ' ' + sy);
      first = false; px = x; py = y;
    }
    if (d.endsWith('l')) d = d.slice(0, -1);
    if (closed) d += 'z';
  }
  return d;
}
function simplifyPx(pts: number[][], tol: number, closed: boolean) {
  if (pts.length <= 3) return pts;
  const out = [pts[0]]; let [lx, ly] = pts[0];
  for (let k = 1; k < pts.length - 1; k++) { const [x, y] = pts[k]; if ((x - lx) ** 2 + (y - ly) ** 2 >= tol * tol) { out.push(pts[k]); lx = x; ly = y; } }
  out.push(pts[pts.length - 1]);
  return closed && out.length < 3 ? pts : out;
}
function clipPoly(pts: number[][], R: BBox) {
  const edges: [(p: number[]) => boolean, (a: number[], b: number[]) => number[]][] = [
    [p => p[0] >= R[0], (a, b) => { const t = (R[0] - a[0]) / (b[0] - a[0]); return [R[0], a[1] + t * (b[1] - a[1])]; }],
    [p => p[0] <= R[2], (a, b) => { const t = (R[2] - a[0]) / (b[0] - a[0]); return [R[2], a[1] + t * (b[1] - a[1])]; }],
    [p => p[1] >= R[1], (a, b) => { const t = (R[1] - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), R[1]]; }],
    [p => p[1] <= R[3], (a, b) => { const t = (R[3] - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), R[3]]; }],
  ];
  let out = pts;
  for (const [inside, inter] of edges) {
    const inp = out; out = []; if (!inp.length) break;
    let S = inp[inp.length - 1];
    for (const E of inp) { if (inside(E)) { if (!inside(S)) out.push(inter(S, E)); out.push(E); } else if (inside(S)) out.push(inter(S, E)); S = E; }
  }
  return out;
}
function clipLine(pts: number[][], R: BBox) {
  const out: number[][][] = []; let cur: number[][] | null = null;
  for (let k = 1; k < pts.length; k++) {
    const [x0, y0] = pts[k - 1], [x1, y1] = pts[k];
    let t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0;
    const p = [-dx, dx, -dy, dy], q = [x0 - R[0], R[2] - x0, y0 - R[1], R[3] - y0];
    let ok = true;
    for (let j = 0; j < 4; j++) {
      if (p[j] === 0) { if (q[j] < 0) { ok = false; break; } }
      else { const r = q[j] / p[j]; if (p[j] < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; } else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; } }
    }
    if (!ok) { cur = null; continue; }
    const a = [x0 + t0 * dx, y0 + t0 * dy], b = [x0 + t1 * dx, y0 + t1 * dy];
    if (!cur || t0 > 0) { cur = [a]; out.push(cur); }
    cur.push(b);
    if (t1 < 1) cur = null;
  }
  return out;
}
export function textToPath(t: TextPrim) {
  let x = t.x;
  const w = measureW(t.text, t.cut, t.size);
  if (t.anchor === 'middle') x -= w / 2; else if (t.anchor === 'end') x -= w;
  const d = textPathD(t.text, t.cut, x, t.y, t.size);
  if (!d) return `<text x="${t.x.toFixed(1)}" y="${t.y.toFixed(1)}" font-size="${t.size}" fill="${t.color}">${esc(t.text)}</text>`;
  let s = '';
  if (t.halo) s += `<path d="${d}" fill="none" stroke="#FFFFFF" stroke-width="${(t.size * 0.24).toFixed(2)}" stroke-linejoin="round"/>`;
  return s + `<path d="${d}" fill="${t.color}"/>`;
}
const primsToPaths = (p: Prims) => p.rects.map(r => `<rect x="${r.x.toFixed(1)}" y="${r.y.toFixed(1)}" width="${r.w.toFixed(1)}" height="${r.h.toFixed(1)}" fill="${r.fill}"/>`).join('') + p.texts.map(textToPath).join('');

function exportFrame(doc: Doc, id: FrameId) {
  const v = activeVariant(doc), F = v.L[id], vw = F.view, st = doc.style, g = GEO[doc.geoSet];
  const cm = colorModel(doc);
  const R: BBox = [F.x, F.y, F.x + F.w, F.y + F.h];
  const toA = ([gx, gy]: Pt) => [F.x + (gx - vw.cx) * vw.k + F.w / 2, F.y + (gy - vw.cy) * vw.k + F.h / 2];
  const tol = 0.35;
  const polyOut = (polys: Poly[], bb: BBox) => {
    const a = toA([bb[0], bb[1]]), b = toA([bb[2], bb[3]]);
    if (b[0] < R[0] || a[0] > R[2] || b[1] < R[1] || a[1] > R[3]) return '';
    const inside = a[0] >= R[0] && a[1] >= R[1] && b[0] <= R[2] && b[1] <= R[3];
    const rings: number[][][] = [];
    for (const poly of polys) for (const ring of poly) { let r = simplifyPx(ring.map(toA), tol, true); if (!inside) r = clipPoly(r, R); if (r.length >= 3) rings.push(r); }
    return relD(rings, true);
  };
  const lineOut = (lines: Pt[][]) => { const segs: number[][][] = []; for (const l of lines) { const r = simplifyPx(l.map(toA), tol, false); for (const sg of clipLine(r, R)) if (sg.length >= 2) segs.push(sg); } return relD(segs, false); };
  const sets = frameSets(doc, id), me = frameMeshes(doc, id, sets);
  let s = `<g id="${id === 'main' ? 'Hauptkarte' : 'Inset-' + svgId(insetLabel(doc))}">`;
  if (id === 'inset') s += `<rect x="${F.x}" y="${F.y}" width="${F.w}" height="${F.h}" fill="#FFFFFF"/>`;
  if (doc.layers.neighbors) { s += `<g id="${id}-Nachbarstaaten">`; for (const c of CONTEXT.countries) { const d = polyOut(c.polys, c.bbox); if (d) s += `<path id="${id}-${c.code}" d="${d}" fill="${st.neighbor}" fill-rule="evenodd" stroke="${st.neighborLine}" stroke-width="0.7" stroke-linejoin="round"/>`; } s += `</g>`; }
  if (doc.layers.lakes) { s += `<g id="${id}-Gewaesser">`; for (const c of CONTEXT.lakes) { const d = polyOut(c.polys, c.bbox); if (d) s += `<path d="${d}" fill="${st.water}" fill-rule="evenodd"/>`; } s += `</g>`; }
  if (!me.linesMode && sets.U.size) { s += `<g id="${id}-Umfeld">`; for (const i of sets.U) { const a = g.areas[i]; const d = polyOut(a.polys, a.bbox); if (d) s += `<path d="${d}" fill="${st.umfeld}" fill-rule="evenodd"/>`; } s += `</g>`; }
  s += `<g id="${id}-Gebiete">`;
  for (const i of sets.F) { const a = g.areas[i]; const d = polyOut(a.polys, a.bbox); if (d) s += `<path id="${id}-${svgId(g.meta.level)}-${a.id}" d="${d}" fill="${doc.layers.wkFill ? fillOf(doc, cm, i) : st.umfeld}" fill-rule="evenodd"/>`; }
  s += `</g><g id="${id}-Grenzen">`;
  const ln = (lines: Pt[][], color: string, w: number, name: string) => { const d = lineOut(lines); return d ? `<path id="${id}-${name}" d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>` : ''; };
  if (doc.layers.wkLines) s += ln(me.wk, st.wkLine, st.wkLineW, 'Gebietsgrenzen');
  if (me.linesMode) { s += ln(me.wkU, '#C8C2B6', 0.6, 'Umfeldgrenzen'); s += ln(me.outline, '#B9B2A5', 0.8, 'Umfeldumriss'); }
  if (doc.layers.landLines) s += ln(me.land, st.landLine, st.landLineW, 'Laendergrenzen');
  if (id === 'main' && doc.fokusOutline && doc.fokus.kind !== 'de') s += ln(me.fokus, st.fokusLine, 1.8, 'Fokusumriss');
  if (id === 'main' && doc.inset.visible && doc.fokus.kind === 'de') {
    const bb = bboxOfIds(g, insetIdx(doc)), p = 800;
    const a = toA([bb[0] - p, bb[1] - p]), b = toA([bb[2] + p, bb[3] + p]);
    s += `<rect id="Lupe" x="${a[0].toFixed(1)}" y="${a[1].toFixed(1)}" width="${(b[0] - a[0]).toFixed(1)}" height="${(b[1] - a[1]).toFixed(1)}" fill="none" stroke="${st.frameLine}" stroke-width="1.2"/>`;
  }
  s += `</g>`;
  const lay = layoutLabels(doc, id);
  if (lay.items.length) {
    s += `<g id="${id}-Beschriftungen">`;
    for (const it of lay.items) {
      if (it.leader) s += `<path d="M${(F.x + it.leader[0]).toFixed(1)} ${(F.y + it.leader[1]).toFixed(1)}L${(F.x + it.leader[2]).toFixed(1)} ${(F.y + it.leader[3]).toFixed(1)}" fill="none" stroke="${st.ink}" stroke-width="1"/><circle cx="${(F.x + it.leader[0]).toFixed(1)}" cy="${(F.y + it.leader[1]).toFixed(1)}" r="2" fill="${st.ink}"/>`;
      for (const t of labelPrims(doc, it)) s += textToPath({ ...t, x: t.x + F.x, y: t.y + F.y });
    }
    s += `</g>`;
  }
  if (id === 'inset') {
    s += `<rect x="${F.x}" y="${F.y}" width="${F.w}" height="${F.h}" fill="none" stroke="${st.frameLine}" stroke-width="1.5"/>`;
    const cap = insetLabel(doc), size = Math.round(17 * v.ts), w = measureW(cap, 'bold', size) + 14;
    s += `<rect x="${F.x}" y="${F.y}" width="${w.toFixed(1)}" height="${size + 10}" fill="${st.frameLine}"/>` + textToPath({ x: F.x + 7, y: F.y + 5 + size * 0.8, text: cap, cut: 'bold', size, color: '#FFFFFF', anchor: 'start' });
  }
  return s + `</g>`;
}
export function buildExportSvg(doc: Doc, transparent = doc.background === 'transparent') {
  const v = activeVariant(doc), W = v.w, H = v.h;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  if (!transparent) s += `<rect id="Hintergrund" x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>`;
  s += exportFrame(doc, 'main');
  if (doc.inset.visible) s += exportFrame(doc, 'inset');
  const lp = legendPrims(doc); if (lp) s += `<g id="Legende">${primsToPaths(lp)}</g>`;
  for (const [kind, name] of [['title', 'Titel'], ['subtitle', 'Unterzeile'], ['source', 'Quelle']] as const) { const p = textPrims(doc, kind); if (p) s += `<g id="${name}">${primsToPaths(p)}</g>`; }
  return s + `</svg>`;
}
export interface SvgReport { bytes: number; colors: number; paths: number; checks: { ok: boolean; label: string }[] }
export function analyzeSvg(svg: string): SvgReport {
  const bytes = new Blob([svg]).size;
  const colors = new Set<string>();
  for (const m of svg.matchAll(/(?:fill|stroke)="(#[0-9A-Fa-f]{3,8})"/g)) colors.add(m[1].toUpperCase());
  const paths = (svg.match(/<path /g) || []).length + (svg.match(/<rect /g) || []).length + (svg.match(/<circle /g) || []).length;
  const lim = 3 * 1024 * 1024;
  return {
    bytes, colors: colors.size, paths, checks: [
      { ok: !/<style|class=/.test(svg), label: 'SVG 1.1, Stile als Attribute, kein CSS' },
      { ok: !/<text/.test(svg), label: 'Text in Pfade umgewandelt (Merriweather)' },
      { ok: !/<pattern|<mask|<clipPath|<filter|Gradient/.test(svg), label: 'Keine Muster, Masken, Beschnittpfade, Verläufe' },
      { ok: !/opacity/.test(svg), label: 'Keine Transparenz, Mischfarben vorab berechnet' },
      { ok: !/<use|<marker|<image/.test(svg), label: 'Keine Verweise, Marker oder eingebetteten Bilder' },
      { ok: bytes < lim, label: bytes < lim ? 'Unter der Canva-Grenze von 3 MB' : 'Über 3 MB – Canva lehnt die Datei ab' },
    ],
  };
}
export function renderPng(svg: string, w: number, h: number): Promise<Blob> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d')!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      cv.toBlob(b => b ? res(b) : rej(new Error('PNG konnte nicht erzeugt werden')), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('PNG konnte nicht erzeugt werden')); };
    img.src = url;
  });
}
