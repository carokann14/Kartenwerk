// Texte, Legende und Beschriftungen als Primitive (Editor: <text>, Export: Pfade)
import { STEP_T, fmtBreak, mixWhite } from '../lib/color';
import { Cut, ascentRatio, capOffset, measureW, wrapText } from '../lib/fonts';
import { clamp, fmt1, fmtNum } from '../lib/util';
import { areaRowIndex, groupMetrics } from '../data/derive';
import { GEO, LAENDER } from '../geo/geo';
import { LH } from '../model/defaults';
import type { Doc, Variant } from '../model/types';
import { ColorModel, colorModel, legendTitleAuto, partyColor } from './colorModel';
import { FrameId, frameSets, geoOf } from './scene';

export interface TextPrim { x: number; y: number; text: string; cut: Cut; size: number; color: string; anchor: 'start' | 'middle' | 'end'; halo?: boolean }
export interface RectPrim { x: number; y: number; w: number; h: number; fill: string }
export interface Prims { texts: TextPrim[]; rects: RectPrim[]; box: { x: number; y: number; w: number; h: number } }

export const activeVariant = (doc: Doc): Variant => doc.variants[doc.active];
const styleColor = (doc: Doc, c: string) => (c in doc.style ? String((doc.style as unknown as Record<string, string>)[c]) : c);

// ---------- Quellenvermerk ----------
export function sourceText(doc: Doc): string {
  const g = GEO[doc.geoSet];
  const parts: string[] = [];
  const cm = colorModel(doc);
  const used = cm.dataset ? [cm.dataset] : [];
  for (const ds of used) {
    const s = ds.settings;
    parts.push(`Daten: ${[s.attribution, s.sourceTitle].filter(Boolean).join(', ') || ds.fileName}.`);
  }
  if (g) parts.push(`Geometrie: ${g.meta.attribution}, vereinfacht.`);
  if (doc.layers.neighbors || doc.layers.lakes) parts.push('Nachbarstaaten und Gewässer: Natural Earth.');
  if (doc.texts.source.extra.trim()) parts.push(doc.texts.source.extra.trim());
  return parts.join(' ');
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
  const texts = b.lines.map((line, k) => ({ x: L.x, y: L.y + k * b.lh + (b.lh - b.size) / 2 + asc * b.size * 0.94, text: line, cut: t.cut, size: b.size, color: styleColor(doc, t.color), anchor: 'start' as const }));
  return { texts, rects: [], box: { x: L.x, y: L.y, w: L.w, h: b.height } };
}

