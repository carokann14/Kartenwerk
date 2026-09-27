// Zeitachse: Datensätze mit mehreren Perioden (Regionaldatenbank). Die Zeilen des Datensatzes selbst gehören zur
// neuesten Periode; eine andere Periode wird als eigene, zwischengespeicherte Fassung des Datensatzes gebildet, damit
// Farbregeln, Summen auf gröbere Ebenen, Beschriftungen und Blasen unverändert funktionieren.
import type { Dataset } from './types';

/** „2025-12-31“ → „31.12.2025“, „2025“ bleibt */
export function periodText(p: string): string {
  const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(p);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : p;
}
export const periodYear = (p: string): number => +(p.match(/\d{4}/)?.[0] || 0);
export const latestPeriod = (ds: Dataset): string | null => ds.time ? ds.time.periods[ds.time.periods.length - 1] : null;
/** Gewählte Periode eines Datensatzes (fehlt oder unbekannt: die neueste) */
export function selectedPeriod(sel: Record<string, string> | undefined, ds: Dataset): string | null {
  if (!ds.time) return null;
  const p = sel?.[ds.id];
  return p && ds.time.byPeriod[p] ? p : latestPeriod(ds);
}
const cache = new WeakMap<Dataset, Map<string, Dataset>>();
/** Datensatz mit den Zeilen einer Periode (gleiche Kennung, Spalten und Gruppen) */
export function atPeriod(ds: Dataset, p: string | null | undefined): Dataset {
  if (!ds.time || !p || p === latestPeriod(ds) || !ds.time.byPeriod[p]) return ds;
  let m = cache.get(ds); if (!m) { m = new Map(); cache.set(ds, m); }
  const hit = m.get(p); if (hit) return hit;
  const r = ds.time.byPeriod[p];
  const out: Dataset = { ...ds, rows: r.rows, rowKey: r.rowKey, rowArea: r.rowArea, joint: undefined, alias: undefined, period: p };
  m.set(p, out);
  return out;
}
/** Periode, die zu einem Datensatz gehört (Zeitreihe) – für Titel, Quellenzeile und Hinweise */
export const periodOf = (ds: Dataset): string | null => (ds.time ? ds.period || latestPeriod(ds) : null);
/** Standard-Vergleich für „Veränderung“: 10 Jahre vor der neuesten Periode, sonst die älteste */
export function defaultComparePeriod(ds: Dataset, from?: string | null): string | null {
  if (!ds.time || ds.time.periods.length < 2) return null;
  const ps = ds.time.periods, a = from || ps[ps.length - 1], y = periodYear(a) - 10;
  const older = ps.filter(p => p < a);
  return older.find(p => periodYear(p) === y) || older.filter(p => periodYear(p) >= y)[0] || older[0] || null;
}
