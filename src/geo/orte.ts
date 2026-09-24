// Ortssuche über das Gemeindeverzeichnis (wird beim ersten Suchen nachgeladen)
import { loadJSON } from '../lib/assets';
import { norm } from '../lib/util';

export interface Ort { ags: string; name: string; short: string; kreis: string; x: number; y: number; ew: number; typ: number }
interface Raw { meta: { attribution: string; stand: string; kreise: Record<string, string> }; rows: [string, string, number, number, number, number][] }
let data: { list: Ort[]; keys: string[]; attribution: string; stand: string } | null = null;
let loading: Promise<void> | null = null;

export const shortName = (name: string) => name.split(',')[0].trim();
export function loadOrte(): Promise<void> {
  if (data) return Promise.resolve();
  if (!loading) loading = loadJSON<Raw>('data/orte.json').then(r => {
    const list = r.rows.map(([ags, name, x, y, ew, typ]) => ({ ags, name, short: shortName(name), kreis: r.meta.kreise[ags.slice(0, 5)] || '', x, y, ew, typ }));
    data = { list, keys: list.map(o => norm(o.short)), attribution: r.meta.attribution, stand: r.meta.stand };
  });
  return loading;
}
export const orteReady = () => !!data;
export const orteAttribution = () => data ? `Gemeindeverzeichnis ${data.stand}, ${data.attribution}` : 'Gemeindeverzeichnis, © Statistisches Bundesamt (Destatis)';
/** Treffer: Anfang des Namens vor enthaltenem Namen, dann nach Einwohnerzahl (die Liste ist danach sortiert). AGS ebenfalls. */
export function searchOrte(q: string, limit = 8): Ort[] {
  if (!data) return [];
  const k = norm(q.trim()); if (k.length < 2) return [];
  const byAgs = /^\d{5,8}$/.test(k) ? data.list.filter(o => o.ags.startsWith(k)) : [];
  const pre: Ort[] = [], mid: Ort[] = [];
  for (let i = 0; i < data.list.length && pre.length < limit; i++) {
    const key = data.keys[i];
    if (key.startsWith(k)) pre.push(data.list[i]); else if (mid.length < limit && key.includes(k)) mid.push(data.list[i]);
  }
  return [...byAgs, ...pre, ...mid].slice(0, limit);
}
