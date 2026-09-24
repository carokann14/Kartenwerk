import type { Cell, RawInput } from './types';

// ---------- Text-Dateien ----------
export function decodeText(buf: ArrayBuffer): { text: string; encoding: string } {
  const u = new Uint8Array(buf);
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(u);
    return { text: text.replace(/^﻿/, ''), encoding: 'UTF-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(u), encoding: 'Windows-1252' };
  }
}
export function detectDelimiter(text: string) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#')).slice(0, 40);
  let best = ';', bestScore = -1;
  for (const d of [';', ',', '\t', '|']) {
    const counts = lines.map(l => l.split(d).length - 1);
    const max = Math.max(0, ...counts);
    if (!max) continue;
    const consistent = counts.filter(c => c === max).length;
    const score = consistent * 10 + max;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}
export function parseCSV(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  // leere Endspalten entfernen
  return rows.map(r => { let n = r.length; while (n > 0 && r[n - 1].trim() === '') n--; return r.slice(0, n).map(s => s.trim()); });
}

export async function readFile(name: string, buf: ArrayBuffer): Promise<RawInput> {
  const lower = name.toLowerCase();
  if (/\.(xlsx|xlsm|xls|ods)$/.test(lower)) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buf, { type: 'array' });
    const sheets = wb.SheetNames.map(sn => {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, raw: true, defval: '', blankrows: true });
      const cells: Cell[][] = rows.map(r => { const out = r.map(v => (typeof v === 'number' ? v : v == null ? '' : String(v).trim())) as Cell[]; let n = out.length; while (n > 0 && (out[n - 1] === '' || out[n - 1] == null)) n--; return out.slice(0, n); });
      return { name: sn, cells };
    });
    return { fileName: name, kind: 'xlsx', sheets, encoding: 'Excel', delimiter: '' };
  }
  const { text, encoding } = decodeText(buf);
  const delimiter = detectDelimiter(text);
  return { fileName: name, kind: 'csv', sheets: [{ name: 'Tabelle', cells: parseCSV(text, delimiter) }], encoding, delimiter };
}

// ---------- Zahlen und Zeichenerklärung ----------
// amtlich: „–“ = genau null; „.“ unbekannt/geheim; „…“ folgt später; „x“ gesperrt; „/“ zu unsicher
const DASH = /^[-–—]$/;
const MISSING = /^(\.|…|\.\.\.|x|X|\/|k\.\s?A\.|n\.\s?v\.|NA|N\/A|#NV|#N\/A)$/;
export type CellClass = { t: 'empty' } | { t: 'dash' } | { t: 'missing' } | { t: 'number'; v: number } | { t: 'text' };
export function detectGerman(values: Cell[]) {
  let comma = 0, dotDec = 0, thousand = 0;
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const s = v.replace(/[\s %]/g, '');
    if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(s) || /^-?\d+,\d+$/.test(s)) comma++;
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) thousand++;
    else if (/^-?\d+\.\d+$/.test(s)) dotDec++;
  }
  if (comma) return true;
  if (thousand >= 3 && !dotDec) return true;
  return false;
}
export function classify(v: Cell, german: boolean): CellClass {
  if (v == null) return { t: 'empty' };
  if (typeof v === 'number') return isFinite(v) ? { t: 'number', v } : { t: 'missing' };
  const s = v.trim();
  if (!s) return { t: 'empty' };
  if (DASH.test(s)) return { t: 'dash' };
  if (MISSING.test(s)) return { t: 'missing' };
  let c = s.replace(/[\s ]/g, '').replace(/%$/, '');
  if (german) c = c.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  else c = c.replace(/,(?=\d{3}(\D|$))/g, '');
  if (/^[-+]?\d+(\.\d+)?$/.test(c) || /^[-+]?\.\d+$/.test(c)) return { t: 'number', v: parseFloat(c) };
  return { t: 'text' };
}
export const isNumericish = (c: CellClass) => c.t === 'number' || c.t === 'dash' || c.t === 'missing' || c.t === 'empty';
