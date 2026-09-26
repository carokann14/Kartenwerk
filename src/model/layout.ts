// Layout der Formatvarianten und Einpassen der Kartenausschnitte
import { clamp, uid } from '../lib/util';
import type { BBox } from '../lib/util';
import { GEO, bboxOfIds } from '../geo/geo';
import { legendPrims, textBlock } from '../render/elements';
import { fokusBBox, insetBBox } from '../render/scene';
import { PRESET_GUIDES, PRESETS } from './defaults';
import { PRESET_LOGO_BOX, defaultLogoBox, logoRatio } from './logo';
import type { Doc, FrameBox, Guides, Layout, Margin, Variant, View } from './types';

export const defaultTS = (W: number, H: number) => Math.round(clamp(Math.sqrt(W * H) / 1207, 0.7, 1.25) * 100) / 100;

/** Rand für die Standardplatzierung der Inhaltselemente (Titel, Unterzeile, Quelle, Legende, Logo, im Hochformat
 *  auch der Kartenrahmen selbst), je Seite einzeln – eine Safe Zone muss nicht symmetrisch sein (z. B. Reels: oben
 *  schmal, unten breit für die Bedienelemente). Sind auf einer Achse mindestens zwei Hilfslinien gesetzt und ergeben
 *  ihre äußersten Linien auf allen vier Seiten einen positiven Rand, gilt genau dieser Rand je Seite – Inhaltselemente
 *  bleiben dadurch innerhalb jeder der vier Hilfslinien. Sonst 6 % der kurzen Seite auf allen vier Seiten wie bisher. */
function marginFor(W: number, H: number, guides?: Guides): Margin {
  const formula = Math.round(Math.min(W, H) * 0.06);
  const fallback: Margin = { left: formula, top: formula, right: formula, bottom: formula };
  if (!guides || guides.x.length < 2 || guides.y.length < 2) return fallback;
  const gx = [...guides.x].sort((a, b) => a - b), gy = [...guides.y].sort((a, b) => a - b);
  const left = gx[0], right = W - gx[gx.length - 1], top = gy[0], bottom = H - gy[gy.length - 1];
  if (left <= 0 || right <= 0 || top <= 0 || bottom <= 0) return fallback;
  return { left: Math.round(left), top: Math.round(top), right: Math.round(right), bottom: Math.round(bottom) };
}

export function fitView(frame: { w: number; h: number }, bb: BBox, reserveRight = 0, padFrac = 0.035, reserveBottom = 0): View {
  const pad = Math.round(Math.min(frame.w, frame.h) * padFrac);
  const aw = Math.max(40, frame.w - 2 * pad - reserveRight), ah = Math.max(40, frame.h - 2 * pad - reserveBottom);
  const bw = Math.max(1, bb[2] - bb[0]), bh = Math.max(1, bb[3] - bb[1]);
  const k = Math.min(aw / bw, ah / bh);
  return { cx: (bb[0] + bb[2]) / 2 - (pad + aw / 2 - frame.w / 2) / k, cy: (bb[1] + bb[3]) / 2 - (pad + ah / 2 - frame.h / 2) / k, k };
}
/** Platz in der Hauptkarte freihalten, wenn Inset oder Legende darin liegen: rechts (Spalte oben) oder unten (Legende unter breiten Gebieten). */
export function mainReserve(doc: Doc, v: Variant): { right: number; bottom: number } {
  const F = v.L.main; let right = 0, bottom = 0;
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  if (doc.inset.visible) boxes.push(v.L.inset);
  const lp = legendPrims(doc, v.L.legend, F.w, v.ts); if (lp) boxes.push(lp.box);
  const gap = Math.round(Math.min(F.w, F.h) * 0.015);
  for (const b of boxes) {
    const insideY = b.y < F.y + F.h && b.y + b.h > F.y, insideX = b.x < F.x + F.w && b.x + b.w > F.x;
    if (!insideY || !insideX) continue;
    if (b.y > F.y + F.h * 0.55) bottom = Math.max(bottom, F.y + F.h - b.y + gap);
    else if (b.x > F.x + F.w * 0.5) right = Math.max(right, F.x + F.w - b.x + gap);
  }
  return { right, bottom };
}
export const fitMain = (doc: Doc, v: Variant) => { const r = mainReserve(doc, v); v.L.main.view = fitView(v.L.main, fokusBBox(doc), r.right, 0.035, r.bottom); };
export const fitInset = (doc: Doc, v: Variant) => { v.L.inset.view = fitView(v.L.inset, insetBBox(doc), 0, 0.07); };

