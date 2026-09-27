// Regionaldatenbank Deutschland (GENESIS): Flat-File-CSV, Daten-CSV und Excel einer Tabelle einlesen.
// Ergebnis ist eine neutrale Form: Perioden × Gebiete (je Ebene) × Spalten (Ausprägungen der übrigen Merkmale).
import type { Cell } from './types';
import { classify } from './parse';
import { partyOf } from './parties';

export type GLevel = 'de' | 'lan' | 'rbz' | 'krs' | 'gem' | 'vwg';
export interface GenesisArea { key: string; name: string; vals: Map<string, Cell[]> }   // Periode → Werte je Spalte
export interface GenesisParsed {
  format: 'ffcsv' | 'dcsv';
  code: string;                 // Tabellennummer (12411-01-01-4) bzw. Statistik (12411), wenn nur die bekannt ist
  title: string;                // „Bevölkerung nach Geschlecht“
  statLabel: string;            // „Fortschreibung des Bevölkerungsstandes“
  stand: string;                // „26.09.2026“
  copyright: string;            // „Statistische Ämter des Bundes und der Länder, Deutschland, 2026“
  timeLabel: string;            // „Stichtag“ oder „Jahr“
  periods: string[];            // aufsteigend
  columns: string[];            // Spaltenbezeichnungen
  colMeasure: string[];         // Merkmal (Wert) je Spalte, z. B. „Gültige Zweitstimmen“
  colParty: (string | null)[];  // Partei je Spalte (Wahltabellen)
  colTotal: boolean[];          // Spalte ist die Summe ihres Merkmals (keine weitere Ausprägung)
  levels: Partial<Record<GLevel, Map<string, GenesisArea>>>;
  notes: string[];
}

