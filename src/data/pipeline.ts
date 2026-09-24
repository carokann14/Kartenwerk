// Importablauf: Rohdaten → Tabelle (Kopfzeilen, Form, Spalten) → Zuordnung → Datensatz
import type { Cell, Column, Dataset, Group, GroupSetting, ImportSettings, LongSettings, MatchIssue, MatchReport, PresetId, RawInput, Role } from './types';
import { classify, detectGerman } from './parse';
import { partyOf } from './parties';
import { GEO, GEO_INDEX, LAENDER } from '../geo/geo';
import { norm, uid } from '../lib/util';

export const PRESET_LABELS: Record<PresetId, string> = {
  auto: 'Automatisch erkennen',
  'bwl-kerg': 'Bundeswahlleiterin · kerg (Breitformat)',
  'bwl-kerg2': 'Bundeswahlleiterin · kerg2 (Langformat)',
  'bwl-umrechnung': 'Bundeswahlleiterin · Umrechnung auf neue Wahlkreise',
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
  if (p === 'bwl-kerg2') {
    const h = findRow(cells, r => r.includes('Gebietsart') && r.includes('Gruppenname'));
    const hdr = rowText(cells[h]);
    const ix = (n: string) => hdr.indexOf(n);
    const long: LongSettings = { key: ix('Gebietsnummer'), name: ix('Gebietsname'), group: ix('Gruppenname'), sub: ix('Stimme'), value: ix('Anzahl'), kind: ix('Gruppenart'), filterCol: ix('Gebietsart'), filterValue: 'Wahlkreis' };
    const wahltag = txt(cells[h + 1]?.[ix('Wahltag')]);
    return { ...base, headerStart: h, headerRows: 1, format: 'long', long, sourceTitle: `Bundestagswahl ${wahltag ? wahltag.slice(-4) : ''}`.trim(), attribution: 'Die Bundeswahlleiterin' };
  }
  return { ...base, ...detectHeader(cells) };
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
  const colOrder: string[] = [], colSeen = new Set<string>(), kinds: Record<string, string> = {}, colGroup: Record<string, string> = {}, colSub: Record<string, string> = {};
  for (const r of body) {
    if (L.filterCol != null && L.filterCol >= 0 && L.filterValue && txt(r[L.filterCol]) !== L.filterValue) continue;
    const k = txt(r[L.key]); if (!k) continue;
    const g = txt(r[L.group]); if (!g) continue;
    const s = L.sub != null && L.sub >= 0 ? subLabel(txt(r[L.sub])) : '';
    const label = s ? `${g} · ${s}` : g;
    if (!byKey[k]) { byKey[k] = {}; keys.push(k); }
    if (L.name != null && L.name >= 0) names[k] = txt(r[L.name]);
    byKey[k][label] = r[L.value];
    if (!colSeen.has(label)) { colSeen.add(label); colOrder.push(label); colGroup[label] = g; colSub[label] = s; }
    if (L.kind != null && L.kind >= 0) kinds[g] = txt(r[L.kind]);
  }
  const outHeader = [header[L.key] || 'Kennung', ...(L.name != null && L.name >= 0 ? [header[L.name] || 'Name'] : []), ...colOrder];
  const outBody: Cell[][] = keys.map(k => [k, ...(L.name != null && L.name >= 0 ? [names[k] || ''] : []), ...colOrder.map(c => byKey[k][c] ?? '')]);
  return { header: outHeader, body: outBody, kinds, colGroup, colSub };
}

