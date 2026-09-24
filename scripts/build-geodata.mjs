// Kartenwerk – Aufbereitung der Geodaten
// Liest die Quelldateien aus data-src/ und schreibt kompakte Topologien nach public/data/.
//   node scripts/build-geodata.mjs
// Quellen und Lizenzen: siehe DATENLIZENZEN.md
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import polylabel from 'polylabel';

const SRC = 'data-src', OUT = 'public/data', TMP = 'data-src/.tmp';
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });

// Gemeinsames Raster für alle Ebenen: ETRS89 / UTM 32N, 10 m, y nach unten
const GRID = 10, X0 = -120000, Y0 = 6502000;
const toGrid = ([x, y]) => [Math.round((x - X0) / GRID), Math.round((Y0 - y) / GRID)];
const deltaEnc = pts => { const r = []; let px = 0, py = 0; for (const [x, y] of pts) { r.push(x - px, y - py); px = x; py = y; } return r; };
const mapshaper = args => execFileSync(process.execPath, [path.resolve('node_modules/mapshaper/bin/mapshaper'), ...args], { stdio: ['ignore', 'ignore', 'inherit'] });

// Landeszuordnung der Wahlkreise 2021 aus der amtlichen Ergebnisdatei (Spalte „gehört zu“)
function blFromKerg2021() {
  const txt = fs.readFileSync('public/beispiele/btw2021_kerg.csv', 'utf8').replace(/^﻿/, '');
  const map = {};
  for (const line of txt.split(/\r?\n/)) {
    const c = line.split(';');
    const nr = Number(c[0]);
    if (/^\d{3}$/.test(c[0]) && nr >= 1 && nr <= 299 && /^\d{2}$/.test(c[2])) map[nr] = c[2];
  }
  return map;
}

const SETS = [
  {
    id: 'btw-wk-2025', file: 'wkr2025.geojson', year: 2025,
    label: 'Bundestagswahlkreise 2025', level: 'btw-wk', levelLabel: 'Bundestagswahlkreise', election: 'Bundestagswahl 2025',
    attribution: '© Die Bundeswahlleiterin, Statistisches Bundesamt, Wiesbaden 2024; Geoinformationen © GeoBasis-DE / BKG 2024 (dl-de/by-2-0)',
    source: 'https://www.bundeswahlleiterin.de/bundestagswahlen/2025/wahlkreiseinteilung/downloads.html',
    props: p => ({ nr: p.wkr_id, name: p.name, bl: p.bl }),
  },
  {
    id: 'btw-wk-2021', file: 'wkr2021.geojson', year: 2021,
    label: 'Bundestagswahlkreise 2021', level: 'btw-wk', levelLabel: 'Bundestagswahlkreise', election: 'Bundestagswahl 2021',
    attribution: '© Der Bundeswahlleiter, Wiesbaden 2020; Geoinformationen © GeoBasis-DE / BKG 2020 (dl-de/by-2-0)',
    source: 'https://www.bundeswahlleiterin.de/bundestagswahlen/2021/wahlkreiseinteilung/downloads.html',
    props: (p, bl) => ({ nr: p.id, name: p.name, bl: bl[p.id] }),
  },
];

