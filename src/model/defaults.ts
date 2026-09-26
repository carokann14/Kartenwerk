import { DEFAULT_PARTY_COLORS } from '../data/parties';
import type { Doc, HatchStyle, LegendSettings } from './types';
import { uid } from '../lib/util';
import { defaultLogo, defaultLogoBox, logoRatio } from './logo';

export const PRESETS: Record<string, { w: number; h: number; label: string }> = {
  '4:5': { w: 1080, h: 1350, label: 'Instagram 4:5' },
  '1:1': { w: 1080, h: 1080, label: 'Quadrat 1:1' },
  '3:4': { w: 1080, h: 1440, label: 'Feed / Karussell 3:4' },
  '9:16': { w: 1080, h: 1920, label: 'Story / Reel 9:16' },
  '16:9': { w: 1600, h: 900, label: 'X / Bluesky 16:9' },
  LinkedIn: { w: 1200, h: 627, label: 'LinkedIn 1,91:1' },
  Frei: { w: 1200, h: 1200, label: 'Freies Format' },
};
/** Vorgegebene Hilfslinien je Formatvorlage (Safe Zone): gelten, sobald eine Variante dieses Formats angelegt wird –
 *  beim „Neuen Projekt“ ebenso wie bei „+ Format“. Formate ohne Eintrag bekommen weiterhin keine Hilfslinien. */
export const PRESET_GUIDES: Partial<Record<string, { x: number[]; y: number[] }>> = {
  '4:5': { x: [80, 1000], y: [80, 1270] },     // Instagram 4:5: 80 px Rand rundum
  '9:16': { x: [80, 1000], y: [260, 1620] },   // Story/Reel 9:16: Safe Zone, oben schmal (260 px), unten breit (1920 − 1620 = 300 px) für Bedienelemente
};
export const LABEL_PRESETS: Record<string, { label: string; template: string | null }> = {
  nr: { label: 'Wahlkreisnummer', template: '{nr}' },
  partei: { label: 'Partei + Anteil', template: '{partei}\n{anteil}' },
  name: { label: 'Name', template: '{name}' },
  namepartei: { label: 'Name + Partei', template: '{name}\n{partei} {anteil}' },
  wert: { label: 'Wert', template: '{wert}' },
  eigene: { label: 'Eigene Vorlage', template: null },
};
export const LH = { title: 1.12, subtitle: 1.36, source: 1.4 };

export function defaultDoc(geoSet = 'btw-wk-2025'): Doc {
  return {
    app: 'kartenwerk', version: 1,
    id: uid('p'),
    name: 'Neues Projekt',
    geoSet,
    datasets: [],
    color: { mode: 'none' },
    partyColors: { ...DEFAULT_PARTY_COLORS },
    overrides: {},
    fokus: { kind: 'de' }, umfeld: 'parent', umfeldStyle: 'fill', fokusOutline: false,
    layers: { wkFill: true, wkLines: true, wkLabels: false, krLines: true, landLines: true, neighbors: true, lakes: true, hatches: true, laender: true },
    style: {
      wkLine: '#FFFFFF', wkLineW: 0.6, krLine: '#FFFFFF', krLineW: 1.1, landLine: '#FFFFFF', landLineW: 1.8,
      umfeld: '#E2DDD2', noData: '#ECE8DF', neighbor: '#F0EEE9', neighborLine: '#D6D1C6', laender: '#E2DDD2', laenderLine: '#FFFFFF', laenderLineW: 1.8, water: '#D6E4EC', fokusLine: '#16181B',
      ink: '#16181B', inkSoft: '#5A5F66', frameLine: '#16181B',
    },
    labels: { preset: 'partei', template: '{partei}\n{anteil}', size: 13, halo: true },
    texts: {
      // Größen als Vorgabe für ein neues Projekt (Standardformat 1080×1350, ts ≈ 1 – siehe defaultTS): 60/30 px, nur hier als Ausgangswert.
      title: { text: 'Titel der Grafik', visible: true, size: 60, cut: 'display', color: 'ink', align: 'start' },
      subtitle: { text: 'Unterzeile: Was zeigt die Karte, welche Wahl, welcher Stand?', visible: true, size: 30, cut: 'text', color: 'inkSoft', align: 'start' },
      source: { visible: true, size: 13, cut: 'text', color: 'inkSoft', align: 'start' },
    },
    legend: defaultLegend(),
    categoryColors: {},
    hatches: [NODATA_HATCH()],
    hatchAssign: {},
    hatchRules: [{ id: 'r-nodata', hatch: 'h-nodata', source: 'nodata' }],
    els: [],
    overlays: [],
    bubbles: null,
    regions: [],
    geodata: [],
    inset: { visible: true, preset: 'berlin', autoHidden: false },
    logo: defaultLogo(),
    background: 'white',
    variants: [],
    active: 0,
  };
}