/** Tabellentitel bekannter Tabellen (die Flat-File-CSV nennt nur die Statistik) */
export const TABLE_TITLES: Record<string, string> = {
  '12411-01-01-4': 'Bevölkerung nach Geschlecht',
  '12411-02-03-4': 'Bevölkerung nach Geschlecht und Altersgruppen',
  '12411-03-03-4': 'Bevölkerung nach Nationalität und Altersgruppen',
  '13211-02-05-4': 'Arbeitslose und Arbeitslosenquoten',
  '14111-01-04-4': 'Bundestagswahlen',
  '82000-01-01-4': 'Bruttoinlandsprodukt',
  '82000-07-01-4': 'Verfügbares Einkommen der privaten Haushalte',
  '33111-01-02-4': 'Bodenfläche nach Art der tatsächlichen Nutzung',
};
const txt = (v: Cell) => (v == null ? '' : String(v)).trim();
const CODE = /(\d{5}-\d{2}-\d{2}-\d|\d{5}-[A-Z0-9]{1,4}(-[A-Z0-9]{1,4})*)/;
const DATE = /^(\d\d)\.(\d\d)\.(\d{4})$/, ISO = /^\d{4}-\d\d-\d\d$/, YEAR = /^(19|20)\d\d$/;
const isPeriod = (s: string) => DATE.test(s) || ISO.test(s) || YEAR.test(s);
/** „31.12.2025“ → „2025-12-31“, „2025“ bleibt */
export const normPeriod = (s: string) => { const m = DATE.exec(s.trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : s.trim(); };
/** Ebene aus der Form des Schlüssels */
export function levelOfKey(k: string): GLevel | null {
  if (/^(DG|D|DINSG)$/i.test(k)) return 'de';
  if (!/^\d+$/.test(k)) return null;
  return k.length === 2 ? 'lan' : k.length === 3 ? 'rbz' : k.length === 5 ? 'krs' : k.length === 8 ? 'gem' : k.length === 9 ? 'vwg' : null;
}

// ---------- Erkennen ----------
export const isGenesisFlat = (cells: Cell[][]) => { const h = (cells[0] || []).map(txt); return h.includes('statistics_code') && h.includes('time') && h.includes('value'); };
export const isGenesisTable = (cells: Cell[][]) => cells.slice(0, 3).some(r => /^(Tabelle:\s*)?\d{5}-\d{2}-\d{2}-\d\b/.test(txt(r[0])));
export const isGenesis = (cells: Cell[][]) => isGenesisFlat(cells) || isGenesisTable(cells);

const cache = new WeakMap<Cell[][], GenesisParsed>();
export function parseGenesis(cells: Cell[][], fileName = ''): GenesisParsed {
  const hit = cache.get(cells); if (hit) return hit;
  const g = isGenesisFlat(cells) ? parseFlat(cells, fileName) : parseTable(cells);
  cache.set(cells, g);
  return g;
}
const base = (format: GenesisParsed['format']): GenesisParsed => ({ format, code: '', title: '', statLabel: '', stand: '', copyright: '', timeLabel: 'Jahr', periods: [], columns: [], colMeasure: [], colParty: [], colTotal: [], levels: {}, notes: [] });
function put(g: GenesisParsed, key: string, name: string, period: string, col: number, v: Cell) {
  const lvl = levelOfKey(key); if (!lvl) return false;
  const m = (g.levels[lvl] ||= new Map());
  let a = m.get(key); if (!a) { a = { key, name, vals: new Map() }; m.set(key, a); }
  if (!a.name && name) a.name = name;
  let row = a.vals.get(period); if (!row) { row = []; a.vals.set(period, row); }
  row[col] = v;
  return true;
}
const withUnit = (label: string, unit: string) => unit && !/^anzahl$/i.test(unit) && !label.includes(`(${unit})`) ? `${label} (${unit})` : label;

// ---------- Flat-File-CSV ----------
function parseFlat(cells: Cell[][], fileName: string): GenesisParsed {
  const g = base('ffcsv');
  const H = cells[0].map(txt), ix = (n: string) => H.indexOf(n);
  const iTime = ix('time'), iTimeLbl = ix('time_label'), iVal = ix('value'), iUnit = ix('value_unit'), iMeas = ix('value_variable_label'), iStat = ix('statistics_label'), iCode = ix('statistics_code');
  // Merkmale: je „k_variable_…“ vier Spalten
  const vars: { code: number; attr: number; label: number }[] = [];
  for (let k = 1; k < 10; k++) { const c = ix(`${k}_variable_code`); if (c < 0) break; vars.push({ code: c, attr: ix(`${k}_variable_attribute_code`), label: ix(`${k}_variable_attribute_label`) }); }
  const body = cells.slice(1).filter(r => r.length > iVal);
  // Gebietsmerkmal: Attributcodes sehen aus wie Schlüssel (DG, 01, 01001 …)
  const sample = body.slice(0, 400);
  const regIdx = vars.findIndex(v => { const ks = sample.map(r => txt(r[v.attr])).filter(Boolean); return ks.length > 0 && ks.filter(k => levelOfKey(k)).length >= ks.length * 0.9; });
  if (regIdx < 0) throw new Error('In der Flat-File-CSV fehlt das Gebietsmerkmal (Deutschland, Länder, Kreise …).');
  const others = vars.filter((_, k) => k !== regIdx);
  const measures = new Set(body.map(r => txt(r[iMeas])));
  // Spalte: Merkmal (mit Einheit) und Ausprägungen der übrigen Merkmale; Merkmale ohne weiteres Merkmal (leerer Code) nur mit Namen.
  // Parteien stehen vorn („SPD · Gültige Zweitstimmen“), damit Kartenwerk sie als Parteispalten erkennt.
  const colInfo = new Map<string, { c: number; meas: string; party: string | null; total: boolean }>();
  const colKey = (r: Cell[]) => {
    const parts = others.filter(v => txt(r[v.code])).map(v => txt(r[v.label]) || 'Insgesamt');
    const meas = withUnit(txt(r[iMeas]), txt(r[iUnit]));
    const p = parts.filter((x, i) => !(x === 'Insgesamt' && parts.length > 1 && i > 0));
    const party = p.map(x => partyOf(x)).find(Boolean) || null;
    const label = party ? [...p, meas].join(' · ') : measures.size > 1 || !p.length ? [meas, ...p].filter(Boolean).join(' · ') : p.join(' · ');
    return { label, meas, party: party ? party.key : null, total: !p.length || p.every(x => x === 'Insgesamt') };
  };
  const periods = new Set<string>(), measOrder: string[] = [];
  for (const r of body) {
    const key = txt(r[vars[regIdx].attr]); if (!key) continue;
    const k = colKey(r); let ci = colInfo.get(k.label);
    if (!ci) { ci = { c: colInfo.size, meas: k.meas, party: k.party, total: k.total }; colInfo.set(k.label, ci); if (!measOrder.includes(k.meas)) measOrder.push(k.meas); }
    const p = normPeriod(txt(r[iTime])); periods.add(p);
    put(g, key === 'DG' ? 'DG' : key, txt(r[vars[regIdx].label]), p, ci.c, r[iVal] ?? null);
  }
  // Reihenfolge: Merkmale wie in der Datei, darin „Insgesamt“ zuerst
  const order = [...colInfo.entries()].sort((a, b) => measOrder.indexOf(a[1].meas) - measOrder.indexOf(b[1].meas) || (+b[1].total - +a[1].total) || a[1].c - b[1].c);
  const perm = order.map(([, v]) => v.c);
  for (const lvl of Object.values(g.levels)) for (const a of lvl!.values()) for (const [p, v] of a.vals) a.vals.set(p, perm.map(c => v[c] ?? null));
  g.columns = order.map(([l]) => l);
  g.colMeasure = order.map(([, v]) => v.meas);
  g.colParty = order.map(([, v]) => v.party);
  g.colTotal = order.map(([, v]) => v.total);
  const tl = txt(body[0]?.[iTimeLbl]);
  g.periods = [...periods].sort();
  g.timeLabel = tl && tl.length < 20 ? tl : g.periods.every(p => ISO.test(p)) ? 'Stichtag' : 'Jahr';
  g.statLabel = txt(body[0]?.[iStat]);
  g.code = fileName.match(CODE)?.[1] || txt(body[0]?.[iCode]);
  g.title = TABLE_TITLES[g.code] || g.statLabel;
  if (/wahl/i.test(g.statLabel) && g.periods.every(p => ISO.test(p))) g.timeLabel = 'Wahltag';
  if (!TABLE_TITLES[g.code] && measures.size === 1 && g.columns.every(c => !c.startsWith([...measures][0]))) g.title = [...measures][0] || g.statLabel;
  return g;
}

// ---------- Daten-CSV und Excel (Tabellenform) ----------
function parseTable(cells: Cell[][]): GenesisParsed {
  const g = base('dcsv');
  const t0 = txt(cells[0]?.[0]);
  g.code = t0.match(CODE)?.[1] || '';
  // Datenbeginn: erste Zeile mit Schlüssel (DG oder Ziffern) und Name; bei „Zeit in Zeilen“ steht davor die Periode
  const isKey = (s: string) => !!levelOfKey(s);
  let d = -1, lead = 0;
  for (let i = 1; i < Math.min(cells.length, 80); i++) {
    const r = cells[i].map(txt);
    if (isKey(r[0]) && r[1] && !isKey(r[1])) { d = i; lead = 0; break; }
    if (isPeriod(r[0]) && isKey(r[1]) && r[2]) { d = i; lead = 1; break; }
  }
  if (d < 0) throw new Error('Die Tabelle der Regionaldatenbank hat keine erkennbaren Gebietszeilen.');
  // Vorspann: Titel (bis zu zwei Zeilen), Statistik, Merkmal (Einheit); Kopfzeilen: erste zwei Spalten leer
  let h = d; while (h - 1 > 0 && !txt(cells[h - 1][lead]) && !txt(cells[h - 1][lead + 1]) && cells[h - 1].slice(lead + 2).some(v => txt(v))) h--;
  const pre = cells.slice(0, h).map(r => txt(r[0]).replace(/;+$/, '')).filter(Boolean);
  const titleLines = pre.slice(1).filter(x => !/^\d{5}\b/.test(x));
  // Titel: „Bevölkerung nach Geschlecht - Stichtag 31.12. - regionale“ + „Tiefe: Kreise und krfr. Städte“
  const full = titleLines.slice(0, 2).join(' ').replace(/\s+/g, ' ');
  g.title = full.split(/\s+-\s+/)[0].trim();
  const rest = titleLines.slice(/Tiefe:/.test(titleLines[1] || '') ? 2 : 1);
  g.statLabel = rest[0] || '';
  const unitLine = rest[1] || '';
  const hdr = cells.slice(h, d).map(r => r.map(txt));
  const width = Math.max(...cells.slice(d, d + 20).map(r => r.length));
  // verbundene Zellen in Kopfzeilen nach rechts auffüllen
  for (const r of hdr) { let last = ''; for (let i = lead + 2; i < width; i++) { if (r[i]) last = r[i]; else r[i] = last; } }
  const periodRow = hdr.findIndex(r => r.slice(lead + 2, width).filter(Boolean).every(isPeriod) && r.slice(lead + 2).some(Boolean));
  const timeName = periodRow > 0 ? hdr[periodRow - 1][lead + 2] : '';
  const colLabel: string[] = [], colPeriod: string[] = [];
  const unit = unitLine.match(/\(([^)]+)\)\s*$/)?.[1] || '';
  const measName = unitLine.replace(/\s*\([^)]*\)\s*$/, '');
  const colLabels = new Map<string, number>();
  const colIdx: number[] = [];
  for (let i = lead + 2; i < width; i++) {
    const parts = hdr.map((r, k) => (k === periodRow || (periodRow > 0 && k === periodRow - 1 && r[i] === timeName) ? '' : r[i])).filter(Boolean);
    const uniq = parts.filter((p, j) => parts.indexOf(p) === j);
    let label = uniq.join(' · ') || measName || `Spalte ${i + 1}`;
    if (!uniq.length && unit) label = withUnit(label, unit);
    colPeriod[i] = periodRow >= 0 ? normPeriod(hdr[periodRow][i]) : '';
    let c = colLabels.get(label); if (c == null) { c = colLabels.size; colLabels.set(label, c); }
    colIdx[i] = c; colLabel[c] = label;
  }
  const periods = new Set<string>();
  for (let i = d; i < cells.length; i++) {
    const r = cells[i]; const key = txt(r[lead]);
    if (!isKey(key)) { if (/^_{3,}|^__/.test(txt(r[0])) || (!key && !txt(r[lead + 1]))) { if (i > d + 2) break; } continue; }
    const rowPeriod = lead ? normPeriod(txt(r[0])) : '';
    for (let c = lead + 2; c < width; c++) {
      const p = rowPeriod || colPeriod[c] || 'ohne';
      periods.add(p);
      put(g, key, txt(r[lead + 1]).replace(/\s+/g, ' '), p, colIdx[c], r[c] ?? null);
    }
  }
  g.columns = colLabel;
  g.colMeasure = colLabel.map(l => l.split(' · ').find(x => !partyOf(x)) || measName);
  g.colParty = colLabel.map(l => { const p = l.split(' · ').map(x => partyOf(x)).find(Boolean); return p ? p.key : null; });
  g.colTotal = colLabel.map((l, k) => !g.colParty[k] && l.split(' · ').every(x => x === g.colMeasure[k] || x === 'Insgesamt'));
  g.periods = [...periods].sort();
  g.timeLabel = /stichtag/i.test(timeName) || g.periods.every(p => ISO.test(p)) ? 'Stichtag' : 'Jahr';
  // Nachspann: Copyright und Stand
  for (const r of cells.slice(d)) {
    const s = txt(r[0]);
    const m = s.match(/©\s*([^.\n]+?)(?:,\s*\d{4})?\./); if (m && !g.copyright) g.copyright = m[1].trim();
    const st = s.match(/Stand:\s*(\d\d\.\d\d\.\d{4})/); if (st) g.stand = st[1];
  }
  return g;
}

// ---------- Zeilen einer Ebene und Periode ----------
export function genesisRows(g: GenesisParsed, lvl: GLevel, period: string): { key: string; name: string; vals: Cell[] }[] {
  const m = g.levels[lvl]; if (!m) return [];
  const out: { key: string; name: string; vals: Cell[] }[] = [];
  for (const a of m.values()) { const v = a.vals.get(period); if (v) out.push({ key: a.key, name: a.name, vals: g.columns.map((_, c) => v[c] ?? null) }); }
  return out;
}
/** Gibt es in dieser Periode wenigstens einen Wert? (leere Jahre älterer Kreise) */
export const hasValue = (vals: Cell[], german: boolean) => vals.some(v => classify(v, german).t === 'number' || classify(v, german).t === 'dash');
export const LEVEL_LABEL: Record<GLevel, string> = { de: 'Deutschland', lan: 'Länder', rbz: 'Regierungsbezirke bzw. statistische Regionen', krs: 'Kreise und kreisfreie Städte', gem: 'Gemeinden', vwg: 'Gemeindeverbände' };
