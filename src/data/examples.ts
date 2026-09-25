// Beispieldateien ohne Assistent übernehmen (Startdialog „Beispiel öffnen“)
import { loadBinary } from '../lib/assets';
import { ensureGeo } from '../geo/geo';
import { readFile } from './parse';
import { buildDataset, buildTable, defaultSettings, shortTitle, suggestGeoSetAsync } from './pipeline';
import type { Dataset } from './types';

export const EXAMPLES = [
  { file: 'beispiele/btw2025_kerg2.csv', name: 'kerg2.csv', label: 'Bundestagswahl 2025 · amtliches Endergebnis', hint: 'kerg2.csv, Wahlkreise 2025, mit Vorperiode und Direktmandaten' },
  { file: 'beispiele/btw2025_kreise.csv', name: 'btw2025kreis.csv', label: 'Bundestagswahl 2025 nach Kreisen', hint: 'btw2025kreis.csv, 400 Kreise und kreisfreie Städte (Stand 01.01.2025)' },
  { file: 'beispiele/btw2025_gemeinden.csv', name: 'btw2025_gemeinden.csv', label: 'Bundestagswahl 2025 nach Gemeinden', hint: 'aus der Wahlbezirksstatistik zusammengefasst, Zweitstimmen, Briefwahl teils anteilig geschätzt' },
  { file: 'beispiele/btwkr25_umrechnung_btw21.csv', name: 'btwkr25_umrechnung_btw21.csv', label: 'BTW 2021 umgerechnet auf die Wahlkreise 2025', hint: 'amtliche Umrechnung der Bundeswahlleiterin' },
  { file: 'beispiele/btw2021_kerg.csv', name: 'btw2021_kerg.csv', label: 'Bundestagswahl 2021 · amtliches Endergebnis', hint: 'kerg.csv, Wahlkreise 2021' },
  { file: 'beispiele/berlin2026_wahlbezirke.csv', name: 'Datenexport_AGH2026_Zweitstimme_W_BE.csv', label: 'Berlin 2026 nach Wahlbezirken', hint: 'Abgeordnetenhauswahl, Zweitstimmen, vorläufig · 2.542 Urnen- und 1.572 Briefwahlbezirke' },
  { file: 'beispiele/berlin2026_wahlkreise.csv', name: 'Datenexport_AGH2026_Zweitstimme_A_BE.csv', label: 'Berlin 2026 nach Wahlkreisen', hint: 'Abgeordnetenhauswahl, Zweitstimmen, vorläufig · 78 Wahlkreise, 12 Bezirke' },
];
/** In der Vorschau-Fassung fehlen große Beispieldateien */
export const exampleAvailable = (x: { file: string }) => { const a = typeof window !== 'undefined' ? (window as unknown as { __KW_ASSETS__?: Record<string, string> }).__KW_ASSETS__ : undefined; return !a || x.file in a; };
export const EXAMPLES_AVAILABLE = () => EXAMPLES.filter(exampleAvailable);
/** Index eines Beispiels (Berlin: Wahlbezirke, sonst Wahlkreise) */
export const berlinExample = () => { const k = EXAMPLES.findIndex(x => x.file.includes('berlin2026_wahlbezirke')); return k >= 0 && exampleAvailable(EXAMPLES[k]) ? k : EXAMPLES.findIndex(x => x.file.includes('berlin2026_wahlkreise')); };

export async function importExample(k = 0): Promise<Dataset> {
  const x = EXAMPLES[k];
  const raw = await readFile(x.name, await loadBinary(x.file));
  const st = defaultSettings(raw);
  const t = buildTable(raw, st);
  st.geoSet = st.geoSet || (await suggestGeoSetAsync(t, st, x.name)).id;
  await ensureGeo([st.geoSet]);
  return buildDataset(raw, st, t, shortTitle(st.sourceTitle, x.label));
}
