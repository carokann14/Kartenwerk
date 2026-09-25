// Texte, Legende und Beschriftungen als Primitive (Editor: <text>, Export: Pfade)
import { CONT_STEPS, STEP_T, contColor, fmtBreak, mixWhite, signed } from '../lib/color';
import { Cut, ascentRatio, capOffset, measureW, wrapText } from '../lib/fonts';
import { clamp, fmt1, fmtNum } from '../lib/util';
import { areaRowIndex, groupMetrics } from '../data/derive';
import { GEO, LAENDER } from '../geo/geo';
import { LH } from '../model/defaults';
import type { Doc, Variant } from '../model/types';
import { ColorModel, colorModel, partyColor } from './colorModel';
import { hatchPathD, rectRing } from './hatch';
import { markerD } from './annotations';
import { LegEntry, legendModel } from './legend';
import { bubbleLegendValues, bubbleSet, circleD } from './bubbles';
import { FrameId, frameSets, geoOf, jointOf } from './scene';
import { logoRect } from '../model/logo';

export interface TextPrim { x: number; y: number; text: string; cut: Cut; size: number; color: string; anchor: 'start' | 'middle' | 'end'; halo?: boolean }
export interface RectPrim { x: number; y: number; w: number; h: number; fill: string }
export interface PathPrim { d: string; fill: string; stroke?: string; width?: number; dash?: string; cap?: 'round' | 'butt' }
export interface Prims { texts: TextPrim[]; rects: RectPrim[]; paths?: PathPrim[]; box: { x: number; y: number; w: number; h: number } }

export const activeVariant = (doc: Doc): Variant => doc.variants[doc.active];
const styleColor = (doc: Doc, c: string) => (c in doc.style ? String((doc.style as unknown as Record<string, string>)[c]) : c);

