// Berlin: Ergebnisse der Abgeordnetenhauswahl aus den Datenexporten des Amts für Statistik Berlin-Brandenburg
//   Datenexport_AGH2026_{Erst,Zweit}stimme_W_BE.csv – je Urnenwahlbezirk (W) und Briefwahlbezirk (B)
//   Datenexport_AGH2026_{Erst,Zweit}stimme_A_BE.csv – je Wahlkreis, Bezirk, Bundestagswahlkreis, Ost/West, Land
// Parteien stehen als P01 … P120; die Namen stehen in der Beschreibung (DSB_…csv) und sind hier für 2026 hinterlegt.
// Briefwahl: Ein Briefwahlbezirk umfasst mehrere Urnenwahlbezirke. Wie bei der Bundestagswahl zwei Wege:
//   anteilig  – Briefwahlstimmen nach Wahlberechtigten mit Wahlschein auf die Urnenwahlbezirke verteilt (geschätzt)
//   gemeinsam – Ergebnis je Briefwahlbezirk (Urne + Brief), Karte der Briefwahlbezirke
import type { Cell } from './types';

// Parteien und Einzelbewerbungen der Wahl 2026 (aus DSB_Datenexport_AGH2026_*_W_BE.csv)
export const BE_PARTIES_2026: Record<string, string> = {
  P01: 'CDU', P02: 'SPD', P03: 'GRÜNE', P04: 'Die Linke', P05: 'AfD', P06: 'FDP', P07: 'Tierschutzpartei', P08: 'Die PARTEI', P09: 'Volt',
  P11: 'Mieterpartei', P12: 'Die Urbane', P13: 'DKP', P14: 'ÖDP', P15: 'Die Heimat', P16: 'bergpartei', P17: 'SGP', P24: 'BSW', P26: 'MERA25', P27: 'PdF',
  P29: 'Demokratische Linke', P30: 'Die Frauen',
  P31: 'Einzelbewerbung Fleischmann', P32: 'Einzelbewerbung Gerken', P33: 'Einzelbewerbung Kanzler', P34: 'Einzelbewerbung Lindlmair', P35: 'Einzelbewerbung Mansamba',
  P36: 'Einzelbewerbung Mihm', P37: 'Einzelbewerbung Ngwa', P38: 'Einzelbewerbung Schnitzer', P39: 'Einzelbewerbung Snelinski', P40: 'Einzelbewerbung Trockle', P41: 'Einzelbewerbung Worbs',
};
export const isBeWbz = (h: string[]) => h.includes('Adresse') && h.includes('WBezArt') && h.includes('Briefwahlbezirk') && h.includes('AghWkr');
export const isBeGebiete = (h: string[]) => h.includes('Adresse') && h.includes('Gebietsart') && h.includes('Gebietsname') && h.includes('AnzWbez');
// Gebietsart in der Datei, Bezeichnung, Gebietsstand, „nach …“
export const BE_EBENEN: [string, string, string, string][] = [
  ['Abgeordnetenhauswahlkreis', 'Wahlkreise', 'be-wk-2026', 'Wahlkreisen'], ['Bezirk', 'Bezirke', 'be-bez-2026', 'Bezirken'], ['Bundestagswahlkreis', 'Bundestagswahlkreise', 'btw-wk-2025', 'Bundestagswahlkreisen'],
];
const num = (v: Cell) => (typeof v === 'number' ? v : v == null || v === '' ? 0 : Number(String(v).replace(/\./g, '').replace(',', '.')) || 0);
const s = (v: Cell) => String(v ?? '').trim();
/** Datum des Ergebnisabzugs „26.09.20“ (JJ.MM.TT) → „20.09.2026“ */
export const beDatum = (v: Cell) => { const m = s(v).match(/^(\d\d)\.(\d\d)\.(\d\d)$/); return m ? `${m[3]}.${m[2]}.20${m[1]}` : ''; };
export const beStimme = (v: Cell) => (s(v) === '1' ? 'Erststimmen' : 'Zweitstimmen');

