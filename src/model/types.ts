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
  ann: Record<string, [number, number]>;   // Versatz je Element: Marker → Beschriftung, Textkasten → Kasten
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
  layers: { wkFill: boolean; wkLines: boolean; wkLabels: boolean; landLines: boolean; neighbors: boolean; lakes: boolean; hatches: boolean };
  style: { wkLine: string; wkLineW: number; landLine: string; landLineW: number; umfeld: string; noData: string; neighbor: string; neighborLine: string; water: string; fokusLine: string; ink: string; inkSoft: string; frameLine: string };
  labels: { preset: string; template: string; size: number; halo: boolean };
  texts: { title: TextEl; subtitle: TextEl; source: { visible: boolean; extra: string; size: number; cut: Cut; color: 'ink' | 'inkSoft' } };
  legend: LegendSettings;
  categoryColors: Record<string, string>;   // Farbe je Kategorie (keine Partei), gilt im Projekt
  hatches: HatchStyle[];
  hatchAssign: Record<string, string>;      // "<geoSet>:<id>" → Schraffur-ID, "" = ausdrücklich keine
  hatchRules: HatchRule[];
  els: AnnEl[];                             // Marker und Textkästen (Reihenfolge = Stapelung)
  inset: { visible: boolean; preset: string; autoHidden: boolean };
  background: 'white' | 'transparent';
  variants: Variant[];
  active: number;
}
export type HatchPattern = 'diag' | 'diag2' | 'kreuz' | 'horizontal' | 'vertikal' | 'punkte';
export interface HatchStyle {
  id: string; name: string; pattern: HatchPattern;
  color: string; width: number; spacing: number;   // Strichstärke und Abstand in px der Grafik
  bg: string | null;                               // null = über der Datenfarbe, sonst eigene Grundfläche
}
export type HatchRule =
  | { id: string; hatch: string; source: 'nodata' }
  | { id: string; hatch: string; source: 'column'; dataset: string; column: string; op: 'in' | 'lt' | 'gt'; values: string[]; num: number | null };
export interface LegendExtra { id: string; label: string; kind: 'fill' | 'hatch' | 'line'; color: string; hatch: string | null }
export interface LegendSettings {
  visible: boolean; title: string; orientation: 'vertical' | 'horizontal' | 'grid'; cols: number; counts: boolean; size: number;
  labels: Record<string, string>;   // Eintrag → eigener Text
  hidden: string[];                 // ausgeblendete Einträge
  order: string[];                  // eigene Reihenfolge
  extra: LegendExtra[];             // eigene Einträge
  caption: string | null;           // Fußzeile, null = automatisch
}
export type MarkerShape = 'kreis' | 'quadrat' | 'dreieck' | 'raute' | 'stern' | 'pin' | 'eigen';
export interface MarkerEl {
  id: string; type: 'marker'; hidden?: boolean;
  at: [number, number];                                   // Kartenraster (ETRS89/UTM32, 10 m)
  place: { ags: string; name: string; src: string } | null; // aus dem Gemeindeverzeichnis
  shape: MarkerShape; symbol: { d: string; vb: [number, number, number, number]; name: string } | null;
  size: number; fill: string; stroke: string; strokeW: number;
  label: string; labelPos: 'r' | 'l' | 'o' | 'u'; labelSize: number; labelCut: Cut; labelHalo: boolean;
  legend: string;                                         // Legendentext, leer = nicht in der Legende
  inset: boolean;                                         // auch in der Detail-Lupe
}
export interface TextBoxEl {
  id: string; type: 'text'; hidden?: boolean;
  anchor: 'map' | 'board';
  at: [number, number];          // Karte: Kartenraster · Fläche: Anteil an Breite und Höhe (0…1)
  text: string; size: number; cut: Cut; color: string;   // 'ink', 'inkSoft' oder Hex
  width: number;                 // Umbruchbreite in px, 0 = nur harte Umbrüche
  align: 'start' | 'middle' | 'end';
  bg: string | null; border: string | null; pad: number;
  leader: boolean;               // Führungslinie zum Ankerpunkt (nur an der Karte)
}
export type AnnEl = MarkerEl | TextBoxEl;
export type Sel =
  | { kind: 'graphic' }
  | { kind: 'area'; ids: string[] }
  | { kind: 'el'; id: 'title' | 'subtitle' | 'source' | 'legend' }
  | { kind: 'frame'; id: 'main' | 'inset' }
  | { kind: 'layer'; id: 'wk' | 'labels' | 'land' | 'water' | 'neighbors' | 'hatches' }
  | { kind: 'hatch'; id: string }
  | { kind: 'ann'; id: string };
