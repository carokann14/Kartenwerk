// Formatierung innerhalb eines Textfelds (Canva-artig): Läufe fett/kursiv/Farbe über Zeichenbereiche.
// Marks sind Zeichenbereiche [start, end) im (rohen) Text; b/i/color überschreiben je Feld die Grundeinstellung
// des Textfelds. Nicht gesetzte Felder erben die Grundeinstellung. Intern arbeiten die Funktionen mit einer
// dichten Stil-je-Zeichen-Darstellung, das hält Zusammenführen/Aufteilen einfach und eindeutig.
import { Cut, measureW } from './fonts';

export interface TextMark { start: number; end: number; b?: boolean; i?: boolean; color?: string }
export interface RunPrim { text: string; cut: Cut; color: string; italic?: boolean }
interface Style { b?: boolean; i?: boolean; color?: string }

const sameStyle = (a: Style, b: Style) => a.b === b.b && a.i === b.i && a.color === b.color;

function toDense(text: string, marks: TextMark[] | undefined): Style[] {
  const arr: Style[] = Array.from({ length: text.length }, () => ({}));
  if (!marks) return arr;
  for (const m of marks) {
    const s = Math.max(0, Math.min(text.length, m.start)), e = Math.max(0, Math.min(text.length, m.end));
    for (let k = s; k < e; k++) {
      if (m.b !== undefined) arr[k].b = m.b;
      if (m.i !== undefined) arr[k].i = m.i;
      if (m.color !== undefined) arr[k].color = m.color;
    }
  }
  return arr;
}
function fromDense(arr: Style[]): TextMark[] {
  const out: TextMark[] = [];
  let i = 0;
  while (i < arr.length) {
    const c = arr[i]; let j = i + 1;
    while (j < arr.length && sameStyle(arr[j], c)) j++;
    if (c.b !== undefined || c.i !== undefined || c.color !== undefined) {
      const m: TextMark = { start: i, end: j };
      if (c.b !== undefined) m.b = c.b; if (c.i !== undefined) m.i = c.i; if (c.color !== undefined) m.color = c.color;
      out.push(m);
    }
    i = j;
  }
  return out;
}

/** Ein Feld (fett, kursiv, Farbe) über einem Zeichenbereich setzen; gibt neue, normalisierte Marks zurück. */
export function setMarkField(text: string, marks: TextMark[] | undefined, start: number, end: number, field: 'b' | 'i' | 'color', value: boolean | string | undefined): TextMark[] {
  const arr = toDense(text, marks);
  const [s, e] = clampRange(text, start, end);
  for (let k = s; k < e; k++) (arr[k] as Record<string, unknown>)[field] = value;
  return fromDense(arr);
}
/** Auswahlbereich auf den vorhandenen Text begrenzen. Die Auswahl im Textfeld kann kurz veraltet sein (z. B. direkt nach dem
 *  Löschen einer markierten Stelle oder nach „Rückgängig“) und dann über das Textende hinausreichen. */
export function clampRange(text: string, start: number, end: number): [number, number] {
  const n = text.length, s = Math.max(0, Math.min(n, start | 0)), e = Math.max(0, Math.min(n, end | 0));
  return s <= e ? [s, e] : [e, s];
}
/** Ist der ganze Bereich fett (auch wenn das über den Grundschnitt der Fettung kommt)? */
export function isRangeBold(text: string, marks: TextMark[] | undefined, start: number, end: number, baseBold: boolean): boolean {
  const [s, e] = clampRange(text, start, end);
  if (e <= s) return false;
  const arr = toDense(text, marks);
  for (let k = s; k < e; k++) if ((arr[k].b ?? baseBold) !== true) return false;
  return true;
}
export function isRangeItalic(text: string, marks: TextMark[] | undefined, start: number, end: number): boolean {
  const [s, e] = clampRange(text, start, end);
  if (e <= s) return false;
  const arr = toDense(text, marks);
  for (let k = s; k < e; k++) if (!arr[k].i) return false;
  return true;
}
/** Farbe am Anfang der Auswahl, für die Vorschau im Farbfeld. */
export function colorAtRange(text: string, marks: TextMark[] | undefined, start: number, end: number, fallback: string): string {
  const [s, e] = clampRange(text, start, end);
  if (e <= s) return fallback;
  const arr = toDense(text, marks);
  return arr[s]?.color ?? fallback;
}
/** Marks an eine Textänderung anpassen (Tippen, Einfügen, Löschen, Ersetzen). Neu eingefügte Zeichen übernehmen den
 *  Stil der vorausgehenden Stelle, wie in gängigen Editoren; ersetzt die Eingabe eine Auswahl, übernimmt sie den Stil
 *  des ersten ersetzten Zeichens (fett markiertes Wort überschreiben → neues Wort bleibt fett). */
