// Importablauf: Rohdaten → Tabelle (Kopfzeilen, Form, Spalten) → Zuordnung → Datensatz
import type { Cell, Column, Dataset, Group, GroupSetting, ImportSettings, LongSettings, MatchIssue, MatchReport, PresetId, RawInput, Role } from './types';
import { classify, detectGerman } from './parse';
import { partyOf } from './parties';
import { GEO, GEO_INDEX, GeoIndexEntry, LAENDER, ensureGeo, normKey } from '../geo/geo';
import { norm, uid } from '../lib/util';
import { WbzResult, aggregateWbz } from './wbz';
import { BE_EBENEN, BE_PARTIES_2026, aggregateBeWbz, beDatum, beStimme, isBeGebiete, isBeWbz } from './berlin';

export const PRESET_LABELS: Record<PresetId, string> = {
  auto: 'Automatisch erkennen',
  'bwl-kerg': 'Bundeswahlleiterin · kerg (Breitformat)',
  'bwl-kerg2': 'Bundeswahlleiterin · kerg2 (Langformat)',
  'bwl-umrechnung': 'Bundeswahlleiterin · Umrechnung auf neue Wahlkreise',
  'bwl-kreis': 'Bundeswahlleiterin · Ergebnisse nach Kreisen',
  'bwl-wbz': 'Bundeswahlleiterin · Wahlbezirke → Gemeinden',
  'be-wbz': 'Berlin · Abgeordnetenhauswahl nach Wahlbezirken',
  'be-gebiete': 'Berlin · Abgeordnetenhauswahl nach Wahlkreisen und Bezirken',
  allgemein: 'Allgemeine Tabelle',
};

const txt = (v: Cell) => (v == null ? '' : String(v)).trim();
const rowText = (r: Cell[]) => r.map(txt);

// ---------- Vorlagen erkennen ----------
export function findRow(cells: Cell[][], test: (r: string[]) => boolean, limit = 60) {
  for (let i = 0; i < Math.min(cells.length, limit); i++) if (test(rowText(cells[i]))) return i;
  return -1;
}
export function detectPreset(raw: RawInput, sheet = 0): PresetId {
  const c = raw.sheets[sheet]?.cells || [];
  if (findRow(c, r => r[0] === 'Nr' && r[1] === 'Gebiet' && r[2]?.startsWith('gehört')) >= 0) return 'bwl-kerg';
  if (findRow(c, r => r.includes('Gebietsart') && r.includes('Gruppenname') && r.includes('Stimme')) >= 0) return 'bwl-kerg2';
  if (findRow(c, r => r[0] === 'Wkr-Nr.' && r.includes('Wahlkreisname')) >= 0) return 'bwl-umrechnung';
  if (findRow(c, r => r.includes('Statistische Kennziffer') && r.some(x => /^Kreisfreie Stadt/.test(x))) >= 0) return 'bwl-kreis';
  if (findRow(c, r => r.includes('Kennziffer Briefwahlzugehörigkeit') && r.includes('Bezirksart')) >= 0) return 'bwl-wbz';
  if (findRow(c, isBeWbz, 5) >= 0) return 'be-wbz';
  if (findRow(c, isBeGebiete, 5) >= 0) return 'be-gebiete';
  return 'allgemein';
}
export function detectHeader(cells: Cell[][]) {
  // erste Zeile eines stabilen Blocks mit Zahlen = Datenbeginn
  const isData = (r: Cell[]) => {
    const t = r.filter(v => txt(v) !== '');
    const nums = t.filter(v => classify(v, true).t === 'number').length;
    return t.length >= 2 && nums >= Math.max(1, Math.floor(t.length * 0.3));
  };
  let d = -1;
  for (let i = 0; i < Math.min(cells.length - 2, 80); i++) {
    if (txt(cells[i][0]).startsWith('#')) continue;
    if (isData(cells[i]) && isData(cells[i + 1]) && isData(cells[i + 2])) { d = i; break; }
  }
  if (d <= 0) return { headerStart: 0, headerRows: 1 };
  let start = d - 1, n = 1;
  const width = Math.max(...cells.slice(d, d + 5).map(r => r.length));
  while (start - 1 >= 0 && n < 3) {
    const r = cells[start - 1];
    const filled = r.filter(v => txt(v) !== '').length;
    if (txt(r[0]).startsWith('#') || filled < 2 || filled < width * 0.15) break;
    start--; n++;
  }
  return { headerStart: start, headerRows: n };
}

export const wbzTitle = (year: string, mode: 'anteilig' | 'gemeinsam') => `Bundestagswahl ${year}, Wahlbezirksstatistik nach Gemeinden` + (mode === 'anteilig' ? '; gemeinsam ausgezählte Briefwahl anteilig auf die Gemeinden verteilt (geschätzt)' : '; Gemeinden mit gemeinsamer Briefwahl zusammengefasst');
/** Quellentitel Berlin: Stimme, Stand der Auszählung, Ebene bzw. Briefwahl */
export const beTitle = (stimme: string, datum: string, how: string) => `Abgeordnetenhauswahl Berlin 2026, ${stimme}${datum ? `, Stand ${datum}` : ''}` + (
  how === 'anteilig' ? ', nach Wahlbezirken; Briefwahl anteilig verteilt (geschätzt)' : how === 'gemeinsam' ? ', nach Briefwahlbezirken (Urnen- und Briefwahl)' : `, nach ${(BE_EBENEN.find(e => e[0] === how) || BE_EBENEN[0])[3]}`);
