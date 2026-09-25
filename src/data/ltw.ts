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
];
export const ltwSetId = (e: Pick<LtwEntry, 'code' | 'year'>) => `ltw-${e.code}-${e.year}`;
export const ltwLevel = (e: Pick<LtwEntry, 'code'>) => `ltw-${e.code}`;
export const isLtwLevel = (level: string) => level.startsWith('ltw-');

// ---------- Mecklenburg-Vorpommern: Landeswahlleiter, Ergebnis der Wahlkreise (l_wahlkreise.csv) ----------
// Vorspann (Titel, Stand, Hinweise, Urheber), dann je Wahlkreis vier Zeilen: Ausgabe A (Anzahl) / P (Prozent) × Stimme 1 / 2.
// Wahlkreis 99 = Land. „x“ = Wahlvorschlag nicht zugelassen bzw. nicht angetreten.
const s = (v: Cell) => String(v ?? '').trim();
export const isMvLtw = (h: string[]) => h.includes('Ausgabe') && h.includes('Erst-/Zweitstimme') && h.includes('Wahlkreisname/Land') && h.includes('Wahlkreis');
const numOf = (v: Cell): number | null => {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const t = s(v); if (!t || /^[x.…/-]$/i.test(t)) return null;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
};
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
