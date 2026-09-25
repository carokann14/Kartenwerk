// SVG-Export (Vektor) und Grundlage für PNG: Text als Pfade, Stile als Attribute, kein CSS
import { CONTEXT, GEO, Pt, Poly, arcLines, bboxOfIds, lodTol, mergedRings, polysAt } from '../geo/geo';
import { textPathD, measureW } from '../lib/fonts';
import { esc, svgId } from '../lib/util';
import type { BBox } from '../lib/util';
import type { Doc } from '../model/types';
import { colorModel } from '../render/colorModel';
import { areaFill, hatchMap, hatchPathD } from '../render/hatch';
import { annItems, elName } from '../render/annotations';
import { bubbleSet } from '../render/bubbles';
import { activeVariant, labelPrims, layoutLabels, legendPrims, Prims, TextPrim, textPrims } from '../render/elements';
import { FrameId, activeOverlays, frameMeshes, frameSets, insetIdx, insetLabel, overlayParts } from '../render/scene';

const q1 = (v: number) => Math.round(v * 10);
function relD(rings: number[][][], closed: boolean) {
  const out: string[] = [];
  for (const r of rings) {
    if (r.length < (closed ? 3 : 2)) continue;
    let px = q1(r[0][0]), py = q1(r[0][1]);
    let d = 'M' + px / 10 + ' ' + py / 10;
    let body = '', first = true;
    for (let k = 1; k < r.length; k++) {
      const x = q1(r[k][0]), y = q1(r[k][1]), dx = x - px, dy = y - py;
      if (!dx && !dy) continue;
      const sx = String(dx / 10), sy = String(dy / 10);
      body += (first || sx[0] === '-' ? sx : ' ' + sx) + (sy[0] === '-' ? sy : ' ' + sy);
      first = false; px = x; py = y;
    }
    if (body) d += 'l' + body;
    if (closed) d += 'z';
    out.push(d);
  }
  return out.join('');
}
/** Linienstücke mit gemeinsamen Endpunkten zu längeren Linien verbinden (weniger „M“-Befehle, kleinere Datei) */
function chainLines(segs: number[][][]): number[][][] {
  const key = (p: number[]) => q1(p[0]) + ',' + q1(p[1]);
  const at = new Map<string, number[]>();
  segs.forEach((sg, i) => { for (const k of [key(sg[0]), key(sg[sg.length - 1])]) { const L = at.get(k); if (L) L.push(i); else at.set(k, [i]); } });
  const used = new Uint8Array(segs.length), out: number[][][] = [];
  const take = (k: string) => { const L = at.get(k); if (!L) return -1; for (const i of L) if (!used[i]) return i; return -1; };
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1; let line = segs[i].slice();
    for (let dir = 0; dir < 2; dir++) {
      for (;;) {
        const endK = key(line[line.length - 1]), j = take(endK); if (j < 0) break;
        used[j] = 1; let sg = segs[j]; if (key(sg[0]) !== endK) sg = sg.slice().reverse();
        for (let k = 1; k < sg.length; k++) line.push(sg[k]);
      }
      line.reverse();
    }
    out.push(line);
  }
  return out;
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
const primsToPaths = (p: Prims) => p.rects.map(r => `<rect x="${r.x.toFixed(1)}" y="${r.y.toFixed(1)}" width="${r.w.toFixed(1)}" height="${r.h.toFixed(1)}" fill="${r.fill}"/>`).join('')
  + (p.paths || []).map(q => `<path d="${q.d}" fill="${q.fill}"${q.stroke ? ` stroke="${q.stroke}" stroke-width="${q.width ?? 1}" stroke-linejoin="round"${q.cap ? ` stroke-linecap="${q.cap}"` : ''}${q.dash ? ` stroke-dasharray="${q.dash}"` : ''}` : ''}/>`).join('') + p.texts.map(textToPath).join('');

