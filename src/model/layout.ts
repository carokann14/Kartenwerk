// Layout der Formatvarianten und Einpassen der Kartenausschnitte
import { clamp, uid } from '../lib/util';
import type { BBox } from '../lib/util';
import { GEO, bboxOfIds } from '../geo/geo';
import { legendPrims, textBlock } from '../render/elements';
import { fokusBBox, insetBBox } from '../render/scene';
import { PRESETS } from './defaults';
import type { Doc, FrameBox, Layout, Variant, View } from './types';

export const defaultTS = (W: number, H: number) => Math.round(clamp(Math.sqrt(W * H) / 1207, 0.7, 1.25) * 100) / 100;

export function fitView(frame: { w: number; h: number }, bb: BBox, reserveRight = 0, padFrac = 0.035): View {
  const pad = Math.round(Math.min(frame.w, frame.h) * padFrac);
  const aw = Math.max(40, frame.w - 2 * pad - reserveRight), ah = Math.max(40, frame.h - 2 * pad);
  const bw = Math.max(1, bb[2] - bb[0]), bh = Math.max(1, bb[3] - bb[1]);
  const k = Math.min(aw / bw, ah / bh);
  return { cx: (bb[0] + bb[2]) / 2 - (pad + aw / 2 - frame.w / 2) / k, cy: (bb[1] + bb[3]) / 2, k };
}
/** Platz rechts in der Hauptkarte freihalten, wenn Inset oder Legende dort liegen. */
export function mainReserve(doc: Doc, v: Variant) {
  const F = v.L.main; let r = 0;
  const boxes: { x: number; y: number; h: number }[] = [];
  if (doc.inset.visible) boxes.push(v.L.inset);
  const lp = legendPrims(doc, v.L.legend, F.w, v.ts); if (lp) boxes.push(lp.box);
  for (const b of boxes) {
    const insideY = b.y < F.y + F.h && b.y + b.h > F.y;
    if (insideY && b.x > F.x + F.w * 0.5 && b.x < F.x + F.w) r = Math.max(r, F.x + F.w - b.x + Math.round(F.w * 0.015));
  }
  return r;
}
export const fitMain = (doc: Doc, v: Variant) => { v.L.main.view = fitView(v.L.main, fokusBBox(doc), mainReserve(doc, v)); };
export const fitInset = (doc: Doc, v: Variant) => { v.L.inset.view = fitView(v.L.inset, insetBBox(doc), 0, 0.07); };

export function makeLayout(doc: Doc, W: number, H: number, ts: number): Layout {
  const s = Math.sqrt(W * H) / 1207;
  const m = Math.round(Math.min(W, H) * 0.06);
  const land = W / H > 1.3, tall = H / W > 1.5;
  const tb = (kind: 'title' | 'subtitle' | 'source', w: number) => textBlock(doc, kind, w, ts).height;
  const srcW = W - 2 * m, srcH = doc.texts.source.visible ? tb('source', srcW) : 0;
  const blank: FrameBox = { x: 0, y: 0, w: 100, h: 100, view: { cx: 0, cy: 0, k: 1 } };
  const L: Layout = { m, reserve: 0, title: { x: m, y: m, w: 100 }, subtitle: { x: m, y: m, w: 100 }, source: { x: m, y: H - m - srcH, w: srcW }, legend: { x: m, y: m }, main: { ...blank }, inset: { ...blank } };
  const titleH = (w: number) => doc.texts.title.visible ? tb('title', w) + Math.round(12 * s) : 0;
  const subH = (w: number) => doc.texts.subtitle.visible ? tb('subtitle', w) : 0;
  const bottom = H - m - srcH - Math.round(16 * s);
  if (tall) {
    const tw = W - 2 * m;
    L.title = { x: m, y: m, w: tw };
    let y = m + titleH(tw); L.subtitle = { x: m, y, w: tw }; y += subH(tw) + Math.round(26 * s);
    const g = GEO[doc.geoSet], bb = bboxOfIds(g, g.all), ratio = (bb[3] - bb[1]) / (bb[2] - bb[0]);
    const colW = Math.round(W * 0.34);
    L.main = { ...blank, x: m, y, w: tw, h: Math.max(200, Math.min(Math.round(tw * ratio * 0.97), bottom - y - Math.round(colW * 1.1) - Math.round(30 * s))) };
    const y2 = L.main.y + L.main.h + Math.round(26 * s);
    L.inset = { ...blank, x: W - m - colW, y: y2, w: colW, h: Math.round(Math.min(colW * 1.08, bottom - y2)) };
    L.legend = { x: m, y: y2 };
  } else if (!land) {
    const tw = W - 2 * m;
    L.title = { x: m, y: m, w: tw };
    let y = m + titleH(tw); L.subtitle = { x: m, y, w: Math.round(tw * 0.94) }; y += subH(L.subtitle.w) + Math.round(22 * s);
    L.main = { ...blank, x: m, y, w: tw, h: Math.max(200, bottom - y) };
    const colW = Math.round(W * 0.22);
    L.reserve = colW + Math.round(10 * s);
    L.inset = { ...blank, x: L.main.x + L.main.w - colW, y: L.main.y + Math.round(L.main.h * 0.02), w: colW, h: Math.round(colW * 1.08) };
    L.legend = { x: L.main.x + L.main.w - colW, y: L.inset.y + L.inset.h + Math.round(40 * s) };
  } else {
    const tw = Math.round(W * 0.33);
    L.title = { x: m, y: m, w: tw };
    let y = m + titleH(tw); L.subtitle = { x: m, y, w: tw }; y += subH(tw) + Math.round(34 * s);
    L.legend = { x: m, y };
    const mx = m + tw + Math.round(W * 0.03);
    L.main = { ...blank, x: mx, y: m, w: W - mx - m, h: H - 2 * m - srcH - Math.round(14 * s) };
    const colW = Math.round(L.main.w * 0.27);
    L.reserve = colW + Math.round(10 * s);
    L.inset = { ...blank, x: L.main.x + L.main.w - colW, y: L.main.y + Math.round(4 * s), w: colW, h: Math.round(colW * 1.08) };
  }
  const lp = legendPrims(doc, { x: 0, y: 0 }, L.main.w, ts);
  if (lp && !land && !tall) {
    L.legend.x = Math.min(L.legend.x, L.main.x + L.main.w - lp.box.w);
    L.legend.y = Math.min(L.legend.y, L.main.y + L.main.h - lp.box.h - Math.round(8 * s));
  }
  return L;
}
export function makeVariant(doc: Doc, preset: string, w?: number, h?: number): Variant {
  const p = PRESETS[preset] || PRESETS['4:5'];
  const W = w || p.w, H = h || p.h, ts = defaultTS(W, H);
  const v: Variant = { id: uid('v'), preset, w: W, h: H, ts, L: makeLayout(doc, W, H, ts), labelOffsets: {}, locked: { main: false, inset: false } };
  fitMain(doc, v); fitInset(doc, v);
  return v;
}
export function relayout(doc: Doc, v: Variant) { v.L = makeLayout(doc, v.w, v.h, v.ts); fitMain(doc, v); fitInset(doc, v); }
