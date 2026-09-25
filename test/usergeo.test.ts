// Geodaten-Import: dieselben 12 Berliner Wahlkreise als Shapefile (UTM33, ZIP), GeoJSON (WGS84), KML und GeoPackage (UTM32)
// → gleicher Gebietsstand wie das Original (Flächen, Nachbarn, Land, Beschriftung innen)
import fs from 'node:fs';
import { DOMParser as XmlDOMParser } from '@xmldom/xmldom';
import { GEO, setFromRaw } from '../src/geo/geo';
import { readGeoFiles } from '../src/geo/readers';
import { buildUserGeo } from '../src/geo/buildUserGeo';
import { crsFromCode, crsFromWkt, guessCrs } from '../src/geo/crs';
import { pointInArea } from '../src/geo/relate';
import { userMeta } from '../src/geo/userGeo';
const ok = (c: boolean, m: string) => { console.log((c ? 'ok: ' : 'FEHLER: ') + m); if (!c) process.exitCode = 1; };
(globalThis as unknown as { DOMParser: unknown }).DOMParser = XmlDOMParser;
const raw = JSON.parse(fs.readFileSync('public/data/btw-wk-2025.json', 'utf8'));
GEO['btw-wk-2025'] = setFromRaw({ ...raw.meta, showNr: true }, raw);
const orig = GEO['btw-wk-2025'], berlin = orig.byBl['11'];
const buf = (p: string) => { const b = fs.readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const cases: [string, string[]][] = [['Shapefile-ZIP (UTM33)', ['/tmp/ug/berlin_shp.zip']], ['Shapefile lose Dateien', ['/tmp/ug/berlin_utm33.shp', '/tmp/ug/berlin_utm33.dbf', '/tmp/ug/berlin_utm33.prj']], ['GeoJSON (WGS84)', ['/tmp/ug/berlin_wgs84.geojson']], ['KML', ['/tmp/ug/berlin.kml']], ['GeoPackage (UTM32)', ['/tmp/ug/berlin.gpkg']]];
for (const [name, files] of cases) {
  const t0 = Date.now();
  const layers = await readGeoFiles(files.map(p => ({ name: p.split('/').pop()!, buf: buf(p) })));
  const L = layers[0];
  const crs = crsFromWkt(L.wkt) || crsFromCode(L.code) || guessCrs(L.bbox, L.file).crs;
  const idF = L.fields.find(f => /WK_NR/i.test(f)) || (L.format === 'KML' ? null : null), nameF = L.fields.find(f => /WK_NAME|^name$/i.test(f)) || null;
  const { raw: r, report } = buildUserGeo(L, { crs, idField: idF || null, nameField: nameF, tol: 0 });
  const g = setFromRaw(userMeta('ug:t', 'Test', 'Wahlkreise', 'Test', '', r.keyLen, 2025), r);
  const sumA = g.areas.reduce((s, a) => s + a.area, 0), sumO = berlin.reduce((s, i) => s + orig.areas[i].area, 0);
  const nb = g.areas.reduce((s, a) => s + a.nb.length, 0), nbO = berlin.reduce((s, i) => s + orig.areas[i].nb.filter(j => orig.areas[j].bl === '11').length, 0);
  const inside = g.areas.every(a => pointInArea(g, a.i, a.label));
  console.log(`— ${name}: ${L.format}, ${L.features.length} Zeilen, Felder ${L.fields.join(',')}, KS ${crs.id}, ${report.areas} Gebiete, ${report.points} Punkte, ${(report.bytes / 1024).toFixed(1)} KB, ${Date.now() - t0} ms`);
  ok(report.areas === 12, `${name}: 12 Gebiete`);
  ok(Math.abs(sumA - sumO) / sumO < 0.002, `${name}: Fläche ${sumA.toFixed(1)} km² (Original ${sumO.toFixed(1)})`);
  ok(nb === nbO, `${name}: Nachbarschaften ${nb} (Original ${nbO}) → gemeinsame Grenzen erkannt`);
  ok(g.areas.every(a => a.bl === '11'), `${name}: alle in Berlin (Land 11)`);
  ok(inside, `${name}: Beschriftungspunkte liegen innen`);
  if (idF) ok(!!r.keyLen && g.byId.has('075'), `${name}: Kennungen mit führender Null behalten („075“), keyLen ${r.keyLen}`);
  const r2 = buildUserGeo(L, { crs, idField: idF || null, nameField: nameF, tol: 3 });
  ok(r2.report.points < report.points && r2.report.areas === 12, `${name}: Vereinfachung 30 m: ${r2.report.points} statt ${report.points} Punkte`);
}
