// Eigene Gebiete: Einteilungen anlegen, Regionen aus Bausteinen bilden, als Karte zeigen
import type { Draft } from 'immer';
import { GEO, GeoSet } from '../geo/geo';
import { EG, isCustom } from '../geo/regions';
import { UG } from '../geo/userGeo';
import { relateIds } from '../geo/relate';
import { uid } from '../lib/util';
import { refit, setGeoSet } from './actions';
import { getDoc, setUI, toast, update } from './store';
import type { Doc, Overlay, RegionSet } from './types';

const PLURAL: Record<string, string> = { 'btw-wk': 'Wahlkreise', lan: 'Länder', rbz: 'Bezirke', krs: 'Kreise', vwg: 'Verbände', gem: 'Gemeinden' };
export const baseLabel = (rs: RegionSet) => { const m = GEO[rs.base]?.meta; return m ? (PLURAL[m.level] || m.levelLabel) + (m.stand ? ' ' + m.stand.slice(-4) : ' ' + m.year) : rs.base; };
const nextNr = (rs: RegionSet) => String(rs.regions.reduce((m, r) => Math.max(m, /^\d+$/.test(r.id) ? +r.id : 0), 0) + 1);
const find = (d: Draft<Doc>, id: string) => d.regions.find(r => r.id === id);
const regionOverlay = (id: string): Overlay => ({ id: uid('ov'), geoSet: EG + id, color: '#16181B', width: 2, dash: false, visible: true, legend: false });

/** Bausteine (Kennungen im Gebietsstand der Einteilung) aus Gebieten der aktuellen Karte */
export function toMembers(rs: RegionSet, fromGeo: string, ids: string[]): string[] {
  const base = GEO[rs.base], from = GEO[fromGeo]; if (!base || !from) return [];
  if (fromGeo === rs.base) return ids.filter(id => base.byId.has(id));
  const idx = ids.map(id => from.byId.get(id)).filter((x): x is number => x != null);
  return relateIds(from, idx, base).map(i => base.areas[i].id);
}
const sortIds = (g: GeoSet | undefined, ids: string[]) => g ? [...ids].sort((a, b) => (g.byId.get(a) ?? 0) - (g.byId.get(b) ?? 0)) : ids;

