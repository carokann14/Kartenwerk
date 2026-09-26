// Kartenwerk – Landtagswahlkreise der Länder (Katalog in src/data/ltw.ts)
//   npm run ltw            alle Einträge des Katalogs
//   npm run ltw -- mv      nur ein Land
// Quelle je Land: eine Geodatei in data-src/ltw/<land>-<jahr>/ (Shapefile als ZIP u. a.) oder – wo es keine eigene Datei
// braucht (Saarland, Bremen) – Kreise/Gemeinden der Verwaltungsgrenzen (public/data/vg250-2026.json), zusammengefasst.
// Optional eine gröbere Ebene aus den Wahlkreisen (Bayern: Stimmkreise → Wahlkreise), auf derselben Topologie.
// Schreibt public/data/ltw-<land>-<jahr>.json und die Einträge in index.json.
import fs from 'node:fs';
import polylabel from 'polylabel';
import { GEO, Pt, RawArea, mergedArcRings, ringsToPolys, setFromRaw } from '../src/geo/geo';
import type { GeoLayer } from '../src/geo/readers';
import { readGeoFiles } from '../src/geo/readers';
import { buildUserGeo } from '../src/geo/buildUserGeo';
import { crsFromCode, crsFromWkt } from '../src/geo/crs';
import { gridToUtm } from '../src/geo/proj';
import { userMeta } from '../src/geo/userGeo';
import { LTW, LtwEntry, ltwGroupId, ltwLevel, ltwSetId } from '../src/data/ltw';

const SRC = 'data-src/ltw', OUT = 'public/data';
const buf = (p: string) => { const b = fs.readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
// Land über den Beschriftungspunkt (Bundestagswahlkreise 2025) – nur zur Prüfung, gesetzt wird das Land des Katalogs
const wkRaw = JSON.parse(fs.readFileSync(OUT + '/btw-wk-2025.json', 'utf8'));
GEO['btw-wk-2025'] = setFromRaw({ ...wkRaw.meta, showNr: true }, wkRaw);

type G = ReturnType<typeof setFromRaw>;
const ptsOf = (g: G, r: number[]) => { const pts: Pt[] = []; for (const ai of r) { const a = ai >= 0 ? g.arcs[ai] : g.arcs[~ai].slice().reverse(); for (let i = pts.length ? 1 : 0; i < a.length; i++) pts.push(a[i]); } return pts; };
const ringArea = (pts: Pt[]) => { let s = 0; for (let i = 0, n = pts.length; i < n; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n]; s += x1 * y2 - x2 * y1; } return Math.abs(s / 2); };

/** Flächen aus den Verwaltungsgrenzen zusammensetzen und als Geodatei-Ebene (UTM 32) ausgeben */
let vgFile: { meta: unknown; arcs: number[][]; levels: Record<string, { areas: RawArea[] }> } | null = null;
function layerFromVg(e: LtwEntry): GeoLayer {
  const fv = e.geo.fromVg!;
  vgFile ||= JSON.parse(fs.readFileSync(OUT + '/vg250-2026.json', 'utf8'));
  const g = setFromRaw(userMeta('vg', 'vg', 'vg', '', '', undefined, 2026), { arcs: vgFile!.arcs, areas: vgFile!.levels[fv.level].areas });
  const features = fv.parts.map(p => {
    const idx = p.members.map(m => { const i = g.byId.get(m); if (i == null) throw new Error(`${ltwSetId(e)}: ${fv.level} ${m} fehlt`); return i; });
    const polys = ringsToPolys(g, mergedArcRings(g, idx)).map(poly => poly.map(r => ptsOf(g, r).map(pt => gridToUtm(pt as [number, number]))));
    return { props: { __id: p.id, __name: p.name } as Record<string, string>, polys };
  });
  return { name: ltwSetId(e), file: 'vg250-2026.json', format: 'vg', fields: ['__id', '__name'], features: features as never, skipped: { other: 0, empty: 0 }, wkt: null, code: 'EPSG:25832', bbox: [0, 0, 0, 0] };
}

