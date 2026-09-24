// Beispieldateien ohne Assistent übernehmen (Startdialog „Beispiel öffnen“)
import { loadBinary } from '../lib/assets';
import { readFile } from './parse';
import { buildDataset, buildTable, defaultSettings, shortTitle, suggestGeoSet } from './pipeline';
import type { Dataset } from './types';

export const EXAMPLES = [
  { file: 'beispiele/btw2025_kerg2.csv', name: 'kerg2.csv', label: 'Bundestagswahl 2025 · amtliches Endergebnis', hint: 'kerg2.csv, Wahlkreise 2025, mit Vorperiode und Direktmandaten' },
  { file: 'beispiele/btwkr25_umrechnung_btw21.csv', name: 'btwkr25_umrechnung_btw21.csv', label: 'BTW 2021 umgerechnet auf die Wahlkreise 2025', hint: 'amtliche Umrechnung der Bundeswahlleiterin' },
  { file: 'beispiele/btw2021_kerg.csv', name: 'btw2021_kerg.csv', label: 'Bundestagswahl 2021 · amtliches Endergebnis', hint: 'kerg.csv, Wahlkreise 2021' },
];

export async function importExample(k = 0): Promise<Dataset> {
  const x = EXAMPLES[k];
  const raw = await readFile(x.name, await loadBinary(x.file));
  const st = defaultSettings(raw);
  const t = buildTable(raw, st);
  st.geoSet = st.geoSet || suggestGeoSet(t).id;
  return buildDataset(raw, st, t, shortTitle(st.sourceTitle, x.label));
}
