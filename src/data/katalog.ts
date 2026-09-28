// Eingebauter Kennzahlen-Katalog (M8): verkleinerte Tabellen der Regionaldatenbank in public/katalog/, erzeugt von
// scripts/build-katalog.ts. Übernommen werden sie mit derselben Logik wie eine selbst geladene Tabelle (Vorlage „genesis“).
import { loadBinary, loadJSON } from '../lib/assets';
import { ensureGeo } from '../geo/geo';
import { readFile } from './parse';
import { parseGenesis } from './genesis';
import { buildDataset, buildTable, defaultSettings, genesisDeDataset, genesisLevel, laenderStandFor, suggestGeoSetAsync } from './pipeline';
import { periodText } from './time';
import type { Dataset } from './types';

export interface KatalogEntry {
  id: string; thema: string; label: string; hint: string; table: string; title: string; file: string;
  timeLabel: string; periods: string[]; columns: string[]; levels: { de: number; lan: number; krs: number };
  source: string; retrieved: string; bytes: number;
}
export interface KatalogIndex { built: string; entries: KatalogEntry[] }
export type KatalogLevel = 'krs' | 'lan';

let index: Promise<KatalogIndex> | null = null;
/** Katalog laden (einmal je Sitzung); in der Vorschau-Fassung nur Einträge, deren Datei eingebettet ist */
export function loadKatalog(): Promise<KatalogIndex> {
  index ||= loadJSON<KatalogIndex>('katalog/index.json').then(k => {
    const a = typeof window !== 'undefined' ? window.__KW_ASSETS__ : undefined;
    return a ? { ...k, entries: k.entries.filter(e => 'katalog/' + e.file in a) } : k;
  }).catch(e => { index = null; throw e; });
  return index;
}
/** „1994–2025 · 9 Wahltage“ bzw. „Stand 31.12.2025“ */
export function katalogSpan(e: KatalogEntry): string {
  const p = e.periods, n = p.length;
  if (!n) return '';
  const unit = e.timeLabel === 'Wahltag' ? 'Wahltage' : e.timeLabel === 'Stichtag' ? 'Stichtage' : 'Jahre';
  return n === 1 ? (e.timeLabel === 'Jahr' ? `Jahr ${p[0]}` : `Stand ${periodText(p[0])}`) : `${p[0].slice(0, 4)}–${p[n - 1].slice(0, 4)} · ${n} ${unit}`;
}

/** Eintrag übernehmen: Kreise (dazu Länder und Deutschland) bzw. Länder (dazu Deutschland). Erster Datensatz = Hauptdatensatz. */
export async function importKatalog(e: KatalogEntry, level: KatalogLevel): Promise<Dataset[]> {
  const raw = await readFile(e.file, await loadBinary('katalog/' + e.file));
  const st = defaultSettings(raw, 'genesis');
  const [y, m, d] = e.retrieved.split('-');
  st.sourceTitle = st.sourceTitle.replace(/, dl-de/, ` (abgerufen am ${d}.${m}.${y}), dl-de`);
  st.genesis = { laender: level === 'krs' };
  const G = parseGenesis(raw.sheets[st.sheet].cells, raw.fileName);
  // Gebietsstand: Kreise wie beim Import (der Stand, der die neueste Periode am besten abdeckt), Länder dazu passend
  const krs = (await suggestGeoSetAsync(buildTable(raw, { ...st, geoSet: '' }), st, e.file)).id;
  const lan = laenderStandFor(krs);
  st.geoSet = level === 'krs' ? krs : lan || krs;
  await ensureGeo([st.geoSet, ...(level === 'krs' && lan ? [lan] : [])]);
  const main = buildDataset(raw, st, buildTable(raw, st), level === 'krs' ? e.label : `${e.label} · Länder`);
  const out = [main];
  if (level === 'krs' && lan && G.levels.lan?.size && genesisLevel(G, st.geoSet) !== 'lan') {
    const s2 = { ...st, geoSet: lan, rules: {} };
    out.push(buildDataset(raw, s2, buildTable(raw, s2), `${e.label} · Länder`));
  }
  const de = genesisDeDataset(raw, st, main, `${e.label} · Deutschland`);
  if (de) out.push(de);
  return out;
}
