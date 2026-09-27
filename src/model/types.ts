import type { Dataset } from '../data/types';
import type { Cut } from '../lib/fonts';
import type { TextMark } from '../lib/richtext';

export type Fokus = { kind: 'de' } | { kind: 'land'; bl: string } | { kind: 'kreis'; kr: string } | { kind: 'area'; id: string } | { kind: 'custom'; ids: string[]; label?: string };   // label: Herkunft, z. B. „Wahlkreis 156 Görlitz“
export type Umfeld = 'none' | 'neighbors' | 'parent' | 'all';

export type ColorRule =
  | { mode: 'none' }
  | { mode: 'siegerStaerke'; dataset: string; group: string; basis: 'anteil' | 'vorsprung'; steps: 1 | 2 | 3 | 4 }
  | { mode: 'sieger'; dataset: string; group: string }
  | { mode: 'anteil'; dataset: string; group: string; party: string; stetig?: boolean }
  | { mode: 'wert'; dataset: string; column: string; method: 'rund' | 'quantil' | 'gleich' | 'stetig'; classes: number; hue: string }
  | { mode: 'kategorie'; dataset: string; column: string }
  | VeraenderungRule;
/** Wert, der verglichen wird: Parteianteil einer Gruppe oder eine Zahlenspalte, aus einem Datensatz desselben Gebietsstands */
export interface WertRef { dataset: string; group: string; column: string; period?: string }   // period: Zeitreihe, sonst die gewählte Periode
export interface VeraenderungRule {
  mode: 'veraenderung'; dataset: string;       // dataset = a.dataset (für Gebietsstand, Quelle)
  kind: 'anteil' | 'wert';
  party: string;                               // bei kind 'anteil'
  a: WertRef; b: WertRef;                      // neu, Vergleich
  rel: boolean;                                // bei kind 'wert': Veränderung in % statt absolut
  palette: 'partei' | 'blaurot';
  classes: 4 | 6 | 8; step: number | null;     // Klassen je Seite ergeben sich; null = automatisch
}
/** Proportionale Kreise an den Gebieten, Größe aus einer Zahlenspalte */
export interface Bubbles {
  visible: boolean; dataset: string; column: string;
  maxR: number;                                // Radius des größten Werts in px der Grafik
  ref: number | null;                          // Bezugswert für maxR (null = größter Wert im Fokus)
  color: 'regel' | string;                     // wie die Färbung oder feste Farbe
  stroke: string; strokeW: number;
  opacity?: number;                            // Deckkraft der Füllung (1 = deckend)
  legend: boolean; title: string;              // Titel in der Legende, leer = Spaltenname
}

export interface View { cx: number; cy: number; k: number }
export interface Box { x: number; y: number; w: number }
export interface FrameBox { x: number; y: number; w: number; h: number; view: View }
export interface Margin { left: number; top: number; right: number; bottom: number }   // Rand für die Standardplatzierung, je Seite einzeln (z. B. ungleiche Safe Zone bei Reels)
export interface Layout {
  m: Margin; reserve: number;
  title: Box; subtitle: Box; source: Box; legend: Box;   // legend.w: 0 = automatisch (passt sich der Kartenbreite an), sonst vom Nutzer per Ziehgriff/Feld gesetzt
  main: FrameBox; inset: FrameBox;
  logo: Box;                                 // x, y = linke obere Ecke, w = Breite in px; die Höhe folgt dem Seitenverhältnis des Logos
}
export interface Guides { x: number[]; y: number[]; visible: boolean }   // Hilfslinien in Pixeln der Grafik, nicht exportiert; visible: Umschalt+R
export interface Variant {
  id: string; preset: string; w: number; h: number; ts: number;
  L: Layout; labelOffsets: Record<string, [number, number]>; locked: { main: boolean; inset: boolean };
  ann: Record<string, [number, number]>;   // Versatz je Element: Marker → Beschriftung, Textkasten → Kasten
  guides: Guides;
}
export interface TextEl { text: string; visible: boolean; size: number; cut: Cut; color: 'ink' | 'inkSoft'; align: 'start' | 'middle' | 'end'; marks?: TextMark[] }
/** Quellenzeile: automatisch aus Daten und Geometrien; `text` gesetzt = von Hand bearbeitet (wird dann nicht mehr angepasst) */
export interface SourceEl {
  visible: boolean; size: number; cut: Cut; color: 'ink' | 'inkSoft'; align: 'start' | 'middle' | 'end';
  text?: string | null;      // eigene Fassung (null/fehlt = automatisch)
  autoBase?: string;         // automatischer Text beim Beginn der Bearbeitung, um spätere Änderungen zu melden
  marks?: TextMark[];        // Formatierung einzelner Textstellen (fett/kursiv/Farbe), bezogen auf die eigene Fassung
}
/** Grafik einer Mappe (Karte oder Diagramm). Die aktive Grafik steht mit ihren Feldern oben im Doc,
 *  die übrigen liegen in `pageData` (siehe src/model/graphics.ts, GRAPHIC_KEYS). */