const only = process.argv.slice(2);
const main = async () => {
  const idxFile = OUT + '/index.json', idx = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
  for (const e of LTW.filter(x => !only.length || only.includes(x.code))) {
    const id = ltwSetId(e), dir = `${SRC}/${e.code}-${e.year}`;
    let L: GeoLayer | undefined;
    if (e.geo.fromVg) L = layerFromVg(e);
    else {
      const layers = await readGeoFiles([{ name: e.geo.file!, buf: buf(`${dir}/${e.geo.file}`) }]);
      const lay = e.geo.layer?.toLowerCase();
      L = lay ? layers.find(x => x.name.toLowerCase() === lay || x.name.toLowerCase().endsWith('/' + lay)) : layers[0];
      if (!L) throw new Error(`${id}: Ebene ${e.geo.layer} nicht gefunden (${layers.map(x => x.name).join(', ')})`);
      // Kennung und Name nach Katalog ableiten (etwa Rheinland-Pfalz: Nummer aus 26_IDEN)
      for (const f of L.features) { f.props.__id = e.geo.id ? e.geo.id(f.props) : f.props[e.geo.idField!]; f.props.__name = e.geo.name ? e.geo.name(f.props) : f.props[e.geo.nameField!]; }
    }
    const crs = e.geo.fromVg ? crsFromCode('EPSG:25832') : (e.geo.crs ? crsFromCode(e.geo.crs) : null) || crsFromWkt(L.wkt) || crsFromCode(L.code); if (!crs) throw new Error(`${id}: Koordinatensystem nicht erkannt`);
    const { raw, report } = buildUserGeo(L, { crs, idField: '__id', nameField: '__name', tol: e.geo.fromVg ? 0 : e.geo.tol ?? (e.count > 100 ? 2 : 1) });
    const wrongBl = raw.areas.filter(a => a.bl !== e.bl).map(a => a.id);
    for (const a of raw.areas) { a.bl = e.bl; a.name = a.name.replace(/\s+/g, ' ').trim(); }
    raw.areas.sort((a, b) => (a.nr ?? 0) - (b.nr ?? 0));
    const lvLabel = e.levelLabel || 'Landtagswahlkreise';
    console.log(`${id}: ${report.areas} ${lvLabel} aus ${report.features} Flächen (KS ${crs.id}), ${report.points} Punkte` + (report.merged.length ? `, zusammengefasst ${report.merged.join(' ')}` : '') + (wrongBl.length ? `, Mittelpunkt außerhalb des Landes: ${wrongBl.join(' ')}` : ''));
    if (raw.areas.length !== e.count) throw new Error(`${id}: ${raw.areas.length} statt ${e.count} ${lvLabel}`);
    if (e.geo.seq !== false) {
      const nums = raw.areas.map(a => a.nr).join(','), want = Array.from({ length: e.count }, (_, k) => k + 1).join(',');
      if (nums !== want) throw new Error(`${id}: Nummern nicht 1…${e.count}: ${nums}`);
    }
    const meta = { election: e.election, year: e.year, attribution: e.geo.attribution, source: e.geo.source, grid: 10, origin: [-120000, 6502000], crs: 'EPSG:25832' };
    const label = `${lvLabel} ${e.land} ${e.year}`;
    const levels: Record<string, unknown> = { wk: { level: ltwLevel(e), levelLabel: lvLabel, label, showNr: e.showNr !== false, areas: raw.areas } };
    const entries = [{ id, label, level: ltwLevel(e), levelLabel: lvLabel, election: e.election, year: e.year, part: 'wk', lazy: true, count: raw.areas.length, region: e.land }];
    let parents: string[] | undefined, krFrom: string | undefined;
    // gröbere Ebene aus den Wahlkreisen (Bayern: Stimmkreise → Wahlkreise = Regierungsbezirke)
    if (e.group) {
      const gr = e.group, gid = ltwGroupId(e);
      const Gs = setFromRaw(userMeta(id, id, id, '', '', undefined, e.year), raw);
      const members = new Map<string, number[]>();
      for (const a of Gs.areas) { const k = gr.key(a.id); (members.get(k) || members.set(k, []).get(k)!).push(a.i); (raw.areas[a.i] as RawArea & { p?: string[] }).p = [k]; }
      const out: RawArea[] = [];
      for (const [k, m] of [...members].sort((x, y) => x[0].localeCompare(y[0]))) {
        const rings = mergedArcRings(Gs, m);
        let best: number[] | null = null, bestA = -1, sa = 0;
        for (const i of m) sa += Gs.areas[i].area;
        for (const r of rings) { const A = ringArea(ptsOf(Gs, r)); if (A > bestA) { bestA = A; best = r; } }
        const lp = polylabel([ptsOf(Gs, best!)] as unknown as number[][][], Math.max(1, Math.sqrt(bestA) / 60));
        out.push({ id: k, nr: Number(k), name: gr.names[k] || k, bl: e.bl, area: Math.round(sa * 1000) / 1000, label: [Math.round(lp[0]), Math.round(lp[1])], polys: ringsToPolys(Gs, rings) });
      }
      if (out.length !== Object.keys(gr.names).length) throw new Error(`${gid}: ${out.length} statt ${Object.keys(gr.names).length} ${gr.levelLabel}`);
      console.log(`  ${gid}: ${out.length} ${gr.levelLabel} (aus ${lvLabel} zusammengesetzt)`);
      levels[gr.part] = { level: ltwLevel(e) + '-' + gr.part, levelLabel: gr.levelLabel, label: `${gr.levelLabel} ${e.land} ${e.year}`, showNr: false, areas: out };
      entries.push({ id: gid, label: `${gr.levelLabel} ${e.land} ${e.year}`, level: ltwLevel(e) + '-' + gr.part, levelLabel: gr.levelLabel, election: e.election, year: e.year, part: gr.part, lazy: true, count: out.length, region: e.land });
      parents = [gid]; krFrom = gid;
    }
    const strip = (a: RawArea) => { const { nb: _nb, ...r } = a; void _nb; return r; };
    for (const L2 of Object.values(levels) as { areas: RawArea[] }[]) L2.areas = L2.areas.map(strip);
    const file = `${id}.json`;
    fs.writeFileSync(`${OUT}/${file}`, JSON.stringify({ meta, ...(parents ? { parents, krFrom } : {}), arcs: raw.arcs, levels }));
    console.log(`  ${OUT}/${file}`, (fs.statSync(`${OUT}/${file}`).size / 1024).toFixed(0), 'KB');
    const ids = new Set(entries.map(x => x.id));
    idx.sets = idx.sets.filter((s: { id: string }) => !ids.has(s.id));
    for (const x of entries) idx.sets.push({ ...x, file });
  }
  fs.writeFileSync(idxFile, JSON.stringify(idx));
  console.log('index.json:', idx.sets.length, 'Gebietsstände');
};
main().catch(err => { console.error(err); process.exit(1); });