// ---------- Quellenvermerk ----------
/** „Wahlbezirke“ → „Wahlbezirken“ (Dativ Plural nach „aus“), „Gemeinden“ bleibt */
export const dativ = (label: string) => label.replace(/^([^\s(]+)/, w => /[ns]$/.test(w) ? w : w + 'n');
/** Automatischer Quellenvermerk aus den verwendeten Daten, Geometrien und Ortslagen */
export function autoSourceText(doc: Doc): string {
  const g = GEO[doc.geoSet];
  const parts: string[] = [];
  const cm = colorModel(doc);
  const used = cm.dataset ? [cm.dataset] : [];
  for (const ds of used) {
    const s = ds.settings;
    parts.push(`Daten: ${[s.attribution, s.sourceTitle].filter(Boolean).join(', ') || ds.fileName}.`);
    if (ds.derived) parts.push(`Werte aus ${dativ(GEO[ds.derived.from]?.meta.levelLabel || 'kleineren Gebieten')} summiert.`);
  }
  if (g) parts.push(`Geometrie: ${g.meta.stand ? `Gebietsstand ${g.meta.stand}, ` : ''}${g.meta.attribution}, vereinfacht${g.meta.base ? `; Regionen aus ${dativ(GEO[g.meta.base]?.meta.levelLabel || 'Bausteinen')} zusammengefasst` : ''}.`);
  if (doc.layers.neighbors || doc.layers.lakes) parts.push('Nachbarstaaten und Gewässer: Natural Earth.');
  const gv = [...new Set(doc.els.filter(e => e.type === 'marker' && !e.hidden && e.place).map(e => (e as { place: { src: string } }).place.src))];
  if (gv.length) parts.push(`Ortslagen: ${gv.join('; ')}.`);
  return parts.join(' ');
}
/** Quellenzeile, wie sie in der Grafik steht: eigene Fassung oder automatisch */
export const sourceText = (doc: Doc): string => doc.texts.source.text != null ? doc.texts.source.text : autoSourceText(doc);
export const sourceIsManual = (doc: Doc) => doc.texts.source.text != null;
/** Lizenzgeber, die im Quellenvermerk genannt sein müssen (Daten und Geometrie), und die davon in `text` fehlenden */
export function missingMarks(doc: Doc, text = sourceText(doc)): string[] {
  const g = GEO[doc.geoSet], cm = colorModel(doc);
  const holder = (a: string | undefined) => (a || '').replace(/©/g, '').split(/,|\(|;/)[0].trim();
  const norm = (x: string) => x.replace(/©/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const need = [holder(cm.dataset?.settings.attribution), holder(g?.meta.attribution)].filter(x => x.length > 2);
  const t = norm(text);
  return [...new Set(need)].filter(h => !t.includes(norm(h)));
}
export const textOf = (doc: Doc, kind: 'title' | 'subtitle' | 'source') => kind === 'source' ? sourceText(doc) : doc.texts[kind].text;
export function textBlock(doc: Doc, kind: 'title' | 'subtitle' | 'source', w: number, ts: number) {
  const t = doc.texts[kind], size = +(t.size * ts).toFixed(2);
  const lines = wrapText(textOf(doc, kind), t.cut, size, w);
  const lh = size * LH[kind];
  return { lines, lh, height: lines.length * lh, size, cut: t.cut };
}
export function textPrims(doc: Doc, kind: 'title' | 'subtitle' | 'source', v: Variant = activeVariant(doc)): Prims | null {
  const t = doc.texts[kind], L = v.L[kind];
  if (!t.visible) return null;
  const b = textBlock(doc, kind, L.w, v.ts);
  const asc = ascentRatio(t.cut);
  const align = t.align || 'start';
  const ax = align === 'middle' ? L.x + L.w / 2 : align === 'end' ? L.x + L.w : L.x;
  const texts = b.lines.map((line, k) => ({ x: ax, y: L.y + k * b.lh + (b.lh - b.size) / 2 + asc * b.size * 0.94, text: line, cut: t.cut, size: b.size, color: styleColor(doc, t.color), anchor: align }));
  return { texts, rects: [], box: { x: L.x, y: L.y, w: L.w, h: b.height } };
}

// ---------- Legende ----------
export function legendPrims(doc: Doc, P: { x: number; y: number } = activeVariant(doc).L.legend, mainW = activeVariant(doc).L.main.w, ts = activeVariant(doc).ts): Prims | null {
  if (!doc.legend.visible) return null;
  const M = legendModel(doc); if (!M) return null;
  const cm = colorModel(doc), c = doc.color;
  const base = +(doc.legend.size * ts).toFixed(2), small = Math.round(base * 0.74), ink = doc.style.ink, soft = doc.style.inkSoft;
  const texts: TextPrim[] = [], rects: RectPrim[] = [], paths: PathPrim[] = [];
  let y = 0, maxX = 0;
  const T = (x: number, yy: number, text: string, cut: Cut, size: number, color: string, anchor: TextPrim['anchor'] = 'start') => {
    texts.push({ x: P.x + x, y: P.y + yy, text, cut, size, color, anchor });
    const w = measureW(text, cut, size);
    maxX = Math.max(maxX, anchor === 'start' ? x + w : anchor === 'middle' ? x + w / 2 : x);
  };
  const R = (x: number, yy: number, w: number, h: number, fill: string) => { rects.push({ x: P.x + x, y: P.y + yy, w, h, fill }); maxX = Math.max(maxX, x + w); };
  const lbl = (e: LegEntry) => e.label + (doc.legend.counts && e.count != null && e.kind !== 'line' && e.kind !== 'marker' ? ` (${e.count})` : '');
  /** Kästchen eines Eintrags: Fläche, Schraffur oder Linie */
  const swatch = (e: LegEntry, x: number, yy: number, w: number, h: number) => {
    const ax = P.x + x, ay = P.y + yy;
    if (e.kind === 'line') {
      if (e.dash) { const seg = 5, gap = 3.5; for (let sx = 0; sx < w; sx += seg + gap) rects.push({ x: ax + sx, y: ay + h / 2 - 1.25, w: Math.min(seg, w - sx), h: 2.5, fill: e.color }); }
      else rects.push({ x: ax, y: ay + h / 2 - 1.25, w, h: 2.5, fill: e.color });
      maxX = Math.max(maxX, x + w); return;
    }
    if (e.kind === 'marker' && e.marker) { const m = e.marker, sz = Math.min(w, h) * (m.shape === 'pin' ? 0.62 : 0.86); paths.push({ d: markerD(m, ax + w / 2, m.shape === 'pin' ? ay + h * 0.98 : ay + h / 2, sz), fill: m.fill, ...(m.strokeW > 0 && m.stroke.toUpperCase() !== '#FFFFFF' ? { stroke: m.stroke, width: Math.min(1, m.strokeW) } : {}) }); maxX = Math.max(maxX, x + w); return; }
    const fill = e.kind === 'nodata' ? e.color : e.kind === 'hatch' ? (e.bg || '#FFFFFF') : e.color;
    R(x, yy, w, h, fill);
    if (e.hatch && (e.kind === 'hatch' || e.kind === 'nodata')) {
      const d = hatchPathD(e.hatch, [rectRing(ax, ay, w, h)]);
      if (d) paths.push(e.hatch.pattern === 'punkte' ? { d, fill: e.hatch.color } : { d, fill: 'none', stroke: e.hatch.color, width: e.hatch.width });
      if (e.kind === 'hatch' && !e.bg) paths.push({ d: `M${ax} ${ay}h${w}v${h}h${-w}z`, fill: 'none', stroke: '#C9C3B8', width: 0.8 });
    }
  };
  for (const tl of wrapText(M.title, 'bold', base, Math.max(220, 300 * ts))) { T(0, y + base * 0.95, tl, 'bold', base, ink); y += base * 1.3; }
  y += base * 0.25;
  // Klassenbreite: mindestens so breit wie die längste Grenzbeschriftung (große Zahlen überlappen sonst)
  const segW = (n: number, min: number) => Math.round(Math.max(min, ...cm.breaks.slice(0, Math.max(0, n - 1)).map(b => measureW(fmtBreak(b), 'text', small) + small * 0.8)));
  const scale = (n: number, sw: number, gap: number, yy: number) => cm.breaks.forEach((b, k) => { if (k < n - 1) T((k + 1) * (sw + gap) - gap / 2, yy, fmtBreak(b), 'text', small, soft, 'middle'); });
  const rows = M.rows.filter(e => !e.hidden), more = M.more.filter(e => !e.hidden);
  const orient = doc.legend.orientation;
  /** Anordnung (untereinander/nebeneinander/Raster) für eine Reihe gleich hoher Einträge; misst und zeichnet jeden Eintrag über measure/draw. */
  const arrange = (n: number, or: 'vertical' | 'horizontal' | 'grid', measure: (i: number) => number, draw: (i: number, x: number, yy: number) => void, h: number) => {
    if (!n) return;
    if (or === 'horizontal') {
      let x = 0; const maxW = Math.max(260, mainW * 0.8);
      for (let i = 0; i < n; i++) {
        const w = measure(i) + base * 1.1;
        if (x > 0 && x + w > maxW) { x = 0; y += h + base * 0.42; }
        draw(i, x, y); x += w;
      }
      y += h;
    } else if (or === 'grid') {
      const cols = Math.max(1, Math.min(6, doc.legend.cols || 2)), colW: number[] = [];
      for (let i = 0; i < n; i++) { const cI = i % cols; colW[cI] = Math.max(colW[cI] || 0, measure(i) + base * 1.1); }
      for (let i = 0; i < n; i++) {
        const cI = i % cols, x = colW.slice(0, cI).reduce((a, b) => a + b, 0);
        if (cI === 0 && i > 0) y += h + base * 0.42;
        draw(i, x, y);
      }
      y += h;
    } else {
      for (let i = 0; i < n; i++) { draw(i, 0, y); y += h + base * 0.42; }
      y -= base * 0.42;
    }
  };
  /** Einfache Einträge untereinander, nebeneinander oder im Raster */
  const list = (items: LegEntry[], sw: number, size: number, color: string, or: 'vertical' | 'horizontal' | 'grid') => {
    arrange(items.length, or, i => sw + base * 0.5 + measureW(lbl(items[i]), 'text', size), (i, x, yy) => {
      const e = items[i]; swatch(e, x, yy, sw, sw); T(x + sw + base * 0.5, yy + sw / 2 + capOffset('text', size), lbl(e), 'text', size, color);
    }, sw);
  };
  /** Aus Farbe + Text gebaute Einträge für Klassen-Legenden (kein LegEntry aus dem Modell, aber gleich behandelbar) */
  const swItem = (color: string, label: string): LegEntry => ({ key: '', label, auto: label, color, count: null, kind: 'fill', hatch: null, bg: null, hidden: false, target: null, removable: false });
  if (M.main === 'matrix' && c.mode === 'siegerStaerke' && doc.legend.simple) {
    // Vereinfacht: ein Kasten je Partei in ihrer vollen Farbe, wie eine gewöhnliche Liste anordenbar (Unter/Neben/Raster).
    // Die Abstufung nach Stärke bleibt allein der Karte vorbehalten (cm.fills, unverändert).
    list(rows, Math.round(base * 1.15), base * 0.92, ink, orient);
  } else if (M.main === 'matrix' && c.mode === 'siegerStaerke') {
    const n = cm.steps, sw = segW(n, base * 2.35), sh = Math.round(base * 1.1), gap = 2, groupW = n * (sw + gap);
    if (orient === 'vertical') {
      if (n > 1) { scale(n, sw, gap, y + small * 0.9); y += small * 1.45; }
      for (const e of rows) {
        for (let s2 = 0; s2 < n; s2++) R(s2 * (sw + gap), y, sw, sh, mixWhite(e.color, STEP_T[n][s2]));
        T(groupW + base * 0.55, y + sh / 2 + capOffset('text', base * 0.92), lbl(e), 'text', base * 0.92, ink);
        y += sh + base * 0.42;
      }
      y -= base * 0.42;
    } else {
      // Neben/Raster: je Partei ihre Abstufungsreihe als ein Block; ohne gemeinsame Klassengrenzen-Skala, da Spalten hier nicht ausgerichtet sind.
      arrange(rows.length, orient, i => groupW + base * 0.55 + measureW(lbl(rows[i]), 'text', base * 0.92), (i, x, yy) => {
        const e = rows[i];
        for (let s2 = 0; s2 < n; s2++) R(x + s2 * (sw + gap), yy, sw, sh, mixWhite(e.color, STEP_T[n][s2]));
        T(x + groupW + base * 0.55, yy + sh / 2 + capOffset('text', base * 0.92), lbl(e), 'text', base * 0.92, ink);
      }, sh);
    }
  } else if (M.main === 'list') {
    list(rows, Math.round(base * 1.15), base * 0.92, ink, orient);
  } else if (cm.continuous && orient === 'vertical') {
    // Vorgabe „Unter“: stetige Skala wie bisher, feine Streifen ohne Lücke
    const { min, max, hue } = cm.continuous, N = CONT_STEPS, bw = Math.round(base * 11), sh = Math.round(base * 1.0), w1 = bw / N;
    for (let s2 = 0; s2 < N; s2++) R(s2 * w1, y, w1 + 0.3, sh, contColor(hue, s2 / (N - 1)));
    const f = (x: number) => fmtNum(x, Math.abs(max - min) < 10 ? 1 : 0);
    T(0, y + sh + small * 1.25, f(min) + cm.unit, 'text', small, soft, 'start');
    T(bw / 2, y + sh + small * 1.25, f((min + max) / 2), 'text', small, soft, 'middle');
    T(bw, y + sh + small * 1.25, f(max) + cm.unit, 'text', small, soft, 'end');
    y += sh + small * 0.9;
  } else if (cm.continuous) {
    // „Neben“/„Raster“ gewählt: für eine stetige Skala nicht sinnvoll getrennt, beides dreht den Verlauf senkrecht (oben = Höchstwert).
    const { min, max, hue } = cm.continuous, N = CONT_STEPS, bh = Math.round(base * 11), sw = Math.round(base * 1.6), h1 = bh / N;
    for (let s2 = 0; s2 < N; s2++) R(0, y + s2 * h1, sw, h1 + 0.3, contColor(hue, 1 - s2 / (N - 1)));
    const f = (x: number) => fmtNum(x, Math.abs(max - min) < 10 ? 1 : 0);
    T(sw + base * 0.5, y + capOffset('text', small), f(max) + cm.unit, 'text', small, soft, 'start');
    T(sw + base * 0.5, y + bh / 2 + capOffset('text', small), f((min + max) / 2), 'text', small, soft, 'start');
    T(sw + base * 0.5, y + bh + capOffset('text', small), f(min) + cm.unit, 'text', small, soft, 'start');
    y += bh;
  } else if (cm.diverging && cm.shown && orient === 'vertical') {
    // Vorgabe „Unter“: wie bisher, eine zusammenhängende Reihe mit Grenzbeschriftung darunter
    const [lo, hi] = cm.shown, n = hi - lo + 1, sw = Math.round(base * (n > 6 ? 1.7 : 2.2)), sh = Math.round(base * 1.0), gap = 2;
    for (let k = 0; k < n; k++) R(k * (sw + gap), y, sw, sh, cm.classColors[lo + k]);
    for (let k = lo > 0 ? 0 : 1; k < n; k++) T(k * (sw + gap) - (k ? gap / 2 : 0), y + sh + small * 1.25, signed(cm.breaks[lo + k - 1]), 'text', small, soft, k ? 'middle' : 'start');
    if (hi < cm.classColors.length - 1) T(n * (sw + gap) - gap, y + sh + small * 1.25, signed(cm.breaks[hi]), 'text', small, soft, 'end');
    y += sh + small * 0.9;
  } else if (cm.diverging && cm.shown) {
    // „Neben“/„Raster“ gewählt: einzelne Klassen mit eigener Bereichsbeschriftung, wie eine gewöhnliche Liste anordenbar
    const [lo, hi] = cm.shown, total = cm.classColors.length;
    const divLbl = (k: number) => { const lb = k > 0 ? signed(cm.breaks[k - 1]) : null, hb = k < total - 1 ? signed(cm.breaks[k]) : null; return lb && hb ? `${lb} – ${hb}` : hb ? `< ${hb}` : lb ? `≥ ${lb}` : ''; };
    const items = Array.from({ length: hi - lo + 1 }, (_, i) => swItem(cm.classColors[lo + i], divLbl(lo + i)));
    list(items, Math.round(base * (items.length > 6 ? 0.85 : 1.05)), small, soft, orient);
  } else if ((c.mode === 'anteil' || c.mode === 'wert') && orient === 'vertical') {
    // Vorgabe „Unter“: wie bisher, eine zusammenhängende Reihe mit Klassengrenzen darunter
    const n = cm.steps || 5, sw = segW(n, base * (n > 5 ? 1.9 : 2.4)), sh = Math.round(base * 1.0), gap = 2;
    for (let s2 = 0; s2 < n; s2++) R(s2 * (sw + gap), y, sw, sh, cm.classColors[s2] || '#CCCCCC');
    scale(n, sw, gap, y + sh + small * 1.25);
    y += sh + small * 0.9;
  } else if (c.mode === 'anteil' || c.mode === 'wert') {
    // „Neben“/„Raster“ gewählt: einzelne Klassen mit eigener Bereichsbeschriftung, wie eine gewöhnliche Liste anordenbar
    const n = cm.steps || 5;
    const clsLbl = (k: number) => n <= 1 ? '' : k === 0 ? `< ${fmtBreak(cm.breaks[0])}${cm.unit}` : k === n - 1 ? `≥ ${fmtBreak(cm.breaks[n - 2])}${cm.unit}` : `${fmtBreak(cm.breaks[k - 1])}–${fmtBreak(cm.breaks[k])}${cm.unit}`;
    const items = Array.from({ length: n }, (_, k) => swItem(cm.classColors[k] || '#CCCCCC', clsLbl(k)));
    list(items, Math.round(base * (n > 5 ? 0.85 : 1.05)), small, soft, orient);
  }
  if (M.caption && !M.caption.hidden && M.caption.text) { y += small * 0.3; for (const cl of wrapText(M.caption.text, 'text', small, Math.max(220, 300 * ts))) { T(0, y + small * 1.2, cl, 'text', small, soft); y += small * 1.3; } y += small * 0.2; }
  // Blasen: verschachtelte Kreise mit Werten
  const bs0 = doc.bubbles?.visible && doc.bubbles.legend ? bubbleSet(doc, 'main', activeVariant(doc)) : null;
  const bs = bs0 ? { ...bs0, unitR: doc.bubbles!.maxR * ts } : null;
  if (bs) {
    if (M.main) y += base * 0.7;
    for (const tl of wrapText(bs.label, 'bold', small * 1.08, Math.max(220, 300 * ts))) { T(0, y + small * 1.1, tl, 'bold', small * 1.08, ink); y += small * 1.45; }
    y += small * 0.3;
    const vals = bubbleLegendValues(bs.ref), rMax = Math.max(4, bs.unitR * Math.sqrt(vals[0] / bs.ref)), cx = rMax + 1, tx = 2 * rMax + base * 0.8;
    // Beschriftungen mit Mindestabstand; die Linie führt vom Kreisscheitel zur Beschriftung
    const lineH = small * 1.2, top0 = y + small * 0.5;
    const bottom = Math.max(top0 + 2 * rMax, top0 + (vals.length - 1) * lineH);
    let ly = -Infinity;
    for (const val of vals) {
      const r = bs.unitR * Math.sqrt(val / bs.ref), cy = bottom - r, top = cy - r;
      paths.push({ d: circleD(P.x + cx, P.y + cy, r), fill: 'none', stroke: soft, width: 1 });
      const yl = Math.max(top, ly + lineH); ly = yl;
      paths.push({ d: `M${(P.x + cx).toFixed(1)} ${(P.y + top).toFixed(1)}L${(P.x + 2 * rMax + 2).toFixed(1)} ${(P.y + top).toFixed(1)}L${(P.x + tx - 3).toFixed(1)} ${(P.y + yl).toFixed(1)}`, fill: 'none', stroke: soft, width: 0.7 });
      T(tx, yl + capOffset('text', small), fmtNum(val, 0), 'text', small, soft);
    }
    maxX = Math.max(maxX, 2 * rMax + 2);
    y = Math.max(bottom, ly + small * 0.6);
  }
  if (more.length) {
    y += base * 0.55;
    list(more, Math.round(base * 0.95), small, soft, orient);
  }
  if (M.ovNote && !M.ovNote.hidden) { y += base * 0.7; T(0, y + small, M.ovNote.text, 'text', small, soft); y += small * 1.3; }
  return { texts, rects, paths, box: { x: P.x, y: P.y, w: Math.ceil(maxX), h: Math.ceil(y) } };
}

// ---------- Beschriftungen ----------
export function labelText(doc: Doc, cm: ColorModel, i: number): string[] {
  const g = geoOf(doc), a = g.areas[i];
  let partei = '', anteil = '', vorsprung = '', wert = '';
  const ds = cm.dataset, grp = cm.group;
  if (ds && grp) {
    const r = areaRowIndex(ds).get(a.id) ?? -1;
    if (r >= 0) {
      const gm = groupMetrics(ds, grp)[r];
      const col = gm.win >= 0 ? ds.columns.find(c => c.id === grp.columns[gm.win]) : null;
      partei = col ? (col.short || col.label.split(' · ')[0]) : '';
      anteil = doc.color.mode === 'anteil' ? fmt1(cm.valueOf(i)) + ' %' : fmt1(gm.winShare) + ' %';
      vorsprung = fmt1(gm.margin) + ' Pkt.';
    }
  }
  const v = cm.valueOf(i); if (v != null) wert = doc.color.mode === 'veraenderung' ? signed(+v.toFixed(1)) : fmtNum(v, 1);
  if (cm.mode === 'kategorie') wert = cm.keys[i] || '';
  return (doc.labels.template || '')
    .replace(/\{nr\}/g, g.meta.showNr ? String(a.nr) : a.id).replace(/\{name\}/g, a.name).replace(/\{land\}/g, LAENDER[a.bl]?.[1] || '')
    .replace(/\{partei\}/g, partei).replace(/\{anteil\}/g, anteil).replace(/\{vorsprung\}/g, vorsprung).replace(/\{wert\}/g, wert)
    .split('\n').map(s => s.trim()).filter(s => s.length);
}
export interface LabelItem { i: number; key: string; cx: number; cy: number; w: number; h: number; lines: string[]; lh: number; size: number; forced: boolean; leader: [number, number, number, number] | null; box: [number, number, number, number] }
export const toFrame = (F: { w: number; h: number; view: { cx: number; cy: number; k: number } }, [gx, gy]: [number, number]) => [(gx - F.view.cx) * F.view.k + F.w / 2, (gy - F.view.cy) * F.view.k + F.h / 2] as [number, number];
export function layoutLabels(doc: Doc, id: FrameId, v: Variant = activeVariant(doc)): { items: LabelItem[]; hidden: number } {
  const res = { items: [] as LabelItem[], hidden: 0 };
  if (!doc.layers.wkLabels || (id === 'inset' && !doc.inset.visible)) return res;
  const F = v.L[id], size = +(doc.labels.size * v.ts).toFixed(2), lh = size * 1.14, g = geoOf(doc), cm = colorModel(doc);
  const { list } = frameSets(doc, id);
  const obstacles: number[][] = [];
  if (id === 'main') {
    if (doc.inset.visible) { const I = v.L.inset; obstacles.push([I.x - F.x - 6, I.y - F.y - 6, I.x - F.x + I.w + 6, I.y - F.y + I.h + 6]); }
    const lp = legendPrims(doc, v.L.legend, v.L.main.w, v.ts);
    if (lp) { const b = lp.box; obstacles.push([b.x - F.x - 6, b.y - F.y - 6, b.x - F.x + b.w + 6, b.y - F.y + b.h + 6]); }
    const lr = logoRect(doc, v);
    if (lr) obstacles.push([lr.x - F.x - 6, lr.y - F.y - 6, lr.x - F.x + lr.w + 6, lr.y - F.y + lr.h + 6]);
  }
  // Gebiete, die im Maßstab kleiner als eine Zeile sind, bekommen keine automatische Beschriftung (wichtig bei Gemeinden)
  const minA = (size * 1.6) ** 2 / (F.view.k * F.view.k) * g.meta.grid * g.meta.grid / 1e6;
  const cands = list.map(i => { const key = id + ':' + g.areas[i].id; const off = v.labelOffsets[key]; return { i, key, off, pri: off ? 1e12 : g.areas[i].area }; })
    .filter(c => (c.off || c.pri >= minA || list.length < 400) && !(g.memberOf && g.areas[c.i].free)).sort((a, b) => b.pri - a.pri);   // Restflächen eigener Einteilungen ohne Beschriftung
  // gemeinsame Ergebnisse nur einmal beschriften (größtes Gebiet der Gruppe)
  const J = jointOf(doc);
  if (J) { const seen = new Set<string>(); const keep = cands.filter(c => { const j = J[g.areas[c.i].id]; if (!j || c.off) return true; if (seen.has(j)) return false; seen.add(j); return true; }); res.hidden += cands.length - keep.length; cands.length = 0; cands.push(...keep); }
  res.hidden += list.length - cands.length;
  const placed: number[][] = [];
  const hit = (b: number[], L: number[][]) => L.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
  for (const c of cands) {
    const [ax, ay] = toFrame(F, g.areas[c.i].label);
    if (ax < -40 || ay < -40 || ax > F.w + 40 || ay > F.h + 40) continue;
    const lines = labelText(doc, cm, c.i);
    if (!lines.length) continue;
    const w = Math.max(...lines.map(l => measureW(l, 'label', size))) + 2, h = lines.length * lh;
    const dx = c.off ? c.off[0] : 0, dy = c.off ? c.off[1] : 0, cx = ax + dx, cy = ay + dy;
    const box: [number, number, number, number] = [cx - w / 2 - 2, cy - h / 2 - 1, cx + w / 2 + 2, cy + h / 2 + 1];
    const inside = box[0] >= 0 && box[1] >= 0 && box[2] <= F.w && box[3] <= F.h;
    if (!c.off && (!inside || hit(box, placed) || hit(box, obstacles))) { res.hidden++; continue; }
    placed.push(box);
    let leader: LabelItem['leader'] = null;
    if (Math.hypot(dx, dy) > 16) leader = [ax, ay, clamp(ax, box[0], box[2]), clamp(ay, box[1], box[3])];
    res.items.push({ i: c.i, key: c.key, cx, cy, w, h, lines, lh, size, forced: !!c.off, leader, box });
  }
  return res;
}
export function labelPrims(doc: Doc, it: LabelItem): TextPrim[] {
  const cap = capOffset('label', it.size), top = it.cy - it.h / 2;
  return it.lines.map((t, k) => ({ x: it.cx, y: top + k * it.lh + it.lh / 2 + cap, text: t, cut: 'label' as Cut, size: it.size, color: doc.style.ink, anchor: 'middle' as const, halo: doc.labels.halo }));
}
