// Kartenwerk – Landtagswahlkreise der Länder (Katalog in src/data/ltw.ts)
//   npm run ltw            alle Einträge des Katalogs
//   npm run ltw -- mv      nur ein Land
// Liest data-src/ltw/<land>-<jahr>/<Datei der Landesstelle> (Shapefile als ZIP u. a.) und schreibt
// public/data/ltw-<land>-<jahr>.json (eine Ebene, Topologie wie bei den übrigen Gebietsständen) sowie die Einträge in index.json.
import fs from 'node:fs';
import { GEO, setFromRaw } from '../src/geo/geo';
import { readGeoFiles } from '../src/geo/readers';
import { buildUserGeo } from '../src/geo/buildUserGeo';
import { crsFromWkt } from '../src/geo/crs';
import { LTW, ltwLevel, ltwSetId } from '../src/data/ltw';

const SRC = 'data-src/ltw', OUT = 'public/data';
const buf = (p: string) => { const b = fs.readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
// Land über den Beschriftungspunkt (Bundestagswahlkreise 2025) – nur zur Prüfung, gesetzt wird das Land des Katalogs
const wkRaw = JSON.parse(fs.readFileSync(OUT + '/btw-wk-2025.json', 'utf8'));
GEO['btw-wk-2025'] = setFromRaw({ ...wkRaw.meta, showNr: true }, wkRaw);

const only = process.argv.slice(2);
const main = async () => {
  const idxFile = OUT + '/index.json', idx = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
  for (const e of LTW.filter(x => !only.length || only.includes(x.code))) {
    const id = ltwSetId(e), dir = `${SRC}/${e.code}-${e.year}`;
    const layers = await readGeoFiles([{ name: e.geo.file, buf: buf(`${dir}/${e.geo.file}`) }]);
    const lay = e.geo.layer?.toLowerCase(), L = lay ? layers.find(x => x.name.toLowerCase() === lay || x.name.toLowerCase().endsWith('/' + lay)) : layers[0];
    if (!L) throw new Error(`${ltwSetId(e)}: Ebene ${e.geo.layer} nicht gefunden (${layers.map(x => x.name).join(', ')})`);
    // Kennung und Name nach Katalog ableiten (etwa Rheinland-Pfalz: Nummer aus 26_IDEN)
    for (const f of L.features) { f.props.__id = e.geo.id ? e.geo.id(f.props) : f.props[e.geo.idField]; f.props.__name = e.geo.name ? e.geo.name(f.props) : f.props[e.geo.nameField]; }
    const crs = crsFromWkt(L.wkt); if (!crs) throw new Error(`${id}: Koordinatensystem nicht erkannt`);
    const { raw, report } = buildUserGeo(L, { crs, idField: '__id', nameField: '__name', tol: e.count > 100 ? 2 : 1 });
    const wrongBl = raw.areas.filter(a => a.bl !== e.bl).map(a => a.id);
    for (const a of raw.areas) { a.bl = e.bl; a.name = a.name.replace(/\s+/g, ' ').trim(); }
    raw.areas.sort((a, b) => (a.nr ?? 0) - (b.nr ?? 0));
    console.log(`${id}: ${report.areas} Wahlkreise aus ${report.features} Flächen (KS ${crs.id}), ${report.points} Punkte` + (report.merged.length ? `, zusammengefasst ${report.merged.join(' ')}` : '') + (wrongBl.length ? `, Mittelpunkt außerhalb des Landes: ${wrongBl.join(' ')}` : ''));
    if (raw.areas.length !== e.count) throw new Error(`${id}: ${raw.areas.length} statt ${e.count} Wahlkreise`);
    const nums = raw.areas.map(a => a.nr).join(','), want = Array.from({ length: e.count }, (_, k) => k + 1).join(',');
    if (nums !== want) throw new Error(`${id}: Nummern nicht 1…${e.count}: ${nums}`);
    const meta = { election: e.election, year: e.year, attribution: e.geo.attribution, source: e.geo.source, grid: 10, origin: [-120000, 6502000], crs: 'EPSG:25832' };
    const out = { meta, arcs: raw.arcs, levels: { wk: { level: ltwLevel(e), levelLabel: 'Landtagswahlkreise', label: `Landtagswahlkreise ${e.land} ${e.year}`, showNr: true, areas: raw.areas.map(({ nb: _nb, ...r }) => r) } } };
    const file = `${id}.json`;
    fs.writeFileSync(`${OUT}/${file}`, JSON.stringify(out));
    console.log(`  ${OUT}/${file}`, (fs.statSync(`${OUT}/${file}`).size / 1024).toFixed(0), 'KB');
    idx.sets = idx.sets.filter((s: { id: string }) => s.id !== id);
    idx.sets.push({ id, label: out.levels.wk.label, level: ltwLevel(e), levelLabel: 'Landtagswahlkreise', election: e.election, year: e.year, file, part: 'wk', lazy: true, count: raw.areas.length, region: e.land });
  }
  fs.writeFileSync(idxFile, JSON.stringify(idx));
  console.log('index.json:', idx.sets.length, 'Gebietsstände');
};
main().catch(err => { console.error(err); process.exit(1); });