export type GraphicKind = 'map' | 'chart';
/** Diagramm einer Grafik (M7): Säulen (Parteiergebnis), Balken (waagerecht, sortiert), Gewinne/Verluste */
export type ChartType = 'saeulen' | 'balken' | 'gewinne';
export type ChartScope = { kind: 'alle' } | { kind: 'land'; bl: string } | { kind: 'gebiet'; id: string };
export type ChartSource =
  | { kind: 'partei'; dataset: string; group: string; scope: ChartScope; period?: string | null;
      /** Vergleich (Vorwahl bzw. Gewinne/Verluste): Gruppe „… (Vorperiode)“, andere Periode oder anderer Datensatz */
      cmp: { dataset: string; group: string; period?: string | null } | null }
  | { kind: 'gebiete'; dataset: string; column: string; period?: string | null; select: 'top' | 'bottom' | 'alle'; n: number; scope: ChartScope }
  | { kind: 'tabelle'; dataset: string; column: string; cmp: string | null };
export interface ChartSpec {
  type: ChartType;
  source: ChartSource | null;
  showCmp: boolean;          // Säulen: Vergleichswert als schmale helle Säule daneben
  minShare: number;          // Parteien unter dieser Schwelle (%) → „Sonstige“
  decimals: number;          // Nachkommastellen der Werte
  color: string;             // Farbe für Werte ohne Partei
  keyVisible: boolean;       // kleine Zeichenerklärung (etwa „2025 · 2021“)
  barColors?: Record<string, string>;   // Farbe je einzelnem Balken, überschreibt `color` (bzw. die Parteifarbe) für den Balken mit diesem Schlüssel (Bar.key)
  barLabels?: Record<string, string>;   // Name je einzelnem Balken, überschreibt die automatische Beschriftung (Gebiets-/Spaltenname) für den Balken mit diesem Schlüssel
}
export interface GraphicMeta { id: string; name: string; kind: GraphicKind }
export interface Doc {
  app: 'kartenwerk'; version: 1 | 2;
  graphics: GraphicMeta[];                  // Grafiken der Mappe in Reihenfolge
  page: number;                             // Index der aktiven Grafik
  pageData: Record<string, Partial<Doc>>;   // gespeicherter Zustand der übrigen Grafiken (Felder aus GRAPHIC_KEYS)
  chart?: ChartSpec | null;                 // Diagramm der aktiven Grafik (nur bei kind 'chart')
  id: string;
  name: string;
  geoSet: string;
  datasets: Dataset[];
  periodSel?: Record<string, string>;   // gewählte Periode je Datensatz mit Zeitachse (fehlt = neueste)
  color: ColorRule;
  partyColors: Record<string, string>;
  overrides: Record<string, string>;   // "<geoSet>:<id>" → Farbe
  fokus: Fokus; umfeld: Umfeld; umfeldStyle: 'fill' | 'lines'; fokusOutline: boolean;
  layers: { wkFill: boolean; wkLines: boolean; wkLabels: boolean; krLines: boolean; landLines: boolean; neighbors: boolean; lakes: boolean; hatches: boolean; laender: boolean };
  style: { wkLine: string; wkLineW: number; krLine: string; krLineW: number; landLine: string; landLineW: number; umfeld: string; noData: string; neighbor: string; neighborLine: string; laender: string; laenderLine: string; laenderLineW: number; water: string; fokusLine: string; ink: string; inkSoft: string; frameLine: string };
  labels: { preset: string; template: string; size: number; halo: boolean };
  texts: { title: TextEl; subtitle: TextEl; source: SourceEl };
  legend: LegendSettings;
  categoryColors: Record<string, string>;   // Farbe je Kategorie (keine Partei), gilt im Projekt
  hatches: HatchStyle[];
  hatchAssign: Record<string, string>;      // "<geoSet>:<id>" → Schraffur-ID, "" = ausdrücklich keine
  hatchRules: HatchRule[];
  els: AnnEl[];                             // Marker und Textkästen (Reihenfolge = Stapelung)
  overlays: Overlay[];                      // Grenzen anderer Ebenen über der Karte (z. B. Wahlkreise über Gemeinden)
  bubbles: Bubbles | null;                  // Blasen aus Tabellenwerten
  regions: RegionSet[];                     // eigene Einteilungen (Regionen aus Gebieten eines Gebietsstands)
  geodata: UserGeo[];                       // importierte Geodaten (GeoJSON, Shapefile …), als Gebietsstand „ug:<id>“
  inset: { visible: boolean; preset: string; autoHidden: boolean };
  logo: LogoSettings;                       // eigenes Logo (Bilddatei im Projekt), Platz je Variante in Layout.logo
  background: 'white' | 'transparent';
  variants: Variant[];
  active: number;
}
/** Logo als Bilddatei: SVG (entschärft) oder PNG/JPG (zugeschnitten, höchstens 1600 px breit) */
export interface LogoAsset { name: string; mime: 'image/svg+xml' | 'image/png' | 'image/jpeg'; data: string; w: number; h: number }   // data = Data-URL, w/h = Seitenverhältnis (px bzw. viewBox)
export interface LogoSettings { visible: boolean; asset: LogoAsset | null; opacity: number }
/** Importierte Geodaten: Flächen im Kartenwerk-Raster (Bögen deltakodiert), mit Quelle und Einstellungen des Imports */
export interface UserGeo {
  id: string; label: string; levelLabel: string;        // Name der Ebene, z. B. „Wahlbezirke Berlin 2026“ / „Wahlbezirke“
  attribution: string; source: string;                   // Quellenvermerk (Pflicht), Fundstelle
  year: number; fileName: string; crs: string; tol: number; idField: string | null; nameField: string | null; created: string;
  raw: { arcs: number[][]; areas: import('../geo/geo').RawArea[]; keyLen?: number };
}
/** Eigene Einteilung: Regionen aus Bausteinen eines Gebietsstands (z. B. Kreise → „Ruhrgebiet“).
 *  Als Karte ist sie der Gebietsstand „eg:<id>“; Daten der Bausteine werden je Region addiert. */
