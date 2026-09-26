// Logo: Datei einlesen (SVG entschärfen, PNG/JPG zuschneiden und verkleinern), im Browser merken, Platz in der Grafik
import { getDoc, toast, update } from './store';
import type { Box, Doc, Layout, LogoAsset, LogoSettings, Variant } from './types';

export const LOGO_KEY = 'kartenwerk:logo';
export const LOGO_MAX_W = 1600;              // Rasterlogos: längste Seite höchstens so lang (reicht für PNG 2× und mehr)
const DEFAULT_RATIO = 0.19;                   // Platzhalter-Seitenverhältnis, solange kein Logo da ist
const SVGNS = 'http://www.w3.org/2000/svg';

export const defaultLogo = (): LogoSettings => ({ visible: false, asset: null, opacity: 1 });
export const logoRatio = (a: LogoAsset | null | undefined) => (a && a.w > 0 && a.h > 0 ? a.h / a.w : DEFAULT_RATIO);

/** Standardplatz ohne Preset: unten links in der Hauptkarte, Breite 21 % der kurzen Seite (höchstens 10 % hoch), Abstand 2,5 %. */
/** Feste Logo-Startplätze für einzelne Formate (Breite × Höhe als Schlüssel); alle anderen Formate nutzen die Formel unten. */
export const PRESET_LOGO_BOX: Partial<Record<string, { x: number; y: number; w: number }>> = {
  '1080x1350': { x: 85, y: 1222, w: 238 },
  '1080x1920': { x: 89, y: 1555, w: 300 },
};
export function defaultLogoBox(L: Pick<Layout, 'main'>, W: number, H: number, ratio: number): Box {
  const preset = PRESET_LOGO_BOX[`${W}x${H}`];
  if (preset) return { x: preset.x, y: preset.y, w: preset.w };
  const s = Math.min(W, H), gap = Math.round(s * 0.025), w = Math.round(Math.min(s * 0.21, s * 0.10 / ratio));
  return { x: L.main.x + gap, y: Math.round(L.main.y + L.main.h - gap - w * ratio), w };
}
/** Fläche des Logos in einer Variante; null, wenn ausgeblendet oder kein Logo geladen */
export function logoRect(doc: Doc, v: Variant): { x: number; y: number; w: number; h: number } | null {
  const lg = doc.logo; if (!lg?.visible || !lg.asset || !v.L.logo) return null;
  const b = v.L.logo; return { x: b.x, y: b.y, w: b.w, h: b.w * logoRatio(lg.asset) };
}

// ---------- Im Browser merken ----------
interface Stored { asset: LogoAsset; opacity: number }
let cache: { raw: string | null; val: Stored | null } = { raw: null, val: null };
const validAsset = (a: unknown): a is LogoAsset => {
  const x = a as LogoAsset;
  return !!x && typeof x.data === 'string' && (x.mime === 'image/svg+xml' || x.mime === 'image/png' || x.mime === 'image/jpeg')
    && x.data.startsWith('data:' + x.mime + ';base64,') && x.w > 0 && x.h > 0;
};
export function rememberedLogo(): Stored | null {
  let raw: string | null = null;
  try { raw = localStorage.getItem(LOGO_KEY); } catch { return null; }
  if (raw === cache.raw) return cache.val;
  let val: Stored | null = null;
  try { const x = raw ? JSON.parse(raw) : null; if (x && validAsset(x.asset)) val = { asset: x.asset, opacity: typeof x.opacity === 'number' ? x.opacity : 1 }; } catch { /* kaputt = nichts gemerkt */ }
  cache = { raw, val };
  return val;
}
export function rememberLogo(asset: LogoAsset, opacity = 1): boolean {
  try { localStorage.setItem(LOGO_KEY, JSON.stringify({ v: 1, asset, opacity })); return true; } catch { return false; }
}
export function forgetLogo() { try { localStorage.removeItem(LOGO_KEY); } catch { /* egal */ } }
export const isRemembered = (asset: LogoAsset | null) => { const r = rememberedLogo(); return !!asset && !!r && r.asset.data === asset.data; };
/** Neues Projekt: gemerktes Logo einsetzen (vor dem Anlegen der Varianten, damit es gleich seinen Platz bekommt) */
export function withDefaultLogo<T extends Doc>(d: T): T {
  const r = rememberedLogo();
  if (r) d.logo = { visible: true, asset: r.asset, opacity: r.opacity };
  return d;
}

