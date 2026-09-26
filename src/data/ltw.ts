// Landtagswahlen: Katalog der eingebauten Landtagswahlkreise und Import-Vorlagen für die Ergebnisdateien der Landeswahlleitungen.
// Je Land und Wahljahr ein Gebietsstand `ltw-<land>-<jahr>` (Ebene `ltw-<land>`), gebaut mit `npm run ltw` aus data-src/ltw/<land>-<jahr>.
// Berlin hat eine eigene, feinere Aufbereitung (berlin.ts, Wahlbezirke bis Bezirke).
import type { Cell } from './types';

export interface LtwEntry {
  bl: string; code: string; year: number; land: string;
  election: string;                  // „Landtagswahl Mecklenburg-Vorpommern 2026“
  count: number;                     // erwartete Zahl der Wahlkreise (Prüfung beim Bau)
  levelLabel?: string;               // Bezeichnung der Ebene, sonst „Landtagswahlkreise“ (Bayern: „Stimmkreise“, Bremen: „Wahlbereiche“)
  showNr?: boolean;                  // Nummer vor dem Namen zeigen (Standard ja)
  // gröbere Ebene aus den Wahlkreisen, auf derselben Topologie (Bayern: Stimmkreise → Wahlkreise = Regierungsbezirke)
  group?: { part: string; levelLabel: string; key: (id: string) => string; names: Record<string, string> };
  geo: {
    file?: string; idField?: string; nameField?: string;
    // statt einer Datei aus Kreisen oder Gemeinden der Verwaltungsgrenzen zusammengesetzt (Saarland, Bremen)
    fromVg?: { level: 'krs' | 'gem'; parts: { id: string; name: string; members: string[] }[] };
    seq?: boolean;                   // Nummern 1…n prüfen (Standard ja; Bayern hat Stimmkreise 101 ff.)
    tol?: number;                    // Vereinfachung in 10-m-Zellen (Standard 1, ab 100 Wahlkreisen 2)
    crs?: string;                    // Koordinatensystem, wenn die Datei keins nennt (Thüringen: GeoPackage ohne Angabe)
    layer?: string;                  // Ebene im Archiv, wenn es mehrere gibt (Dateiname ohne Endung)
    id?: (p: Record<string, unknown>) => string;     // Kennung aus den Attributen ableiten (sonst idField)
    name?: (p: Record<string, unknown>) => string;   // Name bereinigen (sonst nameField)
    attribution: string;             // Quellenvermerk der Geometrie
    source: string;                  // Fundstelle
    license: string;                 // Lizenzstand, wie ihn die Stelle angibt
  };
}
export const LTW: LtwEntry[] = [
  {
    bl: '13', code: 'mv', year: 2026, land: 'Mecklenburg-Vorpommern', election: 'Landtagswahl Mecklenburg-Vorpommern 2026', count: 36,
    geo: {
      file: 'LTwahl_Wahlkreise.zip', idField: 'WkNr', nameField: 'text',
      attribution: '© LAiV M-V, Landtagswahlkreise 2026 (KLWK250MV)',
      source: 'https://www.laiv-mv.de/Wahlen/Landtagswahlen/2026/Wahlkreise-und-%E2%80%93leiter/',
      license: 'keine Lizenz angegeben (© LAiV)',
    },
  },
  {
    bl: '08', code: 'bw', year: 2026, land: 'Baden-Württemberg', election: 'Landtagswahl Baden-Württemberg 2026', count: 70,
    geo: {
      file: 'LTWahlkreise2026-BW_SHP.zip', idField: 'Nummer', nameField: 'WK Name',
      attribution: '© Statistisches Landesamt Baden-Württemberg, Fellbach 2025, Wahlkreiskarte für die Landtagswahl 2026 in Baden-Württemberg; Kartengrundlage: LGL (www.lgl-bw.de), Stadt Freiburg, Stadt Karlsruhe, Stadt Mannheim, Landeshauptstadt Stuttgart',
      source: 'https://www.statistik-bw.de/service/karten-und-atlanten/wahlkreiskarten/',
      license: 'keine Lizenz angegeben; Weiterverwendung mit Copyright-Vermerk im genannten Wortlaut verlangt',
    },
  },
  {
    bl: '07', code: 'rp', year: 2026, land: 'Rheinland-Pfalz', election: 'Landtagswahl Rheinland-Pfalz 2026', count: 52,
    geo: {
      file: 'Geodaten_LW2026_RP.zip', layer: 'LW2026_RP_WK_2_WK', idField: '26_IDEN', nameField: '26_NAM',
      // 26_IDEN: Bezirk (1) + Wahlkreis (2) + …; Namen „Andernach, Wahlkreis“
      id: p => String(Number(String(p['26_IDEN']).slice(1, 3))),
      name: p => String(p['26_NAM']).replace(/,\s*(Wahlkreis|WK)$/, '').replace(/\s*\/\s*/g, '/'),
      attribution: 'Statistisches Landesamt Rheinland-Pfalz, Geodaten zur Landtagswahl 2026 (Stand 09.12.2025)',
      source: 'https://www.wahlen.rlp.de/service/geodaten',
      license: 'keine Lizenz angegeben (Quelle: Statistisches Landesamt Rheinland-Pfalz)',
    },
  },
  {
    bl: '06', code: 'he', year: 2023, land: 'Hessen', election: 'Landtagswahl Hessen 2023', count: 55,
    geo: {
      file: 'hsl_landtagswahlkreise_2023.zip', idField: 'LWK', nameField: 'LWK_NAME',
      attribution: '© Hessisches Statistisches Landesamt, Wiesbaden 2022, Wahlkreiskarte für die Wahl zum 21. Hessischen Landtag im Herbst 2023; Kartengrundlage der Geoinformationen © GeoBasis-DE / BKG 2021, Stadt Darmstadt, Stadt Frankfurt am Main, Stadt Kassel, Landeshauptstadt Wiesbaden',
      source: 'https://statistik.hessen.de/unsere-zahlen/wahlen',
      license: 'keine Lizenz angegeben; Weiterverwendung mit Copyright-Vermerk im genannten Wortlaut verlangt',
    },
  },
  {
    bl: '01', code: 'sh', year: 2022, land: 'Schleswig-Holstein', election: 'Landtagswahl Schleswig-Holstein 2022', count: 35,
    geo: {
      file: 'landtagswahlkreise_sh_2022.zip', idField: 'WKNR', nameField: 'WKNAME',
      attribution: 'Statistisches Amt für Hamburg und Schleswig-Holstein, Wahlkreise der Landtagswahl 2022 (Open-Data Schleswig-Holstein)',
      source: 'https://opendata.schleswig-holstein.de/dataset/wahlkreise-der-landtagswahl-2022',
      license: 'Open-Data-Portal Schleswig-Holstein (Lizenz beim Bau nicht einsehbar, Portal gesperrt)',
    },
  },
  {
    bl: '03', code: 'ni', year: 2022, land: 'Niedersachsen', election: 'Landtagswahl Niedersachsen 2022', count: 87,
    geo: {
      file: 'Landtagswahlkreise_Niedersachsen_2022.zip', idField: 'WKNum', nameField: 'WKName',
      // Die Datei kürzt Namen am ersten Leerzeichen („Bad“, „Sarstedt/Bad“); volle Namen laut wahlen.statistik.niedersachsen.de/LW2022
      name: p => ({ 21: 'Sarstedt/Bad Salzdetfurth', 35: 'Bad Pyrmont', 79: 'Grafschaft Bentheim' } as Record<number, string>)[Number(p.WKNum)] || String(p.WKName),
      attribution: '© Landesamt für Statistik Niedersachsen, Hannover 2022, Wahlkreiskarte für die Wahl zum 19. Niedersächsischen Landtag; Grundlage der Geoinformationen: Auszug aus den Geodaten des Landesamtes für Geoinformation und Landesvermessung Niedersachsen, © 2022; Stadt Braunschweig (dl-de/by-2-0), Stadt Göttingen, Landeshauptstadt Hannover, Stadt Oldenburg, Stadt Osnabrück, Stadt Salzgitter, Stadt Wolfsburg',
      source: 'https://www.statistik.niedersachsen.de/themen/Landtagswahlen-niedersachsen/landtagswahlen-in-niedersachsen-tabellen-und-wahlkreiskarten-227429.html',
      license: 'keine Lizenz angegeben; Weiterverwendung mit Copyright-Vermerk laut Nutzungshinweisen des LSN verlangt',
    },
  },
  {
    bl: '05', code: 'nw', year: 2022, land: 'Nordrhein-Westfalen', election: 'Landtagswahl Nordrhein-Westfalen 2022', count: 128,
    geo: {
      file: '16_LW2022_NRW_Wahlkreise.zip', idField: 'LWKNR', nameField: 'Name',
      name: p => String(p.Name).replace(/^\d+\s+/, ''),   // ein Name mit vorangestellter Nummer („18 Köln VI“)
      attribution: '© Ministerium des Innern des Landes Nordrhein-Westfalen, IT.NRW, Düsseldorf, Wahlkreiseinteilung des Landes Nordrhein-Westfalen zur Landtagswahl am 15. Mai 2022',
      source: 'https://www.wahlergebnisse.nrw/landtagswahlen/2022/wahlkreiskarten.shtml',
      license: 'Pflichtvermerk von IT.NRW (keine weitere Lizenz angegeben)',
    },
  },
  {
    bl: '15', code: 'st', year: 2026, land: 'Sachsen-Anhalt', election: 'Landtagswahl Sachsen-Anhalt 2026', count: 41,
    geo: {
      file: 'Wahlkreise_LTW_2026.zip', idField: 'Nr. Wahlkr', nameField: 'Name Wahlk',
      name: p => String(p['Name Wahlk']).replace('Wittenebrg', 'Wittenberg'),   // Schreibfehler in der Datei
      attribution: '© Statistisches Landesamt Sachsen-Anhalt, Wahlkreise zur Landtagswahl 2026',
      source: 'https://statistik.sachsen-anhalt.de/themen/gebiet-und-wahlen/wahlen/landtagswahl-2026-2/uebersicht-wahlkreiseinteilung',
      license: 'alle Rechte vorbehalten',
    },
  },
  {
    bl: '09', code: 'by', year: 2023, land: 'Bayern', election: 'Landtagswahl Bayern 2023', count: 91, levelLabel: 'Stimmkreise',
    group: { part: 'wkr', levelLabel: 'Wahlkreise', key: id => '90' + id.slice(0, 1), names: { 901: 'Oberbayern', 902: 'Niederbayern', 903: 'Oberpfalz', 904: 'Oberfranken', 905: 'Mittelfranken', 906: 'Unterfranken', 907: 'Schwaben' } },
    geo: {
      file: 'shapefile_stimmkreiseltw_bayern_2023.zip', idField: 'SKR_NR', nameField: 'SKR_NAME', seq: false, tol: 3,
      attribution: '© Bayerisches Landesamt für Statistik, Fürth 2022, Stimmkreiseinteilung zur Landtagswahl 2023',
      source: 'https://www.statistik.bayern.de/wahlen/landtagswahlen/system/index.html',
      license: 'keine Lizenz angegeben (© Bayerisches Landesamt für Statistik)',
    },
  },
  {
    bl: '02', code: 'hh', year: 2025, land: 'Hamburg', election: 'Bürgerschaftswahl Hamburg 2025', count: 17,
    geo: {
      file: 'Wahlkreis_BÜ2025_shape.zip', idField: 'WK_Nr', nameField: 'WK_Name',
      attribution: '© Statistisches Amt für Hamburg und Schleswig-Holstein, Hamburg 2025, Wahlkreise zur Bürgerschaftswahl 2025',
      source: 'https://www.statistik-nord.de/wahlen/wahlen-in-hamburg/buergerschaftswahlen/buergerschaftswahl-2025-in-hamburg',
      license: 'Verbreitung mit Quellenangabe gestattet, alle übrigen Rechte vorbehalten',
    },
  },
  {
    bl: '10', code: 'sl', year: 2022, land: 'Saarland', election: 'Landtagswahl Saarland 2022', count: 3,
    geo: {
      // § 7 LWG Saarland: Wahlkreis Saarbrücken = Regionalverband, Saarlouis = Saarlouis + Merzig-Wadern, Neunkirchen = Neunkirchen + St. Wendel + Saarpfalz
      fromVg: { level: 'krs', parts: [{ id: '1', name: 'Saarbrücken', members: ['10041'] }, { id: '2', name: 'Saarlouis', members: ['10042', '10044'] }, { id: '3', name: 'Neunkirchen', members: ['10043', '10045', '10046'] }] },
      attribution: '© BKG (2026) dl-de/by-2-0 (Verwaltungsgebiete 1:250 000), Wahlkreise aus den Landkreisen zusammengesetzt',
      source: 'https://daten.gdz.bkg.bund.de/produkte/vg/',
      license: 'dl-de/by-2-0 (BKG)',
    },
  },
  {
    bl: '04', code: 'hb', year: 2023, land: 'Bremen', election: 'Bürgerschaftswahl Bremen 2023', count: 2, levelLabel: 'Wahlbereiche', showNr: false,
    geo: {
      fromVg: { level: 'gem', parts: [{ id: '1', name: 'Bremen', members: ['04011000'] }, { id: '2', name: 'Bremerhaven', members: ['04012000'] }] },
      attribution: '© BKG (2026) dl-de/by-2-0 (Verwaltungsgebiete 1:250 000), Wahlbereiche = Städte Bremen und Bremerhaven',
      source: 'https://daten.gdz.bkg.bund.de/produkte/vg/',
      license: 'dl-de/by-2-0 (BKG)',
    },
  },
  {
    bl: '14', code: 'sn', year: 2024, land: 'Sachsen', election: 'Landtagswahl Sachsen 2024', count: 60,
    geo: {
      // Kartendienst des GeoSN (Verwaltungsatlas, Ebene landtagswahlkreise), abgefragt über den eingebauten Browser und als Topologie übertragen
      file: 'sn_landtagswahlkreise_2024.geojson', idField: 'nr', nameField: 'name', tol: 0,
      attribution: 'Landtagswahlkreise 2024: © GeoSN (2024), dl-de/by-2-0, Verwaltungsatlas Sachsen',
      source: 'https://geodienste.sachsen.de/ags-relay/ArcGISServer/guest/arcgis/rest/services/smr/rest_smr_wahlen/MapServer/1',
      license: 'dl-de/by-2-0 (GeoSN)',
    },
  },
  {
    bl: '16', code: 'th', year: 2024, land: 'Thüringen', election: 'Landtagswahl Thüringen 2024', count: 44,
    geo: {
      file: '16TH_L24_Wahlkreiseinteilung.zip', idField: 'WK_ID', nameField: 'WK', crs: 'EPSG:25832',
      attribution: 'Wahlkreiseinteilung zur Landtagswahl 2024: Landeswahlleiter Thüringen',
      source: 'https://wahlen.thueringen.de/landtagswahlen/lw_informationen.asp',
      license: 'keine Lizenz angegeben (Geo-Vektordaten des Landeswahlleiters)',
    },
  },
  {
    bl: '12', code: 'bb', year: 2024, land: 'Brandenburg', election: 'Landtagswahl Brandenburg 2024', count: 44,
    geo: {
      // abgeleitet (npm run ltw:derive -- bb): Gemeinden der VG250 nach der amtlichen Zuordnung im Wahlbezirksergebnis;
      // Brandenburg an der Havel, Cottbus und Potsdam sind geteilt, dort stammt die innere Grenze aus der groben Karte der Ergebnis-Präsentation
      file: 'bb_landtagswahlkreise_2024.geojson', idField: 'nr', nameField: 'name', tol: 0,
      attribution: 'Landtagswahlkreise 2024 abgeleitet aus © BKG (2026) dl-de/by-2-0 (Verwaltungsgebiete 1:250 000) und der Wahlkreiszuordnung des Landeswahlleiters Brandenburg; Grenzen in Brandenburg an der Havel, Cottbus und Potsdam genähert',
      source: 'https://wahlergebnisse.brandenburg.de/12/500/20240922/landtagswahl_land/',
      license: 'dl-de/by-2-0 (BKG); Zuordnung aus amtlichen Ergebnisdaten',
    },
  },
];
export const ltwGroupId = (e: Pick<LtwEntry, 'code' | 'year' | 'group'>) => `ltw-${e.code}-${e.group!.part}-${e.year}`;
export const ltwSetId = (e: Pick<LtwEntry, 'code' | 'year'>) => `ltw-${e.code}-${e.year}`;
export const ltwLevel = (e: Pick<LtwEntry, 'code'>) => `ltw-${e.code}`;
export const isLtwLevel = (level: string) => level.startsWith('ltw-');