export interface RegionSet {
  id: string; name: string;
  base: string;                            // Gebietsstand der Bausteine
  regions: Region[];
  rest: boolean;                           // übrige Bausteine als eigene Region (sonst neutral, ohne Daten)
  restName: string;
}
export interface Region { id: string; name: string; members: string[] }   // id = Nummer (Schlüssel beim Import)
export interface Overlay {
  id: string; geoSet: string;              // Gebietsstand, dessen innere Grenzen gezeichnet werden
  color: string; width: number; dash: boolean; visible: boolean;
  legend: boolean;                         // als Linie in der Legende
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
  unitOn: boolean; unit: string;      // eigenes Zeichen hinter Werten/Bereichen der Klassen-Legende (z. B. „%“, „€“); unitOn = an/aus, unit = der Text
  simple: boolean;                  // Sieger + Stärke: ein Kasten je Partei statt der Abstufungsmatrix (nur die Legende, die Karte bleibt abgestuft)
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
  marks?: TextMark[];            // Formatierung einzelner Textstellen (fett/kursiv/Farbe)
  width: number;                 // Umbruchbreite in px, 0 = nur harte Umbrüche
  align: 'start' | 'middle' | 'end';
  bg: string | null; border: string | null; pad: number;
  leader: boolean;               // Führungslinie zum Ankerpunkt (nur an der Karte)
}
export type ArrowEnd =
  | { kind: 'map'; at: [number, number] }      // Kartenpunkt (Kartenraster)
  | { kind: 'board'; at: [number, number] }    // Punkt der Fläche (Anteil an Breite und Höhe)
  | { kind: 'el'; id: string }                 // verbunden mit Marker oder Textkasten
  | { kind: 'area'; key: string };             // Mittelpunkt eines Gebiets, "<geoSet>:<id>"
export interface ArrowEl {
  id: string; type: 'arrow'; hidden?: boolean;
  from: ArrowEnd; to: ArrowEnd;
  bend: number;                                // Auslenkung der Mitte als Anteil der Länge, 0 = gerade
  color: string; width: number;
  head: 'end' | 'start' | 'both' | 'none'; headSize: number;
  dash: boolean; gap: number;                  // Abstand zu verbundenen Elementen in px
}
export type AnnEl = MarkerEl | TextBoxEl | ArrowEl;
export type Sel =
  | { kind: 'graphic' }
  | { kind: 'area'; ids: string[] }
  | { kind: 'el'; id: 'title' | 'subtitle' | 'source' | 'legend' | 'logo' }
  | { kind: 'frame'; id: 'main' | 'inset' }
  | { kind: 'layer'; id: 'wk' | 'labels' | 'kr' | 'land' | 'water' | 'neighbors' | 'hatches' | 'laender' }
  | { kind: 'hatch'; id: string }
  | { kind: 'ann'; id: string }
  | { kind: 'overlay'; id: string }
  | { kind: 'bubbles' };