export interface ExportOpts { merge: boolean; scale: number }   // merge: gleiche Farben als eine Fläche; scale: Ausgabe-Pixel je Grafik-Pixel
function exportFrame(doc: Doc, id: FrameId, o: ExportOpts) {
  const v = activeVariant(doc), F = v.L[id], vw = F.view, st = doc.style, g = GEO[doc.geoSet];
  const cm = colorModel(doc);
  const R: BBox = [F.x, F.y, F.x + F.w, F.y + F.h];
  const toA = ([gx, gy]: Pt) => [F.x + (gx - vw.cx) * vw.k + F.w / 2, F.y + (gy - vw.cy) * vw.k + F.h / 2];
  // Vereinfachung unterhalb eines Ausgabe-Pixels (PNG 2× → halbe Toleranz in Grafik-Pixeln)
  const tol = 0.3 / Math.max(1, o.scale);
  const polyRings = (polys: Poly[], bb: BBox) => {
    const a = toA([bb[0], bb[1]]), b = toA([bb[2], bb[3]]);
    const rings: number[][][] = [];
    if (b[0] < R[0] || a[0] > R[2] || b[1] < R[1] || a[1] > R[3]) return rings;
    const inside = a[0] >= R[0] && a[1] >= R[1] && b[0] <= R[2] && b[1] <= R[3];
    for (const poly of polys) for (const ring of poly) { let r = simplifyPx(ring.map(toA), tol, true); if (!inside) r = clipPoly(r, R); if (r.length >= 3) rings.push(r); }
    return rings;
  };
  const polyOut = (polys: Poly[], bb: BBox) => relD(polyRings(polys, bb), true);
  const lineOut = (lines: Pt[][]) => {
    const segs: number[][][] = [];
    for (const l of lines) {
      const r = simplifyPx(l.map(toA), tol, false);
      for (const sg of clipLine(r, R)) if (sg.length >= 2) segs.push(sg);
    }
    return relD(chainLines(segs), false);
  };
  const sets = frameSets(doc, id), me = frameMeshes(doc, id, sets);
  // große Gebietsstände: vorab auf den Exportmaßstab vereinfachen (halbe Toleranz, Rest erledigt simplifyPx)
  const lt = lodTol(g, vw.k * 2 * Math.max(1, o.scale)), pa = (i: number) => polysAt(g, i, lt), arcsL = (x: number[]) => arcLines(g, x, lt);
  const krOn = doc.layers.krLines && me.kr.length > 0;
  let s = `<g id="${id === 'main' ? 'Hauptkarte' : 'Inset-' + svgId(insetLabel(doc))}">`;
  if (id === 'inset') s += `<rect x="${F.x}" y="${F.y}" width="${F.w}" height="${F.h}" fill="#FFFFFF"/>`;
  if (doc.layers.neighbors) { s += `<g id="${id}-Nachbarstaaten">`; for (const c of CONTEXT.countries) { const d = polyOut(c.polys, c.bbox); if (d) s += `<path id="${id}-${c.code}" d="${d}" fill="${st.neighbor}" fill-rule="evenodd" stroke="${st.neighborLine}" stroke-width="0.7" stroke-linejoin="round"/>`; } s += `</g>`; }
  if (doc.layers.lakes) { s += `<g id="${id}-Gewaesser">`; for (const c of CONTEXT.lakes) { const d = polyOut(c.polys, c.bbox); if (d) s += `<path d="${d}" fill="${st.water}" fill-rule="evenodd"/>`; } s += `</g>`; }
  // Gleiche Farben als eine Fläche: keine feinen Nahtlinien zwischen Nachbargebieten (PNG), kleinere Datei
  const merge = o.merge;
  const bigBox: BBox = [-1e9, -1e9, 1e9, 1e9];
  const mergedOut = (idx: Iterable<number>) => polyRings([mergedRings(g, idx, lt)], bigBox);
  if (!me.linesMode && sets.U.size) {
    s += `<g id="${id}-Umfeld">`;
    if (merge) { const d = relD(mergedOut(sets.U), true); if (d) s += `<path d="${d}" fill="${st.umfeld}" fill-rule="evenodd"/>`; }
    else for (const i of sets.U) { const a = g.areas[i]; const d = polyOut(pa(i), a.bbox); if (d) s += `<path d="${d}" fill="${st.umfeld}" fill-rule="evenodd"/>`; }
    s += `</g>`;
  }
  s += `<g id="${id}-Gebiete">`;
  const hm = hatchMap(doc), hatchRings = new Map<string, number[][][]>();
  const fillOfI = (i: number) => doc.layers.wkFill ? areaFill(doc, cm, i) : st.umfeld;
  if (merge) {
    const byFill = new Map<string, number[]>(), byHatch = new Map<string, number[]>();
    for (const i of sets.F) {
      const f = fillOfI(i); const L = byFill.get(f); if (L) L.push(i); else byFill.set(f, [i]);
      const h = doc.layers.hatches ? hm.byArea[i] : null; if (h) { const H = byHatch.get(h); if (H) H.push(i); else byHatch.set(h, [i]); }
    }
    for (const [f, idx] of [...byFill.entries()].sort((a, b) => b[1].length - a[1].length)) { const d = relD(mergedOut(idx), true); if (d) s += `<path id="${id}-Farbe-${f.slice(1)}" d="${d}" fill="${f}" fill-rule="evenodd"/>`; }
    for (const [h, idx] of byHatch) hatchRings.set(h, mergedOut(idx));
  } else for (const i of sets.F) {
    const a = g.areas[i]; const rings = polyRings(pa(i), a.bbox); if (!rings.length) continue;
    s += `<path id="${id}-${svgId(g.meta.level)}-${a.id}" d="${relD(rings, true)}" fill="${fillOfI(i)}" fill-rule="evenodd"/>`;
    const h = doc.layers.hatches ? hm.byArea[i] : null;
    if (h) { const L = hatchRings.get(h) || []; L.push(...rings); hatchRings.set(h, L); }
  }
  s += `</g>`;
  if (hatchRings.size) {
    s += `<g id="${id}-Schraffuren">`;
    for (const [h, rings] of hatchRings) {
      const hs = hm.styles.get(h)!; const d = hatchPathD(hs, rings); if (!d) continue;
      s += hs.pattern === 'punkte' ? `<path id="${id}-Schraffur-${svgId(hs.name)}" d="${d}" fill="${hs.color}"/>`
        : `<path id="${id}-Schraffur-${svgId(hs.name)}" d="${d}" fill="none" stroke="${hs.color}" stroke-width="${hs.width}" stroke-linecap="butt"/>`;
    }
    s += `</g>`;
  }
  s += `<g id="${id}-Grenzen">`;
  const ln = (lines: Pt[][], color: string, w: number, name: string, dash = false) => { const d = lineOut(lines); return d ? `<path id="${id}-${name}" d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="${dash ? 'butt' : 'round'}"${dash ? ` stroke-dasharray="${(w * 3.2).toFixed(1)} ${(w * 2.4).toFixed(1)}"` : ''}/>` : ''; };
  if (doc.layers.wkLines) s += ln(arcsL(krOn ? me.wk : [...me.wk, ...me.kr]), st.wkLine, st.wkLineW, 'Gebietsgrenzen');
  if (krOn) s += ln(arcsL(me.kr), st.krLine, st.krLineW, 'Kreisgrenzen');
  if (me.linesMode) { s += ln(arcsL(me.wkU), '#C8C2B6', 0.6, 'Umfeldgrenzen'); s += ln(arcsL(me.outline), '#B9B2A5', 0.8, 'Umfeldumriss'); }
  if (doc.layers.landLines) s += ln(arcsL(me.land), st.landLine, st.landLineW, 'Laendergrenzen');
  for (const ov of activeOverlays(doc)) { const og = GEO[ov.geoSet]; s += ln(overlayParts(g, og).flatMap(p => arcLines(p.set, p.arcs, lodTol(p.set, vw.k * 2 * Math.max(1, o.scale)))), ov.color, ov.width, 'Grenzen-' + svgId(og.meta.label), ov.dash); }
  if (id === 'main' && doc.fokusOutline && doc.fokus.kind !== 'de') s += ln(arcsL(me.fokus), st.fokusLine, 1.8, 'Fokusumriss');
  if (id === 'main' && doc.inset.visible && doc.fokus.kind === 'de') {
    const bb = bboxOfIds(g, insetIdx(doc)), p = 800;
    const a = toA([bb[0] - p, bb[1] - p]), b = toA([bb[2] + p, bb[3] + p]);
    s += `<rect id="Lupe" x="${a[0].toFixed(1)}" y="${a[1].toFixed(1)}" width="${(b[0] - a[0]).toFixed(1)}" height="${(b[1] - a[1]).toFixed(1)}" fill="none" stroke="${st.frameLine}" stroke-width="1.2"/>`;
  }
  s += `</g>`;
  const bub = bubbleSet(doc, id, v);
  if (bub && bub.items.length) {
    const b = doc.bubbles!, sw = (b.strokeW > 0 ? ` stroke="${b.stroke}" stroke-width="${b.strokeW}"` : '') + (b.opacity != null && b.opacity < 1 ? ` fill-opacity="${b.opacity}"` : '');
    s += `<g id="${id}-Blasen">`;
    for (const it of bub.items) { const cx = F.x + it.x, cy = F.y + it.y; if (cx + it.r < R[0] || cx - it.r > R[2] || cy + it.r < R[1] || cy - it.r > R[3]) continue; s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${it.r.toFixed(1)}" fill="${it.fill}"${sw}/>`; }
    s += `</g>`;
  }
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
export function buildExportSvg(doc: Doc, opts: Partial<ExportOpts> = {}, transparent = doc.background === 'transparent') {
  const o: ExportOpts = { merge: false, scale: 1, ...opts };
  const v = activeVariant(doc), W = v.w, H = v.h;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  if (!transparent) s += `<rect id="Hintergrund" x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>`;
  s += exportFrame(doc, 'main', o);
  if (doc.inset.visible) s += exportFrame(doc, 'inset', o);
  const lp = legendPrims(doc); if (lp) s += `<g id="Legende">${primsToPaths(lp)}</g>`;
  for (const [kind, name] of [['title', 'Titel'], ['subtitle', 'Unterzeile'], ['source', 'Quelle']] as const) { const p = textPrims(doc, kind); if (p) s += `<g id="${name}">${primsToPaths(p)}</g>`; }
  const items = annItems(doc, v);
  if (items.length) {
    s += `<g id="Marker-und-Texte">`;
    let nArrow = 0;
    for (const it of items) s += `<g id="${it.el.type === 'arrow' ? 'Pfeil-' + (++nArrow) : svgId((it.el.type === 'marker' ? 'Marker-' : 'Text-') + elName(it.el)) || it.id}">${primsToPaths({ texts: it.texts, rects: it.rects, paths: it.paths, box: { x: 0, y: 0, w: 0, h: 0 } })}</g>`;
    s += `</g>`;
  }
  return s + `</svg>`;
}
export interface SvgReport { bytes: number; colors: number; paths: number; checks: { ok: boolean; label: string }[] }
export function analyzeSvg(svg: string): SvgReport {
  const bytes = new Blob([svg]).size;
  const colors = new Set<string>();
  for (const m of svg.matchAll(/(?:fill|stroke)="(#[0-9A-Fa-f]{3,8})"/g)) colors.add(m[1].toUpperCase());
  const paths = (svg.match(/<path /g) || []).length + (svg.match(/<rect /g) || []).length + (svg.match(/<circle /g) || []).length;
  return {
    bytes, colors: colors.size, paths, checks: [
      { ok: !/<text/.test(svg), label: 'Schrift als Pfade: sieht überall gleich aus, keine Schriftdateien nötig' },
      { ok: true, label: 'Ebenen als benannte Gruppen (Hauptkarte, Legende, Titel …)' },
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