// ---------- Datei einlesen ----------
export async function readLogoFile(file: File): Promise<LogoAsset> {
  const name = file.name.replace(/\.[^.]+$/, '') || 'Logo';
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) return svgAsset(await file.text(), name);
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) && !/\.(png|jpe?g|webp|gif)$/i.test(file.name)) throw new Error('Bitte eine SVG-, PNG- oder JPG-Datei wählen.');
  return rasterAsset(file, name);
}

const utf8ToB64 = (s: string) => { const b = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(bin); };
const b64ToUtf8 = (b64: string) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder().decode(u); };

// Elemente, die in einem Logo nichts verloren haben (Skripte, eingebettetes HTML, Animationen, Medien)
const BAD = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video', 'canvas', 'set', 'animate', 'animatemotion', 'animatetransform', 'animatecolor', 'discard', 'handler', 'listener', 'a']);
const OK_NS = new Set([null, 'http://www.w3.org/1999/xlink', 'http://www.w3.org/XML/1998/namespace', 'http://www.w3.org/2000/xmlns/']);
const DATA_IMG = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$/i;
const EXT_URL = /url\s*\(\s*['"]?\s*(?!#)/i;

/** SVG-Text parsen und entschärfen: keine Skripte, keine Ereignisse, keine Verweise nach außen */
export function sanitizeSvg(text: string): SVGSVGElement {
  const parse = (t: string) => new DOMParser().parseFromString(t, 'image/svg+xml');
  let doc = parse(text);
  if (doc.documentElement.localName === 'svg' && doc.documentElement.namespaceURI !== SVGNS) doc = parse(text.replace(/<svg\b/, `<svg xmlns="${SVGNS}"`));
  const svg = doc.documentElement as unknown as SVGSVGElement;
  if (doc.getElementsByTagName('parsererror').length || svg.localName !== 'svg') throw new Error('Die Datei ist keine gültige SVG-Datei.');
  for (const el of Array.from(svg.getElementsByTagName('*'))) {
    if (!el.parentNode) continue;
    const tag = el.localName.toLowerCase();
    if (el.namespaceURI !== SVGNS) { el.remove(); continue; }                     // Metadaten fremder Programme, HTML
    if (tag === 'a') { while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el); el.remove(); continue; }   // Links auflösen, Inhalt behalten
    if (BAD.has(tag)) { el.remove(); continue; }
  }
  for (const el of [svg, ...Array.from(svg.getElementsByTagName('*'))]) {
    const tag = el.localName.toLowerCase();
    for (const at of Array.from(el.attributes)) {
      const n = at.localName.toLowerCase(), v = at.value.trim();
      if (!OK_NS.has(at.namespaceURI)) { el.removeAttributeNode(at); continue; }  // inkscape:, sodipodi: …
      if (n.startsWith('on')) { el.removeAttributeNode(at); continue; }
      if (n === 'href') { if (!(v.startsWith('#') || (tag === 'image' && DATA_IMG.test(v)))) el.removeAttributeNode(at); continue; }
      if (EXT_URL.test(v)) el.removeAttributeNode(at);                                 // nur interne Verweise url(#…)
    }
    if (tag === 'image' && !el.getAttribute('href') && !el.getAttributeNS('http://www.w3.org/1999/xlink', 'href')) { el.remove(); continue; }   // Bild ohne erlaubte Quelle
    if (tag === 'style') el.textContent = (el.textContent || '').replace(/@import[^;]*;?/gi, '').replace(/url\s*\(\s*['"]?\s*(?!#)[^)]*\)/gi, 'none');
  }
  return svg;
}
function viewBoxOf(svg: Element): [number, number, number, number] {
  const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb.every(x => isFinite(x)) && vb[2] > 0 && vb[3] > 0) return vb as [number, number, number, number];
  const w = parseFloat(svg.getAttribute('width') || ''), h = parseFloat(svg.getAttribute('height') || '');
  if (w > 0 && h > 0) return [0, 0, w, h];
  throw new Error('Die SVG-Datei hat keine Größe (viewBox oder Breite/Höhe fehlen).');
}
/** Tatsächlich bemalte Fläche im Koordinatensystem der viewBox (ohne Linienstärke); null, wenn nicht messbar */
function paintedBox(svg: SVGSVGElement): [number, number, number, number] | null {
  if (typeof document === 'undefined') return null;
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-10000px;top:0;width:400px;height:400px;overflow:hidden;visibility:hidden;pointer-events:none';
  try {
    const c = document.importNode(svg, true) as SVGSVGElement;
    c.setAttribute('width', '400'); c.setAttribute('height', '400');
    const g = document.createElementNS(SVGNS, 'g');
    while (c.firstChild) g.appendChild(c.firstChild);
    c.appendChild(g); host.appendChild(c); document.body.appendChild(host);
    const b = g.getBBox();
    return b.width > 0 && b.height > 0 ? [b.x, b.y, b.width, b.height] : null;
  } catch { return null; }
  finally { host.remove(); }
}
/** Bemalte Fläche durch Rastern messen: genau, auch mit Konturen, Masken und Filtern (etwa aus Canva). Koordinaten der viewBox. */
async function paintedBoxRaster(svg: SVGSVGElement, vb: [number, number, number, number]): Promise<[number, number, number, number] | null> {
  if (typeof document === 'undefined') return null;
  try {
    const S = 1200 / Math.max(vb[2], vb[3]), W = Math.max(1, Math.round(vb[2] * S)), H = Math.max(1, Math.round(vb[3] * S));
    const c = svg.cloneNode(true) as SVGSVGElement;
    c.setAttribute('viewBox', vb.join(' ')); c.setAttribute('width', String(W)); c.setAttribute('height', String(H)); c.setAttribute('preserveAspectRatio', 'none');
    const img = new Image(); img.src = 'data:image/svg+xml;base64,' + utf8ToB64(new XMLSerializer().serializeToString(c));
    await img.decode();
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true })!; cx.drawImage(img, 0, 0, W, H);
    const [x0, y0, x1, y1] = trimBox(cx.getImageData(0, 0, W, H).data, W, H), sx = W / vb[2], sy = H / vb[3];
    return [vb[0] + x0 / sx, vb[1] + y0 / sy, (x1 - x0) / sx, (y1 - y0) / sy];
  } catch { return null; }
}
export async function svgAsset(text: string, name: string): Promise<LogoAsset> {
  const svg = sanitizeSvg(text);
  let vb = viewBoxOf(svg);
  // Leerraum um das Logo abschneiden (Zeichenfläche aus Grafikprogrammen). Gerastert gemessen ist die Fläche genau;
  // ersatzweise über getBBox (ohne Konturen), dann mit etwas Luft.
  const raster = await paintedBoxRaster(svg, vb), pb = raster || paintedBox(svg);
  if (pb) {
    const x0 = Math.max(vb[0], pb[0]), y0 = Math.max(vb[1], pb[1]), x1 = Math.min(vb[0] + vb[2], pb[0] + pb[2]), y1 = Math.min(vb[1] + vb[3], pb[1] + pb[3]);
    const pad = Math.max(x0 - vb[0], y0 - vb[1], vb[0] + vb[2] - x1, vb[1] + vb[3] - y1);
    if (x1 > x0 && y1 > y0 && pad > 0.005 * Math.max(vb[2], vb[3])) {
      const m = raster ? 0 : 0.015 * Math.max(x1 - x0, y1 - y0), r = (v: number) => +v.toFixed(3);
      const nx0 = Math.max(vb[0], x0 - m), ny0 = Math.max(vb[1], y0 - m), nx1 = Math.min(vb[0] + vb[2], x1 + m), ny1 = Math.min(vb[1] + vb[3], y1 + m);
      vb = [r(nx0), r(ny0), r(nx1 - nx0), r(ny1 - ny0)];
    }
  }
  svg.setAttribute('viewBox', vb.join(' '));
  svg.removeAttribute('width'); svg.removeAttribute('height');
  const out = new XMLSerializer().serializeToString(svg);
  return { name, mime: 'image/svg+xml', data: 'data:image/svg+xml;base64,' + utf8ToB64(out), w: vb[2], h: vb[3] };
}

async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.decoding = 'async'; img.src = url;
    await img.decode().catch(() => { throw new Error('Das Bild konnte nicht gelesen werden.'); });
    return img;
  } finally { URL.revokeObjectURL(url); }
}
/** Rand abschneiden: transparent, wenn die Ecken transparent sind, sonst weiß */
export function trimBox(px: Uint8ClampedArray, W: number, H: number): [number, number, number, number] {
  const at = (x: number, y: number) => (y * W + x) * 4;
  const corners = [at(0, 0), at(W - 1, 0), at(0, H - 1), at(W - 1, H - 1)];
  const clear = (i: number) => px[i + 3] < 16, white = (i: number) => px[i] >= 245 && px[i + 1] >= 245 && px[i + 2] >= 245;
  const mode = corners.filter(clear).length >= 3 ? 'alpha' : corners.filter(i => clear(i) || white(i)).length >= 3 ? 'white' : null;
  if (!mode) return [0, 0, W, H];
  const bg = mode === 'alpha' ? clear : (i: number) => clear(i) || white(i);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    let row = false;
    for (let x = 0, i = y * W * 4; x < W; x++, i += 4) if (!bg(i)) { row = true; if (x < x0) x0 = x; if (x > x1) x1 = x; }
    if (row) { if (y < y0) y0 = y; y1 = y; }
  }
  if (x1 < 0) throw new Error('Das Bild ist leer (nur Hintergrund).');
  return [Math.max(0, x0 - 1), Math.max(0, y0 - 1), Math.min(W, x1 + 2), Math.min(H, y1 + 2)];
}
async function rasterAsset(file: File, name: string): Promise<LogoAsset> {
  const img = await loadImage(file);
  const W = img.naturalWidth, H = img.naturalHeight;
  if (!W || !H) throw new Error('Das Bild hat keine Größe.');
  if (W * H > 60e6) throw new Error('Das Bild ist zu groß (höchstens 60 Megapixel).');
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true })!; cx.drawImage(img, 0, 0);
  const px = cx.getImageData(0, 0, W, H).data;
  const [x0, y0, x1, y1] = trimBox(px, W, H), tw = x1 - x0, th = y1 - y0;
  let alpha = false;
  for (let y = y0; y < y1 && !alpha; y++) for (let x = x0, i = (y * W + x0) * 4 + 3; x < x1; x++, i += 4) if (px[i] < 255) { alpha = true; break; }
  const k = Math.min(1, LOGO_MAX_W / tw, LOGO_MAX_W / th), ow = Math.max(1, Math.round(tw * k)), oh = Math.max(1, Math.round(th * k));
  const out = document.createElement('canvas'); out.width = ow; out.height = oh;
  const oc = out.getContext('2d')!; oc.imageSmoothingEnabled = true; oc.imageSmoothingQuality = 'high';
  oc.drawImage(cv, x0, y0, tw, th, 0, 0, ow, oh);
  const jpeg = !alpha && file.type === 'image/jpeg';
  const data = jpeg ? out.toDataURL('image/jpeg', 0.92) : out.toDataURL('image/png');
  return { name, mime: jpeg ? 'image/jpeg' : 'image/png', data, w: ow, h: oh };
}