// ---------- Tabelle aus Rohdaten ----------
export interface TableResult {
  columns: Column[]; body: Cell[][]; summary: boolean[]; groups: Group[];
  headerLabels: string[]; notes: string[]; german: boolean;
}
export function buildTable(raw: RawInput, st: ImportSettings): TableResult {
  const cells = raw.sheets[st.sheet]?.cells || [];
  const hdrRows = cells.slice(st.headerStart, st.headerStart + st.headerRows).map(rowText);
  let header = mergeHeaders(hdrRows.length ? hdrRows : [[]], st.preset);
  let body = cells.slice(st.headerStart + st.headerRows).filter(r => r.some(v => txt(v) !== '') && !txt(r[0]).startsWith('#'));
  const notes: string[] = [];
  let pv: ReturnType<typeof pivot> | null = null;
  if (st.format === 'long' && st.long) {
    pv = pivot(header, body, st.long);
    header = pv.header; body = pv.body;
    notes.push(`Langformat gedreht: ${body.length} Gebiete × ${header.length - 1} Spalten`);
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
  return { columns, body, summary, groups, headerLabels: header, notes, german };
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
  } else {
    // Kennung: ganze Zahlen oder Ziffernfolgen, überwiegend eindeutig
    const vals = (c: Column) => body.map(r => txt(r[+c.id.slice(1)]));
    const idCol = columns.find(c => { const v = vals(c).filter(Boolean); return v.length > 3 && v.every(x => /^\d{1,12}$/.test(x)) && new Set(v).size >= v.length * 0.9; });
    if (idCol) idCol.role = 'id';
    const nameCol = columns.find(c => c.kind === 'text' && c !== idCol && (() => { const v = vals(c).filter(Boolean); return v.length > 3 && new Set(v).size >= v.length * 0.8; })());
    if (nameCol) nameCol.role = 'name';
    for (const c of columns) if (c !== idCol && c !== nameCol && c.kind === 'text') c.role = 'category';
  }
  for (const c of columns) if (c.role === 'value' && c.kind === 'text') c.role = 'category';
}
function autoGroups(columns: Column[], st: ImportSettings, kinds: Record<string, string>, colGroup: Record<string, string>): Group[] {
  const vals = columns.filter(c => c.role === 'value' && c.kind === 'number');
  const out: Group[] = [];
  const NONPARTY = /^(Wahlberechtigte|Wählende|Wähler|Ungültig|Gültig|Nr|Wahlbeteiligung)/;
  if (st.preset === 'bwl-kerg' || st.preset === 'bwl-umrechnung' || st.preset === 'bwl-kerg2') {
    const isParty = (c: Column) => {
      if (st.preset === 'bwl-kerg2') { const k = kinds[colGroup[c.label]]; return k === 'Partei' || k === 'Einzelbewerber'; }
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
    if (partyCols.length >= 2) out.push({ id: 'g-parteien', label: 'Parteien', columns: partyCols.map(c => c.id), total: null, parties: true });
  }
  return out;
}
function isSummaryRow(r: Cell[], columns: Column[], st: ImportSettings) {
  if (!st.excludeSummary) return false;
  const get = (pred: (c: Column) => boolean) => { const c = columns.find(pred); return c ? txt(r[+c.id.slice(1)]) : ''; };
  if (st.preset === 'bwl-kerg') { const g = get(c => c.label.startsWith('gehört')); return !/^(0[1-9]|1[0-6])$/.test(g); }
  if (st.preset === 'bwl-umrechnung') { const n = Number(get(c => c.label === 'Wkr-Nr.')); return !(n >= 1 && n <= 299); }
  const name = get(c => c.role === 'name');
  if (/^(deutschland|bund|bundesgebiet|insgesamt|summe|gesamt|total)$/i.test(name)) return true;
  if (Object.values(LAENDER).some(([n]) => n === name)) return true;
  return false;
}

// ---------- Gebietsstand erkennen ----------
export function suggestGeoSet(t: TableResult): { id: string; reason: string } {
  const idc = t.columns.find(c => c.role === 'id'), nmc = t.columns.find(c => c.role === 'name');
  const rows = t.body.filter((_, i) => !t.summary[i]);
  const ids = idc ? rows.map(r => txt(r[+idc.id.slice(1)]).replace(/^0+/, '')) : [];
  const names = nmc ? rows.map(r => norm(txt(r[+nmc.id.slice(1)]))) : [];
  let best = GEO_INDEX[GEO_INDEX.length - 1]?.id || '', bestScore = -1, reason = '';
  for (const s of GEO_INDEX) {
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

// ---------- Zuordnung ----------
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
  const rows: Cell[][] = [], rowKey: string[] = [], rowArea: (string | null)[] = [];
  const geoNames = g.areas.map(a => ({ id: a.id, n: norm(a.name) }));
  const nameIndex = new Map<string, string[]>();
  for (const a of geoNames) nameIndex.set(a.n, [...(nameIndex.get(a.n) || []), a.id]);
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
    const id = idRaw.replace(/^0+(?=\d)/, '');
    const key = id ? 'id:' + id : 'name:' + norm(nmRaw);
    rows.push(out); rowKey.push(key); rep.total++;
    let area: string | null = null;
    if (key in st.rules) { area = st.rules[key]; rep.ruled++; if (area == null) rep.ignored++; rowArea.push(area); return; }
    if (id && g.byId.has(id)) {
      area = id; rep.exact++;
      if (nmRaw) { const gn = g.areas[g.byId.get(id)!].name; if (norm(gn) !== norm(nmRaw)) rep.nameMismatch.push({ row: rows.length - 1, areaId: id, dataName: nmRaw, geoName: gn }); }
    } else if (nmRaw) {
      const n = norm(nmRaw);
      const exact = nameIndex.get(n);
      if (exact && exact.length === 1) { area = exact[0]; rep.byName++; rep.issues.push({ row: rows.length - 1, kind: 'byName', key, name: nmRaw, candidates: exact, chosen: area }); }
      else {
        const sc = geoNames.map(a => ({ id: a.id, s: dice(n, a.n) })).sort((x, y) => y.s - x.s);
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
  rep.missing = g.areas.filter(a => !matched.has(a.id)).sort((x, y) => x.nr - y.nr).map(a => a.id);
  return {
    id: keepId || uid('ds'), name, fileName: raw.fileName, importedAt: new Date().toISOString(), geoSet: st.geoSet, preset: st.preset,
    settings: { ...st, roles: Object.fromEntries(t.columns.map(c => [c.label, c.role])) },
    columns: t.columns, groups: t.groups, rows, rowKey, rowArea, report: rep,
  };
}
export const issueLabel: Record<MatchIssue['kind'], string> = { byName: 'über Namen', ambiguous: 'mehrdeutig', unknown: 'unbekannt', duplicate: 'doppelt' };

/** Kurzer Name für Datensatz und Projekt aus dem (oft langen) amtlichen Titel. */
export function shortTitle(title: string, fallback = 'Daten'): string {
  const t = (title || '').replace(/\s+/g, ' ').trim();
  if (!t) return fallback;
  const bt = t.match(/Wahl zum \d+\. Deutschen Bundestag am .*?(\d{4})/) || t.match(/^Bundestagswahl (\d{4})/);
  if (bt) {
    const um = t.match(/umgerechnet .*?Bundestagswahl (\d{4})/);
    if (um) return `Bundestagswahl ${bt[1]}, umgerechnet auf die Wahlkreise ${um[1]}`;
    const rest = t.replace(/^Bundestagswahl \d{4},?\s*/, '');
    return `Bundestagswahl ${bt[1]}${rest && rest !== t ? ', ' + rest : ''}`;
  }
  return t.length > 70 ? t.slice(0, 67).replace(/\s+\S*$/, '') + ' …' : t;
}
