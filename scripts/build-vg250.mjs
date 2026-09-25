// Kartenwerk – Verwaltungsgrenzen aus VG250 (BKG) aufbereiten
// Liest data-src/vg250-<Jahr>.zip (Shapefile, UTM32s, „ebenen“, Stand 01.01.) und schreibt
// public/data/vg250-<Jahr>.json: eine gemeinsame Topologie für Länder, Regierungsbezirke, Kreise,
// Gemeindeverbände und Gemeinden. Die oberen Ebenen entstehen durch Zusammenfassen der Gemeinden,
// deshalb passen alle Grenzen exakt aufeinander.
//   node scripts/build-vg250.mjs [Jahr …]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import polylabel from 'polylabel';

const SRC = 'data-src', OUT = process.env.VG_OUT || 'public/data', TMP = 'data-src/.tmp';
fs.mkdirSync(OUT, { recursive: true });
const GRID = 10, X0 = -120000, Y0 = 6502000;
const INTERVAL = Number(process.env.VG_INTERVAL || 40);   // Vereinfachung in Metern
const toGrid = ([x, y]) => [Math.round((x - X0) / GRID), Math.round((Y0 - y) / GRID)];
const deltaEnc = pts => { const r = []; let px = 0, py = 0; for (const [x, y] of pts) { r.push(x - px, y - py); px = x; py = y; } return r; };
const MS = path.resolve('node_modules/mapshaper/bin/mapshaper');
const mapshaper = args => execFileSync(process.execPath, ['--max-old-space-size=6000', MS, ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
const LAENDER = { '01': 'Schleswig-Holstein', '02': 'Hamburg', '03': 'Niedersachsen', '04': 'Bremen', '05': 'Nordrhein-Westfalen', '06': 'Hessen', '07': 'Rheinland-Pfalz', '08': 'Baden-Württemberg', '09': 'Bayern', '10': 'Saarland', '11': 'Berlin', '12': 'Brandenburg', '13': 'Mecklenburg-Vorpommern', '14': 'Sachsen', '15': 'Sachsen-Anhalt', '16': 'Thüringen' };

function findShp(dir, name) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const r = findShp(p, name); if (r) return r; }
    else if (e.name.toUpperCase() === name.toUpperCase() + '.SHP') return p;
  }
  return null;
}
function attrs(shp, filter = 'GF == 4') {
  const out = path.join(TMP, path.basename(shp) + '.json');
  mapshaper(['-i', shp, '-filter', filter, '-o', 'format=json', out]);
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}

