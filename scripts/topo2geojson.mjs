// Übertragungsformat (Topologie, Bögen deltakodiert in q-Meter-Schritten, gzip) → GeoJSON in ETRS89 / UTM 32 (EPSG:25832)
// Aufruf: node scripts/topo2geojson.mjs eingabe.json.gz ausgabe.geojson
import fs from 'node:fs';
import zlib from 'node:zlib';
const [inp, out] = process.argv.slice(2);
const t = JSON.parse(zlib.gunzipSync(fs.readFileSync(inp)).toString('utf8'));
const q = t.q;
const arcs = t.arcs.map(d => { const p = []; let x = 0, y = 0; for (let i = 0; i < d.length; i += 2) { x += d[i]; y += d[i + 1]; p.push([x, y]); } return p; });
const arc = i => (i >= 0 ? arcs[i] : arcs[~i].slice().reverse());
const ring = ids => { const r = []; ids.forEach((i, k) => { const a = arc(i); r.push(...(k ? a.slice(1) : a)); }); return r.map(([x, y]) => [x * q, y * q]); };
const features = t.objs.map(o => ({ type: 'Feature', properties: o.p, geometry: o.t === 'Polygon' ? { type: 'Polygon', coordinates: o.a.map(ring) } : { type: 'MultiPolygon', coordinates: o.a.map(p => p.map(ring)) } }));
fs.writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::25832' } }, features }));
console.log(out, features.length, 'Flächen', arcs.reduce((a, b) => a + b.length, 0), 'Bogenpunkte');
