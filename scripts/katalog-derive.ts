// Berechnete Kennzahlen des Katalogs (nicht in der Tabelle der Regionaldatenbank enthalten, sondern aus ihr abgeleitet).
// Altersgruppen: aus den Fünf-/Zehnjahresgruppen von 12411-02-03-4 werden „unter 18“, „18 bis unter 65“ und „65 und älter“
// zusammengezählt (nur Geschlecht insgesamt) und als Zahl und Anteil an der Bevölkerung geschrieben. Die Anteile heißen
// ausdrücklich „berechnet“; sie stehen nicht in der amtlichen Tabelle.
export interface Col { code: number; attr: number; label: number }
export interface DeriveCtx { value: number; unit: number; vcode: number; vlabel: number; time: number; region: Col; age: Col; sex: Col | null; levels: string[] }

export const AGE_GROUPS: { attr: string; label: string; members: string[] }[] = [
  { attr: 'ALTU18', label: 'unter 18 Jahre', members: ['ALT000B03', 'ALT003B06', 'ALT006B10', 'ALT010B15', 'ALT015B18'] },
  { attr: 'ALT18B65', label: '18 bis unter 65 Jahre', members: ['ALT018B20', 'ALT020B25', 'ALT025B30', 'ALT030B35', 'ALT035B40', 'ALT040B45', 'ALT045B50', 'ALT050B55', 'ALT055B60', 'ALT060B65'] },
  { attr: 'ALT65UM', label: '65 Jahre und älter', members: ['ALT065B75', 'ALT075UM'] },
];
export const ANTEIL_LABEL = 'Anteil an der Bevölkerung, berechnet';
const num = (s: string) => (/^-?\d+$/.test((s || '').trim()) ? +s : NaN);
const de1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');

/** rows: Zeilen der Tabelle (Geschlecht insgesamt, alle Altersgruppen). Ergebnis: je Zeit und Gebiet 1 + 3 Zahlen und 3 Anteile;
 *  Gebiete, bei denen ein Wert fehlt (Sperrvermerk), entfallen ganz. Reihenfolge fest (Zeit, Ebene, Gebiet), damit die Datei reproduzierbar bleibt. */
export function deriveAltersgruppen(rows: string[][], c: DeriveCtx): string[][] {
  const groups = new Map<string, string[][]>();
  for (const r of rows) { const k = `${r[c.time]}|${c.levels.indexOf(r[c.region.code])}|${r[c.region.attr]}`; (groups.get(k) || groups.set(k, []).get(k)!).push(r); }
  const keys = [...groups.keys()].sort((a, b) => { const [ta, la, aa] = a.split('|'), [tb, lb, ab] = b.split('|'); return ta < tb ? -1 : ta > tb ? 1 : +la - +lb || (aa < ab ? -1 : aa > ab ? 1 : 0); });
  const out: string[][] = [];
  for (const k of keys) {
    const g = groups.get(k)!, by = new Map(g.map(r => [r[c.age.attr], r]));
    const total = by.get(''), tpl = total || g[0], t = total ? num(total[c.value]) : NaN;
    const counts = AGE_GROUPS.map(a => a.members.map(m => { const r = by.get(m); return r ? num(r[c.value]) : NaN; }));
    if (counts.some(m => m.some(Number.isNaN))) continue;
    const sums = counts.map(m => m.reduce((x, y) => x + y, 0)), all = Number.isNaN(t) ? sums.reduce((x, y) => x + y, 0) : t;
    if (!(all > 0)) continue;
    const mk = (attr: string, label: string, val: string, unit: string, vcode: string, vlabel: string) => {
      const r = [...tpl];
      if (c.sex) { r[c.sex.code] = ''; r[c.sex.attr] = ''; r[c.sex.label] = ''; }
      r[c.age.code] = attr ? tpl[c.age.code] : ''; r[c.age.attr] = attr; r[c.age.label] = label;
      r[c.value] = val; r[c.unit] = unit; r[c.vcode] = vcode; r[c.vlabel] = vlabel;
      return r;
    };
    out.push(mk('', '', String(all), 'Anzahl', 'BEVSTD', 'Bevölkerung'));
    AGE_GROUPS.forEach((a, i) => out.push(mk(a.attr, a.label, String(sums[i]), 'Anzahl', 'BEVSTD', 'Bevölkerung')));
    AGE_GROUPS.forEach((a, i) => out.push(mk(a.attr, a.label, de1(sums[i] / all * 100), '%', 'BEVANT', ANTEIL_LABEL)));
  }
  return out;
}

