import type { Dataset } from '../data/types';
import type { Cut } from '../lib/fonts';

export type Fokus = { kind: 'de' } | { kind: 'land'; bl: string } | { kind: 'area'; id: string } | { kind: 'custom'; ids: string[] };
export type Umfeld = 'none' | 'neighbors' | 'parent' | 'all';

export type ColorRule =
  | { mode: 'none' }
  | { mode: 'siegerStaerke'; dataset: string; group: string; basis: 'anteil' | 'vorsprung'; steps: 3 | 4 }
  | { mode: 'sieger'; dataset: string; group: string }
  | { mode: 'anteil'; dataset: string; group: string; party: string }
  | { mode: 'wert'; dataset: string; column: string; method: 'rund' | 'quantil' | 'gleich'; classes: number; hue: string }
  | { mode: 'kategorie'; dataset: string; column: string };

export interface View { cx: number; cy: number; k: number }
export interface Box { x: number; y: number; w: number }
export interface FrameBox { x: number; y: number; w: number; h: number; view: View }
export interface Layout {
  m: number; reserve: number;
  title: Box; subtitle: Box; source: Box; legend: { x: number; y: number };
  main: FrameBox; inset: FrameBox;
}
export interface Variant {
  id: string; preset: string; w: number; h: number; ts: number;
  L: Layout; labelOffsets: Record<string, [number, number]>; locked: { main: boolean; inset: boolean };
}
export interface TextEl { text: string; visible: boolean; size: number; cut: Cut; color: 'ink' | 'inkSoft' }
export interface Doc {
  app: 'kartenwerk'; version: 1;
  id: string;
  name: string;
  geoSet: string;
  datasets: Dataset[];
  color: ColorRule;
  partyColors: Record<string, string>;
  overrides: Record<string, string>;   // "<geoSet>:<id>" → Farbe
  fokus: Fokus; umfeld: Umfeld; umfeldStyle: 'fill' | 'lines'; fokusOutline: boolean;
  layers: { wkFill: boolean; wkLines: boolean; wkLabels: boolean; landLines: boolean; neighbors: boolean; lakes: boolean };
  style: { wkLine: string; wkLineW: number; landLine: string; landLineW: number; umfeld: string; noData: string; neighbor: string; neighborLine: string; water: string; fokusLine: string; ink: string; inkSoft: string; frameLine: string };
  labels: { preset: string; template: string; size: number; halo: boolean };
  texts: { title: TextEl; subtitle: TextEl; source: { visible: boolean; extra: string; size: number; cut: Cut; color: 'ink' | 'inkSoft' } };
  legend: { visible: boolean; title: string; orientation: 'vertical' | 'horizontal'; counts: boolean; size: number };
  inset: { visible: boolean; preset: string; autoHidden: boolean };
  background: 'white' | 'transparent';
  variants: Variant[];
  active: number;
}
export type Sel =
  | { kind: 'graphic' }
  | { kind: 'area'; ids: string[] }
  | { kind: 'el'; id: 'title' | 'subtitle' | 'source' | 'legend' }
  | { kind: 'frame'; id: 'main' | 'inset' }
  | { kind: 'layer'; id: 'wk' | 'labels' | 'land' | 'water' | 'neighbors' };
