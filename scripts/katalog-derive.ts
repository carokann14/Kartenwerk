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
