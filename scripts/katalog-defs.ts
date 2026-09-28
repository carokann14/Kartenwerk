// Einträge des Kennzahlen-Katalogs (M8). Gemeinsam genutzt von build-katalog.ts (verkleinern) und fetch-rdb.ts (laden).
export interface KatalogDef {
  id: string; thema: string; label: string; hint: string; table: string;
  /** Zeile übernehmen? v = Code des Werts (value_variable_code), a = Ausprägungen der übrigen Merkmale (leer = Insgesamt) */
  keep: (v: string, a: string) => boolean;
  /** kürzere Bezeichnungen der Werte (value_variable_label) */
  rename?: Record<string, string>;
}
export const DEFS: KatalogDef[] = [
  { id: 'bevoelkerung', thema: 'Bevölkerung', table: '12411-01-01-4', label: 'Bevölkerung', hint: 'Einwohnerinnen und Einwohner insgesamt, weiblich und männlich, jeweils am 31.12.', keep: () => true },
  { id: 'arbeitslosigkeit', thema: 'Arbeit', table: '13211-02-05-4', label: 'Arbeitslosenquote', hint: 'Jahresdurchschnitt, bezogen auf alle zivilen Erwerbspersonen; auch für Frauen, Männer, Ausländer und 15- bis 25-Jährige, dazu die Zahl der Arbeitslosen', keep: (v, a) => v === 'ERWP10' || (v === 'ERWP06' && !a), rename: { ERWP10: 'Arbeitslosenquote' } },
  { id: 'wahlbeteiligung', thema: 'Wahlen', table: '14111-01-04-4', label: 'Wahlbeteiligung bei Bundestagswahlen', hint: 'Wahlberechtigte und Wahlbeteiligung je Bundestagswahl', keep: v => v === 'WAHL01' || v === 'WAHLSR' },
  { id: 'bundestagswahlen', thema: 'Wahlen', table: '14111-01-04-4', label: 'Bundestagswahlen: Zweitstimmen', hint: 'Zweitstimmen von CDU/CSU, SPD, AfD, Grünen, FDP und Linken je Bundestagswahl, dazu Wahlbeteiligung', keep: () => true },
];
/** Tabellen, die der Katalog braucht (jede nur einmal) */
export const TABLES = [...new Set(DEFS.map(d => d.table))];
