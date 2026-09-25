// Importierte Geodaten im Projekt: anlegen, umbenennen, entfernen
import { Draft } from 'immer';
import { uid } from '../lib/util';
import { GEO } from '../geo/geo';
import { EG } from '../geo/regions';
import { UG } from '../geo/userGeo';
import { setGeoSet } from './actions';
import { getDoc, toast, update } from './store';
import type { Doc, UserGeo } from './types';

export async function addUserGeo(u: Omit<UserGeo, 'id' | 'created'>) {
  const id = uid('g'), entry: UserGeo = { ...u, id, created: new Date().toISOString() };
  update(d => { d.geodata.push(entry as Draft<UserGeo>); });
  await setGeoSet(UG + id, { fokus: { kind: 'de' } });
  toast(`„${u.label}“ übernommen · ${u.raw.areas.length.toLocaleString('de-DE')} ${u.levelLabel}`);
}
export function updateUserGeo(id: string, patch: Partial<Pick<UserGeo, 'label' | 'levelLabel' | 'attribution' | 'source'>>, key?: string) {
  update(d => { const u = d.geodata.find(x => x.id === id); if (u) Object.assign(u, patch); }, { key: key || 'ug-' + id });
}
/** Was hängt an einer importierten Ebene? (Datensätze, Einteilungen, Überlagerungen, aktuelle Karte) */
export function userGeoUsage(doc: Doc, id: string) {
  const gid = UG + id;
  return { current: doc.geoSet === gid, datasets: doc.datasets.filter(x => x.geoSet === gid).map(x => x.name), regions: doc.regions.filter(r => r.base === gid).map(r => r.name), overlays: doc.overlays.filter(o => o.geoSet === gid).length };
}
export async function removeUserGeo(id: string) {
  const gid = UG + id, d0 = getDoc(), u = d0.geodata.find(x => x.id === id); if (!u) return;
  const regionIds = d0.regions.filter(r => r.base === gid).map(r => EG + r.id);
  if (d0.geoSet === gid || regionIds.includes(d0.geoSet)) await setGeoSet('btw-wk-2025', { fokus: { kind: 'de' } });
  update(d => {
    d.geodata = d.geodata.filter(x => x.id !== id);
    d.datasets = d.datasets.filter(x => x.geoSet !== gid && !regionIds.includes(x.geoSet));
    d.regions = d.regions.filter(r => r.base !== gid);
    d.overlays = d.overlays.filter(o => o.geoSet !== gid && !regionIds.includes(o.geoSet));
    const c = d.color as { dataset?: string }; if (c.dataset && !d.datasets.some(x => x.id === c.dataset)) d.color = { mode: 'none' };
    if (d.bubbles && !d.datasets.some(x => x.id === d.bubbles!.dataset)) d.bubbles = null;
  });
  delete GEO[gid]; for (const r of regionIds) delete GEO[r];
  toast(`„${u.label}“ entfernt`);
}