// ---------- Export: Logo als Vektor (SVG) oder Bild ----------
/** SVG-Markup des Logos an seinem Platz. SVG-Logos werden noch einmal entschärft (auch Logos aus fremden Projektdateien)
 *  und als verschachteltes <svg> eingefügt, Kennungen mit Präfix „Logo-“. Rasterlogos als <image>. */
export function logoExportSvg(doc: Doc, v: Variant): string {
  const r = logoRect(doc, v); if (!r) return '';
  const a = doc.logo.asset!, op = doc.logo.opacity < 1 ? ` opacity="${+doc.logo.opacity.toFixed(2)}"` : '';
  const pos = `x="${r.x.toFixed(1)}" y="${r.y.toFixed(1)}" width="${r.w.toFixed(1)}" height="${r.h.toFixed(1)}"`;
  if (a.mime !== 'image/svg+xml') {
    if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(a.data)) return '';
    return `<g id="Logo"${op}><image ${pos} preserveAspectRatio="none" xlink:href="${a.data}"/></g>`;
  }
  try {
    const svg = sanitizeSvg(b64ToUtf8(a.data.slice(a.data.indexOf(',') + 1)));
    const vb = viewBoxOf(svg);
    // Kennungen eindeutig machen (die Exportdatei hat eigene Gruppen wie „Legende“)
    const ids = new Map<string, string>();
    for (const el of Array.from(svg.querySelectorAll('[id]'))) { const id = el.getAttribute('id')!, nid = 'Logo-' + id; ids.set(id, nid); el.setAttribute('id', nid); }
    const cssIds = ids.size ? new RegExp('#(' + [...ids.keys()].sort((x, y) => y.length - x.length).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\w-])', 'g') : null;
    const fix = (s: string) => s.replace(/url\(\s*(['"]?)#([^)'"]+)\1\s*\)/g, (m, q, id) => (ids.has(id) ? `url(#${ids.get(id)})` : m));
    for (const el of Array.from(svg.getElementsByTagName('*'))) {
      for (const at of Array.from(el.attributes)) {
        if (at.localName === 'href' && at.value.startsWith('#') && ids.has(at.value.slice(1))) at.value = '#' + ids.get(at.value.slice(1));
        else if (at.value.includes('url(')) at.value = fix(at.value);
      }
      if (el.localName === 'style' && el.textContent && cssIds) el.textContent = el.textContent.replace(cssIds, (m, id) => '#' + (ids.get(id) || id));
    }
    const inner = Array.from(svg.childNodes).map(n => new XMLSerializer().serializeToString(n)).join('')
      .replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '').replace(/ xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink"/g, '');
    const par = svg.getAttribute('preserveAspectRatio');
    return `<svg id="Logo" ${pos} viewBox="${vb.join(' ')}"${par ? ` preserveAspectRatio="${par}"` : ''}${op} overflow="visible">${inner}</svg>`;
  } catch { return ''; }
}

// ---------- Aktionen ----------
/** Neues Logo übernehmen. Ein ersetztes Logo behält Platz und Unterkante; ein erstes Logo kommt an den Standardplatz. */
export function setLogoAsset(asset: LogoAsset, opacity?: number) {
  const old = getDoc().logo.asset, r = logoRatio(asset), r0 = logoRatio(old);
  update(d => {
    d.logo.asset = asset; d.logo.visible = true;
    if (opacity != null) d.logo.opacity = opacity;
    for (const v of d.variants) {
      const b = v.L.logo;
      if (!old || !b) { v.L.logo = defaultLogoBox(v.L, v.w, v.h, r); continue; }
      const w = r > r0 ? Math.round(b.w * r0 / r) : b.w, bottom = b.y + b.w * r0;   // höheres Logo: gleiche Höhe statt gleicher Breite
      v.L.logo = { x: b.x, y: Math.round(bottom - w * r), w };
    }
  });
}
/** Breite ändern, Unterkante und linke Kante bleiben */
export function setLogoWidth(w: number, key = 'logo-w') {
  const r = logoRatio(getDoc().logo.asset);
  update(d => { const b = d.variants[d.active].L.logo; const bottom = b.y + b.w * r; b.w = Math.round(w); b.y = Math.round(bottom - b.w * r); }, { key });
}
export function resetLogoPlace() {
  const r = logoRatio(getDoc().logo.asset);
  update(d => { const v = d.variants[d.active]; v.L.logo = defaultLogoBox(v.L, v.w, v.h, r); });
  toast('Logo an den Standardplatz gesetzt');
}
export function removeLogo() { update(d => { d.logo.asset = null; d.logo.visible = false; }); toast('Logo aus dieser Grafik entfernt'); }
export function setLogoVisible(on: boolean) { update(d => { d.logo.visible = on && !!d.logo.asset; }); }