// ---------- Import-Vorlagen der Landeswahlleitungen ----------
// Jede Vorlage erkennt ihre Datei, liest Titel und Urheber und baut eine Tabelle mit einer Zeile je Wahlkreis:
// Kennung (Nummer ohne führende Nullen), ggf. Name, Wahlberechtigte, Wählende, dann je Stimme „Gültige Stimmen · Erststimmen“,
// „Ungültige Stimmen · …“ und die Wahlvorschläge „Partei · Erststimmen“/„Partei · Zweitstimmen“. Spalten ohne jeden Wert entfallen.
export interface LtwTable { header: string[]; body: Cell[][]; notes: string[] }
export interface LtwPreset {
  id: `ltw-${string}`; code: string; label: string;
  hint: string;                                      // Erklärung im Importassistenten
  find: (cells: Cell[][]) => number;                 // Kopfzeile oder -1
  headerRows?: number;
  meta: (cells: Cell[][], h: number, fileName: string) => { year?: number; title: string; attribution: string };
  build: (cells: Cell[][], h: number, sheets?: Cell[][][]) => LtwTable;   // sheets: alle Blätter (Brandenburg: Erst- und Zweitstimmen getrennt)
  group?: boolean;                                   // Ergebnis für die Zusammenfassung (Bayern: Wahlkreise über den Stimmkreisen)
  nameRole?: 'name' | 'label';                       // abgekürzte Namen in der Datei: nur zur Anzeige, zugeordnet wird über die Nummer
}
const s = (v: Cell) => String(v ?? '').trim();
const txtRow = (r: Cell[] | undefined) => (r || []).map(s);
const findIn = (cells: Cell[][], test: (r: string[]) => boolean, limit = 30) => { for (let i = 0; i < Math.min(cells.length, limit); i++) if (test(txtRow(cells[i]))) return i; return -1; };
const numOf = (v: Cell): number | null => {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const t = s(v); if (!t || /^[x.…/–-]$/i.test(t)) return null;
  const n = Number(t.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
};
const wkKey = (v: Cell) => { const t = s(v).replace(/\s+/g, ' '); const m = t.match(/(\d+)\s*$/); return m ? String(Number(m[1])) : t; };
/** Spalten ohne jeden Wert entfernen (Parteien, die nicht angetreten sind), ab Spalte `from` */
function dropEmpty(t: LtwTable, from: number): LtwTable {
  const keep = t.header.map((_, c) => c < from || t.body.some(r => r[c] != null && r[c] !== ''));
  return { header: t.header.filter((_, c) => keep[c]), body: t.body.map(r => r.filter((_, c) => keep[c])), notes: t.notes };
}
/** Summe der Wahlkreise mit einer Landeszeile vergleichen */
function checkLand(t: LtwTable, land: Cell[] | null, from: number, skip: (label: string) => boolean = () => false) {
  if (!land) return;
  const bad: string[] = [];
  for (let c = from; c < t.header.length; c++) {
    if (skip(t.header[c]) || land[c] == null) continue;
    let sum = 0; for (const r of t.body) sum += (r[c] as number | null) ?? 0;
    if (Math.abs(sum - (land[c] as number)) > 0.5) bad.push(t.header[c]);
  }
  t.notes.push(bad.length ? `Achtung: Summe der Wahlkreise weicht vom Landesergebnis ab bei ${bad.join(', ')}.` : 'Summe der Wahlkreise stimmt mit dem Landesergebnis überein.');
}
const isRateLabel = (l: string) => /beteiligung|%/i.test(l);
const copyOf = (pre: string[], fallback: string) => (pre.find(x => /^\(c\)|^©/i.test(x)) || fallback).replace(/^\(c\)\s*|^©\s*/i, '');

// Mecklenburg-Vorpommern: Landeswahlleiter, Ergebnis der Wahlkreise (l_wahlkreise.csv)
// Vorspann (Titel, Stand, Hinweise, Urheber), dann je Wahlkreis vier Zeilen: Ausgabe A (Anzahl) / P (Prozent) × Stimme 1 / 2.
// Wahlkreis 99 = Land. „x“ = Wahlvorschlag nicht zugelassen bzw. nicht angetreten.
export const isMvLtw = (h: string[]) => h.includes('Ausgabe') && h.includes('Erst-/Zweitstimme') && h.includes('Wahlkreisname/Land') && h.includes('Wahlkreis');
/** Titel für die Quellenzeile aus dem Vorspann: „Landtagswahl Mecklenburg-Vorpommern 2026, vorläufiges Ergebnis, Stand 21.09.2026“ */
export function mvTitle(pre: string[]): string {
  const y = (pre.find(x => /Landtag/.test(x)) || '').match(/(\d{4})/)?.[1] || '';
  const st = pre.find(x => /Ergebnis/.test(x)) || '';
  const art = /vorl[äa]ufig/i.test(st) ? 'vorläufiges Ergebnis' : /endg[üu]ltig/i.test(st) ? 'endgültiges Ergebnis' : '';
  const d = st.match(/am (\d\d\.\d\d\.\d{4})/)?.[1];
  return [`Landtagswahl Mecklenburg-Vorpommern${y ? ' ' + y : ''}`, art, d ? 'Stand ' + d : ''].filter(Boolean).join(', ');
}
/** Eine Zeile je Wahlkreis: Anzahlen der Erst- und Zweitstimmen nebeneinander; Landeszeile zur Prüfung */
export function aggregateMvLtw(cells: Cell[][], h: number) {
  const H = (cells[h] || []).map(s), ix = (n: string) => H.indexOf(n);
  const I = { aus: ix('Ausgabe'), wk: ix('Wahlkreis'), name: ix('Wahlkreisname/Land'), wbz: ix('Wahlbezirke insg.'), erf: ix('Erf. Wahlbezirke'), wb: ix('Wahlberechtigte'), wae: ix('Wähler'), bet: ix('Wahlbeteiligung'), st: ix('Erst-/Zweitstimme'), ung: ix('Ungültige Stimmen'), gue: ix('Gültige Stimmen') };
  const pcols = H.map((c, i) => [c, i] as const).filter(([, i]) => i > I.gue);
  const rows = cells.slice(h + 1).filter(r => r && s(r[I.aus]) === 'A' && /^\d+$/.test(s(r[I.wk])));
  const byWk = new Map<string, { name: string; r1?: Cell[]; r2?: Cell[] }>();
  for (const r of rows) {
    const k = s(r[I.wk]); let x = byWk.get(k); if (!x) { x = { name: s(r[I.name]) }; byWk.set(k, x); }
    if (s(r[I.st]) === '1') x.r1 = r; else if (s(r[I.st]) === '2') x.r2 = r;
  }
  const land = byWk.get('99'); byWk.delete('99');
  const wks = [...byWk].sort((a, b) => +a[0] - +b[0]);
  const any = (i: number, which: 'r1' | 'r2') => wks.some(([, x]) => x[which] && numOf(x[which]![i]) != null);
  const used1 = pcols.filter(([, i]) => any(i, 'r1')), used2 = pcols.filter(([, i]) => any(i, 'r2'));
  const header = ['Wahlkreis', 'Name', 'Wahlbezirke', 'Erfasste Wahlbezirke', 'Wahlberechtigte', 'Wählende', 'Wahlbeteiligung',
    'Gültige Stimmen · Erststimmen', 'Ungültige Stimmen · Erststimmen', ...used1.map(([c]) => `${c} · Erststimmen`),
    'Gültige Stimmen · Zweitstimmen', 'Ungültige Stimmen · Zweitstimmen', ...used2.map(([c]) => `${c} · Zweitstimmen`)];
  const line = (x: { r1?: Cell[]; r2?: Cell[] }): (number | null)[] => {
    const b = x.r2 || x.r1!, v = (r: Cell[] | undefined, i: number) => (r ? numOf(r[i]) : null);
    return [numOf(b[I.wbz]), numOf(b[I.erf]), numOf(b[I.wb]), numOf(b[I.wae]), numOf(b[I.bet]),
      v(x.r1, I.gue), v(x.r1, I.ung), ...used1.map(([, i]) => v(x.r1, i)),
      v(x.r2, I.gue), v(x.r2, I.ung), ...used2.map(([, i]) => v(x.r2, i))];
  };
  const body: Cell[][] = wks.map(([k, x]) => [k, x.name, ...line(x)]);
  const notes: string[] = [`${wks.length} Wahlkreise mit Erst- und Zweitstimmen; übernommen werden die Stimmenzahlen, die Prozentzeilen berechnet Kartenwerk selbst.`];
  const miss = body.filter(r => r[2] != null && r[3] != null && r[2] !== r[3]).length;
  if (miss) notes.push(`In ${miss} Wahlkreisen sind noch nicht alle Wahlbezirke erfasst.`);
  // Prüfung: Summe der Wahlkreise = Landesergebnis
  if (land) {
    const L = line(land), bad: string[] = [];
    for (let c = 2; c < header.length; c++) {
      if (c === 6 || L[c - 2] == null) continue;   // Wahlbeteiligung ist ein Anteil
      let sum = 0; for (const r of body) sum += (r[c] as number | null) ?? 0;
      if (Math.abs(sum - (L[c - 2] as number)) > 0.5) bad.push(header[c]);
    }
    notes.push(bad.length ? `Achtung: Summe der Wahlkreise weicht vom Landesergebnis ab bei ${bad.join(', ')}.` : 'Summe der Wahlkreise stimmt mit dem Landesergebnis überein.');
  }
  return { header, body, notes };
}

const mvPreset: LtwPreset = {
  id: 'ltw-mv', code: 'mv', label: 'Mecklenburg-Vorpommern · Landtagswahl nach Wahlkreisen',
  hint: 'Die Datei des Landeswahlleiters enthält je Wahlkreis vier Zeilen (Stimmen und Prozent, Erst- und Zweitstimme) und das Land. Übernommen werden die Stimmenzahlen, Erst- und Zweitstimmen nebeneinander; Anteile rechnet Kartenwerk selbst. „x“ heißt: nicht angetreten.',
  find: c => findIn(c, isMvLtw, 20),
  meta: (c, h) => { const pre = c.slice(0, Math.max(0, h)).map(r => s(r[0])).filter(Boolean); const y = (pre.find(x => /Landtag/.test(x)) || '').match(/(\d{4})/)?.[1]; return { year: y ? +y : undefined, title: mvTitle(pre), attribution: copyOf(pre, 'Der Landeswahlleiter Mecklenburg-Vorpommern') }; },
  build: (c, h) => aggregateMvLtw(c, h),
};

// Niedersachsen: Landesamt für Statistik, wahlergebnis.csv (je Wahlkreis, „Partei I“ = Erststimmen, „Partei II“ = Zweitstimmen)
const niPreset: LtwPreset = {
  id: 'ltw-ni', code: 'ni', label: 'Niedersachsen · Landtagswahl nach Wahlkreisen',
  hint: 'Datei des Landesamts für Statistik Niedersachsen: je Wahlkreis eine Zeile, „Partei I“ sind Erststimmen, „Partei II“ Zweitstimmen. Die Namen der Wahlkreise kommen aus der Karte.',
  find: c => findIn(c, r => r[0] === 'Wahlkreis' && r.includes('Gültige Erststimmen') && r.some(x => / II$/.test(x)), 5),
  meta: () => ({ year: 2022, title: 'Landtagswahl Niedersachsen 2022', attribution: 'Landesamt für Statistik Niedersachsen' }),
  build: (c, h) => {
    const H = txtRow(c[h]);
    const lab = (x: string) => x === 'Wahlkreis' ? 'Wahlkreis' : x === 'Wähler' ? 'Wählende' : x === 'Gültige Erststimmen' ? 'Gültige Stimmen · Erststimmen' : x === 'Gültige Zweitstimmen' ? 'Gültige Stimmen · Zweitstimmen'
      : /^sonstige \(Partei\) II$/i.test(x) ? 'Sonstige · Zweitstimmen' : /^sonstige \(Partei\) I$/i.test(x) ? 'Sonstige · Erststimmen'
      : / II$/.test(x) ? x.replace(/ II$/, ' · Zweitstimmen') : / I$/.test(x) ? x.replace(/ I$/, ' · Erststimmen') : /^Einzelbewerber \d+$/.test(x) ? x + ' · Erststimmen' : x;
    const cols = H.map((x, i) => [lab(x), i] as const).filter(([x]) => x);
    const rows = c.slice(h + 1).filter(r => /^\d+$/.test(s(r[0])));
    const t: LtwTable = { header: cols.map(x => x[0]), body: rows.map(r => cols.map(([x, i]) => (x === 'Wahlkreis' ? wkKey(r[i]) : numOf(r[i])))), notes: [] };
    const out = dropEmpty(t, 1);
    out.notes.push(`${out.body.length} Wahlkreise mit Erst- und Zweitstimmen (${out.header.filter(x => / · Zweitstimmen$/.test(x) && !/^Gültige/.test(x)).length} Parteien).`);
    return out;
  },
};

// Nordrhein-Westfalen: IT.NRW, LW22_WK_insgesamt.txt (Titelzeilen, dann „… [E]“ = Erststimmen, „… [Z]“ = Zweitstimmen; Wahlkreis 000 = Land)
const nwPreset: LtwPreset = {
  id: 'ltw-nw', code: 'nw', label: 'Nordrhein-Westfalen · Landtagswahl nach Wahlkreisen',
  hint: 'Datei von IT.NRW: je Wahlkreis eine Zeile, „[E]“ sind Erststimmen, „[Z]“ Zweitstimmen. Die Zeile 000 ist das Land und dient der Prüfung.',
  find: c => findIn(c, r => r[0] === 'Wahl' && r.includes('Wahlkreisnr.') && r.some(x => /\[Z\]$/.test(x)), 10),
  meta: (c, h) => {
    const pre = c.slice(0, h).map(r => s(r[0])).filter(Boolean);
    const y = (pre.find(x => /Landtagswahl/.test(x)) || '').match(/(\d{4})/)?.[1];
    const art = pre.some(x => /Endgültig/i.test(x)) ? ', endgültiges Ergebnis' : pre.some(x => /Vorläufig/i.test(x)) ? ', vorläufiges Ergebnis' : '';
    return { year: y ? +y : undefined, title: `Landtagswahl Nordrhein-Westfalen${y ? ' ' + y : ''}${art}`, attribution: 'IT.NRW, Düsseldorf' };
  },
  build: (c, h) => {
    const H = txtRow(c[h]);
    const lab = (x: string) => x === 'Wahlkreisnr.' ? 'Wahlkreis' : x === 'Wahlkreisname' ? 'Name' : x === 'Wahlberechtigte insgesamt' ? 'Wahlberechtigte' : x === 'Wähler/-innen' ? 'Wählende' : x === 'darunter mit Wahlschein' ? 'Wählende mit Wahlschein'
      : /\[E\]$/.test(x) ? x.replace(/\s*\[E\]$/, ' · Erststimmen') : /\[Z\]$/.test(x) ? x.replace(/\s*\[Z\]$/, ' · Zweitstimmen') : '';
    const cols = H.map((x, i) => [lab(x), i] as const).filter(([x]) => x);
    const all = c.slice(h + 1).filter(r => /^\d+$/.test(s(r[1])));
    const row = (r: Cell[]) => cols.map(([x, i]) => (x === 'Wahlkreis' ? wkKey(r[i]) : x === 'Name' ? s(r[i]) : numOf(r[i])));
    const landRow = all.find(r => Number(s(r[1])) === 0);
    const t = dropEmpty({ header: cols.map(x => x[0]), body: all.filter(r => Number(s(r[1])) > 0).map(row), notes: [] }, 2);
    t.notes.push(`${t.body.length} Wahlkreise mit Erst- und Zweitstimmen.`);
    if (landRow) { const L = row(landRow); const keepIdx = cols.map(([x]) => x).map((x, k) => (t.header.includes(x) ? k : -1)).filter(k => k >= 0); checkLand(t, keepIdx.map(k => L[k]), 2, l => isRateLabel(l) || /^Einzelbewerber\/-in \d/.test(l)); }
    return t;
  },
};

// Rheinland-Pfalz: Landeswahlleiter, Endgueltiges_Ergebnis_LW_2026_Wahlkreise.xlsx (fünf Kopfzeilen: Bereich, Stimme, Partei, leer, Kennbuchstaben)
// Wahlkreisstimme = Erststimme, Landesstimme = Zweitstimme; Prozentspalten entfallen.
const rpPreset: LtwPreset = {
  id: 'ltw-rp', code: 'rp', label: 'Rheinland-Pfalz · Landtagswahl nach Wahlkreisen',
  hint: 'Datei des Landeswahlleiters: je Wahlkreis eine Zeile, Wahlkreisstimmen erscheinen als Erststimmen, Landesstimmen als Zweitstimmen. Die Namen in der Datei sind abgekürzt; zugeordnet wird über die Nummer, angezeigt werden die Namen der Karte.',
  headerRows: 5, nameRole: 'label',
  find: c => findIn(c, r => r[0] === 'Gebietsschlüssel' && r.includes('Wahl in den Wahlkreisen') && r.includes('Wahl nach Landeslisten'), 10),
  meta: (_c, _h, fileName) => {
    const y = fileName.match(/(20\d\d)/)?.[1] || '2026';
    const art = /endg/i.test(fileName) ? ', endgültiges Ergebnis' : /vorl/i.test(fileName) ? ', vorläufiges Ergebnis' : '';
    return { year: +y, title: `Landtagswahl Rheinland-Pfalz ${y}${art}`, attribution: 'Der Landeswahlleiter Rheinland-Pfalz' };
  },
  build: (c, h) => {
    const names = txtRow(c[h + 2]), codes = txtRow(c[h + 4]);
    const FIX: Record<string, string> = { A: 'Wahlberechtigte', B: 'Wählende', B1: 'Wählende mit Wahlschein', C: 'Ungültige Stimmen · Erststimmen', D: 'Gültige Stimmen · Erststimmen', E: 'Ungültige Stimmen · Zweitstimmen', F: 'Gültige Stimmen · Zweitstimmen' };
    const cols: [string, number][] = [['Wahlkreis', 0], ['Name', 2]];
    codes.forEach((k, i) => {
      if (FIX[k]) cols.push([FIX[k], i]);
      else if (/^D\d+$/.test(k) && names[i]) cols.push([`${names[i]} · Erststimmen`, i]);
      else if (/^F\d+$/.test(k) && names[i]) cols.push([`${names[i]} · Zweitstimmen`, i]);
    });
    const rows = c.slice(h + 5).filter(r => /^\d\s*\d{3}$/.test(s(r[0])));
    const body = rows.map(r => cols.map(([x, i]) => (x === 'Wahlkreis' ? wkKey(r[i]) : x === 'Name' ? s(r[i]).replace(/,\s*WK$/, '') : numOf(r[i]))));
    const t = dropEmpty({ header: cols.map(x => x[0]), body, notes: [] }, 2);
    t.notes.push(`${t.body.length} Wahlkreise; Wahlkreisstimmen als Erststimmen, Landesstimmen als Zweitstimmen übernommen.`);
    return t;
  },
};

// Baden-Württemberg: Statistisches Landesamt, ltw26-ergebnisse.csv (alle Ebenen; Wahlvorschläge nur als D…/F… nummeriert,
// Namen laut „Hinweise-Datensatzbeschreibung“). D22 = anderer Kreiswahlvorschlag je Wahlkreis, wird nicht aufs Land summiert.
const BW_2026: Record<string, string> = {
  1: 'GRÜNE', 2: 'CDU', 3: 'SPD', 4: 'FDP', 5: 'AfD', 6: 'Die Linke', 7: 'FREIE WÄHLER', 8: 'Die PARTEI', 9: 'dieBasis', 10: 'KlimalisteBW', 11: 'ÖDP', 12: 'Volt',
  13: 'Bündnis C', 14: 'PDH', 15: 'Verjüngungsforschung', 16: 'BSW', 17: 'Die Gerechtigkeitspartei', 18: 'PDR', 19: 'PdF', 20: 'Tierschutzpartei', 21: 'Werteunion', 22: 'Andere Kreiswahlvorschläge',
};
/** Votemanager-Spalten: A…F und D1…/F1… in Kartenwerk-Beschriftungen */
function vmLabel(h: string, names: Record<string, string>, D: Record<string, string> = names): string {
  const m = h.match(/^([DF])(\d+)$/); if (m) { const n = (m[1] === 'D' ? D : names)[m[2]]; return n ? `${n} · ${m[1] === 'D' ? 'Erststimmen' : 'Zweitstimmen'}` : `Wahlvorschlag ${h} · ${m[1] === 'D' ? 'Erststimmen' : 'Zweitstimmen'}`; }
  if (/\(A\)$/.test(h)) return 'Wahlberechtigte';
  if (/\(B\)$/.test(h)) return 'Wählende';
  if (/\(C\)$/.test(h)) return 'Ungültige Stimmen · Erststimmen';
  if (/\(D\)$/.test(h)) return 'Gültige Stimmen · Erststimmen';
  if (/\(E\)$/.test(h)) return 'Ungültige Stimmen · Zweitstimmen';
  if (/\(F\)$/.test(h)) return 'Gültige Stimmen · Zweitstimmen';
  return '';
}
const bwPreset: LtwPreset = {
  id: 'ltw-bw', code: 'bw', label: 'Baden-Württemberg · Landtagswahl nach Wahlkreisen',
  hint: 'Downloaddatei des Statistischen Landesamts: alle Ebenen bis zum Wahlbezirk. Übernommen werden die 70 Wahlkreise; die Parteien stehen in der Datei nur als D1…/F1…, die Namen stammen aus der Datensatzbeschreibung 2026. „Andere Kreiswahlvorschläge“ (D22) sind je nach Wahlkreis BÜNDNIS DEUTSCHLAND, PIRATEN oder Einzelbewerbungen.',
  find: c => findIn(c, r => r.includes('Wahlkreisnummer') && r.includes('Gebietsart') && r.includes('Erststimmen gueltige (D)') && r.includes('Zweitstimmen gueltige (F)'), 5),
  meta: () => ({ year: 2026, title: 'Landtagswahl Baden-Württemberg 2026', attribution: 'Statistisches Landesamt Baden-Württemberg' }),
  build: (c, h) => {
    const H = txtRow(c[h]), ix = (n: string) => H.indexOf(n), ga = ix('Gebietsart');
    const cols: [string, number][] = [['Wahlkreis', ix('Wahlkreisnummer')], ['Name', ix('Wahlkreisname')]];
    H.forEach((x, i) => { const l = vmLabel(x, BW_2026); if (l) cols.push([l, i]); });
    const row = (r: Cell[]) => cols.map(([x, i]) => (x === 'Wahlkreis' ? wkKey(r[i]) : x === 'Name' ? s(r[i]).replace(/^\d+\s*-\s*/, '') : numOf(r[i])));
    const rows = c.slice(h + 1).filter(r => s(r[ga]) === 'WAHLKREIS');
    const land = c.slice(h + 1).find(r => s(r[ga]) === 'LAND');
    const t = dropEmpty({ header: cols.map(x => x[0]), body: rows.map(row), notes: [] }, 2);
    const inc = rows.filter(r => s(r[ix('gemeldete Wahlbezirke')]) !== s(r[ix('Anzahl Wahlbezirke')])).length;
    t.notes.push(`${t.body.length} Wahlkreise mit Erst- und Zweitstimmen.` + (inc ? ` In ${inc} Wahlkreisen sind noch nicht alle Wahlbezirke gemeldet.` : ''));
    if (land) { const L = row(land), keep = cols.map(([x]) => x); checkLand(t, t.header.map(x => L[keep.indexOf(x)]), 2, l => /^Andere Kreiswahlvorschläge/.test(l)); }
    return t;
  },
};

// Schleswig-Holstein: Statistikamt Nord, ergebnis-download.csv (nur Wahlbezirke, Wahlkreis „01“ + Nummer; Namen laut Feldbezeichnungen 2022)
const SH_2022_D: Record<string, string> = { 1: 'CDU', 2: 'SPD', 3: 'GRÜNE', 4: 'FDP', 5: 'AfD', 6: 'DIE LINKE', 7: 'SSW', 9: 'FREIE WÄHLER', 10: 'Die PARTEI', 11: 'Z.', 12: 'dieBasis', 13: 'Die Humanisten', 16: 'Volt', 17: 'Bündnis C', 18: 'FAMILIE', 19: 'LKR', 20: 'Einzelbewerbung' };
const SH_2022_F: Record<string, string> = { 1: 'CDU', 2: 'SPD', 3: 'GRÜNE', 4: 'FDP', 5: 'AfD', 6: 'DIE LINKE', 7: 'SSW', 8: 'PIRATEN', 9: 'FREIE WÄHLER', 10: 'Die PARTEI', 11: 'Z.', 12: 'dieBasis', 13: 'Die Humanisten', 14: 'Gesundheitsforschung', 15: 'Tierschutzpartei', 16: 'Volt' };
const shPreset: LtwPreset = {
  id: 'ltw-sh', code: 'sh', label: 'Schleswig-Holstein · Landtagswahl nach Wahlkreisen',
  hint: 'Downloaddatei des Statistikamts Nord mit allen Wahl- und Briefwahlbezirken; Kartenwerk summiert sie zu den 35 Wahlkreisen. Direktstimmen erscheinen als Erst-, Listenstimmen als Zweitstimmen; die Parteinamen stammen aus den Feldbezeichnungen 2022.',
  find: c => findIn(c, r => r[0] === 'Wahlkreis' && r.includes('Erfassungsgebietsart') && r.includes('Listenstimmen gueltige (F)'), 5),
  meta: () => ({ year: 2022, title: 'Landtagswahl Schleswig-Holstein 2022', attribution: 'Statistisches Amt für Hamburg und Schleswig-Holstein' }),
  build: (c, h) => {
    const H = txtRow(c[h]);
    const lab = (x: string) => /Direktstimmen ungueltige/.test(x) ? 'Ungültige Stimmen · Erststimmen' : /Direktstimmen gueltige/.test(x) ? 'Gültige Stimmen · Erststimmen' : /Listenstimmen ungueltige/.test(x) ? 'Ungültige Stimmen · Zweitstimmen' : /Listenstimmen gueltige/.test(x) ? 'Gültige Stimmen · Zweitstimmen'
      : /^D\d+$/.test(x) ? vmLabel(x, SH_2022_F, SH_2022_D) : /^F\d+$/.test(x) ? vmLabel(x, SH_2022_F) : vmLabel(x, {});
    const cols = H.map((x, i) => [lab(x), i] as const).filter(([x]) => x);
    const acc = new Map<string, (number | null)[]>(); let n = 0;
    for (const r of c.slice(h + 1)) {
      const code = s(r[0]); if (!/^\d{4}$/.test(code)) continue; n++;
      const k = String(Number(code.slice(2)));
      const v = acc.get(k) || cols.map(() => null as number | null);
      cols.forEach(([, i], j) => { const x = numOf(r[i]); if (x != null) v[j] = (v[j] ?? 0) + x; });
      acc.set(k, v);
    }
    const body: Cell[][] = [...acc].sort((a, b) => +a[0] - +b[0]).map(([k, v]) => [k, ...v]);
    const t = dropEmpty({ header: ['Wahlkreis', ...cols.map(x => x[0])], body, notes: [] }, 1);
    t.notes.push(`${n} Wahl- und Briefwahlbezirke zu ${t.body.length} Wahlkreisen summiert.`);
    return t;
  },
};

// Sachsen-Anhalt: Statistisches Landesamt, Ergebnisse_LT_2026.xlsx, Blatt „Land RKR WKR“ (Satzart WKR, Wahllokal leer = Urne + Brief)
const stPreset: LtwPreset = {
  id: 'ltw-st', code: 'st', label: 'Sachsen-Anhalt · Landtagswahl nach Wahlkreisen',
  hint: 'Datei des Statistischen Landesamts (Blatt „Land RKR WKR“): übernommen werden die 41 Wahlkreise mit Urnen- und Briefwahl zusammen; die gewählte Person je Wahlkreis steht in der Spalte „Direktmandat“.',
  find: c => findIn(c, r => r.includes('Satzart') && r.includes('Schlüsselnummer') && r.includes('Wahllokal') && r.some(x => /^F\d+\./.test(x)) && r.some(x => /^D\d+\./.test(x)), 3),
  meta: c => {
    const r = c.find((x, i) => i > 0 && s(x[2]) === 'LAN');
    const d = r?.[1] as unknown;
    const y = d instanceof Date ? d.getFullYear() : typeof d === 'number' && d > 30000 ? new Date(Date.UTC(1899, 11, 30) + d * 864e5).getUTCFullYear() : Number(s((d ?? '') as Cell).match(/(20\d\d)/)?.[1]) || 2026;
    const art = r && s(r[0]) === 'E' ? ', endgültiges Ergebnis' : r && s(r[0]) === 'V' ? ', vorläufiges Ergebnis' : '';
    return { year: y, title: `Landtagswahl Sachsen-Anhalt ${y}${art}`, attribution: 'Statistisches Landesamt Sachsen-Anhalt' };
  },
  build: (c, h) => {
    const H = txtRow(c[h]), ix = (n: string) => H.indexOf(n);
    const lab = (x: string) => x === 'Schlüsselnummer' ? 'Wahlkreis' : x === 'Name' ? 'Name' : x === 'A.Wahlberechtigte' ? 'Wahlberechtigte' : x === 'B.Wähler' ? 'Wählende'
      : x === 'C.Ungültige.Erststimmen' ? 'Ungültige Stimmen · Erststimmen' : x === 'D.Gültige.Erststimmen' ? 'Gültige Stimmen · Erststimmen' : x === 'E.Ungültige.Zweitstimmen' ? 'Ungültige Stimmen · Zweitstimmen' : x === 'F.Gültige.Zweitstimmen' ? 'Gültige Stimmen · Zweitstimmen'
      : /^D\d+\.EB$/.test(x) ? 'Einzelbewerbung · Erststimmen' : /^D\d+\./.test(x) ? x.replace(/^D\d+\./, '') + ' · Erststimmen' : /^F\d+\./.test(x) ? x.replace(/^F\d+\./, '') + ' · Zweitstimmen' : x === 'Gewählt.im.Wahlkreis' ? 'Direktmandat' : '';
    const cols = H.map((x, i) => [lab(x), i] as const).filter(([x]) => x);
    const tot = (r: Cell[]) => s(r[ix('Wahllokal')]) === '';
    const row = (r: Cell[]) => cols.map(([x, i]) => (x === 'Wahlkreis' ? wkKey(r[i]) : x === 'Name' || x === 'Direktmandat' ? s(r[i]) : numOf(r[i])));
    const rows = c.slice(h + 1).filter(r => s(r[ix('Satzart')]) === 'WKR' && tot(r));
    const land = c.slice(h + 1).find(r => s(r[ix('Satzart')]) === 'LAN' && tot(r));
    const t = dropEmpty({ header: cols.map(x => x[0]), body: rows.map(row), notes: [] }, 2);
    t.notes.push(`${t.body.length} Wahlkreise (Urnen- und Briefwahl zusammen) mit Erst- und Zweitstimmen.`);
    if (land) { const L = row(land), keep = cols.map(([x]) => x); checkLand(t, t.header.map(x => L[keep.indexOf(x)]), 2, l => l === 'Direktmandat'); }
    return t;
  },
};

// Hessen: Hessisches Statistisches Landesamt, Wahlergebnisse_Landtagswahl.csv (Wahlpräsentation, alle Ebenen; Gebietstyp WK,
// Schlüssel „00100000000“ = Wahlkreis 1). Wahlkreisstimme = Erststimme, Landesstimme = Zweitstimme; Prozentspalten entfallen.
const hePreset: LtwPreset = {
  id: 'ltw-he', code: 'he', label: 'Hessen · Landtagswahl nach Wahlkreisen',
  hint: 'Downloaddatei der Wahlpräsentation des Hessischen Statistischen Landesamts (alle Ebenen). Übernommen werden die 55 Wahlkreise; Wahlkreisstimmen erscheinen als Erststimmen, Landesstimmen als Zweitstimmen. Die gewählte Person steht in der Spalte „Direktmandat“.',
  find: c => findIn(c, r => r.includes('Gebietsschlüssel') && r.includes('Gebietstyp') && r.includes('gültige Wahlkreisstimmen') && r.includes('gültige Landesstimmen'), 5),
  meta: (c, h) => {
    const t = s(c[0]?.[0]) + ' ' + txtRow(c[0]).join(' ');
    const y = (h > 0 ? t : '').match(/Landtagswahl (20\d\d)/)?.[1] || '2023';
    const st = t.match(/Stand:\s*(\d\d\.\d\d\.\d{4})/)?.[1];
    return { year: +y, title: `Landtagswahl Hessen ${y}${st ? ', Stand ' + st : ''}`, attribution: 'Hessisches Statistisches Landesamt' };
  },
  build: (c, h) => {
    const H = txtRow(c[h]), ix = (n: string) => H.indexOf(n);
    const lab = (x: string) => x === 'Gebietsbezeichnung' ? 'Name' : x === 'Wahlberechtigte' ? 'Wahlberechtigte' : x === 'Wählerinnen und Wähler' ? 'Wählende' : x === 'Wählerinnen und Wähler mit Wahlschein' ? 'Wählende mit Wahlschein' : x === 'Wahlbeteiligung' ? 'Wahlbeteiligung'
      : / \(%\)$/.test(x) ? '' : x === 'ungültige Wahlkreisstimmen' ? 'Ungültige Stimmen · Erststimmen' : x === 'gültige Wahlkreisstimmen' ? 'Gültige Stimmen · Erststimmen' : x === 'ungültige Landesstimmen' ? 'Ungültige Stimmen · Zweitstimmen' : x === 'gültige Landesstimmen' ? 'Gültige Stimmen · Zweitstimmen'
      : / Wahlkreisstimmen$/.test(x) ? x.replace(/ Wahlkreisstimmen$/, ' · Erststimmen') : / Landesstimmen$/.test(x) ? x.replace(/ Landesstimmen$/, ' · Zweitstimmen') : '';
    const cols: [string, number][] = [['Wahlkreis', ix('Gebietsschlüssel')], ...H.map((x, i) => [lab(x), i] as [string, number]).filter(([x]) => x)];
    const gt = ix('Gebietstyp'), gw = (r: Cell[]) => { const n = s(r[ix('Wahlkreis gewonnen: Name')]), v = s(r[ix('Wahlkreis gewonnen: Vorname')]), p = s(r[ix('Wahlkreis gewonnen: Wahlvorschlag')]); return n ? `${n}${v ? ', ' + v : ''}${p ? ` (${p})` : ''}` : ''; };
    const row = (r: Cell[]) => [...cols.map(([x, i]) => (x === 'Wahlkreis' ? String(Number(s(r[i]).slice(0, 3))) : x === 'Name' ? s(r[i]) : numOf(r[i]))), gw(r)];
    const rows = c.slice(h + 1).filter(r => s(r[gt]) === 'WK'), land = c.slice(h + 1).find(r => s(r[gt]) === 'LD');
    const header = [...cols.map(x => x[0]), 'Direktmandat'];
    const t = dropEmpty({ header, body: rows.map(row), notes: [] }, 2);
    t.notes.push(`${t.body.length} Wahlkreise; Wahlkreisstimmen als Erststimmen, Landesstimmen als Zweitstimmen übernommen.`);
    if (land) { const L = row(land); checkLand(t, t.header.map(x => L[header.indexOf(x)]), 2, l => isRateLabel(l) || l === 'Direktmandat'); }
    return t;
  },
};

// Bayern: Landesamt für Statistik, Stimmkreise und Wahlkreise (CSV, cp1252). Je Partei Erst-, Zweit- und Gesamtstimmen 2023 und 2018;
// Sitze werden nach Gesamtstimmen (Erst- + Zweitstimmen) verteilt. „X“ = nicht angetreten.
const byLabel = (x: string): string => {
  const t = x.trim();
  if (t === 'Stimmberechtigte') return 'Wahlberechtigte';
  if (t === 'Wähler') return 'Wählende';
  if (t === 'Wahlbeteiligung in %') return 'Wahlbeteiligung';
  let m = t.match(/^(gültige|ungültige) (Erst|Zweit|Gesamt)stimmen(?: insgesamt)? (20\d\d)$/);
  if (m) return `${m[1] === 'gültige' ? 'Gültige' : 'Ungültige'} Stimmen · ${m[2]}stimmen${m[3] === '2018' ? ' · Vorperiode' : ''}`;
  m = t.match(/^(Erst|Zweit|Gesamt)stimmen (.+) (20\d\d)$/);
  if (m) return `${m[2].replace(/ 2018$/, '')} · ${m[1]}stimmen${m[3] === '2018' ? ' · Vorperiode' : ''}`;
  return '';
};
function byBuild(c: Cell[][], h: number, keep: (k: string) => boolean, idLabel: string, what: string): LtwTable {
  const H = txtRow(c[h]), ix = (n: string) => H.indexOf(n);
  const cols: [string, number][] = [[idLabel, ix('Schlüsselnummer')], ['Name', ix('Name der Regionaleinheit')]];
  H.forEach((x, i) => { const l = byLabel(x); if (l) cols.push([l, i]); });
  const dm = ix('Bewerber mit Erststimmenmehrheit'), dp = ix('Partei mit Erststimmenmehrheit');
  const row = (r: Cell[]) => [...cols.map(([x, i]) => (x === idLabel ? s(r[i]) : x === 'Name' ? s(r[i]) : numOf(r[i]))), ...(dm >= 0 ? [s(r[dm]) ? `${s(r[dm])}${s(r[dp]) ? ` (${s(r[dp])})` : ''}` : ''] : [])];
  const header = [...cols.map(x => x[0]), ...(dm >= 0 ? ['Direktmandat'] : [])];
  const all = c.slice(h + 1).filter(r => /^\d{3}$/.test(s(r[0])));
  const t = dropEmpty({ header, body: all.filter(r => keep(s(r[0]))).map(row), notes: [] }, 2);
  t.notes.push(`${t.body.length} ${what} mit Erst-, Zweit- und Gesamtstimmen 2023; die Werte von 2018 stehen als „… · Vorperiode“ daneben.`);
  const land = all.find(r => s(r[0]) === '990');
  if (land) { const L = row(land); checkLand(t, t.header.map(x => L[header.indexOf(x)]), 2, l => isRateLabel(l) || l === 'Direktmandat'); }
  return t;
}
const byMeta = (c: Cell[][], h: number) => {
  const r = c[h + 1] || [], d = s(r[txtRow(c[h]).indexOf('Stand Tagesdatum')]);
  return { year: 2023, title: `Landtagswahl Bayern 2023${d ? ', Stand ' + d : ''}`, attribution: 'Bayerisches Landesamt für Statistik' };
};
const byPreset: LtwPreset = {
  id: 'ltw-by', code: 'by', label: 'Bayern · Landtagswahl nach Stimmkreisen',
  hint: 'Datei des Landesamts für Statistik mit den 91 Stimmkreisen: je Partei Erst-, Zweit- und Gesamtstimmen, dazu die Werte von 2018 als Vorperiode. In Bayern zählen für die Sitzverteilung die Gesamtstimmen; die Karte färbt deshalb zuerst nach ihnen. Die gewählte Person steht in der Spalte „Direktmandat“.',
  find: c => findIn(c, r => r[0] === 'Schlüsselnummer' && r.includes('Bewerber mit Erststimmenmehrheit') && r.some(x => /^\s*Gesamtstimmen .+ 2023$/.test(x)), 5),
  meta: byMeta,
  build: (c, h) => byBuild(c, h, k => +k < 900, 'Stimmkreis', 'Stimmkreise'),
};
const byWkrPreset: LtwPreset = {
  id: 'ltw-by-wkr', code: 'by', group: true, label: 'Bayern · Landtagswahl nach Wahlkreisen (Regierungsbezirken)',
  hint: 'Datei des Landesamts für Statistik mit den sieben Wahlkreisen (Oberbayern … Schwaben). Die kreisfreien Städte München, Nürnberg und Augsburg in derselben Datei bleiben außen vor; die Zeile „Bayern“ dient der Prüfung.',
  find: c => findIn(c, r => r[0] === 'Schlüsselnummer' && r.includes('Zahl der ausgewerteten Stimmkreise') && r.some(x => /^\s*Gesamtstimmen .+ 2023$/.test(x)), 5),
  meta: byMeta,
  build: (c, h) => byBuild(c, h, k => /^90[1-7]$/.test(k), 'Wahlkreis', 'Wahlkreise'),
};

// Hamburg: Statistikamt Nord, ergebnis-download-wahlkreis.csv (Wahlkreisstimmen) und ergebnis-download-land.csv (Landesstimmen),
// je Stimm- und Briefwahlbezirk; Kartenwerk summiert zu den 17 Wahlkreisen. Jede Person hat fünf Stimmen je Stimmzettel.
// D1… sind je Wahlkreis andere Wahlvorschläge (Feldbezeichner 2025), F1… die Landeslisten.
const HH_2025_F = ['SPD', 'CDU', 'FDP', 'GRÜNE', 'Volt', 'Die Linke', 'AfD', 'DieWahl - WFG', 'DAVA-Hamburg', 'FREIE WÄHLER', 'Die PARTEI', 'ÖDP', 'Tierschutzpartei', 'BÜNDNIS DEUTSCHLAND', 'BSW', 'NPD'];
const EB = 'Einzelbewerbung';
const HH_2025_D: Record<string, string[]> = {
  1: ['SPD', 'CDU', 'FDP', 'Volt', 'DieWahl - WFG', 'Die Linke', 'GRÜNE', 'AfD'],
  2: ['SPD', 'CDU', 'FDP', 'DieWahl - WFG', 'Die Linke', 'AfD', 'GRÜNE', 'Volt', 'DAVA-Hamburg', EB],
  3: ['SPD', 'GRÜNE', 'CDU', 'FDP', 'Volt', 'Die Linke', 'AfD', 'FREIE WÄHLER', 'DAVA-Hamburg', EB],
  4: ['SPD', 'CDU', 'FDP', 'GRÜNE', 'Die Linke', 'Volt', 'AfD'],
  5: ['SPD', 'GRÜNE', 'CDU', 'FDP', 'Volt', 'Die Linke', 'AfD'],
  6: ['SPD', 'GRÜNE', 'CDU', 'FDP', 'Volt', 'Die Linke', 'AfD'],
  7: ['SPD', 'GRÜNE', 'CDU', 'AfD', 'Volt', 'Die Linke', 'FDP'],
  8: ['SPD', 'CDU', 'FDP', 'Volt', 'GRÜNE', 'Die Linke', 'AfD', 'FREIE WÄHLER'],
  9: ['SPD', 'CDU', 'FDP', 'DieWahl - WFG', 'Die Linke', 'Volt', 'GRÜNE', 'AfD', 'DAVA-Hamburg', 'DIE KONSERVATIVEN'],
  10: ['SPD', 'CDU', 'FDP', 'Volt', 'GRÜNE', 'Die Linke', 'AfD'],
  11: ['SPD', 'CDU', 'AfD', 'FDP', 'GRÜNE', 'Die Linke', 'Volt'],
  12: ['SPD', 'CDU', 'FDP', 'GRÜNE', 'Die Linke', 'Volt', 'FREIE WÄHLER', 'DAVA-Hamburg'],
  13: ['SPD', 'CDU', 'AfD', 'FDP', 'GRÜNE', 'Volt', 'Die Linke'],
  14: ['SPD', 'CDU', 'FDP', 'AfD', 'GRÜNE', 'Die Linke', 'Volt'],
  15: ['SPD', 'CDU', 'FDP', 'DieWahl - WFG', 'Die Linke', 'AfD', 'Volt', 'GRÜNE', 'FREIE WÄHLER', 'DAVA-Hamburg', EB],
  16: ['SPD', 'CDU', 'Die Linke', 'FDP', 'Volt', 'GRÜNE', 'AfD'],
  17: ['SPD', 'CDU', 'Die Linke', 'FDP', 'Volt', 'GRÜNE'],
};
function hhBuild(c: Cell[][], h: number, land: boolean): LtwTable {
  const H = txtRow(c[h]), ix = (n: string) => H.findIndex(x => x.startsWith(n));
  const st = land ? 'Zweitstimmen' : 'Erststimmen', V = land ? 'F' : 'D';
  const fix: [string, number][] = [['Wahlberechtigte', ix('Wahlberechtigte gesamt')], ['Wählende', ix('Waehler gesamt')], [`Ungültige Stimmzettel · ${st}`, ix('Stimmzettel ungueltig')], [`Gültige Stimmen · ${st}`, ix(`Stimmen gueltige (${V})`)]];
  const pcols = H.map((x, i) => [x, i] as const).filter(([x]) => new RegExp(`^${V}\\d+$`).test(x)).map(([x, i]) => [Number(x.slice(1)), i] as const);
  const wkI = ix('Wahlkreis');
  const acc = new Map<string, { name: string; v: Map<string, number> }>(); let n = 0;
  const order: string[] = land ? [...HH_2025_F] : [...HH_2025_F, 'DIE KONSERVATIVEN', EB];
  for (const r of c.slice(h + 1)) {
    const m = s(r[wkI]).match(/^Wahlkreis (\d+)\s*-\s*(.+)$/); if (!m) continue; n++;
    const k = m[1]; let a = acc.get(k); if (!a) { a = { name: m[2], v: new Map() }; acc.set(k, a); }
    const add = (lab: string, x: number | null) => { if (x != null) a!.v.set(lab, (a!.v.get(lab) ?? 0) + x); };
    for (const [lab, i] of fix) add(lab, numOf(r[i]));
    for (const [nr, i] of pcols) {
      const p = land ? HH_2025_F[nr - 1] : HH_2025_D[k]?.[nr - 1];
      const lab = p || `Wahlvorschlag ${V}${nr}`; if (!order.includes(lab)) order.push(lab);
      add(`${lab} · ${st}`, numOf(r[i]));
    }
  }
  const header = ['Wahlkreis', 'Name', ...fix.map(x => x[0]), ...order.map(p => `${p} · ${st}`)];
  const body: Cell[][] = [...acc].sort((a, b) => +a[0] - +b[0]).map(([k, a]) => [k, a.name, ...header.slice(2).map(l => a.v.get(l) ?? null)]);
  const t = dropEmpty({ header, body, notes: [] }, 2);
  t.notes.push(`${n} Stimm- und Briefwahlbezirke zu ${t.body.length} Wahlkreisen summiert; ${land ? 'Landesstimmen als Zweitstimmen' : 'Wahlkreisstimmen als Erststimmen'} übernommen (je Person bis zu fünf Stimmen).`);
  return t;
}
const hhMeta = () => ({ year: 2025, title: 'Bürgerschaftswahl Hamburg 2025', attribution: 'Statistisches Amt für Hamburg und Schleswig-Holstein' });
const hhFind = (V: string) => (c: Cell[][]) => findIn(c, r => r[0] === 'Bezirk' && r[1] === 'Wahlkreis' && r.includes('Erfassungsgebietsart') && r.includes(`Stimmen gueltige (${V})`), 5);
const hhPreset: LtwPreset = {
  id: 'ltw-hh', code: 'hh', label: 'Hamburg · Bürgerschaftswahl, Wahlkreisstimmen',
  hint: 'Downloaddatei des Statistikamts Nord mit den Wahlkreisstimmen je Stimm- und Briefwahlbezirk; Kartenwerk summiert zu den 17 Wahlkreisen. Die Wahlvorschläge D1… sind in jedem Wahlkreis andere, die Namen stammen aus den Feldbezeichnern 2025. Wahlkreisstimmen erscheinen als Erststimmen.',
  find: hhFind('D'), meta: hhMeta, build: (c, h) => hhBuild(c, h, false),
};
const hhLandPreset: LtwPreset = {
  id: 'ltw-hh-land', code: 'hh', label: 'Hamburg · Bürgerschaftswahl, Landesstimmen',
  hint: 'Downloaddatei des Statistikamts Nord mit den Landesstimmen je Stimm- und Briefwahlbezirk; Kartenwerk summiert zu den 17 Wahlkreisen. Landesstimmen erscheinen als Zweitstimmen; die Parteinamen stammen aus den Feldbezeichnern 2025.',
  find: hhFind('F'), meta: hhMeta, build: (c, h) => hhBuild(c, h, true),
};

// Saarland: Landeswahlleiterin, KERG_SAARLAND.csv (Aufbau wie kerg.csv der Bundeswahlleiterin: Gemeinden, Wahlkreise 1–3, Land 10;
// je Partei „Endgültig“ und „Vorperiode“). Eine Stimme je Person.
const SL_SHORT: Record<string, string> = {
  'Christlich Demokratische Union Deutschlands': 'CDU', 'Sozialdemokratische Partei Deutschlands': 'SPD', 'Alternative für Deutschland': 'AfD', 'BÜNDNIS 90/DIE GRÜNEN': 'GRÜNE',
  'Freie Demokratische Partei': 'FDP', 'Familien-Partei Deutschlands': 'FAMILIE', 'Piratenpartei Deutschland': 'PIRATEN', 'Basisdemokratische Partei Deutschland': 'dieBasis',
  'bunt.saar sozial-ökologische liste': 'bunt.saar', 'Ökologisch-Demokratische Partei': 'ÖDP', 'Partei der Humanisten': 'PdH',
  'Partei für Arbeit, Rechtsstaat, Tierschutz, Elitenförderung und basisdemokratische Initiative': 'Die PARTEI', 'Partei für Gesundheitsforschung': 'Gesundheitsforschung',
  'PARTEI MENSCH UMWELT TIERSCHUTZ': 'Tierschutzpartei', 'SGV Solidarität, Gerechtigkeit, Veränderung': 'SGV', 'Volt Deutschland': 'Volt', 'Übrige': 'Sonstige',
};
const SL_FIX: Record<string, string> = { Wahlberechtigte: 'Wahlberechtigte', 'Wähler': 'Wählende', 'Ungültige Stimmen': 'Ungültige Stimmen', 'Gültige Stimmen': 'Gültige Stimmen' };
const slPreset: LtwPreset = {
  id: 'ltw-sl', code: 'sl', label: 'Saarland · Landtagswahl nach Wahlkreisen',
  hint: 'Datei der Landeswahlleiterin (Aufbau wie kerg.csv): übernommen werden die drei Wahlkreise, die Zeile „Saarland“ dient der Prüfung. Jede Person hat eine Stimme; die Werte der Vorperiode (2017) stehen als „… · Vorperiode“ daneben.',
  headerRows: 3,
  find: c => (findIn(c, r => /Landtagswahl/.test(r[0]), 3) >= 0 ? findIn(c, r => r[0] === 'Nr' && r[1] === 'Gebiet' && !!r[2]?.startsWith('gehört'), 10) : -1),
  meta: c => {
    const y = s(c[0]?.[0]).match(/(20\d\d)/)?.[1] || '2022', art = s(c[1]?.[0]).replace(/;+$/, '');
    return { year: +y, title: `Landtagswahl Saarland ${y}${art ? ', ' + art.replace(/^Amtliches /, 'amtliches ') : ''}`, attribution: 'Die Landeswahlleiterin des Saarlandes' };
  },
  build: (c, h) => {
    const names = txtRow(c[h]), per = txtRow(c[h + 2]);
    const cols: [string, number][] = [['Wahlkreis', 0], ['Name', 1]];
    let cur = '';
    names.forEach((x, i) => {
      if (i < 3) return;
      if (x) cur = x.replace(/\s+/g, ' ').trim();
      if (!cur || (per[i] !== 'Endgültig' && per[i] !== 'Vorperiode')) return;
      const prev = per[i] === 'Vorperiode' ? ' · Vorperiode' : '';
      cols.push([SL_FIX[cur] ? SL_FIX[cur] + prev : `${SL_SHORT[cur] || cur} · Stimmen${prev}`, i]);
    });
    const row = (r: Cell[]) => cols.map(([x, i]) => (x === 'Wahlkreis' ? s(r[i]) : x === 'Name' ? s(r[i]).replace(/^Wahlkreis\s+/, '') : numOf(r[i])));
    const data = c.slice(h + 3), wk = data.filter(r => /^[1-9]$/.test(s(r[0])) && /^Wahlkreis/.test(s(r[1]))), land = data.find(r => s(r[1]) === 'Saarland');
    const t = dropEmpty({ header: cols.map(x => x[0]), body: wk.map(row), notes: [] }, 2);
    t.notes.push(`${t.body.length} Wahlkreise; die Gemeinden in derselben Datei bleiben außen vor.`);
    if (land) { const L = row(land), keep = cols.map(([x]) => x); checkLand(t, t.header.map(x => L[keep.indexOf(x)]), 2); }
    return t;
  },
};

// Bremen: Statistisches Landesamt, Ergebnis nach Wahlbereichen (von den Ergebnisseiten übertragen, #-Zeilen = Vorspann).
// Fünf Stimmen je Person; Stimmen = Listen- und Personenstimmen zusammen.
const hbPreset: LtwPreset = {
  id: 'ltw-hb', code: 'hb', label: 'Bremen · Bürgerschaftswahl nach Wahlbereichen',
  hint: 'Ergebnis der beiden Wahlbereiche Bremen und Bremerhaven (Listen- und Personenstimmen zusammen, bis zu fünf Stimmen je Person). Zugeordnet wird über den Gemeindeschlüssel.',
  find: c => findIn(c, r => r[0] === 'AGS' && r[1] === 'Wahlbereich' && r.includes('Gültige Stimmen'), 10),
  meta: c => {
    const pre = c.map(r => s(r[0])).filter(x => x.startsWith('#')).map(x => x.replace(/^#\s*/, ''));
    const y = (pre.find(x => /Bürgerschaftswahl/.test(x)) || '').match(/(20\d\d)/)?.[1] || '2023';
    return { year: +y, title: `Bürgerschaftswahl Bremen ${y}${pre.some(x => /endgültig/.test(x)) ? ', endgültiges Ergebnis' : ''}`, attribution: copyOf(pre, 'Statistisches Landesamt Bremen') };
  },
  build: (c, h) => {
    const H = txtRow(c[h]), key: Record<string, string> = { '04011000': '1', '04012000': '2' };
    const FIX: Record<string, string> = { Wahlberechtigte: 'Wahlberechtigte', 'Wählende': 'Wählende', 'Ungültige Stimmzettel': 'Ungültige Stimmzettel', 'Gültige Stimmen': 'Gültige Stimmen' };
    const cols: [string, number][] = [['Wahlbereich', 0], ['Name', 1], ...H.map((x, i) => [i < 2 || !x ? '' : FIX[x] || `${x} · Stimmen`, i] as [string, number]).filter(([x]) => x)];
    const k8 = (v: Cell) => key[s(v).padStart(8, '0')];
    const rows = c.slice(h + 1).filter(r => k8(r[0]));
    const body = rows.map(r => cols.map(([x, i]) => (x === 'Wahlbereich' ? k8(r[i]) : x === 'Name' ? s(r[i]) : numOf(r[i]))));
    const t = dropEmpty({ header: cols.map(x => x[0]), body, notes: [] }, 2);
    t.notes.push(`${t.body.length} Wahlbereiche (Bremen und Bremerhaven) mit Listen- und Personenstimmen zusammen.`);
    return t;
  },
};

// Brandenburg: Landeswahlleiter / Amt für Statistik Berlin-Brandenburg, DL_BB_2_LT2024.xlsx (Blätter A_1 Erststimme, A_2 Zweitstimme;
// zwei Kopfzeilen, je Wahlvorschlag „Anzahl“ und „%“; Schlüssel LI01 … LI44 = Wahlkreise, GI9900 = Land)
const bbFind = (c: Cell[][]) => findIn(c, r => r[0] === 'Stimmart' && /^Gebietsschlüssel/.test(r[1] || '') && r.includes('Wahlbezirke'), 5);
function bbSheet(c: Cell[][]) {
  const h = bbFind(c); if (h < 0) return null;
  const H = txtRow(c[h]), U = txtRow(c[h + 1]);
  const stimme = s(c.slice(h + 2).find(r => s(r?.[0]))?.[0] ?? null) === 'Zweitstimme' ? 'Zweitstimmen' : 'Erststimmen';
  const cols: [string, number][] = [];
  let last = '';
  H.forEach((x, i) => {
    const n = x.replace(/\s+/g, ' ').trim(); if (n) last = n;
    if (U[i] !== 'Anzahl') return;
    if (/^Wahlberechtigte insgesamt$/.test(n)) cols.push(['Wahlberechtigte', i]);
    else if (n === 'Wählende') cols.push(['Wählende', i]);
    else if (n === 'Briefwählende') cols.push(['Wählende mit Wahlschein', i]);
    else if (n === 'Gültige Stimmen') cols.push([`Gültige Stimmen · ${stimme}`, i]);
    else if (n === 'Ungültige Stimmen') cols.push([`Ungültige Stimmen · ${stimme}`, i]);
    else if (i >= 20 && last) cols.push([`${last.replace(/^EB (.+)$/, 'Einzelbewerbung $1')} · ${stimme}`, i]);
  });
  const rows = new Map<string, Cell[]>();
  for (const r of c.slice(h + 2)) { const k = s(r?.[1]); if (/^LI\d+$/.test(k) || k === 'GI9900') rows.set(k, r); }
  return { stimme, cols, rows };
}
const bbPreset: LtwPreset = {
  id: 'ltw-bb', code: 'bb', label: 'Brandenburg · Landtagswahl nach Wahlkreisen',
  hint: 'Datei des Landeswahlleiters (DL_BB_2_LT2024.xlsx): Erst- und Zweitstimmen stehen auf zwei Blättern, Kartenwerk führt sie zusammen. Übernommen werden die 44 Wahlkreise; die Zeile „Brandenburg“ dient der Prüfung. Die Wahlkreise in Brandenburg an der Havel, Cottbus und Potsdam sind in der Karte genähert.',
  headerRows: 2,
  find: bbFind,
  meta: () => ({ year: 2024, title: 'Landtagswahl Brandenburg 2024, endgültiges Ergebnis', attribution: 'Der Landeswahlleiter Brandenburg, Amt für Statistik Berlin-Brandenburg' }),
  build: (c, _h, sheets) => {
    const parts = (sheets && sheets.length ? sheets : [c]).map(bbSheet).filter((x): x is NonNullable<ReturnType<typeof bbSheet>> => !!x);
    parts.sort((a, b) => (a.stimme === 'Erststimmen' ? -1 : 1) - (b.stimme === 'Erststimmen' ? -1 : 1));
    const seen = new Set<string>(), cols: { label: string; part: number; i: number }[] = [];
    parts.forEach((p, k) => p.cols.forEach(([l, i]) => { if (!seen.has(l)) { seen.add(l); cols.push({ label: l, part: k, i }); } }));
    const keys = [...parts[0].rows.keys()].filter(k => k.startsWith('LI')).sort();
    const row = (k: string) => cols.map(x => numOf(parts[x.part].rows.get(k)?.[x.i] ?? null));
    const header = ['Wahlkreis', 'Name', ...cols.map(x => x.label)];
    const t = dropEmpty({ header, body: keys.map(k => [String(Number(k.slice(2))), s(parts[0].rows.get(k)![3]), ...row(k)]), notes: [] }, 2);
    t.notes.push(`${t.body.length} Wahlkreise; ${parts.map(p => p.stimme).join(' und ')} aus ${parts.length} Tabellenblättern zusammengeführt.`);
    if (parts[0].rows.get('GI9900')) { const L = ['', '', ...row('GI9900')]; checkLand(t, t.header.map(x => L[header.indexOf(x)]), 2); }
    return t;
  },
};

// Sachsen: Statistisches Landesamt, statistik-sachsen_LW24_endgErgebniss.xlsx, Blatt „LW24_endgErgebnisse_SN&WK“
// (Ebene SN = Land, WK = Wahlkreis; „_1“ = Direktstimme, „_2“ = Listenstimme; „x“ = nicht angetreten)
const snPreset: LtwPreset = {
  id: 'ltw-sn', code: 'sn', label: 'Sachsen · Landtagswahl nach Wahlkreisen',
  hint: 'Datei des Statistischen Landesamts (Blatt „SN&WK“): übernommen werden die 60 Wahlkreise, die Zeile „Freistaat Sachsen“ dient der Prüfung. Direktstimmen erscheinen als Erststimmen, Listenstimmen als Zweitstimmen.',
  find: c => findIn(c, r => r[0] === 'Wahl' && r[1] === 'Ebene' && r[2] === 'WK-Nr' && r.includes('gültige_1') && r.includes('gültige_2'), 5),
  meta: c => { const y = s(c.find(r => /^LW\d\d$/.test(s(r[0])))?.[0] ?? null).slice(2); const yr = y ? 2000 + Number(y) : 2024; return { year: yr, title: `Landtagswahl Sachsen ${yr}, endgültiges Ergebnis`, attribution: 'Statistisches Landesamt des Freistaates Sachsen' }; },
  build: (c, h) => {
    const H = txtRow(c[h]);
    const lab = (x: string) => x === 'WK-Nr' ? 'Wahlkreis' : x === 'WK-Name' ? 'Name' : x === 'Wahlberechtigte' ? 'Wahlberechtigte' : x === 'Wähler' ? 'Wählende' : x === 'darunter Briefwähler' ? 'Wählende mit Wahlschein'
      : /^ungültige_[12]$/.test(x) ? `Ungültige Stimmen · ${x.endsWith('1') ? 'Erststimmen' : 'Zweitstimmen'}` : /^gültige_[12]$/.test(x) ? `Gültige Stimmen · ${x.endsWith('1') ? 'Erststimmen' : 'Zweitstimmen'}`
      : /_1$/.test(x) ? x.replace(/_1$/, ' · Erststimmen') : /_2$/.test(x) ? x.replace(/_2$/, ' · Zweitstimmen') : '';
    const cols = H.map((x, i) => [lab(x), i] as const).filter(([x]) => x);
    const row = (r: Cell[]) => cols.map(([x, i]) => (x === 'Wahlkreis' ? wkKey(r[i]) : x === 'Name' ? s(r[i]) : numOf(r[i])));
    const ix = H.indexOf('Ebene');
    const rows = c.slice(h + 1).filter(r => s(r[ix]) === 'WK'), land = c.slice(h + 1).find(r => s(r[ix]) === 'SN');
    const t = dropEmpty({ header: cols.map(x => x[0]), body: rows.map(row), notes: [] }, 2);
    t.notes.push(`${t.body.length} Wahlkreise; Direktstimmen als Erststimmen, Listenstimmen als Zweitstimmen übernommen.`);
    if (land) { const L = row(land), keep = cols.map(([x]) => x); checkLand(t, t.header.map(x => L[keep.indexOf(x)]), 2); }
    return t;
  },
};

// Thüringen: Landeswahlleiter, LWINFO2024.xlsx („Excel-Download – Wahlkreisübersicht“; vier Kopfzeilen: Spalte, Stimme, Partei, absolut/%;
// Satzart L = Land, K = Wahlkreis). Wahlkreisstimme = Erststimme, Landesstimme = Zweitstimme.
const thPreset: LtwPreset = {
  id: 'ltw-th', code: 'th', label: 'Thüringen · Landtagswahl nach Wahlkreisen',
  hint: 'Wahlkreisübersicht des Landeswahlleiters: je Wahlkreis eine Zeile, Wahlkreisstimmen erscheinen als Erststimmen, Landesstimmen als Zweitstimmen. Die Zeile „Land Thüringen“ dient der Prüfung.',
  headerRows: 4,
  find: c => { const h = findIn(c, r => r[0] === 'Stand' && r[1] === 'Satzart' && r.includes('Name'), 10); return h >= 0 && txtRow(c[h + 1]).includes('Wahlkreisstimmen') ? h : -1; },
  meta: c => {
    const t = s(c[0]?.[0]), st = s(c[1]?.[0]);
    const y = t.match(/(20\d\d)/)?.[1] || '2024';
    return { year: +y, title: `Landtagswahl Thüringen ${y}${/endgültig/.test(st) ? ', endgültiges Ergebnis' : /vorläufig/.test(st) ? ', vorläufiges Ergebnis' : ''}`, attribution: 'Der Landeswahlleiter Thüringen' };
  },
  build: (c, h) => {
    const S = txtRow(c[h + 1]), P = txtRow(c[h + 3 - 1]), U = txtRow(c[h + 3]);
    const cols: [string, number][] = [['Wahlkreis', 2], ['Name', 3], ['Wahlberechtigte', 6], ['Wählende', 10], ['Wählende mit Wahlschein', 11],
      ['Ungültige Stimmen · Erststimmen', 13], ['Gültige Stimmen · Erststimmen', 14], ['Ungültige Stimmen · Zweitstimmen', 15], ['Gültige Stimmen · Zweitstimmen', 16]];
    U.forEach((u, i) => { if (u === 'absolut' && P[i] && i > 16) cols.push([`${P[i].replace(/\s*\.\.$/, '').replace('Einzelbewerber', 'Einzelbewerbung')} · ${S[i] === 'Landesstimmen' ? 'Zweitstimmen' : 'Erststimmen'}`, i]); });
    const row = (r: Cell[]) => cols.map(([x, i]) => (x === 'Wahlkreis' ? wkKey(r[i]) : x === 'Name' ? s(r[i]) : numOf(r[i])));
    const rows = c.slice(h + 4).filter(r => s(r[1]) === 'K'), land = c.slice(h + 4).find(r => s(r[1]) === 'L');
    const t = dropEmpty({ header: cols.map(x => x[0]), body: rows.map(row), notes: [] }, 2);
    t.notes.push(`${t.body.length} Wahlkreise; Wahlkreisstimmen als Erststimmen, Landesstimmen als Zweitstimmen übernommen.`);
    if (land) { const L = row(land); checkLand(t, t.header.map(x => L[cols.map(y => y[0]).indexOf(x)]), 2); }
    return t;
  },
};

export const LTW_PRESETS: LtwPreset[] = [mvPreset, niPreset, nwPreset, rpPreset, bwPreset, shPreset, stPreset, hePreset, byPreset, byWkrPreset, hhPreset, hhLandPreset, slPreset, hbPreset, bbPreset, snPreset, thPreset];
export const ltwPreset = (id: string) => LTW_PRESETS.find(p => p.id === id) || null;
/** Gebietsstand zur Vorlage: gleiches Land, passendes Jahr, sonst das neueste */
export function ltwGeoFor(p: LtwPreset, year?: number): string {
  const c = LTW.filter(e => e.code === p.code).sort((a, b) => b.year - a.year);
  const e = c.find(e => e.year === year) || c[0];
  return p.group && e.group ? ltwGroupId(e) : ltwSetId(e);
}
