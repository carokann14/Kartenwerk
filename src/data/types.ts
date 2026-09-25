export type Cell = string | number | null;
export type Role = 'id' | 'name' | 'value' | 'category' | 'label' | 'ignore';
export type PresetId = 'auto' | 'bwl-kerg' | 'bwl-kerg2' | 'bwl-umrechnung' | 'bwl-kreis' | 'bwl-wbz' | 'be-wbz' | 'be-gebiete' | 'ltw-mv' | 'allgemein';

export interface Column { id: string; label: string; kind: 'number' | 'text'; role: Role; party: string | null; short: string | null }
export interface Group { id: string; label: string; columns: string[]; total: string | null; parties: boolean }

export interface LongAttr { col: number; label: string; map?: Record<string, string> }
export interface LongSettings {
  key: number; name: number | null; group: number; sub: number | null; value: number; kind: number | null; filterCol: number | null; filterValue: string;
  prev?: number | null;       // Wert der Vorperiode (z. B. VorpAnzahl), wird zu „… · Vorperiode“
  attrs?: LongAttr[];         // Merkmale je Gebiet (erster Wert je Kennung), z. B. „Gewählt“
}
export interface GroupSetting { label: string; columns: string[]; total: string | null; parties: boolean }
export interface ImportSettings {
  preset: PresetId;
  sheet: number;
  headerStart: number;
  headerRows: number;
  format: 'wide' | 'long';
  long: LongSettings | null;
  roles: Record<string, 'id' | 'name' | 'value' | 'category' | 'label' | 'ignore'>;
  groups: GroupSetting[] | null;
  geoSet: string;
  dashIsZero: boolean;
  excludeSummary: boolean;
  rules: Record<string, string | null>;
  sourceTitle: string;
  attribution: string;
  wbz?: { briefwahl: 'anteilig' | 'gemeinsam' };   // Wahlbezirksstatistik → Gemeinden, Berlin: Urnen- und Briefwahlbezirke
  be?: { ebene: string };                          // Berlin, Export je Gebiet: welche Gebietsart (Wahlkreise, Bezirke …)
}

export type IssueKind = 'byName' | 'ambiguous' | 'unknown' | 'duplicate';
export interface MatchIssue { row: number; kind: IssueKind; key: string; name: string; candidates: string[]; chosen: string | null }
export interface MatchReport {
  total: number; exact: number; byName: number; ambiguous: number; unknown: number; duplicate: number;
  summary: number; ignored: number; ruled: number;
  missing: string[];
  nameMismatch: { row: number; areaId: string; dataName: string; geoName: string }[];
  issues: MatchIssue[];
  nullCells: number; dashCells: number;
  included?: number;                // Gebiete, die in der Zeile eines anderen enthalten sind
}

export interface Dataset {
  id: string;
  name: string;
  fileName: string;
  importedAt: string;
  geoSet: string;
  preset: PresetId;
  settings: ImportSettings;
  columns: Column[];
  groups: Group[];
  rows: Cell[][];
  rowKey: string[];
  rowArea: (string | null)[];
  report: MatchReport;
  joint?: Record<string, string>;   // Gebiete mit gemeinsamem Ergebnis (gleicher Schlüssel = eine Fläche)
  alias?: Record<string, string>;   // Gebiet ohne eigene Zeile → Gebiet, dessen Zeile es enthält (z. B. „einschl. Bergewöhrden“)
  derived?: DerivedInfo;            // nur zur Laufzeit: aus einem feineren Gebietsstand summiert
}
export interface DerivedInfo {
  from: string;                     // Gebietsstand der Quelldaten
  sources: number;                  // Quellgebiete mit Daten
  targets: number;                  // Zielgebiete mit Daten
  unassigned: number;               // Quellgebiete ohne Zielgebiet (z. B. außerhalb aller Regionen)
  partial: number;                  // Zielgebiete, in denen Daten einzelner Bausteine fehlen
  rates: string[];                  // Spalten, die sich nicht addieren lassen (Anteile, Quoten), leer gelassen
  split: number;                    // gemeinsam ausgezählte Gruppen, die über mehrere Zielgebiete reichen
}

export interface RawSheet { name: string; cells: Cell[][] }
export interface RawInput { fileName: string; kind: 'csv' | 'xlsx'; sheets: RawSheet[]; encoding: string; delimiter: string }
