// Landtagswahlen: Katalog der eingebauten Landtagswahlkreise und Import-Vorlagen für die Ergebnisdateien der Landeswahlleitungen.
// Je Land und Wahljahr ein Gebietsstand `ltw-<land>-<jahr>` (Ebene `ltw-<land>`), gebaut mit `npm run ltw` aus data-src/ltw/<land>-<jahr>.
// Berlin hat eine eigene, feinere Aufbereitung (berlin.ts, Wahlbezirke bis Bezirke).
import type { Cell } from './types';

export interface LtwEntry {
  bl: string; code: string; year: number; land: string;
  election: string;                  // „Landtagswahl Mecklenburg-Vorpommern 2026“
  count: number;                     // erwartete Zahl der Wahlkreise (Prüfung beim Bau)
  geo: {
    file: string; idField: string; nameField: string;
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
      attribution: '© Landesamt für Statistik Niedersachsen (LSN), Landtagswahlkreise 2022 (Gebietsstand 01.11.2021)',
      source: 'https://www.statistik.niedersachsen.de/themen/Landtagswahlen-niedersachsen/landtagswahlen-in-niedersachsen-tabellen-und-wahlkreiskarten-227429.html',
      license: 'eigene Nutzungshinweise des LSN (PDF, noch nicht vorliegend)',
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
];
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
  build: (cells: Cell[][], h: number) => LtwTable;
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

export const LTW_PRESETS: LtwPreset[] = [mvPreset, niPreset, nwPreset, rpPreset];
export const ltwPreset = (id: string) => LTW_PRESETS.find(p => p.id === id) || null;
/** Gebietsstand zur Vorlage: gleiches Land, passendes Jahr, sonst das neueste */
export function ltwGeoFor(p: LtwPreset, year?: number): string {
  const c = LTW.filter(e => e.code === p.code).sort((a, b) => b.year - a.year);
  return ltwSetId(c.find(e => e.year === year) || c[0]);
}
