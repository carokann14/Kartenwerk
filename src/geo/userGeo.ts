// Importierte Geodaten als Gebietsstände „ug:<id>“ bereitstellen. Die Geometrie liegt im Projekt (doc.geodata)
// und wird beim Öffnen einmal aufgebaut; umbenennen ändert nur die Anzeige.
import { GEO, GeoMeta, GeoSet, setFromRaw } from './geo';
import type { Doc, UserGeo } from '../model/types';

export const UG = 'ug:';
export const isUserGeo = (id: string | null | undefined) => !!id && id.startsWith(UG);
export const userGeoId = (u: UserGeo) => UG + u.id;

/** Meta-Angaben eines importierten Gebietsstands (Raster wie alle Ebenen: UTM 32, 10 m) */
export function userMeta(id: string, label: string, levelLabel: string, attribution: string, source: string, keyLen: number | undefined, year: number): GeoMeta {
  return { id, label, level: 'user', levelLabel, election: '', year, count: 0, attribution, source, grid: 10, origin: [-120000, 6502000], crs: 'EPSG:25832', ...(keyLen ? { keyLen } : {}), showNr: false };
}
const byRaw = new WeakMap<object, GeoSet>();
export function userGeoSet(u: UserGeo): GeoSet {
  let g = byRaw.get(u.raw);
  if (!g) { g = setFromRaw(userMeta(userGeoId(u), u.label, u.levelLabel, u.attribution, u.source, u.raw.keyLen, u.year), u.raw); byRaw.set(u.raw, g); }
  // Anzeige-Angaben können sich ändern, ohne dass die Geometrie neu gebaut wird
  g.meta.label = u.label; g.meta.levelLabel = u.levelLabel; g.meta.attribution = u.attribution; g.meta.source = u.source;
  return g;
}
/** Alle importierten Geodaten des Dokuments als Gebietsstände eintragen (schnell, wenn sich nichts geändert hat) */
export function syncUserGeo(doc: Doc | null | undefined) {
  if (!doc?.geodata) return;
  for (const u of doc.geodata) GEO[userGeoId(u)] = userGeoSet(u);
}
export const userGeoOf = (doc: Doc, geoId: string) => isUserGeo(geoId) ? doc.geodata.find(u => UG + u.id === geoId) || null : null;
/** Gebietsstände, die nicht aus einer Datei geladen werden (Regionen, importierte Geodaten) */
export const isVirtualGeo = (id: string | null | undefined) => !!id && (id.startsWith(UG) || id.startsWith('eg:'));
