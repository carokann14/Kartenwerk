import { DEFAULT_PARTY_COLORS } from '../data/parties';
import type { Doc } from './types';
import { uid } from '../lib/util';

export const PRESETS: Record<string, { w: number; h: number; label: string }> = {
  '4:5': { w: 1080, h: 1350, label: 'Instagram 4:5' },
  '1:1': { w: 1080, h: 1080, label: 'Quadrat 1:1' },
  '9:16': { w: 1080, h: 1920, label: 'Story / Reel 9:16' },
  '16:9': { w: 1600, h: 900, label: 'X / Bluesky 16:9' },
  LinkedIn: { w: 1200, h: 627, label: 'LinkedIn 1,91:1' },
  Frei: { w: 1200, h: 1200, label: 'Freies Format' },
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
    layers: { wkFill: true, wkLines: true, wkLabels: false, landLines: true, neighbors: true, lakes: true },
    style: {
      wkLine: '#FFFFFF', wkLineW: 0.6, landLine: '#FFFFFF', landLineW: 1.8,
      umfeld: '#E2DDD2', noData: '#ECE8DF', neighbor: '#F0EEE9', neighborLine: '#D6D1C6', water: '#D6E4EC', fokusLine: '#16181B',
      ink: '#16181B', inkSoft: '#5A5F66', frameLine: '#16181B',
    },
    labels: { preset: 'partei', template: '{partei}\n{anteil}', size: 13, halo: true },
    texts: {
      title: { text: 'Titel der Grafik', visible: true, size: 54, cut: 'display', color: 'ink' },
      subtitle: { text: 'Unterzeile: Was zeigt die Karte, welche Wahl, welcher Stand?', visible: true, size: 24, cut: 'text', color: 'inkSoft' },
      source: { visible: true, extra: '', size: 13, cut: 'text', color: 'inkSoft' },
    },
    legend: { visible: true, title: '', orientation: 'vertical', counts: true, size: 20 },
    inset: { visible: true, preset: 'berlin', autoHidden: false },
    background: 'white',
    variants: [],
    active: 0,
  };
}
