// Einträge des Kennzahlen-Katalogs (M8). Gemeinsam genutzt von build-katalog.ts (verkleinern) und fetch-rdb.ts (laden).
import type { Extra } from './katalog-derive';
export interface KatalogDef {
  id: string; thema: string; label: string; hint: string; table: string;
  /** Zeile übernehmen? v = Code des Werts (value_variable_code), a = Ausprägungen der übrigen Merkmale (leer = Insgesamt) */
  keep: (v: string, a: string) => boolean;
  /** kürzere Bezeichnungen der Werte (value_variable_label) */
  rename?: Record<string, string>;
  /** aus der Tabelle berechnete Kennzahlen statt der Rohzeilen (scripts/katalog-derive.ts) */
  derive?: 'altersgruppen';
  /** weitere berechnete Spalten (Anteil an Insgesamt, Zahl je Einwohner), Reihenfolge wie angegeben */
  extra?: Extra[];
  /** Hinweis im Katalog, z. B. dass Werte berechnet sind */
  note?: string;
  /** Laden: erstes Jahr und Jahre je Abfrage (Standard 1990 bzw. 6) – große Tabellen kleiner schneiden */
  from?: number; step?: number;
  /** Neue, noch nicht über die Schnittstelle erprobte Tabelle: schlägt das Laden fehl, bleibt der vorige Stand, die Action läuft weiter */
  optional?: boolean;
}
export const DEFS: KatalogDef[] = [
  { id: 'bevoelkerung', thema: 'Bevölkerung', table: '12411-01-01-4', label: 'Bevölkerung', hint: 'Einwohnerinnen und Einwohner insgesamt, weiblich und männlich, jeweils am 31.12.', keep: () => true },
  { id: 'arbeitslosigkeit', thema: 'Arbeit', table: '13211-02-05-4', label: 'Arbeitslosenquote', hint: 'Jahresdurchschnitt, bezogen auf alle zivilen Erwerbspersonen; auch für Frauen, Männer, Ausländer und 15- bis 25-Jährige, dazu die Zahl der Arbeitslosen', keep: (v, a) => v === 'ERWP10' || (v === 'ERWP06' && !a), rename: { ERWP10: 'Arbeitslosenquote' } },
  { id: 'wahlbeteiligung', thema: 'Wahlen', table: '14111-01-04-4', label: 'Wahlbeteiligung bei Bundestagswahlen', hint: 'Wahlberechtigte und Wahlbeteiligung je Bundestagswahl', keep: v => v === 'WAHL01' || v === 'WAHLSR' },
  { id: 'altersgruppen', thema: 'Bevölkerung', table: '12411-02-03-4', label: 'Altersgruppen', hint: 'Bevölkerung unter 18, von 18 bis unter 65 und ab 65 Jahren am 31.12.: Zahl und Anteil an der Bevölkerung (Anteile von Kartenwerk berechnet)', note: 'Die Anteile stehen nicht in der amtlichen Tabelle: Kartenwerk zählt die Altersgruppen zusammen und teilt durch die Bevölkerung insgesamt.', keep: (_v, a) => !/^GES/.test(a), derive: 'altersgruppen', from: 2011, step: 1, optional: true },
  { id: 'einkommen', thema: 'Wirtschaft', table: '82000-07-01-4', label: 'Verfügbares Einkommen', hint: 'Verfügbares Einkommen der privaten Haushalte insgesamt und je Einwohner, jährlich', keep: () => true, rename: { EKM006: 'Verfügbares Einkommen der privaten Haushalte', EKM014: 'Verfügbares Einkommen je Einwohner' }, optional: true },
  { id: 'bip', thema: 'Wirtschaft', table: '82000-01-01-4', label: 'Bruttoinlandsprodukt', hint: 'Bruttoinlandsprodukt insgesamt (Tsd. EUR), je Einwohner und je erwerbstätige Person (EUR), jährlich', keep: () => true, optional: true },
  { id: 'buergergeld', thema: 'Soziales', table: '22811-01-01-4', label: 'Bürgergeld und weitere Mindestsicherung', hint: 'Empfängerinnen und Empfänger von Bürgergeld (SGB II), Hilfe zum Lebensunterhalt, Grundsicherung im Alter und bei Erwerbsminderung sowie Asylbewerberleistungen am 31.12.; dazu der Anteil an der Bevölkerung (von Kartenwerk berechnet)', note: 'Der Anteil an der Bevölkerung steht nicht in der amtlichen Tabelle: Kartenwerk teilt die Zahl der Empfänger durch die Bevölkerung am selben Stichtag (Tabelle 12411-01-01-4).', keep: () => true, extra: [{ kind: 'je-einwohner', per: 100, unit: '%', code: 'MSANT', label: 'Anteil an der Bevölkerung, berechnet' }], optional: true },
  { id: 'pkw', thema: 'Verkehr', table: '46251-02-01-4', label: 'Pkw nach Kraftstoffart', hint: 'Personenkraftwagen am 1.1. nach Benzin, Diesel, Gas, Hybrid, Elektro und sonstigen Kraftstoffen; dazu der Anteil jeder Kraftstoffart am Bestand und die Zahl der Pkw je 1.000 Einwohner (von Kartenwerk berechnet)', note: 'Anteile und Pkw je 1.000 Einwohner stehen nicht in der amtlichen Tabelle: Kartenwerk teilt durch den Pkw-Bestand insgesamt bzw. die Bevölkerung am Tag vor dem Stichtag (Tabelle 12411-01-01-4).', keep: () => true, extra: [{ kind: 'je-einwohner', per: 1000, only: 'total', unit: '', code: 'PKWEW', label: 'Pkw je 1.000 Einwohner, berechnet' }, { kind: 'anteile', code: 'PKWANT', label: 'Anteil am Pkw-Bestand, berechnet' }], optional: true },
  { id: 'bundestagswahlen', thema: 'Wahlen', table: '14111-01-04-4', label: 'Bundestagswahlen: Zweitstimmen', hint: 'Zweitstimmen von CDU/CSU, SPD, AfD, Grünen, FDP und Linken je Bundestagswahl, dazu Wahlbeteiligung', keep: () => true },
];
/** Tabellen, die der Katalog braucht (jede nur einmal) */
export const TABLES = [...new Set(DEFS.map(d => d.table))];
/** Laden je Tabelle: erstes Jahr, Jahre je Abfrage; optional = Fehler beim Laden stoppen die Action nicht */
export const FETCH: Record<string, { from?: number; step?: number; optional: boolean }> = Object.fromEntries(TABLES.map(t => {
  const ds = DEFS.filter(d => d.table === t);
  return [t, { from: Math.min(...ds.map(d => d.from ?? 1990)), step: Math.min(...ds.map(d => d.step ?? 6)), optional: ds.every(d => d.optional) }];
}));