/** Neue Einteilung auf dem Gebietsstand `base`; Grenzen der Regionen werden über der Karte eingeblendet */
export function newDivision(base: string, name?: string): string {
  const d0 = getDoc();
  const id = uid('eg').slice(3);
  const n = d0.regions.length + 1;
  const rs: RegionSet = { id, name: name || (n > 1 ? `Eigene Gebiete ${n}` : 'Eigene Gebiete'), base, regions: [], rest: false, restName: 'Übriges Gebiet' };
  update(d => {
    d.regions.push(rs);
    if (d.geoSet === base) d.overlays.push(regionOverlay(id));
  });
  setUI({ regionEdit: id });
  return id;
}
/** Region aus Gebieten anlegen; die Bausteine verlassen dabei andere Regionen derselben Einteilung */
export function addRegion(rsId: string, name: string, members: string[]) {
  let nr = '';
  update(d => {
    const rs = find(d, rsId); if (!rs) return;
    const S = new Set(members);
    for (const r of rs.regions) r.members = r.members.filter(m => !S.has(m));
    nr = nextNr(rs);
    rs.regions.push({ id: nr, name: name.trim() || 'Region ' + nr, members: sortIds(GEO[rs.base], members) });
  });
  toast(`Region „${name.trim() || 'Region ' + nr}“ angelegt (${members.length})`);
  return nr;
}
export function assignMembers(rsId: string, regionId: string, members: string[]) {
  update(d => {
    const rs = find(d, rsId); if (!rs) return;
    const S = new Set(members);
    for (const r of rs.regions) if (r.id !== regionId) r.members = r.members.filter(m => !S.has(m));
    const r = rs.regions.find(x => x.id === regionId); if (!r) return;
    r.members = sortIds(GEO[rs.base], [...new Set([...r.members, ...members])]);
  });
}
export function unassignMembers(rsId: string, members: string[]) {
  const S = new Set(members);
  update(d => { const rs = find(d, rsId); if (!rs) return; for (const r of rs.regions) r.members = r.members.filter(m => !S.has(m)); });
}
export function renameRegion(rsId: string, regionId: string, name: string) {
  update(d => { const r = find(d, rsId)?.regions.find(x => x.id === regionId); if (r) r.name = name; }, { key: 'rn-' + rsId + regionId });
}
export function removeRegion(rsId: string, regionId: string) {
  update(d => {
    const rs = find(d, rsId); if (!rs) return;
    rs.regions = rs.regions.filter(r => r.id !== regionId);
    const k = EG + rsId + ':' + regionId; delete d.overrides[k]; delete d.hatchAssign[k];
    if (d.geoSet === EG + rsId) {
      if (d.fokus.kind === 'area' && d.fokus.id === regionId) d.fokus = { kind: 'de' };
      if (d.fokus.kind === 'custom') { d.fokus.ids = d.fokus.ids.filter(x => x !== regionId); if (!d.fokus.ids.length) d.fokus = { kind: 'de' }; }
    }
  });
  setUI({ sel: { kind: 'graphic' } });
}
export function updateDivision(rsId: string, patch: Partial<Pick<RegionSet, 'name' | 'rest' | 'restName'>>, key?: string) {
  update(d => {
    const rs = find(d, rsId); if (!rs) return;
    const oldName = rs.name;
    Object.assign(rs, patch);
    if (d.geoSet !== EG + rsId) return;
    const all = d.fokus.kind === 'de' || (d.fokus.kind === 'custom' && d.fokus.label === oldName);
    // Fokus „alle Regionen“ mitführen: mit übrigem Gebiet ganz Deutschland, sonst nur die Regionen
    if ('rest' in patch && all) { const ids = rs.regions.filter(r => r.members.length).map(r => r.id); d.fokus = rs.rest || !ids.length ? { kind: 'de' } : ids.length === 1 ? { kind: 'area', id: ids[0] } : { kind: 'custom', ids, label: rs.name }; refit(d); }
    else if ('name' in patch && d.fokus.kind === 'custom' && d.fokus.label === oldName) d.fokus.label = rs.name;
  }, key ? { key } : {});
}
/** Einteilung löschen; zeigt die Karte gerade die Regionen, wechselt sie zu den Bausteinen */
export async function removeDivision(rsId: string) {
  const d0 = getDoc(), rs = d0.regions.find(r => r.id === rsId); if (!rs) return;
  if (d0.geoSet === EG + rsId) await setGeoSet(rs.base);
  update(d => {
    d.regions = d.regions.filter(r => r.id !== rsId);
    d.overlays = d.overlays.filter(o => o.geoSet !== EG + rsId);
    for (const k of Object.keys(d.overrides)) if (k.startsWith(EG + rsId + ':')) delete d.overrides[k];
    for (const k of Object.keys(d.hatchAssign)) if (k.startsWith(EG + rsId + ':')) delete d.hatchAssign[k];
  });
  setUI({ regionEdit: null });
  toast(`„${rs.name}“ gelöscht`);
}
/** Regionen als Karte zeigen: Daten der Bausteine werden je Region summiert */
export async function showDivision(rsId: string, onlyRegions = true) {
  const d0 = getDoc(), rs = d0.regions.find(r => r.id === rsId); if (!rs) return;
  const g = GEO[EG + rsId];
  const ids = g ? g.all.filter(i => !g.areas[i].free).map(i => g.areas[i].id) : [];
  const fokus = onlyRegions && g && ids.length && ids.length < g.areas.length ? { kind: 'custom' as const, ids, label: rs.name } : { kind: 'de' as const };
  await setGeoSet(EG + rsId, { fokus: ids.length === 1 ? { kind: 'area', id: ids[0] } : fokus });
}
/** Zurück zu den Bausteinen, Regionsgrenzen darüber */
export async function editDivision(rsId: string) {
  const d0 = getDoc(), rs = d0.regions.find(r => r.id === rsId); if (!rs) return;
  if (d0.geoSet !== rs.base) await setGeoSet(rs.base);
  if (!getDoc().overlays.some(o => o.geoSet === EG + rsId)) update(d => { d.overlays.push(regionOverlay(rsId)); });
  setUI({ regionEdit: rsId });
}
export const customOptions = (doc: Doc) => [
  ...(doc.geodata || []).filter(u => GEO[UG + u.id]).map(u => ({ id: UG + u.id, label: u.label, base: '', sub: `${u.raw.areas.length.toLocaleString('de-DE')} ${u.levelLabel}`, kind: 'import' as const })),
  ...doc.regions.filter(rs => GEO[EG + rs.id]).map(rs => ({ id: EG + rs.id, label: rs.name, base: rs.base, sub: baseLabel(rs), kind: 'region' as const })),
];
export const divisionsFor = (doc: Doc, geoId: string) => doc.regions.filter(r => r.base === geoId);
export const currentDivision = (doc: Doc) => isCustom(doc.geoSet) ? doc.regions.find(r => EG + r.id === doc.geoSet) || null : null;