export function makeLayout(doc: Doc, W: number, H: number, ts: number, guides?: Guides): Layout {
  const s = Math.sqrt(W * H) / 1207;
  const m = marginFor(W, H, guides);
  const { left: mL, top: mT, right: mR, bottom: mB } = m;
  const land = W / H > 1.3, tall = H / W > 1.5;
  const tb = (kind: 'title' | 'subtitle' | 'source', w: number) => textBlock(doc, kind, w, ts).height;
  const srcW = W - mL - mR, srcH = doc.texts.source.visible ? tb('source', srcW) : 0;
  const blank: FrameBox = { x: 0, y: 0, w: 100, h: 100, view: { cx: 0, cy: 0, k: 1 } };
  const L: Layout = { m, reserve: 0, title: { x: mL, y: mT, w: 100 }, subtitle: { x: mL, y: mT, w: 100 }, source: { x: mL, y: H - mB - srcH, w: srcW }, legend: { x: mL, y: mT, w: 0 }, main: { ...blank }, inset: { ...blank }, logo: { x: mL, y: mT, w: 100 } };
  const titleH = (w: number) => doc.texts.title.visible ? tb('title', w) + Math.round(12 * s) : 0;
  const subH = (w: number) => doc.texts.subtitle.visible ? tb('subtitle', w) : 0;
  // Fester Logo-Platz des Formats (z. B. 9:16, 4:5) über der Quellenzeile: Quellenzeile rechts neben das Logo,
  // Unterkante bündig mit dem Logo; der Inhalt darüber hält Abstand zum höheren der beiden.
  let srcTop = H - mB - srcH;
  const fixedLogo = PRESET_LOGO_BOX[`${W}x${H}`], logoAsset = doc.logo?.visible ? doc.logo.asset : null;
  if (fixedLogo && logoAsset && doc.texts.source.visible) {
    const lh = fixedLogo.w * logoRatio(logoAsset), lBottom = fixedLogo.y + lh;
    const overlap = fixedLogo.y < H - mB && lBottom > srcTop && fixedLogo.x < mL + srcW && fixedLogo.x + fixedLogo.w > mL;
    const gap = Math.round(Math.min(W, H) * 0.02), x2 = fixedLogo.x + fixedLogo.w + gap, w2 = W - mR - x2;
    if (overlap && w2 >= srcW * 0.35) {
      const h2 = tb('source', w2);
      L.source = { x: x2, y: Math.round((lBottom - h2) * 10) / 10, w: w2 };
      srcTop = Math.min(L.source.y, fixedLogo.y);
    }
  }
  const bottom = srcTop - Math.round(16 * s);
  if (tall) {
    const tw = W - mL - mR;
    L.title = { x: mL, y: mT, w: tw };
    let y = mT + titleH(tw); L.subtitle = { x: mL, y, w: tw }; y += subH(tw) + Math.round(26 * s);
    const g = GEO[doc.geoSet], bb = bboxOfIds(g, g.all), ratio = (bb[3] - bb[1]) / (bb[2] - bb[0]);
    const colW = Math.round(W * 0.34);
    L.main = { ...blank, x: mL, y, w: tw, h: Math.max(200, Math.min(Math.round(tw * ratio * 0.97), bottom - y - Math.round(colW * 1.1) - Math.round(30 * s))) };
    const y2 = L.main.y + L.main.h + Math.round(26 * s);
    L.inset = { ...blank, x: W - mR - colW, y: y2, w: colW, h: Math.round(Math.min(colW * 1.08, bottom - y2)) };
    L.legend = { x: mL, y: y2, w: 0 };
  } else if (!land) {
    const tw = W - mL - mR;
    L.title = { x: mL, y: mT, w: tw };
    let y = mT + titleH(tw); L.subtitle = { x: mL, y, w: Math.round(tw * 0.94) }; y += subH(L.subtitle.w) + Math.round(22 * s);
    L.main = { ...blank, x: mL, y, w: tw, h: Math.max(200, bottom - y) };
    const colW = Math.round(W * 0.22);
    L.reserve = colW + Math.round(10 * s);
    L.inset = { ...blank, x: L.main.x + L.main.w - colW, y: L.main.y + Math.round(L.main.h * 0.02), w: colW, h: Math.round(colW * 1.08) };
    L.legend = { x: L.main.x + L.main.w - colW, y: L.inset.y + L.inset.h + Math.round(40 * s), w: 0 };
  } else {
    const tw = Math.round(W * 0.33);
    L.title = { x: mL, y: mT, w: tw };
    let y = mT + titleH(tw); L.subtitle = { x: mL, y, w: tw }; y += subH(tw) + Math.round(34 * s);
    L.legend = { x: mL, y, w: 0 };
    const mx = mL + tw + Math.round(W * 0.03);
    L.main = { ...blank, x: mx, y: mT, w: W - mx - mR, h: srcTop - mT - Math.round(14 * s) };
    const colW = Math.round(L.main.w * 0.27);
    L.reserve = colW + Math.round(10 * s);
    L.inset = { ...blank, x: L.main.x + L.main.w - colW, y: L.main.y + Math.round(4 * s), w: colW, h: Math.round(colW * 1.08) };
  }
  const lp = legendPrims(doc, { x: 0, y: 0 }, L.main.w, ts);
  if (lp && !land && !tall) {
    L.legend.x = Math.min(L.legend.x, L.main.x + L.main.w - lp.box.w);
    L.legend.y = Math.min(L.legend.y, L.main.y + L.main.h - lp.box.h - Math.round(8 * s));
    // Breite Gebiete (Berlin, Bayern …) füllen die Breite besser, wenn die Legende unten rechts steht statt in der Spalte rechts
    const bb = fokusBBox(doc), wide = (bb[2] - bb[0]) / Math.max(1, bb[3] - bb[1]) > 0.95 * L.main.w / L.main.h;
    if (wide && !doc.inset.visible) L.legend.y = L.main.y + L.main.h - lp.box.h - Math.round(8 * s);
  }
  L.logo = defaultLogoBox(L, W, H, logoRatio(doc.logo?.asset));   // unten links in der Hauptkarte
  return L;
}
export function makeVariant(doc: Doc, preset: string, w?: number, h?: number, guides?: Guides): Variant {
  const p = PRESETS[preset] || PRESETS['4:5'];
  const W = w || p.w, H = h || p.h, ts = defaultTS(W, H);
  // Ohne ausdrücklich übergebene Hilfslinien gilt die vorgegebene Safe Zone des Formats (falls eine hinterlegt ist) –
  // unabhängig davon, ob die Variante beim „Neuen Projekt“ oder später über „+ Format“ entsteht.
  const pg = PRESET_GUIDES[preset];
  const g: Guides = guides || (pg ? { x: [...pg.x], y: [...pg.y], visible: true } : { x: [], y: [], visible: true });
  const v: Variant = { id: uid('v'), preset, w: W, h: H, ts, L: makeLayout(doc, W, H, ts, g), labelOffsets: {}, locked: { main: false, inset: false }, ann: {}, guides: g };
  fitMain(doc, v); fitInset(doc, v);
  return v;
}
export function relayout(doc: Doc, v: Variant) { v.L = makeLayout(doc, v.w, v.h, v.ts, v.guides); fitMain(doc, v); fitInset(doc, v); }
