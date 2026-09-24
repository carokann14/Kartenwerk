import opentype from 'opentype.js';
import { loadBinary } from './assets';

export type Cut = 'display' | 'bold' | 'text' | 'label';
export const CUTS: Record<Cut, { family: string; file: string; label: string }> = {
  display: { family: 'MW Display', file: 'fonts/mw-display.woff', label: 'Titel (Extrafett)' },
  bold: { family: 'MW Bold', file: 'fonts/mw-bold.woff', label: 'Fett' },
  text: { family: 'MW Text', file: 'fonts/mw-text.woff', label: 'Normal' },
  label: { family: 'MW Label', file: 'fonts/mw-label.woff', label: 'Schmal fett' },
};
const FONTS: Partial<Record<Cut, opentype.Font>> = {};

export async function loadFonts() {
  await Promise.all((Object.keys(CUTS) as Cut[]).map(async cut => {
    const c = CUTS[cut];
    const buf = await loadBinary(c.file);
    FONTS[cut] = opentype.parse(buf.slice(0));
    try { const ff = new FontFace(c.family, buf.slice(0)); document.fonts.add(ff); await ff.load(); } catch (e) { console.warn('FontFace', cut, e); }
  }));
}
export const fontReady = (cut: Cut) => !!FONTS[cut];
export function measureW(text: string, cut: Cut, size: number) {
  const f = FONTS[cut];
  if (!f) return text.length * size * 0.55;
  return f.getAdvanceWidth(text, size, { kerning: true });
}
export const ascentRatio = (cut: Cut) => { const f = FONTS[cut]; return f ? f.ascender / f.unitsPerEm : 0.9; };
export function capOffset(cut: Cut, size: number) {
  const f = FONTS[cut] as (opentype.Font & { tables: { os2?: { sCapHeight?: number } } }) | undefined;
  const cap = f && f.tables.os2 && f.tables.os2.sCapHeight ? f.tables.os2.sCapHeight / f.unitsPerEm : 0.72;
  return cap * size / 2;
}
export function wrapText(text: string, cut: Cut, size: number, maxW: number) {
  const lines: string[] = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let cur = words[0];
    for (let i = 1; i < words.length; i++) {
      const t = cur + ' ' + words[i];
      if (measureW(t, cut, size) <= maxW) cur = t; else { lines.push(cur); cur = words[i]; }
    }
    lines.push(cur);
  }
  return lines;
}
/** Umriss eines Textes als SVG-Pfad (für den Canva-Export). null, wenn die Schrift fehlt. */
export function textPathD(text: string, cut: Cut, x: number, y: number, size: number): string | null {
  const f = FONTS[cut];
  if (!f) return null;
  return f.getPath(text, x, y, size, { kerning: true }).toPathData(1);
}