// ---------- Weitere berechnete Spalten (Tabellen mit einem Gliederungsmerkmal, dessen leere Ausprägung „Insgesamt“ ist) ----------
export interface ExtraCtx { value: number; unit: number; vcode: number; vlabel: number; time: number; region: Col; cls: Col | null; levels: string[] }
export type Extra =
  | { kind: 'anteile'; label: string; code: string }
  | { kind: 'je-einwohner'; label: string; code: string; unit: string; per: number; only?: 'total' };
const group = (rows: string[][], c: ExtraCtx) => {
  const groups = new Map<string, string[][]>();
  for (const r of rows) { const k = `${r[c.time]}|${c.levels.indexOf(r[c.region.code])}|${r[c.region.attr]}`; (groups.get(k) || groups.set(k, []).get(k)!).push(r); }
  return [...groups.entries()].sort((a, b) => { const [ta, la, aa] = a[0].split('|'), [tb, lb, ab] = b[0].split('|'); return ta < tb ? -1 : ta > tb ? 1 : +la - +lb || (aa < ab ? -1 : aa > ab ? 1 : 0); }).map(e => e[1]);
};
const mkRow = (r: string[], c: ExtraCtx, val: string, unit: string, code: string, label: string) => { const o = [...r]; o[c.value] = val; o[c.unit] = unit; o[c.vcode] = code; o[c.vlabel] = label; return o; };

/** Anteil jeder Ausprägung an „Insgesamt“ (leere Ausprägung) in %, je Zeit und Gebiet; Gebiete ohne Zahlen entfallen. Ergebnis: nur die neuen Zeilen. */
export function deriveAnteile(rows: string[][], c: ExtraCtx, x: { label: string; code: string }): string[][] {
  if (!c.cls) throw new Error('kein Gliederungsmerkmal für Anteile');
  const cls = c.cls, out: string[][] = [];
  for (const g of group(rows, c)) {
    const total = g.find(r => r[cls.attr] === ''), t = total ? num(total[c.value]) : NaN;
    if (!(t > 0)) continue;
    for (const r of g) { const v = num(r[c.value]); if (r === total || Number.isNaN(v)) continue; out.push(mkRow(r, c, de1(v / t * 100), '%', x.code, x.label)); }
  }
  return out;
}
/** Zahl je Einwohner (x.per, z. B. 100 oder 1000) mit der Bevölkerung am Stichtag; pop liefert sie je Gebiet und Zeit. Ergebnis: nur die neuen Zeilen. */
export function deriveJe(rows: string[][], c: ExtraCtx, pop: (key: string, time: string) => number | undefined, x: Extract<Extra, { kind: 'je-einwohner' }>): string[][] {
  const out: string[][] = [];
  for (const g of group(rows, c)) for (const r of g) {
    if (x.only === 'total' && c.cls && r[c.cls.attr] !== '') continue;
    const v = num(r[c.value]), p = pop(r[c.region.attr], r[c.time]);
    if (Number.isNaN(v) || !(p && p > 0)) continue;
    const o = mkRow(r, c, de1(v / p * x.per), x.unit, x.code, x.label);
    if (x.only === 'total' && c.cls) { o[c.cls.code] = ''; o[c.cls.attr] = ''; o[c.cls.label] = ''; }   // ohne Gliederung: Spalte heißt nur „Pkw je 1.000 Einwohner, berechnet“
    out.push(o);
  }
  return out;
}
/** Bevölkerung (Insgesamt) je Gebiet: zum Stichtag der letzte Stand am oder vor dem Tag (1.1.2026 → 31.12.2025), bei Jahren der 31.12. */
export function popLookup(rows: string[][], c: { value: number; time: number; region: Col; others: Col[]; levels: string[] }): (key: string, time: string) => number | undefined {
  const m = new Map<string, [string, number][]>();
  for (const r of rows) {
    if (!c.levels.includes(r[c.region.code]) || c.others.some(o => r[o.attr] !== '')) continue;
    const v = num(r[c.value]); if (Number.isNaN(v)) continue;
    (m.get(r[c.region.attr]) || m.set(r[c.region.attr], []).get(r[c.region.attr])!).push([r[c.time], v]);
  }
  for (const l of m.values()) l.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return (key, time) => {
    const day = /^\d{4}-\d\d-\d\d$/.test(time) ? time : `${time.slice(0, 4)}-12-31`;
    let best: number | undefined;
    for (const [t, v] of m.get(key) || []) if (t <= day) best = v;
    return best;
  };
}
