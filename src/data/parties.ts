import { norm } from '../lib/util';

export interface PartyDef { key: string; label: string; color: string; variants: [string, string][] }
// [Schreibweise in Datei, Kurzname für Beschriftungen]
export const PARTY_DEFS: PartyDef[] = [
  { key: 'Union', label: 'CDU/CSU', color: '#2D2D31', variants: [['CDU', 'CDU'], ['CSU', 'CSU'], ['CDU/CSU', 'CDU/CSU'], ['Union', 'Union'], ['Christlich Demokratische Union Deutschlands', 'CDU'], ['Christlich-Soziale Union in Bayern e.V.', 'CSU'], ['Christlich-Soziale Union in Bayern', 'CSU']] },
  { key: 'SPD', label: 'SPD', color: '#E3000F', variants: [['SPD', 'SPD'], ['Sozialdemokratische Partei Deutschlands', 'SPD']] },
  { key: 'AfD', label: 'AfD', color: '#009EE0', variants: [['AfD', 'AfD'], ['Alternative für Deutschland', 'AfD']] },
  { key: 'GRÜNE', label: 'Grüne', color: '#46962B', variants: [['GRÜNE', 'Grüne'], ['Grüne', 'Grüne'], ['BÜNDNIS 90/DIE GRÜNEN', 'Grüne'], ['Bündnis 90/Die Grünen', 'Grüne']] },
  { key: 'FDP', label: 'FDP', color: '#FFD500', variants: [['FDP', 'FDP'], ['Freie Demokratische Partei', 'FDP']] },
  { key: 'LINKE', label: 'Die Linke', color: '#BE3075', variants: [['DIE LINKE', 'Linke'], ['Die Linke', 'Linke'], ['LINKE', 'Linke']] },
  { key: 'BSW', label: 'BSW', color: '#7D254F', variants: [['BSW', 'BSW'], ['Bündnis Sahra Wagenknecht – Vernunft und Gerechtigkeit', 'BSW'], ['Bündnis Sahra Wagenknecht - Vernunft und Gerechtigkeit', 'BSW'], ['Bündnis Sahra Wagenknecht', 'BSW']] },
  { key: 'FW', label: 'Freie Wähler', color: '#F29400', variants: [['FREIE WÄHLER', 'FW'], ['Freie Wähler', 'FW'], ['FW', 'FW']] },
  { key: 'SSW', label: 'SSW', color: '#003C8F', variants: [['SSW', 'SSW'], ['Südschleswigscher Wählerverband', 'SSW']] },
  { key: 'Sonstige', label: 'Sonstige', color: '#9A9A9A', variants: [['Übrige', 'Übrige'], ['Sonstige', 'Sonstige'], ['Andere', 'Andere']] },
];
const INDEX = new Map<string, { key: string; short: string }>();
for (const p of PARTY_DEFS) for (const [v, s] of p.variants) INDEX.set(norm(v), { key: p.key, short: s });
export const partyDef = (key: string) => PARTY_DEFS.find(p => p.key === key);
export function partyOf(name: string): { key: string; short: string } | null {
  return INDEX.get(norm(name)) || null;
}
export const DEFAULT_PARTY_COLORS: Record<string, string> = Object.fromEntries(PARTY_DEFS.map(p => [p.key, p.color]));
export const SHARE_KEYS = ['Union', 'SPD', 'AfD', 'GRÜNE', 'FDP', 'LINKE', 'BSW', 'FW'];
