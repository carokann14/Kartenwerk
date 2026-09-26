import type { Cell, RawInput } from './types';

// ---------- Text-Dateien ----------
// Doppelt kodierte Umlaute („WÃ¤hler“, „GRÃœNE“): UTF-8, das einmal als Windows-1252 gelesen und wieder als UTF-8 gespeichert wurde
const CP1252: Record<number, number> = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
const MOJI = /[ÃÂ][\u0080-\u00BF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013\u2014\u2018-\u201E\u2020-\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]/g;
export function repairMojibake(text: string): string | null {
  const hits = (text.match(MOJI) || []).length;
  if (hits < 3) return null;
  const bytes = new Uint8Array(text.length); let n = 0;
  for (const ch of text) { const c = ch.codePointAt(0)!; const b = c < 0x100 ? c : CP1252[c]; if (b == null) return null; bytes[n++] = b; }
  try { const out = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, n)); return (out.match(MOJI) || []).length < hits ? out : null; } catch { return null; }
}
export function decodeText(buf: ArrayBuffer): { text: string; encoding: string } {
  const u = new Uint8Array(buf);
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(u).replace(/^﻿/, '');
    const fixed = repairMojibake(text);
    return fixed != null ? { text: fixed, encoding: 'UTF-8, Umlaute repariert' } : { text, encoding: 'UTF-8' };
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
  const n = text.length;
  let i = 0;
  // schneller Weg für Zeilen ohne Anführungszeichen (große amtliche Dateien)
  while (i < n) {
    let e = text.indexOf('\n', i); if (e < 0) e = n;
    let line = text.slice(i, e); if (line.endsWith('\r')) line = line.slice(0, -1);
    if (line.indexOf('"') < 0) { rows.push(line.split(delim)); i = e + 1; continue; }
    // Zeile mit Anführungszeichen: zeichenweise, auch über Zeilenumbrüche hinweg
    const row: string[] = []; let cell = '', q = false, j = i;
    for (; j < n; j++) {
      const c = text[j];
      if (q) { if (c === '"') { if (text[j + 1] === '"') { cell += '"'; j++; } else q = false; } else cell += c; }
      else if (c === '"' && cell === '') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[j + 1] === '\n') j++; break; }
      else cell += c;
    }
    row.push(cell); rows.push(row); i = j + 1;
  }
  // leere Endspalten entfernen
  return rows.map(r => { let k = r.length; while (k > 0 && r[k - 1].trim() === '') k--; return r.slice(0, k).map(x => x.trim()); });
}

// ---------- ZIP (z. B. btw25_wbz.zip) ----------
async function inflate(data: Uint8Array): Promise<ArrayBuffer> {
  const DS = (globalThis as unknown as { DecompressionStream?: new (f: string) => TransformStream }).DecompressionStream;
  if (!DS) throw new Error('Dieser Browser kann ZIP-Dateien nicht entpacken. Bitte die CSV-Datei vorher entpacken.');
  return new Response(new Blob([data as BlobPart]).stream().pipeThrough(new DS('deflate-raw'))).arrayBuffer();
}
export async function unzipEntries(buf: ArrayBuffer): Promise<{ name: string; size: number; read: () => Promise<ArrayBuffer> }[]> {
  const u = new Uint8Array(buf), dv = new DataView(buf);
  let e = u.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Die ZIP-Datei ist beschädigt.');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const out: { name: string; size: number; read: () => Promise<ArrayBuffer> }[] = [];
  for (let k = 0; k < n; k++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const fl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
    const utf8 = (dv.getUint16(p + 8, true) & 0x800) !== 0;
    const name = new TextDecoder(utf8 ? 'utf-8' : 'windows-1252').decode(u.subarray(p + 46, p + 46 + fl));
    const read = async () => {
      const lfl = dv.getUint16(lho + 26, true), lel = dv.getUint16(lho + 28, true), start = lho + 30 + lfl + lel;
      const data = u.slice(start, start + csize);
      if (method === 0) return data.buffer;
      if (method === 8) return inflate(data);
      throw new Error('Nicht unterstütztes Packverfahren in der ZIP-Datei.');
    };
    out.push({ name, size: usize, read });
    p += 46 + fl + el + cl;
  }
  return out;
}

export async function readFile(name: string, buf: ArrayBuffer): Promise<RawInput> {
  const lower = name.toLowerCase();
  if (lower.endsWith('.zip')) {
    // Tabelle aus dem Archiv: bevorzugt „…ergebnis…“, sonst die größte CSV- oder Excel-Datei
    const es = (await unzipEntries(buf)).filter(x => /\.(csv|txt|xlsx|xls|ods)$/i.test(x.name) && !/(^|\/)__MACOSX\//.test(x.name));
    if (!es.length) throw new Error('In der ZIP-Datei steckt keine CSV- oder Excel-Datei.');
    const pick = es.find(x => /ergebnis/i.test(x.name)) || es.sort((a, b) => b.size - a.size)[0];
    const inner = await readFile(pick.name.split('/').pop()!, await pick.read());
    return { ...inner, fileName: name + ' › ' + inner.fileName };
  }
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