/** Kopf und Zeilen des Wahlbezirks-Exports zusammenfassen: je Urnenwahlbezirk (anteilig) oder je Briefwahlbezirk (gemeinsam) */
export function aggregateBeWbz(cells: Cell[][], h: number, mode: 'anteilig' | 'gemeinsam') {
  const H = (cells[h] || []).map(s), ix = (n: string) => H.indexOf(n);
  const I = { adr: ix('Adresse'), st: ix('StimmArt'), bez: ix('Bezirk'), bezN: ix('Bezirksname'), art: ix('WBezArt'), wbz: ix('Wahlbezirk'), bwb: ix('Briefwahlbezirk'), wk: ix('AghWkr'), wb: ix('WberIns'), a2: ix('WberA2'), wae: ix('Waehler'), gue: ix('Gueltig'), ung: ix('Unguelt'), aufn: ix('aufn'), dat: ix('Datum') };
  const rows = cells.slice(h + 1).filter(r => r && r.length > 10 && s(r[I.adr]));
  // Parteispalten: P01 … mit Stimmen
  const pcols = H.map((c, i) => [c, i] as const).filter(([c]) => /^P\d+$/.test(c));
  const used = pcols.filter(([, i]) => rows.some(r => num(r[i]) > 0));
  const stimme = beStimme(rows[0]?.[I.st] ?? 2);
  const pLabel = (c: string) => `${BE_PARTIES_2026[c] || 'Wahlvorschlag ' + c} · ${stimme}`;
  const counts = [I.wae, I.gue, I.ung, ...used.map(([, i]) => i)];
  const header = [mode === 'anteilig' ? 'Wahlbezirk' : 'Briefwahlbezirk', 'Name', 'Bezirk', 'Wahlkreis', 'Briefwahl', 'Wahlberechtigte', 'Wählende', 'Wahlbeteiligung', `Gültige Stimmen · ${stimme}`, `Ungültige Stimmen · ${stimme}`, ...used.map(([c]) => pLabel(c))];
  const W = rows.filter(r => s(r[I.art]) === 'W'), B = rows.filter(r => s(r[I.art]) === 'B');
  const uwbId = (r: Cell[]) => s(r[I.bez]).padStart(2, '0') + s(r[I.wbz]).padStart(3, '0');
  const notes: string[] = [];
  const joint: Record<string, string> = {};
  const body: Cell[][] = [];
  const r1 = (v: number) => Math.round(v * 10) / 10;
  if (mode === 'anteilig') {
    const members = new Map<string, Cell[][]>();
    for (const r of W) { const k = s(r[I.bwb]); const L = members.get(k); if (L) L.push(r); else members.set(k, [r]); }
    const share = new Map<Cell[], Float64Array>();
    let orphan = 0;
    for (const b of B) {
      const ms = members.get(s(b[I.bwb])); if (!ms || !ms.length) { orphan++; continue; }
      let wsum = ms.reduce((t, r) => t + num(r[I.a2]), 0); const useAll = wsum <= 0; if (useAll) wsum = ms.reduce((t, r) => t + num(r[I.wb]), 0) || ms.length;
      for (const r of ms) {
        const w = (useAll ? num(r[I.wb]) || 1 : num(r[I.a2])) / wsum;
        const acc = share.get(r) || new Float64Array(counts.length);
        counts.forEach((c, k) => { acc[k] += num(b[c]) * w; });
        share.set(r, acc);
      }
    }
    for (const r of W) {
      const add = share.get(r), v = counts.map((c, k) => num(r[c]) + (add ? add[k] : 0));
      const wb = num(r[I.wb]);
      body.push([uwbId(r), `${s(r[I.bezN])} ${s(r[I.wbz])}`, s(r[I.bezN]), s(r[I.bez]).padStart(2, '0') + s(r[I.wk]).padStart(2, '0'), 'anteilig geschätzt', wb, r1(v[0]), wb ? r1(100 * v[0] / wb) : null, ...v.slice(1).map(r1)]);
    }
    if (orphan) notes.push(`${orphan} Briefwahlbezirke ohne zugehörigen Urnenwahlbezirk wurden übergangen.`);
    notes.push(`Briefwahl anteilig verteilt: ${B.length} Briefwahlbezirke auf ${W.length} Urnenwahlbezirke, nach Wahlberechtigten mit Wahlschein (geschätzt).`);
    // § 53 Abs. 2 LWO: Ergebnis eines Wahlbezirks im aufnehmenden Wahlbezirk enthalten → eine Fläche
    if (I.aufn >= 0) for (const r of W) {
      const a = s(r[I.aufn]); if (!a) continue;
      const m = a.match(/^(\d\d)W(\d+)$/); if (!m) continue;
      const host = m[1] + m[2].padStart(3, '0'); joint[uwbId(r)] = host; joint[host] = host;
    }
    if (Object.keys(joint).length) notes.push(`${Object.keys(joint).length} Wahlbezirke wurden gemeinsam ausgezählt (§ 53 Abs. 2 LWO) und erscheinen als eine Fläche.`);
  } else {
    const acc = new Map<string, { v: Float64Array; wb: number; row: Cell[] }>();
    for (const r of [...W, ...B]) {
      const k = s(r[I.bwb]); let x = acc.get(k);
      if (!x) { x = { v: new Float64Array(counts.length), wb: 0, row: r }; acc.set(k, x); }
      counts.forEach((c, j) => { x!.v[j] += num(r[c]); });
      if (s(r[I.art]) === 'W') x.wb += num(r[I.wb]);
    }
    for (const [k, x] of [...acc].sort((a, b) => a[0].localeCompare(b[0]))) {
      const r = x.row;
      body.push([k, `${s(r[I.bezN])} Briefwahlbezirk ${k.slice(2)}`, s(r[I.bezN]), s(r[I.bez]).padStart(2, '0') + s(r[I.wk]).padStart(2, '0'), 'gemeinsam', x.wb, x.v[0], x.wb ? r1(100 * x.v[0] / x.wb) : null, ...Array.from(x.v.slice(1))]);
    }
    notes.push(`Urnen- und Briefwahl je Briefwahlbezirk zusammengefasst: ${acc.size} Briefwahlbezirke aus ${W.length} Urnenwahlbezirken.`);
  }
  return { header, body, notes, joint, stimme, datum: beDatum(rows[0]?.[I.dat] ?? '') };
}