export const NODATA_HATCH = (): HatchStyle => ({ id: 'h-nodata', name: 'Keine Daten', pattern: 'diag', color: '#B3AC9F', width: 0.8, spacing: 5, bg: null });
export const HATCH_PRESETS: Omit<HatchStyle, 'id'>[] = [
  { name: 'Schraffur', pattern: 'diag', color: '#16181B', width: 1.2, spacing: 6, bg: null },
  { name: 'Gegenläufig', pattern: 'diag2', color: '#16181B', width: 1.2, spacing: 6, bg: null },
  { name: 'Kreuz', pattern: 'kreuz', color: '#16181B', width: 0.9, spacing: 7, bg: null },
  { name: 'Punkte', pattern: 'punkte', color: '#16181B', width: 1.6, spacing: 6, bg: null },
];
export const defaultLegend = (): LegendSettings => ({ visible: true, title: '', orientation: 'vertical', cols: 2, counts: true, size: 20, simple: false, labels: {}, hidden: [], order: [], extra: [], caption: null });

/** Ältere Projekte auf den aktuellen Stand bringen (fehlende Felder mit Vorgaben füllen). */
export function normalizeDoc(d: Doc): Doc {
  const x = JSON.parse(JSON.stringify(d)) as Doc & Record<string, unknown>;
  x.legend = { ...defaultLegend(), ...(x.legend || {}) };
  // Nachbarländer (seit M4 · Etappe 2a): ältere Projekte behalten ihr Aussehen, neue zeigen sie
  if (x.layers && x.layers.laender === undefined) x.layers.laender = false;
  x.layers = { ...defaultDoc(x.geoSet).layers, ...(x.layers || {}) };
  x.style = { ...defaultDoc(x.geoSet).style, ...(x.style || {}) };
  x.categoryColors ||= {};
  if (!Array.isArray(x.hatches)) { x.hatches = [NODATA_HATCH()]; x.hatchRules = [{ id: 'r-nodata', hatch: 'h-nodata', source: 'nodata' }]; }
  x.hatchAssign ||= {};
  x.hatchRules ||= [];
  x.els ||= [];
  x.overlays ||= [];
  if (x.bubbles === undefined) x.bubbles = null;
  x.regions ||= [];
  x.geodata ||= [];
  x.logo = { ...defaultLogo(), ...(x.logo || {}) };
  x.texts.title.align ||= 'start'; x.texts.subtitle.align ||= 'start'; x.texts.source.align ||= 'start';
  delete (x.texts.source as unknown as Record<string, unknown>).extra;   // „Eigener Zusatz“ entfallen (Text lässt sich direkt bearbeiten)
  for (const v of x.variants) {
    v.ann ||= {}; v.guides ||= { x: [], y: [], visible: true }; v.guides.visible ??= true;
    v.L.logo ||= defaultLogoBox(v.L, v.w, v.h, logoRatio(x.logo.asset));
    v.L.legend.w ??= 0;   // altes Projekt ohne Breitenfeld: 0 = automatisch, wie es bislang immer war
    if (typeof v.L.m === 'number') { const mm = v.L.m as number; v.L.m = { left: mm, top: mm, right: mm, bottom: mm }; }   // altes Projekt: ein Rand für alle vier Seiten
  }
  return x;
}
