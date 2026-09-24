// Abgeleitete Werte: stärkste Spalte einer Gruppe, Anteil, Vorsprung
import type { Dataset, Group } from './types';

export interface GroupRow { share: (number | null)[]; total: number | null; win: number; second: number; winShare: number | null; margin: number | null }
const cache = new WeakMap<Dataset, Map<string, GroupRow[]>>();

export function groupMetrics(ds: Dataset, g: Group): GroupRow[] {
  let m = cache.get(ds); if (!m) { m = new Map(); cache.set(ds, m); }
  const hit = m.get(g.id); if (hit) return hit;
  const idx = g.columns.map(id => ds.columns.findIndex(c => c.id === id));
  const tIdx = g.total ? ds.columns.findIndex(c => c.id === g.total) : -1;
  const out = ds.rows.map(r => {
    const vals = idx.map(i => (typeof r[i] === 'number' ? r[i] as number : null));
    const sum = vals.reduce<number>((s, v) => s + (v ?? 0), 0);
    const total = tIdx >= 0 && typeof r[tIdx] === 'number' && (r[tIdx] as number) > 0 ? r[tIdx] as number : (sum > 0 ? sum : null);
    const share = vals.map(v => (v == null || total == null) ? null : 100 * v / total);
    let win = -1, second = -1;
    vals.forEach((v, k) => { if (v == null) return; if (win < 0 || v > vals[win]!) { second = win; win = k; } else if (second < 0 || v > vals[second]!) second = k; });
    const winShare = win >= 0 ? share[win] : null;
    const margin = win >= 0 && second >= 0 && share[win] != null && share[second] != null ? share[win]! - share[second]! : null;
    return { share, total, win, second, winShare, margin };
  });
  m.set(g.id, out);
  return out;
}
/** Anteil einer Partei (Schlüssel) innerhalb einer Gruppe; mehrere Spalten (CDU+CSU) werden summiert. */
export function partyShare(ds: Dataset, g: Group, row: number, key: string): number | null {
  const gm = groupMetrics(ds, g)[row];
  let s: number | null = null;
  g.columns.forEach((id, k) => {
    const c = ds.columns.find(x => x.id === id);
    if (c?.party === key && gm.share[k] != null) s = (s ?? 0) + gm.share[k]!;
  });
  return s;
}
export const colIndex = (ds: Dataset, id: string) => ds.columns.findIndex(c => c.id === id);
const rowIdxCache = new WeakMap<Dataset, Map<string, number>>();
export function areaRowIndex(ds: Dataset): Map<string, number> {
  const hit = rowIdxCache.get(ds); if (hit) return hit;
  const m = new Map<string, number>();
  ds.rowArea.forEach((a, i) => { if (a && !m.has(a)) m.set(a, i); });
  if (ds.alias) for (const [a, host] of Object.entries(ds.alias)) { const r = m.get(host); if (r != null && !m.has(a)) m.set(a, r); }
  rowIdxCache.set(ds, m);
  return m;
}