// ---------- Legende ----------
export function legendPrims(doc: Doc, P: { x: number; y: number } = activeVariant(doc).L.legend, mainW = activeVariant(doc).L.main.w, ts = activeVariant(doc).ts): Prims | null {
  if (!doc.legend.visible || doc.color.mode === 'none') return null;
  const cm = colorModel(doc), c = doc.color;
  if (cm.mismatch || !cm.dataset) return null;
  const base = +(doc.legend.size * ts).toFixed(2), small = Math.round(base * 0.74), ink = doc.style.ink, soft = doc.style.inkSoft;
  const texts: TextPrim[] = [], rects: RectPrim[] = [];
  let y = 0, maxX = 0;
  const T = (x: number, yy: number, text: string, cut: Cut, size: number, color: string, anchor: TextPrim['anchor'] = 'start') => {
    texts.push({ x: P.x + x, y: P.y + yy, text, cut, size, color, anchor });
    const w = measureW(text, cut, size);
    maxX = Math.max(maxX, anchor === 'start' ? x + w : anchor === 'middle' ? x + w / 2 : x);
  };
  const R = (x: number, yy: number, w: number, h: number, fill: string) => { rects.push({ x: P.x + x, y: P.y + yy, w, h, fill }); maxX = Math.max(maxX, x + w); };
  const title = doc.legend.title || legendTitleAuto(doc, cm);
  for (const tl of wrapText(title, 'bold', base, Math.max(220, 300 * ts))) { T(0, y + base * 0.95, tl, 'bold', base, ink); y += base * 1.3; }
  y += base * 0.25;
  const count = (k: string) => doc.legend.counts && cm.counts[k] ? ` (${cm.counts[k]})` : '';
  const scale = (n: number, sw: number, gap: number, yy: number) => cm.breaks.forEach((b, k) => { if (k < n - 1) T((k + 1) * (sw + gap) - gap / 2, yy, fmtBreak(b), 'text', small, soft, 'middle'); });
  if (c.mode === 'siegerStaerke') {
    const n = cm.steps, sw = Math.round(base * 2.35), sh = Math.round(base * 1.1), gap = 2;
    scale(n, sw, gap, y + small * 0.9); y += small * 1.45;
    for (const e of cm.entries) {
      for (let s = 0; s < n; s++) R(s * (sw + gap), y, sw, sh, mixWhite(e.color, STEP_T[n][s]));
      T(n * (sw + gap) + base * 0.55, y + sh / 2 + capOffset('text', base * 0.92), e.label + count(e.key), 'text', base * 0.92, ink);
      y += sh + base * 0.42;
    }
    y -= base * 0.42;
    T(0, y + small * 1.5, c.basis === 'anteil' ? 'Anteil der stärksten Partei in %' : 'Vorsprung auf Platz 2 in Prozentpunkten', 'text', small, soft);
    y += small * 1.8;
  } else if (c.mode === 'sieger' || c.mode === 'kategorie') {
    const sw = Math.round(base * 1.15);
    if (doc.legend.orientation === 'horizontal') {
      let x = 0; const maxW = Math.max(260, mainW * 0.8);
      for (const e of cm.entries) {
        const lab = e.label + count(e.key);
        const w = sw + base * 0.45 + measureW(lab, 'text', base * 0.92) + base * 1.1;
        if (x > 0 && x + w > maxW) { x = 0; y += sw + base * 0.5; }
        R(x, y, sw, sw, e.color); T(x + sw + base * 0.45, y + sw / 2 + capOffset('text', base * 0.92), lab, 'text', base * 0.92, ink);
        x += w;
      }
      y += sw;
    } else {
      for (const e of cm.entries) {
        R(0, y, sw, sw, e.color); T(sw + base * 0.55, y + sw / 2 + capOffset('text', base * 0.92), e.label + count(e.key), 'text', base * 0.92, ink);
        y += sw + base * 0.42;
      }
      y -= base * 0.42;
    }
  } else if (c.mode === 'anteil' || c.mode === 'wert') {
    const n = cm.steps || 5, sw = Math.round(base * (n > 5 ? 1.9 : 2.4)), sh = Math.round(base * 1.0), gap = 2;
    const hue = c.mode === 'anteil' ? partyColor(doc, c.party) : c.hue;
    const T5 = STEP_T[n] || STEP_T[5];
    for (let s = 0; s < n; s++) R(s * (sw + gap), y, sw, sh, mixWhite(hue, T5[Math.min(s, T5.length - 1)]));
    scale(n, sw, gap, y + sh + small * 1.25);
    y += sh + small * 1.6;
    if (c.mode === 'anteil') { T(0, y + small * 0.9, 'Anteil in %', 'text', small, soft); y += small * 1.4; }
  }
  if (cm.missing) {
    y += base * 0.5; const sh = Math.round(base * 0.9);
    R(0, y, sh, sh, doc.style.noData);
    T(sh + base * 0.5, y + sh / 2 + capOffset('text', small), `keine Daten (${cm.missing})`, 'text', small, soft);
    y += sh;
  }
  const nOv = Object.keys(doc.overrides).filter(k => k.startsWith(doc.geoSet + ':')).length;
  if (nOv) { y += base * 0.7; T(0, y + small, `${nOv} Gebiet${nOv > 1 ? 'e' : ''} manuell eingefärbt`, 'text', small, soft); y += small * 1.3; }
  return { texts, rects, box: { x: P.x, y: P.y, w: Math.ceil(maxX), h: Math.ceil(y) } };
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
  const v = cm.valueOf(i); if (v != null) wert = fmtNum(v, 1);
  if (cm.mode === 'kategorie') wert = cm.keys[i] || '';
  return (doc.labels.template || '')
    .replace(/\{nr\}/g, String(a.nr)).replace(/\{name\}/g, a.name).replace(/\{land\}/g, LAENDER[a.bl]?.[1] || '')
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
  }
  const cands = list.map(i => { const key = id + ':' + g.areas[i].id; const off = v.labelOffsets[key]; return { i, key, off, pri: off ? 1e12 : g.areas[i].area }; }).sort((a, b) => b.pri - a.pri);
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