export function defaultSettings(raw: RawInput, preset: PresetId = 'auto', sheet = 0): ImportSettings {
  const p = preset === 'auto' ? detectPreset(raw, sheet) : preset;
  const cells = raw.sheets[sheet].cells;
  const base: ImportSettings = {
    preset: p, sheet, headerStart: 0, headerRows: 1, format: 'wide', long: null, roles: {}, groups: null,
    geoSet: '', dashIsZero: true, excludeSummary: true, rules: {}, sourceTitle: '', attribution: '',
  };
  if (p === 'bwl-kerg') {
    const h = findRow(cells, r => r[0] === 'Nr' && r[1] === 'Gebiet');
    const title = rowText(cells[0] || [])[0] || 'Bundestagswahl';
    return { ...base, headerStart: h, headerRows: 3, sourceTitle: `${title.replace(/;+$/, '')}, ${rowText(cells[1] || [])[0] || 'Ergebnis'}`, attribution: 'Die Bundeswahlleiterin' };
  }
  if (p === 'bwl-umrechnung') {
    const h = findRow(cells, r => r[0] === 'Wkr-Nr.');
    const c = cells.filter(r => txt(r[0]).startsWith('#')).map(r => txt(r[0]).replace(/^#\s*/, '')).filter(Boolean);
    return { ...base, headerStart: h, headerRows: 2, sourceTitle: c[1] || 'Umrechnung auf neue Wahlkreise', attribution: (c[0] || 'Die Bundeswahlleiterin').replace(/^\(c\)\s*/i, '') };
  }
  if (p === 'bwl-wbz') {
    const h = findRow(cells, r => r.includes('Bezirksart') && r.includes('Kennziffer Briefwahlzugehörigkeit'));
    const pre = cells.slice(0, h).map(r => txt(r[0])).filter(Boolean);
    const copy = pre.find(x => /^\(c\)|^©/i.test(x)) || '© Die Bundeswahlleiterin';
    const y = (pre.find(x => /Bundestagswahl/.test(x)) || '').match(/(\d{4})/)?.[1] || '';
    return { ...base, headerStart: h, headerRows: 1, wbz: { briefwahl: 'anteilig' }, sourceTitle: wbzTitle(y, 'anteilig'), attribution: copy.replace(/^\(c\)\s*|^©\s*/i, '') };
  }
  if (p === 'be-wbz' || p === 'be-gebiete') {
    const h = findRow(cells, p === 'be-wbz' ? isBeWbz : isBeGebiete, 5), H = rowText(cells[h]);
    const first = cells[h + 1] || [], stimme = beStimme(first[H.indexOf('StimmArt')]), datum = beDatum(first[H.indexOf('Datum')]);
    const attribution = 'Amt für Statistik Berlin-Brandenburg (CC BY 3.0 DE)';
    if (p === 'be-wbz') return { ...base, headerStart: h, headerRows: 1, wbz: { briefwahl: 'anteilig' }, geoSet: 'be-wbz-2026', sourceTitle: beTitle(stimme, datum, 'anteilig'), attribution };
    return { ...base, headerStart: h, headerRows: 1, be: { ebene: BE_EBENEN[0][0] }, geoSet: BE_EBENEN[0][2], sourceTitle: beTitle(stimme, datum, BE_EBENEN[0][0]), attribution };
  }
  if (p === 'bwl-kreis') {
    const h = findRow(cells, r => r.includes('Statistische Kennziffer'));
    const pre = cells.slice(0, h).map(r => txt(r[0])).filter(Boolean);
    const copy = pre.find(x => /^\(c\)|^©/i.test(x)) || '© Die Bundeswahlleiterin';
    const title = pre.find(x => /Ergebnisse der/i.test(x)) || '';
    const y = title.match(/(\d{4})/)?.[1] || '';
    return { ...base, headerStart: h, headerRows: 1, sourceTitle: y ? `Bundestagswahl ${y}, Ergebnisse nach Kreisen` : title, attribution: copy.replace(/^\(c\)\s*|^©\s*/i, '') };
  }
  if (p === 'bwl-kerg2') {
    const h = findRow(cells, r => r.includes('Gebietsart') && r.includes('Gruppenname'));
    const hdr = rowText(cells[h]);
    const ix = (n: string) => hdr.indexOf(n);
    const long: LongSettings = {
      key: ix('Gebietsnummer'), name: ix('Gebietsname'), group: ix('Gruppenname'), sub: ix('Stimme'), value: ix('Anzahl'), kind: ix('Gruppenart'), filterCol: ix('Gebietsart'), filterValue: 'Wahlkreis',
      prev: ix('VorpAnzahl') >= 0 ? ix('VorpAnzahl') : null,
      // „Gewählt“: Partei der oder des gewählten Wahlkreisbewerbers, „–“ = kein Direktmandat zugeteilt (Wahlrecht 2025)
      attrs: ix('Gewählt') >= 0 ? [{ col: ix('Gewählt'), label: 'Direktmandat', map: { '–': 'nicht zugeteilt', '-': 'nicht zugeteilt' } }] : [],
    };
    const wahltag = txt(cells[h + 1]?.[ix('Wahltag')]);
    const pre = cells.slice(0, h).map(r => txt(r[0]));
    const status = cells.slice(0, h).find(r => /^Status/.test(txt(r[0])));
    const endg = status && /Endgültig/i.test(txt(status[1])) ? ', endgültiges Ergebnis' : status ? `, ${txt(status[1])}` : '';
    const copy = pre.find(x => /^\(c\)|^©/i.test(x));
    return { ...base, headerStart: h, headerRows: 1, format: 'long', long, sourceTitle: `Bundestagswahl ${wahltag ? wahltag.slice(-4) : ''}${endg}`.trim(), attribution: copy ? copy.replace(/^\(c\)\s*|^©\s*/i, '') : 'Die Bundeswahlleiterin' };
  }
  // Kommentarzeilen am Anfang („# …“): Urheber (mit © oder (c)) und Titel für die Quellenzeile
  const com = cells.slice(0, 12).map(r => txt(r[0])).filter(x => x.startsWith('#')).map(x => x.replace(/^#\s*/, '').replace(/;+$/, '').trim()).filter(Boolean);
  const copy = com.find(x => /^\(c\)|^©/i.test(x)), title = com.find(x => !/^\(c\)|^©/i.test(x));
  return { ...base, ...detectHeader(cells), sourceTitle: title || '', attribution: copy ? copy.replace(/^\(c\)\s*|^©\s*/i, '') : '' };
}

// ---------- Kopfzeilen zusammenführen ----------
function mergeHeaders(rows: string[][], preset: PresetId): string[] {
  const width = Math.max(...rows.map(r => r.length));
  const filled = rows.map(r => { const o: string[] = []; for (let i = 0; i < width; i++) o.push(r[i] || ''); return o; });
  // nach rechts auffüllen (verbundene Zellen), außer in der letzten Kopfzeile
  for (let k = 0; k < filled.length - 1; k++) {
    let last = '';
    for (let i = 0; i < width; i++) { if (filled[k][i]) last = filled[k][i]; else filled[k][i] = last; }
  }
  const out: string[] = [];
  for (let i = 0; i < width; i++) {
    let parts = filled.map(r => r[i]).filter(Boolean);
    if (preset === 'bwl-kreis' || preset === 'bwl-wbz') parts = parts.flatMap(p => p.split(/ - (?=(Erst|Zweit)stimmen$)/).filter(x => x && !/^(Erst|Zweit)$/.test(x)));
    if (preset === 'bwl-kerg') parts = parts.filter(p => p !== 'Endgültig').map(p => p === 'Vorperiode' ? 'Vorperiode' : p);
    parts = parts.filter((p, j) => parts.indexOf(p) === j);
    if (parts.length) { const pp = partyOf(parts[0]); if (pp && parts.length > 1) parts[0] = pp.short; }
    out.push(parts.join(' · ') || `Spalte ${i + 1}`);
  }
  // eindeutige Bezeichnungen
  const seen: Record<string, number> = {};
  return out.map(l => { seen[l] = (seen[l] || 0) + 1; return seen[l] > 1 ? `${l} (${seen[l]})` : l; });
}

// ---------- Langformat drehen ----------
function pivot(header: string[], body: Cell[][], L: LongSettings) {
  const subLabel = (v: string) => v === '1' ? 'Erststimmen' : v === '2' ? 'Zweitstimmen' : v;
  const keys: string[] = [], names: Record<string, string> = {}, byKey: Record<string, Record<string, Cell>> = {};
  const colOrder: string[] = [], prevOrder: string[] = [], colSeen = new Set<string>(), kinds: Record<string, string> = {}, colGroup: Record<string, string> = {}, colSub: Record<string, string> = {};
  const attrs = L.attrs || [], attrVal: Record<string, Record<string, string>> = {};
  const hasPrev = L.prev != null && L.prev >= 0;
  const addCol = (label: string, g: string, s: string, order: string[]) => { if (!colSeen.has(label)) { colSeen.add(label); order.push(label); colGroup[label] = g; colSub[label] = s; } };
  for (const r of body) {
    if (L.filterCol != null && L.filterCol >= 0 && L.filterValue && txt(r[L.filterCol]) !== L.filterValue) continue;
    const k = txt(r[L.key]); if (!k) continue;
    const g = txt(r[L.group]); if (!g) continue;
    const s = L.sub != null && L.sub >= 0 ? subLabel(txt(r[L.sub])) : '';
    const label = s ? `${g} · ${s}` : g;
    if (!byKey[k]) { byKey[k] = {}; keys.push(k); attrVal[k] = {}; }
    if (L.name != null && L.name >= 0) names[k] = txt(r[L.name]);
    byKey[k][label] = r[L.value];
    addCol(label, g, s, colOrder);
    if (hasPrev) { const pl = `${label} · Vorperiode`; byKey[k][pl] = r[L.prev!]; addCol(pl, g, s, prevOrder); }
    for (const a of attrs) { const v = txt(r[a.col]); if (v && !attrVal[k][a.label]) attrVal[k][a.label] = a.map?.[v] ?? v; }
    if (L.kind != null && L.kind >= 0) kinds[g] = txt(r[L.kind]);
  }
  // Spalten ohne einen einzigen Wert tragen nichts bei (z. B. Zweitstimmen von Einzelbewerbern)
  const filled = (c: string) => keys.some(k => txt(byKey[k][c] ?? '') !== '');
  const cols = [...colOrder, ...prevOrder].filter(filled);
  const attrCols = attrs.map(a => a.label).filter(l => keys.some(k => attrVal[k][l]));
  const hasName = L.name != null && L.name >= 0;
  const outHeader = [header[L.key] || 'Kennung', ...(hasName ? [header[L.name!] || 'Name'] : []), ...attrCols, ...cols];
  const outBody: Cell[][] = keys.map(k => [k, ...(hasName ? [names[k] || ''] : []), ...attrCols.map(l => attrVal[k][l] || ''), ...cols.map(c => byKey[k][c] ?? '')]);
  return { header: outHeader, body: outBody, kinds, colGroup, colSub, attrCols };
}

// ---------- Tabelle aus Rohdaten ----------
export interface TableResult {
  columns: Column[]; body: Cell[][]; summary: boolean[]; groups: Group[];
  headerLabels: string[]; notes: string[]; german: boolean;
  joint?: Record<string, string>;
}
const wbzCache = new WeakMap<Cell[][], Map<string, WbzResult>>();
const beCache = new WeakMap<Cell[][], Map<string, ReturnType<typeof aggregateBeWbz>>>();
function beWbzOf(cells: Cell[][], h: number, mode: 'anteilig' | 'gemeinsam') {
  let m = beCache.get(cells); if (!m) { m = new Map(); beCache.set(cells, m); }
  const k = h + mode; let r = m.get(k); if (!r) { r = aggregateBeWbz(cells, h, mode); m.set(k, r); }
  return r;
}
function wbzOf(cells: Cell[][], h: number, mode: 'anteilig' | 'gemeinsam') {
  let m = wbzCache.get(cells); if (!m) { m = new Map(); wbzCache.set(cells, m); }
  const k = h + mode; let r = m.get(k); if (!r) { r = aggregateWbz(cells, h, mode); m.set(k, r); }
  return r;
}
export function buildTable(raw: RawInput, st: ImportSettings): TableResult {
  const cells = raw.sheets[st.sheet]?.cells || [];
  const hdrRows = cells.slice(st.headerStart, st.headerStart + st.headerRows).map(rowText);
  let header = mergeHeaders(hdrRows.length ? hdrRows : [[]], st.preset);
  let body = cells.slice(st.headerStart + st.headerRows).filter(r => r.some(v => txt(v) !== '') && !txt(r[0]).startsWith('#'));
  const notes: string[] = [];
  let pv: ReturnType<typeof pivot> | null = null;
  let joint: Record<string, string> | undefined;
  if (st.preset === 'bwl-wbz') {
    const w = wbzOf(cells, st.headerStart, st.wbz?.briefwahl || 'anteilig');
    header = mergeHeaders([w.header], st.preset); body = w.body; joint = Object.keys(w.joint).length ? w.joint : undefined;
    notes.push(...w.notes);
  } else if (st.preset === 'be-wbz') {
    const w = beWbzOf(cells, st.headerStart, st.wbz?.briefwahl || 'anteilig');
    header = w.header; body = w.body; joint = Object.keys(w.joint).length ? w.joint : undefined;
    notes.push(...w.notes);
  } else if (st.preset === 'be-gebiete') {
    // eine Gebietsart auswählen, Parteien benennen, Prozentspalten weglassen
    const H = header, ix = (n: string) => H.indexOf(n), ga = ix('Gebietsart'), ebene = st.be?.ebene || BE_EBENEN[0][0];
    const stimme = beStimme(body[0]?.[ix('StimmArt')] ?? 2);
    const rows = body.filter(r => txt(r[ga]) === ebene);
    const pcols = H.map((c, i) => [c, i] as const).filter(([c, i]) => /^P\d+$/.test(c) && rows.some(r => Number(txt(r[i]).replace(',', '.')) > 0));
    const keep: [string, number][] = [['Nummer', ix('Nummer')], ['Gebietsname', ix('Gebietsname')], ['Wahlberechtigte', ix('WberIns')], ['Wählende', ix('Waehler')], ['Wahlbeteiligung', ix('Waehlerp')], ['Wählende mit Wahlschein', ix('Wahlsch')], [`Gültige Stimmen · ${stimme}`, ix('Gueltig')], [`Ungültige Stimmen · ${stimme}`, ix('Unguelt')],
      ...pcols.map(([c, i]) => [`${BE_PARTIES_2026[c] || 'Wahlvorschlag ' + c} · ${stimme}`, i] as [string, number])];
    header = keep.map(k => k[0]);
    body = rows.map(r => keep.map(([, i]) => (i >= 0 ? r[i] ?? null : null)));
    notes.push(`${rows.length} Zeilen der Gebietsart „${ebene}“; ${pcols.length} Wahlvorschläge mit Stimmen.`);
  } else if (st.preset === 'bwl-kreis') {
    // Berlin steht getrennt nach West und Ost (11200, 11100); die Karte kennt nur das Land Berlin (11000)
    const ki = header.indexOf('Statistische Kennziffer');
    const be = body.filter(r => /^11[12]00$/.test(txt(r[ki])));
    if (ki >= 0 && be.length === 2) {
      const merged: Cell[] = be[0].map((v, i) => {
        if (i === ki) return '11000';
        const a = classify(v, false), b = classify(be[1][i], false);
        if (a.t === 'number' && b.t === 'number') return a.v + b.v;
        return /Berlin/.test(txt(v)) ? 'Berlin' : v;
      });
      body = [...body.filter(r => !be.includes(r)), merged];
      notes.push('Berlin-West und Berlin-Ost sind zu Berlin zusammengefasst.');
    }
  } else if (st.format === 'long' && st.long) {
    pv = pivot(header, body, st.long);
    header = pv.header; body = pv.body;
    notes.push(`Langformat gedreht: ${body.length} Gebiete × ${header.length - 1} Spalten`);
    if (header.some(h => / · Vorperiode$/.test(h))) notes.push('Die Werte der Vorperiode stehen als eigene Spalten daneben („… · Vorperiode“).');
    if (pv.attrCols.length) notes.push(`Merkmal je Gebiet: ${pv.attrCols.map(a => `„${a}“`).join(', ')}. Es lässt sich als Kategorie einfärben.`);
  }
  const width = header.length;
  // Zahlenformat und Spaltenart
  const colVals = (i: number) => body.map(r => r[i] ?? null);
  const german = detectGerman(body.slice(0, 400).flat());
  const columns: Column[] = header.map((label, i) => {
    const vals = colVals(i);
    let num = 0, text = 0;
    for (const v of vals) { const c = classify(v, german); if (c.t === 'number') num++; else if (c.t === 'text') text++; }
    const kind: Column['kind'] = num > 0 && num >= text * 4 ? 'number' : 'text';
    const pp = partyOf(label.split(' · ')[0]) || (pv ? partyOf(pv.colGroup[label] || '') : null);
    return { id: 'c' + i, label, kind, role: 'value', party: pp ? pp.key : null, short: pp ? pp.short : null };
  });
  // Rollen: Vorlage bzw. Automatik, dann gespeicherte Vorgaben
  autoRoles(columns, body, st.preset);
  for (const c of columns) if (st.roles[c.label]) c.role = st.roles[c.label];
  // Summenzeilen
  const summary = body.map(r => isSummaryRow(r, columns, st));
  // Gruppen
  const groups = st.groups ? st.groups.map(g => mkGroup(g, columns)) : autoGroups(columns, st, pv?.kinds || {}, pv?.colGroup || {});
  return { columns, body, summary, groups, headerLabels: header, notes, german, joint };
}
function mkGroup(g: GroupSetting, columns: Column[]): Group {
  const byLabel = new Map(columns.map(c => [c.label, c.id]));
  return { id: 'g-' + norm(g.label).replace(/\s/g, '-'), label: g.label, columns: g.columns.map(l => byLabel.get(l)).filter((x): x is string => !!x), total: g.total ? byLabel.get(g.total) || null : null, parties: g.parties };
}
function autoRoles(columns: Column[], body: Cell[][], preset: PresetId) {
  const by = (pred: (c: Column) => boolean) => columns.find(pred);
  const set = (c: Column | undefined, r: Role) => { if (c) c.role = r; };
  if (preset === 'bwl-kerg') {
    set(by(c => c.label === 'Nr'), 'id'); set(by(c => c.label === 'Gebiet'), 'name'); set(by(c => c.label.startsWith('gehört')), 'ignore');
  } else if (preset === 'bwl-umrechnung') {
    set(by(c => c.label === 'Wkr-Nr.'), 'id'); set(by(c => c.label === 'Wahlkreisname'), 'name'); set(by(c => c.label === 'Land'), 'category');
  } else if (preset === 'bwl-kerg2') {
    set(columns[0], 'id'); set(columns[1], 'name');
  } else if (preset === 'bwl-wbz') {
    set(by(c => c.label === 'Gemeindeschlüssel'), 'id'); set(by(c => c.label === 'Gemeinde'), 'name'); set(by(c => c.label === 'Briefwahl'), 'category'); set(by(c => c.label === 'Auszählungseinheit'), 'label'); set(by(c => c.label === 'Enthält'), 'ignore');
  } else if (preset === 'be-wbz') {
    set(columns[0], 'id'); set(by(c => c.label === 'Name'), 'name'); set(by(c => c.label === 'Bezirk'), 'category'); set(by(c => c.label === 'Briefwahl'), 'category'); set(by(c => c.label === 'Wahlkreis'), 'ignore');
  } else if (preset === 'be-gebiete') {
    set(by(c => c.label === 'Nummer'), 'id'); set(by(c => c.label === 'Gebietsname'), 'name');
  } else if (preset === 'bwl-kreis') {
    set(by(c => c.label === 'Statistische Kennziffer'), 'id'); set(by(c => /^Kreisfreie Stadt/.test(c.label)), 'name'); set(by(c => c.label === 'Land'), 'ignore');
  } else {
    // Kennung: ganze Zahlen oder Ziffernfolgen, überwiegend eindeutig
    const vals = (c: Column) => body.map(r => txt(r[+c.id.slice(1)]));
    // kleine Tabellen (etwa eigene Regionen): Kennung nur, wenn die Überschrift danach klingt
    const small = body.length < 4, ID_LBL = /^(nr\.?|nummer|schlüssel|kennziffer|id|ags|ars|wkr[- ]?nr\.?)$|schlüssel|kennziffer/i;
    const idOk = (c: Column) => { const v = vals(c).filter(Boolean); return (small ? v.length >= 1 && ID_LBL.test(c.label) : v.length > 3) && v.every(x => /^\d{1,12}$/.test(x)) && new Set(v).size >= v.length * 0.9; };
    const idCol = columns.find(c => ID_LBL.test(c.label) && idOk(c)) || columns.find(idOk);
    if (idCol) idCol.role = 'id';
    const nameOk = (c: Column) => c.kind === 'text' && c !== idCol && (() => { const v = vals(c).filter(Boolean); return v.length >= Math.min(4, body.length) && v.length > 0 && new Set(v).size >= v.length * 0.8; })();
    const nameCol = columns.find(c => /name|gebiet|region|bezeichnung|kreis|gemeinde|land|wahlkreis|stadt|ort\b/i.test(c.label) && nameOk(c)) || columns.find(nameOk);
    if (nameCol) nameCol.role = 'name';
    for (const c of columns) if (c !== idCol && c !== nameCol && c.kind === 'text') c.role = 'category';
  }
  for (const c of columns) if (c.role === 'value' && c.kind === 'text') c.role = 'category';
}
function autoGroups(columns: Column[], st: ImportSettings, kinds: Record<string, string>, colGroup: Record<string, string>): Group[] {
  const vals = columns.filter(c => c.role === 'value' && c.kind === 'number');
  const out: Group[] = [];
  const NONPARTY = /^(Wahlberechtigte|Wählende|Wähler|Ungültig|Gültig|Nr|Wahlbeteiligung|Übrige|Briefwahl|Anteil)/;
  if (st.preset === 'bwl-kerg' || st.preset === 'bwl-umrechnung' || st.preset === 'bwl-kerg2' || st.preset === 'bwl-kreis' || st.preset === 'bwl-wbz' || st.preset === 'be-wbz' || st.preset === 'be-gebiete') {
    const isParty = (c: Column) => {
      if (st.preset === 'bwl-kerg2') { const k = kinds[colGroup[c.label]] || ''; return k === 'Partei' || k.startsWith('Einzelbewerber'); }
      return !NONPARTY.test(c.label);
    };
    const variants: [string, (l: string) => boolean][] = [
      ['Zweitstimmen', l => /Zweitstimmen/.test(l) && !/Vorperiode/.test(l)],
      ['Erststimmen', l => /Erststimmen/.test(l) && !/Vorperiode/.test(l)],
      ['Zweitstimmen (Vorperiode)', l => /Zweitstimmen/.test(l) && /Vorperiode/.test(l)],
      ['Erststimmen (Vorperiode)', l => /Erststimmen/.test(l) && /Vorperiode/.test(l)],
    ];
    for (const [label, test] of variants) {
      const cols = vals.filter(c => test(c.label) && isParty(c));
      if (cols.length < 2) continue;
      const total = vals.find(c => test(c.label) && /^Gültig/.test(c.label));
      out.push({ id: 'g-' + norm(label).replace(/\s/g, '-'), label, columns: cols.map(c => c.id), total: total ? total.id : null, parties: true });
    }
    return out;
  }
  if (vals.length >= 2) {
    const partyCols = vals.filter(c => c.party);
    if (partyCols.length >= 2) {
      // gemeinsamer Zusatz („CDU · Zweitstimmen“) wird zum Gruppennamen, „Gültige …“ zur Bezugsgröße
      const suf = partyCols.map(c => c.label.split(' · ').slice(1).join(' · '));
      const label = suf[0] && suf.every(x => x === suf[0]) ? suf[0] : 'Parteien';
      const total = vals.find(c => !c.party && /^Gültige?\b/i.test(c.label) && (label === 'Parteien' || c.label.includes(label)));
      out.push({ id: 'g-' + norm(label).replace(/\s/g, '-'), label, columns: partyCols.map(c => c.id), total: total ? total.id : null, parties: true });
    }
  }
  return out;
}
function isSummaryRow(r: Cell[], columns: Column[], st: ImportSettings) {
  if (!st.excludeSummary) return false;
  const get = (pred: (c: Column) => boolean) => { const c = columns.find(pred); return c ? txt(r[+c.id.slice(1)]) : ''; };
  if (st.preset === 'bwl-kerg') { const g = get(c => c.label.startsWith('gehört')); return !/^(0[1-9]|1[0-6])$/.test(g); }
  if (st.preset === 'bwl-umrechnung') { const n = Number(get(c => c.label === 'Wkr-Nr.')); return !(n >= 1 && n <= 299); }
  if (st.preset === 'bwl-kreis') return !/^\d{4,5}$/.test(get(c => c.label === 'Statistische Kennziffer'));
  if (st.preset === 'bwl-wbz' || st.preset === 'be-wbz' || st.preset === 'be-gebiete') return false;
  const name = get(c => c.role === 'name');
  if (/^(deutschland|bund|bundesgebiet|insgesamt|summe|gesamt|total)$/i.test(name)) return true;
  // Landesnamen sind Summenzeilen, außer die Kennung ist ein Kreis- oder Gemeindeschlüssel (Berlin, Hamburg)
  const id = get(c => c.role === 'id').replace(/\s/g, '');
  if (Object.values(LAENDER).some(([n]) => n === name) && !(id.length >= 4 && /^\d+$/.test(id))) return true;
  return false;
}

// ---------- Gebietsstand erkennen ----------
/** Ebene aus der Form der Kennungen: Gemeindeschlüssel (8 bzw. 12 Stellen), Kreise (5), Länder (2), sonst Wahlkreise */
export function levelFromKeys(keys: string[]): string | null {
  const ks = keys.map(k => k.replace(/\s/g, '')).filter(k => /^\d+$/.test(k));
  if (ks.length < 3) return null;
  const lens = ks.map(k => k.length).sort((x, y) => x - y), med = lens[lens.length >> 1];
  if (med >= 11 || med === 7 || med === 8) return 'gem';
  if (med === 9 || med === 10) return 'vwg';
  if (med === 4 || med === 5) return 'krs';
  const nums = ks.map(Number);
  if (ks.length <= 17 && Math.max(...nums) <= 16) return 'lan';
  return 'btw-wk';
}
const yearsIn = (s: string) => [...s.matchAll(/(?:^|\D)(20\d\d)(?!\d)/g)].map(m => +m[1]);
function pickStand(cands: GeoIndexEntry[], hint: string): GeoIndexEntry {
  const ys = yearsIn(hint), byYear = [...cands].sort((a, b) => b.year - a.year);
  for (const y of ys) { const c = cands.find(x => x.year === y); if (c) return c; }
  // Daten aus dem Vorjahr: der Stand vom 1. Januar des Folgejahres liegt näher als ein älterer
  return byYear[0];
}
export function suggestGeoSet(t: TableResult, st?: ImportSettings, fileName = ''): { id: string; reason: string } {
  const idc = t.columns.find(c => c.role === 'id'), nmc = t.columns.find(c => c.role === 'name');
  const rows = t.body.filter((_, i) => !t.summary[i]);
  const rawIds = idc ? rows.map(r => txt(r[+idc.id.slice(1)])) : [];
  const ids = rawIds.map(x => x.replace(/^0+/, ''));
  const names = nmc ? rows.map(r => norm(txt(r[+nmc.id.slice(1)]))) : [];
  const level = levelFromKeys(rawIds);
  if (level && level !== 'btw-wk') {
    const cands = GEO_INDEX.filter(s => s.level === level);
    if (cands.length) {
      const hint = [st?.sourceTitle || '', fileName].join(' ');
      const c = pickStand(cands, hint);
      const LBL: Record<string, string> = { gem: 'Gemeindeschlüssel', vwg: 'Schlüssel von Gemeindeverbänden', krs: 'Kreisschlüssel', lan: 'Ländernummern' };
      return { id: c.id, reason: `Die Kennungen sehen aus wie ${LBL[level] || 'Verwaltungsschlüssel'}; ${yearsIn(hint).includes(c.year) ? `Stand passend zum Jahr ${c.year}` : 'neuester Gebietsstand'}` };
    }
  }
  const wk = GEO_INDEX.filter(s => s.level === 'btw-wk');
  let best = wk[0]?.id || GEO_INDEX[0]?.id || '', bestScore = -1, reason = '';
  for (const s of wk) {
    const g = GEO[s.id]; if (!g) continue;
    const idHits = ids.filter(x => g.byId.has(x)).length;
    const nameSet = new Set(g.areas.map(a => norm(a.name)));
    const nameHits = names.filter(n => nameSet.has(n)).length;
    const score = idHits + nameHits * 2 + s.year / 10000;
    if (score > bestScore) { bestScore = score; best = s.id; reason = `${idHits} Kennungen und ${nameHits} Namen passen zu „${s.label}“`; }
  }
  if (!names.length && ids.length) reason += ' · ohne Namensspalte lässt sich das Jahr nicht sicher bestimmen';
  return { id: best, reason };
}
/** Wie oben; ohne Kennungen werden die Namen auch mit Kreisen und Gemeinden verglichen (lädt deren Grenzen). */
export async function suggestGeoSetAsync(t: TableResult, st?: ImportSettings, fileName = '', custom: { id: string; label: string }[] = [], current = ''): Promise<{ id: string; reason: string }> {
  const s1 = suggestGeoSet(t, st, fileName);
  const idc = t.columns.find(c => c.role === 'id'), nmc = t.columns.find(c => c.role === 'name');
  if (idc) {
    // importierte Geodaten und eigene Regionen: passen die Kennungen, sind sie gemeint
    const ids = t.body.filter((_, i) => !t.summary[i]).map(r => txt(r[+idc.id.slice(1)])).filter(Boolean);
    const idRate = (id: string) => { const g = GEO[id]; if (!g || !ids.length) return 0; return ids.filter(x => g.byId.has(normKey(g.meta, x))).length / ids.length; };
    // bei Gleichstand gewinnt die Karte, die gerade offen ist
    for (const c of custom) { const r = idRate(c.id), r1 = idRate(s1.id); if (r >= 0.6 && (r > r1 || (r === r1 && c.id === current))) return { id: c.id, reason: `${Math.round(r * 100)} % der Kennungen passen zu „${c.label}“` }; }
    return s1;
  }
  if (!nmc) return s1;
  const names = t.body.filter((_, i) => !t.summary[i]).map(r => norm(txt(r[+nmc.id.slice(1)]))).filter(Boolean);
  const hitRate = (id: string) => { const g = GEO[id]; if (!g) return 0; const set = new Set(g.areas.map(a => norm(a.name))); return names.filter(n => set.has(n)).length / Math.max(1, names.length); };
  // eigene Regionen des Projekts: passen die Namen, sind sie gemeint
  for (const c of custom) { const r = hitRate(c.id); if (r >= 0.6 && r > hitRate(s1.id)) return { id: c.id, reason: `${Math.round(r * 100)} % der Namen passen zu den eigenen Gebieten „${c.label}“` }; }
  if (hitRate(s1.id) >= 0.6) return s1;
  const vg = GEO_INDEX.filter(s => s.lazy && s.level !== 'btw-wk');
  if (!vg.length) return s1;
  const newest = Math.max(...vg.map(s => s.year));
  const cands = vg.filter(s => s.year === newest);
  try { await ensureGeo(cands.map(c => c.id)); } catch { return s1; }
  let best = s1, bestR = hitRate(s1.id);
  for (const c of cands) { const r = hitRate(c.id); if (r > bestR + 0.05) { bestR = r; best = { id: c.id, reason: `${Math.round(r * 100)} % der Namen passen zu „${c.label}“` }; } }
  return best;
}

// ---------- Zuordnung ----------
/** Namensvergleich ohne Zusätze wie „, Stadt“ oder „Landkreis“ */
const LOOSE = /\b(kreisfreie|stadt|landeshauptstadt|hansestadt|universitaetsstadt|wissenschaftsstadt|landkreis|kreis|stadtkreis|regionalverband|lk|st|krfr|gemeinde|markt|flecken)\b/g;
export const looseName = (s: string) => norm(s).replace(LOOSE, ' ').replace(/\s+/g, ' ').trim();
const dice = (a: string, b: string) => {
  const bg = (s: string) => { const o: string[] = []; for (let i = 0; i < s.length - 1; i++) o.push(s.slice(i, i + 2)); return o; };
  const A = bg(a), B = bg(b); if (!A.length || !B.length) return 0;
  const m = new Map<string, number>(); for (const x of A) m.set(x, (m.get(x) || 0) + 1);
  let hit = 0; for (const x of B) { const n = m.get(x) || 0; if (n) { hit++; m.set(x, n - 1); } }
  return 2 * hit / (A.length + B.length);
};
export function buildDataset(raw: RawInput, st: ImportSettings, t: TableResult, name: string, keepId?: string): Dataset {
  const g = GEO[st.geoSet];
  const idc = t.columns.find(c => c.role === 'id'), nmc = t.columns.find(c => c.role === 'name');
  const german = t.german;
  const rep: MatchReport = { total: 0, exact: 0, byName: 0, ambiguous: 0, unknown: 0, duplicate: 0, summary: 0, ignored: 0, ruled: 0, missing: [], nameMismatch: [], issues: [], nullCells: 0, dashCells: 0 };
  const rows: Cell[][] = [], rowKey: string[] = [], rowArea: (string | null)[] = [], bodyRow: number[] = [];
  const geoNames = g.areas.map(a => ({ id: a.id, n: norm(a.name) }));
  const nameIndex = new Map<string, string[]>();
  for (const a of geoNames) { const L = nameIndex.get(a.n); if (L) L.push(a.id); else nameIndex.set(a.n, [a.id]); }
  let fuzzyLeft = g.areas.length > 2000 ? 60 : Infinity;
  t.body.forEach((r, ri) => {
    if (t.summary[ri]) { rep.summary++; return; }
    const out: Cell[] = t.columns.map((c, i) => {
      if (c.kind !== 'number') return txt(r[i]);
      const cl = classify(r[i] ?? null, german);
      if (cl.t === 'number') return cl.v;
      if (cl.t === 'dash') { rep.dashCells++; return st.dashIsZero ? 0 : null; }
      if (c.role === 'value') rep.nullCells++;
      return null;
    });
    const idRaw = idc ? txt(r[+idc.id.slice(1)]) : '';
    const nmRaw = nmc ? txt(r[+nmc.id.slice(1)]) : '';
    const id = idRaw ? normKey(g.meta, idRaw) : '';
    const key = id ? 'id:' + id : 'name:' + norm(nmRaw);
    rows.push(out); rowKey.push(key); rep.total++; bodyRow[ri] = rows.length - 1;
    let area: string | null = null;
    if (key in st.rules) { area = st.rules[key]; rep.ruled++; if (area == null) rep.ignored++; rowArea.push(area); return; }
    if (id && g.byId.has(id)) {
      area = id; rep.exact++;
      if (nmRaw) { const gn = g.areas[g.byId.get(id)!].name; if (norm(gn) !== norm(nmRaw) && looseName(gn) !== looseName(nmRaw)) rep.nameMismatch.push({ row: rows.length - 1, areaId: id, dataName: nmRaw, geoName: gn }); }
    } else if (nmRaw) {
      const n = norm(nmRaw);
      const exact = nameIndex.get(n);
      if (exact && exact.length === 1) { area = exact[0]; rep.byName++; rep.issues.push({ row: rows.length - 1, kind: 'byName', key, name: nmRaw, candidates: exact, chosen: area }); }
      else {
        // Ähnlichkeitssuche nur begrenzt: bei Gemeinden wären es sonst Millionen Vergleiche
        const sc = fuzzyLeft-- > 0 ? geoNames.map(a => ({ id: a.id, s: dice(n, a.n) })).sort((x, y) => y.s - x.s) : [];
        if (exact && exact.length > 1) { rep.ambiguous++; rep.issues.push({ row: rows.length - 1, kind: 'ambiguous', key, name: nmRaw, candidates: exact, chosen: null }); }
        else if (sc[0] && sc[0].s >= 0.82 && (!sc[1] || sc[0].s - sc[1].s > 0.06)) { area = sc[0].id; rep.byName++; rep.issues.push({ row: rows.length - 1, kind: 'byName', key, name: nmRaw, candidates: [sc[0].id], chosen: area }); }
        else if (sc[0] && sc[0].s >= 0.6) { rep.ambiguous++; rep.issues.push({ row: rows.length - 1, kind: 'ambiguous', key, name: nmRaw, candidates: sc.slice(0, 4).map(x => x.id), chosen: null }); }
        else { rep.unknown++; rep.issues.push({ row: rows.length - 1, kind: 'unknown', key, name: nmRaw || idRaw, candidates: [], chosen: null }); }
      }
    } else { rep.unknown++; rep.issues.push({ row: rows.length - 1, kind: 'unknown', key, name: idRaw, candidates: [], chosen: null }); }
    rowArea.push(area);
  });
  // doppelte Zuordnungen
  const seen = new Map<string, number>();
  rowArea.forEach((a, i) => { if (!a) return; if (seen.has(a)) { const j = seen.get(a)!; for (const k of [j, i]) if (!rep.issues.some(x => x.row === k && x.kind === 'duplicate')) { rep.duplicate++; rep.issues.push({ row: k, kind: 'duplicate', key: rowKey[k], name: txt(nmc ? t.body[k]?.[+nmc.id.slice(1)] : rowKey[k]), candidates: [a], chosen: a }); } } else seen.set(a, i); });
  const matched = new Set(rowArea.filter(Boolean) as string[]);
  // Gemeinden ohne eigenen Wahlbezirk („Hennstedt (einschl. Bergewöhrden)“): im selben Kreis über den Namen suchen
  let joint = t.joint ? Object.fromEntries(Object.entries(t.joint).map(([k, v]) => [normKey(g.meta, k), v])) : undefined;
  const alias: Record<string, string> = {};
  const inc = t.columns.find(c => c.label === 'Enthält');
  if (inc) {
    const ci = +inc.id.slice(1);
    t.body.forEach((r, ri) => {
      const txtv = txt(r[ci]); if (!txtv) return;
      const k = bodyRow[ri] ?? -1;
      const host = k >= 0 ? rowArea[k] : null; if (!host) return;
      const hi = g.byId.get(host)!, kr = g.areas[hi].kr;
      for (const nm of txtv.split(/\s*[,;]\s*/)) {
        const ln = looseName(nm);
        const pool = (kr ? g.byKr[kr] || [] : g.all).filter(i => !g.areas[i].free && !matched.has(g.areas[i].id) && !alias[g.areas[i].id]);
        let cand = pool.filter(i => looseName(g.areas[i].name) === ln);
        if (!cand.length) cand = pool.filter(i => looseName(g.areas[i].name).startsWith(ln + ' '));   // „Sevenig“ → „Sevenig bei Neuerburg“
        if (cand.length !== 1) continue;
        const a = g.areas[cand[0]].id; alias[a] = host;
        joint ||= {}; const key = joint[host] || 'incl:' + host; joint[host] = key; joint[a] = key;
      }
    });
  }
  const nAlias = Object.keys(alias).length;
  if (nAlias) rep.included = nAlias;
  rep.missing = g.areas.filter(a => !matched.has(a.id) && !alias[a.id] && !(g.memberOf && a.free)).sort((x, y) => x.nr - y.nr).map(a => a.id);
  return {
    id: keepId || uid('ds'), name, fileName: raw.fileName, importedAt: new Date().toISOString(), geoSet: st.geoSet, preset: st.preset,
    settings: { ...st, roles: Object.fromEntries(t.columns.map(c => [c.label, c.role])) },
    columns: t.columns, groups: t.groups, rows, rowKey, rowArea, report: rep,
    ...(joint ? { joint } : {}), ...(nAlias ? { alias } : {}),
  };
}
export const issueLabel: Record<MatchIssue['kind'], string> = { byName: 'über Namen', ambiguous: 'mehrdeutig', unknown: 'unbekannt', duplicate: 'doppelt' };

/** Kurzer Name für Datensatz und Projekt aus dem (oft langen) amtlichen Titel. */
export function shortTitle(title: string, fallback = 'Daten'): string {
  const t = (title || '').split(';')[0].replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return fallback;
  const bt = t.match(/Wahl zum \d+\. Deutschen Bundestag am .*?(\d{4})/) || t.match(/^Bundestagswahl (\d{4})/);
  if (bt) {
    const um = t.match(/umgerechnet .*?Bundestagswahl (\d{4})/);
    if (um) return `Bundestagswahl ${bt[1]}, umgerechnet auf die Wahlkreise ${um[1]}`;
    const rest = t.replace(/^Bundestagswahl \d{4},?\s*/, '');
    return `Bundestagswahl ${bt[1]}${rest && rest !== t ? ', ' + rest : ''}`;
  }
  const ag = t.match(/^Abgeordnetenhauswahl Berlin (\d{4}), (Erst|Zweit)stimmen(?:, Stand ([\d.]+))?/);
  if (ag) return `Abgeordnetenhauswahl Berlin ${ag[1]}, ${ag[2]}stimmen${ag[3] ? ', Stand ' + ag[3] : ''}`;
  return t.length > 70 ? t.slice(0, 67).replace(/\s+\S*$/, '') + ' …' : t;
}
