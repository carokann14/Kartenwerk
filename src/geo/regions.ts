// Eigene Einteilungen als Gebietsstände „eg:<id>“ bereitstellen.
// Die Geometrie entsteht aus den Bausteinen (gleiche Topologie, keine eigene Datei) und wird
// neu berechnet, sobald sich die Einteilung ändert. Rückgängig/Wiederholen tauschen nur das Dokument,
// deshalb wird über den Inhalt zwischengespeichert, nicht über die Reihenfolge der Änderungen.
import { GEO, GeoSet, RegionDef, buildRegionSet } from './geo';
import type { Doc, RegionSet } from '../model/types';

export const EG = 'eg:';
export const isCustom = (id: string | null | undefined) => !!id && id.startsWith(EG);
export const customId = (rs: RegionSet) => EG + rs.id;

const byObj = new WeakMap<RegionSet, GeoSet>();
const bySig = new Map<string, GeoSet>();
// Geometrie hängt nur an Bausteinen und Restregel; Namen werden bei jedem Abgleich eingesetzt (Umbenennen baut nichts neu)
const sigOf = (rs: RegionSet) => JSON.stringify([rs.id, rs.base, rs.rest, rs.regions.map(r => [r.id, r.members])]);

/** Bausteine in Indizes übersetzen; ein Baustein gehört höchstens zu einer Region (die erste gewinnt) */
export function regionDefs(rs: RegionSet, base: GeoSet): RegionDef[] {
  const taken = new Uint8Array(base.areas.length);
  const defs: RegionDef[] = [];
  for (const r of rs.regions) {
    const m: number[] = [];
    for (const id of r.members) { const i = base.byId.get(id); if (i != null && !taken[i]) { taken[i] = 1; m.push(i); } }
    defs.push({ id: r.id, name: r.name, members: m });
  }
  const rest = base.all.filter(i => !taken[i]);
  if (rest.length) {
    if (rs.rest) defs.push({ id: 'rest', name: rs.restName || 'Übriges Gebiet', members: rest });
    else {
      // neutrale Restfläche je Land, damit die Landesgrenzen sichtbar bleiben
      const byBl = new Map<string, number[]>();
      for (const i of rest) { const bl = base.areas[i].bl, L = byBl.get(bl); if (L) L.push(i); else byBl.set(bl, [i]); }
      for (const [bl, m] of [...byBl].sort()) defs.push({ id: 'rest-' + bl, name: rs.restName || 'Übriges Gebiet', members: m, free: true });
    }
  }
  return defs;
}

export function regionGeo(rs: RegionSet): GeoSet | null {
  const base = GEO[rs.base]; if (!base) return null;
  let g = byObj.get(rs);
  if (!g) {
    const sig = sigOf(rs);
    g = bySig.get(sig);
    if (!g || g.arcs !== base.arcs) {
      g = buildRegionSet(customId(rs), rs.name, base, regionDefs(rs, base));
      if (bySig.size > 24) bySig.clear();
      bySig.set(sig, g);
    }
    byObj.set(rs, g);
  }
  // Namen einsetzen
  g.meta.label = rs.name;
  const names = new Map(rs.regions.map(r => [r.id, r.name]));
  for (const a of g.areas) (a as { name: string }).name = a.id === 'rest' || a.free ? rs.restName || 'Übriges Gebiet' : names.get(a.id) ?? a.name;
  return g;
}

/** Alle Einteilungen des Dokuments als Gebietsstände eintragen (schnell, wenn sich nichts geändert hat) */
export function syncRegions(doc: Doc | null | undefined) {
  if (!doc?.regions) return;
  for (const rs of doc.regions) { const g = regionGeo(rs); if (g) GEO[customId(rs)] = g; }
}
export const regionSetOf = (doc: Doc, geoId: string) => isCustom(geoId) ? doc.regions.find(r => EG + r.id === geoId) || null : null;