function build(year) {
  const zip = path.join(SRC, `vg250-${year}.zip`);
  if (!fs.existsSync(zip)) { console.warn('fehlt:', zip); return null; }
  const dir = path.join(TMP, `vg250-${year}`);
  if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); execFileSync('unzip', ['-q', '-o', zip, '-d', dir]); }
  const shp = n => { const p = findShp(dir, n); if (!p) throw new Error(`${n}.shp nicht gefunden in ${zip}`); return p; };

  // Namen der oberen Ebenen
  const T = { krs: attrs(shp('VG250_KRS')), rbz: attrs(shp('VG250_RBZ')), lan: attrs(shp('VG250_LAN')), vwg: attrs(shp('VG250_VWG')) };
  const byArs = rows => { const m = {}; for (const r of rows) m[String(r.ARS)] = r; return m; };
  const N = { krs: byArs(T.krs), rbz: byArs(T.rbz), lan: byArs(T.lan), vwg: byArs(T.vwg) };
  const rbzLaender = new Set(T.rbz.map(r => String(r.ARS).slice(0, 2)));
  const gemRows = attrs(shp('VG250_GEM'));
  const wsk = gemRows.map(r => String(r.WSK || '')).sort().pop() || '';

  // Topologie: Gemeinden (Landfläche), vereinfacht, dann zusammengefasst
  const topoFile = path.join(TMP, `vg250-${year}.topo.json`);
  const rbzExpr = `RBZ = ${JSON.stringify([...rbzLaender])}.indexOf(AGS.slice(0,2)) >= 0 ? AGS.slice(0,3) : AGS.slice(0,2) + '0'`;
  mapshaper([
    '-i', shp('VG250_GEM'), 'name=gem',
    '-filter', 'GF == 4',
    '-each', `KEY = String(AGS); ARS12 = String(ARS_0 || ARS); KRS = KEY.slice(0,5); LAN = KEY.slice(0,2); VWG = ARS12.slice(0,9); ${rbzExpr.replace(/AGS/g, 'KEY')}`,
    '-dissolve', 'KEY', 'copy-fields=GEN,BEZ,ARS12,KRS,LAN,VWG,RBZ',
    '-simplify', `interval=${INTERVAL}`, 'keep-shapes',
    '-dissolve', 'KRS', '+', 'name=krs',
    '-dissolve', 'RBZ', 'target=gem', '+', 'name=rbz',
    '-dissolve', 'LAN', 'target=gem', '+', 'name=lan',
    '-dissolve', 'VWG', 'target=gem', '+', 'name=vwg',
    '-o', 'format=topojson', 'target=*', 'quantization=200000', topoFile,
  ]);
  const topo = JSON.parse(fs.readFileSync(topoFile, 'utf8'));
  const { scale: [sx, sy], translate: [tx, ty] } = topo.transform;
  const arcs = topo.arcs.map(arc => {
    let x = 0, y = 0; const pts = [];
    for (const [dx, dy] of arc) { x += dx; y += dy; const p = toGrid([x * sx + tx, y * sy + ty]); const q = pts[pts.length - 1]; if (!q || q[0] !== p[0] || q[1] !== p[1]) pts.push(p); }
    if (pts.length === 1) pts.push(pts[0].slice());
    return pts;
  });
  const ringCoords = ring => { const pts = []; for (const ai of ring) { const a = ai >= 0 ? arcs[ai] : arcs[~ai].slice().reverse(); for (let i = pts.length ? 1 : 0; i < a.length; i++) pts.push(a[i]); } return pts; };
  const ringArea = pts => { let s = 0; for (let i = 0, n = pts.length; i < n; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n]; s += x1 * y2 - x2 * y1; } return s / 2; };
  function geom(g) {
    const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
    let area = 0, best = null, bestA = -1;
    for (const poly of polys) {
      const a = Math.abs(ringArea(ringCoords(poly[0])));
      let holes = 0; for (let k = 1; k < poly.length; k++) holes += Math.abs(ringArea(ringCoords(poly[k])));
      area += a - holes; if (a > bestA) { bestA = a; best = poly; }
    }
    const prec = Math.max(1, Math.sqrt(Math.max(bestA, 1)) / 40);
    const lp = best ? polylabel(best.map(ringCoords), prec) : [0, 0];
    return { polys, area: Math.round(area * GRID * GRID / 1e6 * 10) / 10, label: [Math.round(lp[0]), Math.round(lp[1])] };
  }
  const short = b => ({ 'Kreisfreie Stadt': 'Stadt', Stadtkreis: 'Stadt', Landkreis: 'Landkreis', Kreis: 'Kreis', Regionalverband: 'Regionalverband' }[b] || b);
  const dedupe = areas => { const c = {}; for (const a of areas) c[a.name] = (c[a.name] || 0) + 1; for (const a of areas) if (c[a.name] > 1 && a.bez) a.name = `${a.name} (${short(a.bez)})`; return areas; };
  const obj = n => topo.objects[n].geometries.filter(g => g.arcs && g.arcs.length);
  const L = {};
  L.gem = obj('gem').map(g => { const p = g.properties, G = geom(g); return { id: p.KEY, name: p.GEN, bez: p.BEZ, bl: p.LAN, kr: p.KRS, ars: p.ARS12, ...G, ...(/gemeindefrei/i.test(p.BEZ || '') ? { free: 1 } : {}) }; });
  L.vwg = obj('vwg').map(g => { const k = g.properties.VWG, r = N.vwg[k], G = geom(g); const one = L.gem.filter(x => x.ars.startsWith(k)); return { id: k, name: r?.GEN || (one.length === 1 ? one[0].name : k), bez: r?.BEZ || (one.length === 1 ? one[0].bez : ''), bl: k.slice(0, 2), kr: k.slice(0, 5), ...G }; });
  L.krs = dedupe(obj('krs').map(g => { const k = g.properties.KRS, r = N.krs[k], G = geom(g); return { id: k, name: r?.GEN || k, bez: r?.BEZ || '', bl: k.slice(0, 2), ...G }; }));
  L.rbz = obj('rbz').map(g => { const k = g.properties.RBZ, r = N.rbz[k], G = geom(g); return { id: k, name: r?.GEN || LAENDER[k.slice(0, 2)], bez: r?.BEZ || 'Land ohne Regierungsbezirke', bl: k.slice(0, 2), ...G }; });
  L.lan = obj('lan').map(g => { const k = g.properties.LAN, r = N.lan[k], G = geom(g); return { id: k, name: r?.GEN || LAENDER[k], bez: r?.BEZ || 'Land', bl: k, ...G }; });
  const LBL = { lan: 'Länder', rbz: 'Regierungsbezirke', krs: 'Kreise', vwg: 'Gemeindeverbände', gem: 'Gemeinden' };
  const stand = `01.01.${year}`;
  const levels = {};
  for (const k of ['lan', 'rbz', 'krs', 'vwg', 'gem']) levels[k] = { level: k, levelLabel: LBL[k], label: `${LBL[k]} · Stand ${stand}`, areas: L[k] };
  const out = {
    meta: {
      election: '', year, stand, grid: GRID, origin: [X0, Y0], crs: 'EPSG:25832',
      attribution: `© BKG (${new Date().getFullYear()}) dl-de/by-2-0, Datenquellen: https://sgx.geodatenzentrum.de/web_public/gdz/datenquellen/datenquellen_vg_nuts.pdf`,
      source: `https://daten.gdz.bkg.bund.de/produkte/vg/vg250_ebenen_0101/${year}/`,
      wsk,
    },
    arcs: arcs.map(deltaEnc),
    levels,
  };
  const file = `vg250-${year}.json`;
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(out));
  const pts = arcs.reduce((s, a) => s + a.length, 0);
  console.log(file, Object.entries(L).map(([k, v]) => `${k} ${v.length}`).join(', '), `· ${arcs.length} Bögen, ${pts} Punkte, ${(fs.statSync(path.join(OUT, file)).size / 1048576).toFixed(1)} MB`);
  return { year, stand, file, counts: Object.fromEntries(Object.entries(L).map(([k, v]) => [k, v.length])) };
}