function buildSet(S) {
  const tmp = path.join(TMP, S.id + '.topo.json');
  mapshaper([path.join(SRC, S.file), '-proj', 'EPSG:25832', '-simplify', 'interval=150', 'keep-shapes', '-o', 'format=topojson', 'quantization=100000', tmp]);
  const topo = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  const obj = topo.objects[Object.keys(topo.objects)[0]];
  const { scale: [sx, sy], translate: [tx, ty] } = topo.transform;
  const arcs = topo.arcs.map(arc => {
    let x = 0, y = 0; const pts = [];
    for (const [dx, dy] of arc) { x += dx; y += dy; const p = toGrid([x * sx + tx, y * sy + ty]); const q = pts[pts.length - 1]; if (!q || q[0] !== p[0] || q[1] !== p[1]) pts.push(p); }
    if (pts.length === 1) pts.push(pts[0].slice());
    return pts;
  });
  const ringCoords = ring => { const pts = []; for (const ai of ring) { const a = ai >= 0 ? arcs[ai] : arcs[~ai].slice().reverse(); for (let i = pts.length ? 1 : 0; i < a.length; i++) pts.push(a[i]); } return pts; };
  const ringArea = pts => { let s = 0; for (let i = 0, n = pts.length; i < n; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n]; s += x1 * y2 - x2 * y1; } return s / 2; };
  const bl = S.id === 'btw-wk-2021' ? blFromKerg2021() : null;
  const owners = arcs.map(() => []);
  const areas = obj.geometries.map((g, fi) => {
    const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs;
    let area = 0, best = null, bestA = -1;
    for (const poly of polys) {
      for (const ring of poly) for (const ai of ring) owners[ai >= 0 ? ai : ~ai].push(fi);
      const a = Math.abs(ringArea(ringCoords(poly[0])));
      let holes = 0; for (let k = 1; k < poly.length; k++) holes += Math.abs(ringArea(ringCoords(poly[k])));
      area += a - holes; if (a > bestA) { bestA = a; best = poly; }
    }
    const lp = polylabel(best.map(ringCoords), 20);
    const pr = S.props(g.properties, bl);
    if (!pr.bl) throw new Error(`${S.id}: kein Land für WK ${pr.nr}`);
    return { id: String(pr.nr), nr: pr.nr, name: pr.name, bl: pr.bl, area: Math.round(area * GRID * GRID / 1e6), label: [Math.round(lp[0]), Math.round(lp[1])], polys };
  });
  const arcOwner = owners.map(o => { const u = [...new Set(o)]; return [u[0], u.length > 1 ? u[1] : -1]; });
  const nb = areas.map(() => new Set());
  for (const [a, b] of arcOwner) if (b >= 0) { nb[a].add(b); nb[b].add(a); }
  const out = {
    meta: { id: S.id, label: S.label, level: S.level, levelLabel: S.levelLabel, election: S.election, year: S.year, count: areas.length, attribution: S.attribution, source: S.source, grid: GRID, origin: [X0, Y0], crs: 'EPSG:25832' },
    arcs: arcs.map(deltaEnc), arcOwner,
    areas: areas.map((a, i) => ({ ...a, nb: [...nb[i]] })),
  };
  fs.writeFileSync(path.join(OUT, S.id + '.json'), JSON.stringify(out));
  console.log(S.id, areas.length, 'Gebiete,', arcs.reduce((s, a) => s + a.length, 0), 'Punkte,', (fs.statSync(path.join(OUT, S.id + '.json')).size / 1024).toFixed(0), 'KB');
}

function buildContext() {
  const c = path.join(TMP, 'countries.json'), l = path.join(TMP, 'lakes.json');
  mapshaper([path.join(SRC, 'ne_10m_countries.geojson'), '-clip', 'bbox=-12,34,36,68', '-filter', 'ADM0_A3 != "DEU"', '-filter-fields', 'NAME_DE,ADM0_A3', '-proj', 'EPSG:25832', '-simplify', 'interval=900', 'keep-shapes', '-filter-slivers', 'min-area=20km2', '-o', 'format=geojson', 'precision=1', c]);
  mapshaper([path.join(SRC, 'ne_10m_lakes.geojson'), '-clip', 'bbox=4,46.5,16.5,56', '-filter', 'scalerank <= 8', '-filter-fields', 'name,name_de', '-proj', 'EPSG:25832', '-simplify', 'interval=300', 'keep-shapes', '-o', 'format=geojson', 'precision=1', l]);
  const enc = geom => (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates).map(poly => poly.map(r => deltaEnc(r.map(toGrid))));
  const countries = JSON.parse(fs.readFileSync(c, 'utf8')).features.filter(f => f.geometry).map(f => ({ name: f.properties.NAME_DE, code: f.properties.ADM0_A3, polys: enc(f.geometry) }));
  const lakes = JSON.parse(fs.readFileSync(l, 'utf8')).features.filter(f => f.geometry).map(f => ({ name: f.properties.name_de || f.properties.name || '', polys: enc(f.geometry) }));
  const out = { meta: { attribution: 'Natural Earth', grid: GRID, origin: [X0, Y0] }, countries, lakes };
  fs.writeFileSync(path.join(OUT, 'context.json'), JSON.stringify(out));
  console.log('context', countries.length, 'Staaten,', lakes.length, 'Seen,', (fs.statSync(path.join(OUT, 'context.json')).size / 1024).toFixed(0), 'KB');
}

for (const S of SETS) buildSet(S);
buildContext();
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ sets: SETS.map(S => ({ id: S.id, label: S.label, level: S.level, levelLabel: S.levelLabel, election: S.election, year: S.year })) }));
