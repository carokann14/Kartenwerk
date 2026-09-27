// Felder, die zu einer einzelnen Grafik der Mappe gehören (alles andere teilen sich die Grafiken:
// Name und Kennung des Projekts, Datensätze, importierte Geodaten, eigene Regionen, Partei- und Kategoriefarben).
import type { Doc } from './types';

export const GRAPHIC_KEYS = [
  'geoSet', 'color', 'periodSel', 'overrides', 'fokus', 'umfeld', 'umfeldStyle', 'fokusOutline', 'layers', 'style', 'labels',
  'texts', 'legend', 'hatches', 'hatchAssign', 'hatchRules', 'els', 'overlays', 'bubbles', 'inset', 'logo', 'background',
  'variants', 'active',
] as const satisfies readonly (keyof Doc)[];
export type GraphicKey = typeof GRAPHIC_KEYS[number];
/** Zustand der aktiven Grafik (Verweise, keine Kopie) */
export function pickGraphic(d: Doc): Partial<Doc> {
  const o: Record<string, unknown> = {};
  for (const k of GRAPHIC_KEYS) o[k] = (d as unknown as Record<string, unknown>)[k];
  return o as Partial<Doc>;
}
/** Doc so, wie es mit Grafik k aktiv aussähe (zum Zeichnen von Vorschauen und zum Export aller Grafiken) */
export function docForGraphic(d: Doc, k: number): Doc {
  if (k === d.page) return d;
  const g = d.graphics[k]; if (!g) return d;
  return { ...d, ...(d.pageData[g.id] || {}), page: k };
}
