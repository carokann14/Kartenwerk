// Grenzen anderer Ebenen einblenden (Wahlkreise über Gemeinden, Kreise über Wahlkreisen …)
import { GEO } from '../geo/geo';
import { uid } from '../lib/util';
import { loadGeoSets } from './actions';
import { getDoc, setUI, toast, update } from './store';
import type { Overlay } from './types';

/** Voreinstellung je Ebene: Wahlkreise gestrichelt, Verwaltungsgrenzen durchgezogen */
export function overlayDefaults(geoSet: string): Omit<Overlay, 'id' | 'geoSet'> {
  const lv = GEO[geoSet]?.meta.level || '';
  if (lv === 'custom') return { color: '#16181B', width: 2, dash: false, visible: true, legend: false };
  if (lv === 'btw-wk') return { color: '#16181B', width: 1.4, dash: true, visible: true, legend: true };
  if (lv === 'gem') return { color: '#FFFFFF', width: 0.4, dash: false, visible: true, legend: false };
  if (lv === 'vwg') return { color: '#5A5F66', width: 0.8, dash: false, visible: true, legend: true };
  if (lv === 'rbz') return { color: '#16181B', width: 1.8, dash: false, visible: true, legend: true };
  return { color: '#16181B', width: 1.1, dash: false, visible: true, legend: true };
}
export async function toggleOverlay(geoSet: string) {
  const d = getDoc(), cur = d.overlays.find(o => o.geoSet === geoSet);
  if (cur) { update(x => { x.overlays = x.overlays.filter(o => o.id !== cur.id); }); return; }
  if (!(await loadGeoSets([geoSet]))) return;
  const o: Overlay = { id: uid('ov'), geoSet, ...overlayDefaults(geoSet) };
  update(x => { x.overlays.push(o); });
  toast('Grenzen eingeblendet: ' + GEO[geoSet].meta.label);
}
export function updateOverlay(id: string, patch: Partial<Overlay>, key?: string) {
  update(d => { const o = d.overlays.find(x => x.id === id); if (o) Object.assign(o, patch); }, key ? { key } : {});
}
export function removeOverlay(id: string) {
  update(d => { d.overlays = d.overlays.filter(o => o.id !== id); });
  setUI({ sel: { kind: 'layer', id: 'wk' } });
}
export { overlayName } from '../render/scene';