export function shiftMarksOnEdit(oldText: string, newText: string, marks: TextMark[] | undefined): TextMark[] {
  if (!marks || !marks.length || oldText === newText) return marks || [];
  let p = 0; const maxP = Math.min(oldText.length, newText.length);
  while (p < maxP && oldText[p] === newText[p]) p++;
  const maxS = Math.min(oldText.length - p, newText.length - p);
  let s = 0;
  while (s < maxS && oldText[oldText.length - 1 - s] === newText[newText.length - 1 - s]) s++;
  const oldEnd = oldText.length - s, newEnd = newText.length - s;
  const dense = toDense(oldText, marks);
  const replaced = oldEnd > p && newEnd > p;
  const insertedStyle: Style = (replaced ? dense[p] : p > 0 ? dense[p - 1] : dense[oldEnd]) || {};
  const next: Style[] = [...dense.slice(0, p), ...Array.from({ length: Math.max(0, newEnd - p) }, () => ({ ...insertedStyle })), ...dense.slice(oldEnd)];
  return fromDense(next);
}
/** Schriftschnitt für ein Zeichen: „fett“-Marke erzwingt MW Bold, „nicht fett“ fällt auf den Textschnitt zurück. */
export function boldCutOf(base: Cut, bold: boolean | undefined): Cut {
  if (bold === true) return 'bold';
  if (bold === false) return base === 'bold' ? 'text' : base;
  return base;
}
function styleAt(arr: Style[], i: number): Style { return arr[i] || {}; }
/** Formatierungs-Läufe für einen Zeichenbereich [from, to) des Originaltexts. */
export function lineRuns(text: string, from: number, to: number, marks: TextMark[] | undefined, baseCut: Cut, baseColor: string): RunPrim[] {
  const dense = toDense(text, marks);
  const runs: RunPrim[] = [];
  let cur = '', curCut: Cut = baseCut, curColor = baseColor, curItalic = false, has = false;
  for (let i = from; i < to; i++) {
    const st = styleAt(dense, i);
    const cut = boldCutOf(baseCut, st.b), color = st.color || baseColor, italic = !!st.i;
    if (has && cut === curCut && color === curColor && italic === curItalic) cur += text[i];
    else { if (has) runs.push({ text: cur, cut: curCut, color: curColor, italic: curItalic }); cur = text[i]; curCut = cut; curColor = color; curItalic = italic; has = true; }
  }
  if (has) runs.push({ text: cur, cut: curCut, color: curColor, italic: curItalic });
  return runs;
}
export function measureRuns(runs: RunPrim[], size: number): number {
  return runs.reduce((w, r) => w + measureW(r.text, r.cut, size), 0);
}
function measureRange(text: string, from: number, to: number, marks: TextMark[], baseCut: Cut, size: number): number {
  return measureRuns(lineRuns(text, from, to, marks, baseCut, '#000'), size);
}
/** Wie wrapText (lib/fonts), aber pro Wort mit dem jeweils wirksamen Schriftschnitt gemessen; liefert
 *  Zeichenbereiche [from, to) im Originaltext statt neu zusammengesetzter Zeilen (behält Zwischenraum bei). */
export function wrapRich(text: string, marks: TextMark[], baseCut: Cut, size: number, maxW: number): { from: number; to: number }[] {
  const lines: { from: number; to: number }[] = [];
  let base = 0;
  for (const para of text.split('\n')) {
    const words: { s: number; e: number }[] = [];
    const re = /\S+/g; let m: RegExpExecArray | null;
    while ((m = re.exec(para))) words.push({ s: base + m.index, e: base + m.index + m[0].length });
    if (!words.length) lines.push({ from: base, to: base });
    else {
      let ls = words[0].s, le = words[0].e;
      for (let k = 1; k < words.length; k++) {
        const w = words[k];
        if (measureRange(text, ls, w.e, marks, baseCut, size) <= maxW) le = w.e;
        else { lines.push({ from: ls, to: le }); ls = w.s; le = w.e; }
      }
      lines.push({ from: ls, to: le });
    }
    base += para.length + 1;
  }
  return lines;
}
