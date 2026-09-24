export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const esc = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const fmt1 = (v: number | null | undefined) => (v == null || !isFinite(v)) ? '–' : v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmtNum = (v: number | null | undefined, digits = 1) => (v == null || !isFinite(v)) ? '–' : v.toLocaleString('de-DE', { maximumFractionDigits: digits });
export const fmtInt = (v: number | null | undefined) => (v == null || !isFinite(v)) ? '–' : Math.round(v).toLocaleString('de-DE');
export const uid = (p = 'id') => p + '-' + Math.random().toString(36).slice(2, 9);
export const norm = (s: string) => s.toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[–—‐-‒−_/.,;:()'"„“”]+/g, ' ').replace(/\s+/g, ' ').trim();
export const svgId = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
export type BBox = [number, number, number, number];
export const emptyBBox = (): BBox => [Infinity, Infinity, -Infinity, -Infinity];
export const unionBBox = (a: BBox, b: BBox): BBox => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