const years = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [2025, 2026];
const built = years.map(build).filter(Boolean);
// Index ergänzen (Wahlkreise bleiben, Verwaltungsebenen werden ersetzt); nicht für die gröbere Vorschau-Fassung
if (process.env.VG_OUT) process.exit(0);
const idxFile = path.join(OUT, 'index.json');
const idx = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
const LBL = { lan: 'Länder', rbz: 'Regierungsbezirke', krs: 'Kreise', vwg: 'Gemeindeverbände', gem: 'Gemeinden' };
const keep = idx.sets.filter(s => !(s.file || '').startsWith('vg250-') || !built.some(b => b.file === s.file));
for (const b of built) for (const k of ['lan', 'rbz', 'krs', 'vwg', 'gem'])
  keep.push({ id: `vg-${k}-${b.year}`, label: `${LBL[k]} · Stand ${b.stand}`, level: k, levelLabel: LBL[k], election: '', year: b.year, file: b.file, part: k, lazy: true, stand: b.stand, count: b.counts[k] });
// Hinweis je Stand für die Auswahl: neuester = „aktuell“, sonst wofür der Stand passt
const HINT = { 2025: 'passt zur Bundestagswahl 2025' };
const newest = {}; for (const s of keep) if (s.stand) newest[s.level] = Math.max(newest[s.level] || 0, s.year);
for (const s of keep) if (s.stand) s.hint = s.year === newest[s.level] ? 'aktuell' : (HINT[s.year] || '');
fs.writeFileSync(idxFile, JSON.stringify({ sets: keep }));
console.log('index.json:', keep.length, 'Gebietsstände');
