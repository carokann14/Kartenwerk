import { clamp } from './util';

const hexToRgb = (h: string) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbToHex = ([r, g, b]: number[]) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const s2l = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const l2s = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function toOklab(hex: string) {
  const [r, g, b] = hexToRgb(hex).map(s2l);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromOklab([L, A, B]: number[]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return rgbToHex([l2s(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), l2s(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), l2s(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)]);
}
const WHITE = toOklab('#FFFFFF');
const cache = new Map<string, string>();
/** Mischt eine Farbe mit Weiß im OKLab-Raum (t=1: volle Farbe). */
export function mixWhite(hex: string, t: number) {
  const k = hex + t; const c = cache.get(k); if (c) return c;
  const b = toOklab(hex); const r = fromOklab(WHITE.map((v, i) => v + (b[i] - v) * t)); cache.set(k, r); return r;
}
export const luminance = (hex: string) => { const [r, g, b] = hexToRgb(hex).map(s2l); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const STEP_T: Record<number, number[]> = { 1: [1], 2: [0.55, 1], 3: [0.42, 0.7, 1], 4: [0.34, 0.55, 0.77, 1], 5: [0.16, 0.34, 0.54, 0.76, 1] };

/** Runde Klassengrenzen aus Quantilen. */
export function niceBreaks(values: (number | null)[], n: number): number[] {
  const v = values.filter((x): x is number => x != null && isFinite(x)).sort((a, b) => a - b);
  if (v.length < 2) return [];
  const qs: number[] = [];
  for (let k = 1; k < n; k++) qs.push(v[Math.min(v.length - 1, Math.floor(k * v.length / n))]);
  const span = v[v.length - 1] - v[0];
  const steps = [1000, 500, 250, 100, 50, 25, 10, 5, 2.5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.01].filter(s => s <= span / 2 || s <= 0.01);
  for (const step of steps) {
    const b = qs.map(q => Math.round(q / step) * step);
    const uniq = b.every((x, i) => i === 0 || x > b[i - 1]);
    if (uniq && b[0] > v[0] && b[b.length - 1] < v[v.length - 1]) return b.map(x => +x.toFixed(4));
  }
  return [...new Set(qs.map(q => +q.toPrecision(3)))];
}
export function quantileBreaks(values: (number | null)[], n: number) {
  const v = values.filter((x): x is number => x != null && isFinite(x)).sort((a, b) => a - b);
  const out: number[] = [];
  for (let k = 1; k < n; k++) out.push(+v[Math.min(v.length - 1, Math.floor(k * v.length / n))].toPrecision(4));
  return [...new Set(out)];
}
export function equalBreaks(values: (number | null)[], n: number) {
  const v = values.filter((x): x is number => x != null && isFinite(x));
  if (!v.length) return [];
  const lo = Math.min(...v), hi = Math.max(...v), out: number[] = [];
  for (let k = 1; k < n; k++) out.push(+(lo + (hi - lo) * k / n).toPrecision(4));
  return out;
}
export const classOf = (v: number, br: number[]) => { let c = 0; while (c < br.length && v >= br[c]) c++; return c; };
export const fmtBreak = (x: number) => x.toLocaleString('de-DE', { maximumFractionDigits: 2 });
export function shortRangeLabels(br: number[], unit = '') {
  const out: string[] = [];
  for (let c = 0; c <= br.length; c++) {
    if (c === 0) out.push('< ' + fmtBreak(br[0]) + unit);
    else if (c === br.length) out.push('≥ ' + fmtBreak(br[c - 1]) + unit);
    else out.push(fmtBreak(br[c - 1]) + '–' + fmtBreak(br[c]) + unit);
  }
  return out;
}
/** Feste Reihenfolge für Kategorien ohne Parteifarbe (nie zyklisch neu erzeugt). */
export const CATEGORICAL = ['#3A6EA5', '#D08C2F', '#5E9C6B', '#A34E6E', '#6C5FA8', '#2F8F95', '#B25B3A', '#7A8B3A'];
export const OTHER_GREY = '#A7A29A';

/** Kleinster „runder“ Schritt ≥ x (1, 2, 2,5, 5 × 10^k) */
export function niceStep(x: number, nearest = false): number {
  if (!(x > 0) || !isFinite(x)) return 1;
  const e = Math.floor(Math.log10(x)), f = x / 10 ** e;
  if (nearest) {   // nächstgelegener runder Wert (logarithmisch)
    const c = [1, 2, 2.5, 5, 10].reduce((b, m) => Math.abs(Math.log(m / f)) < Math.abs(Math.log(b / f)) ? m : b, 1);
    return +(c * 10 ** e).toPrecision(6);
  }
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return +(m * 10 ** e).toPrecision(6);
}
/** Zweiseitige Klassen um 0: Grenzen −(n/2−1)·s … +(n/2−1)·s, Schritt aus dem 5- bis 95-%-Bereich */
export function divergingBreaks(values: (number | null)[], classes: number, step: number | null): { breaks: number[]; step: number } {
  const v = values.filter((x): x is number => x != null && isFinite(x)).sort((a, b) => a - b);
  const half = classes / 2;
  const q = (p: number) => v.length ? v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))] : 0;
  const s = step && step > 0 ? step : niceStep(Math.max(Math.abs(q(0.05)), Math.abs(q(0.95)), 1e-6) / half, true);
  const breaks: number[] = [];
  for (let k = -(half - 1); k <= half - 1; k++) breaks.push(+(k * s).toPrecision(6));
  return { breaks, step: s };
}
/** Farbtiefe je Abstand von 0 (1 = nächste Klasse an 0) */
export const DIV_T: Record<number, number[]> = { 2: [0.4, 1], 3: [0.3, 0.65, 1], 4: [0.24, 0.5, 0.75, 1] };
export function divergingColors(neg: string, pos: string, classes: number): string[] {
  const half = classes / 2, T = DIV_T[half] || DIV_T[3], out: string[] = [];
  for (let c = 0; c < classes; c++) { const d = c < half ? half - c : c - half + 1; out.push(mixWhite(c < half ? neg : pos, T[d - 1])); }
  return out;
}
/** Stetige Skala: Farbe wächst gleichmäßig mit dem Wert (Legende als feiner Streifen aus CONT_STEPS Teilen) */
export const CONT_STEPS = 96;
export const contColor = (hue: string, t: number) => mixWhite(hue, +(0.1 + 0.9 * clamp(t, 0, 1)).toFixed(3));
export const signed = (x: number) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toLocaleString('de-DE', { maximumFractionDigits: 2 });
