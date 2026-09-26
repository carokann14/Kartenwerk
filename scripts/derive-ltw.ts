// Landtagswahlkreise aus Gemeinden ableiten (Brandenburg: kein Geodatensatz veröffentlicht).
// Ganze Gemeinden nach der amtlichen Zuordnung (Wahlbezirksergebnis: Gemeinde → Wahlkreis) aus den VG250-Gemeinden;
// Städte, die auf mehrere Wahlkreise verteilt sind, werden mit den groben Wahlkreisumrissen der Ergebnis-Präsentation geteilt.
// Aufruf: npm run ltw:derive -- bb   → data-src/ltw/bb-2024/bb_landtagswahlkreise_2024.geojson (ETRS89 / UTM 32)
import fs from 'node:fs';
import pc from 'polygon-clipping';
import { mergedArcRings, ringsToPolys, setFromRaw, Pt } from '../src/geo/geo';
import { userMeta } from '../src/geo/userGeo';
import { gridToUtm, toUTM32 } from '../src/geo/proj';

type Poly = [number, number][][];
const JOBS: Record<string, { bl: string; dir: string; out: string }> = {
  bb: { bl: '12', dir: 'data-src/ltw/bb-2024', out: 'bb_landtagswahlkreise_2024.geojson' },
};
const code = process.argv[2] || 'bb', J = JOBS[code];
const gemWk: Record<string, string[]> = JSON.parse(fs.readFileSync(`${J.dir}/gem_wk.json`, 'utf8'));
const names: Record<string, string> = JSON.parse(fs.readFileSync(`${J.dir}/wk_namen.json`, 'utf8'));
// grobe Umrisse: Nummer \t Name \t Polygone (;) aus Ringen (|), deltakodiert in 1e-5 Grad
const coarse = new Map<string, Poly[]>();
for (const line of fs.readFileSync(`${J.dir}/vm_wk_grob.txt`, 'utf8').split('\n').filter(Boolean)) {
  const [nr, , geo] = line.split('\t');
  coarse.set(String(Number(nr)), geo.split(';').map(p => p.split('|').map(r => { const d = r.split(',').map(Number), out: [number, number][] = []; let x = 0, y = 0; for (let i = 0; i < d.length; i += 2) { x += d[i]; y += d[i + 1]; out.push(toUTM32(x / 1e5, y / 1e5)); } return out; })));
}
const vg = JSON.parse(fs.readFileSync('public/data/vg250-2026.json', 'utf8'));
const g = setFromRaw(userMeta('vg', 'vg', 'vg', '', '', undefined, 2026), { arcs: vg.arcs, areas: vg.levels.gem.areas });
const ptsOf = (r: number[]) => { const pts: Pt[] = []; for (const ai of r) { const a = ai >= 0 ? g.arcs[ai] : g.arcs[~ai].slice().reverse(); for (let i = pts.length ? 1 : 0; i < a.length; i++) pts.push(a[i]); } return pts; };
const gemPolys = (i: number): Poly[] => ringsToPolys(g, mergedArcRings(g, [i])).map(poly => poly.map(r => ptsOf(r).map(p => gridToUtm(p as [number, number]))));
const area = (mp: Poly[]) => mp.reduce((s, p) => s + p.reduce((t, r, k) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return t + (k ? -1 : 1) * Math.abs(a / 2); }, 0), 0);

const byWk = new Map<string, Poly[]>(); const add = (wk: string, mp: Poly[]) => { const l = byWk.get(wk) || []; l.push(...mp); byWk.set(wk, l); };
const missing: string[] = [], notes: string[] = [];
for (const a of g.areas.filter(a => a.bl === J.bl)) {
  const wks = gemWk[a.id];
  if (!wks) { missing.push(`${a.id} ${a.name}`); continue; }
  const mp = gemPolys(a.i);
  if (wks.length === 1) { add(wks[0], mp); continue; }
  // geteilte Stadt: Stücke = Gemeinde ∩ grober Wahlkreis; das größte Stück erhält den Rest, damit die Gemeinde lückenlos bleibt
  const pieces = wks.map(w => ({ w, p: pc.intersection(mp as never, coarse.get(w) as never) as unknown as Poly[] }));
  pieces.sort((x, y) => area(y.p) - area(x.p));
  const rest = pieces.slice(1), used = rest.length ? pc.union(...(rest.map(r => r.p) as [never, ...never[]])) : [];
  const main = pc.difference(mp as never, used as never) as unknown as Poly[];
  add(pieces[0].w, main); for (const r of rest) add(r.w, r.p);
  notes.push(`${a.name}: ${[pieces[0].w, ...rest.map(r => r.w)].map((w, k) => `WK ${w} ${(area(k ? rest[k - 1].p : main) / 1e6).toFixed(1)} km²`).join(', ')}`);
}
if (missing.length) console.log('Ohne Zuordnung:', missing.join('; '));
notes.forEach(n => console.log('geteilt:', n));
const features = [...byWk].sort((a, b) => +a[0] - +b[0]).map(([wk, polys]) => ({ type: 'Feature', properties: { nr: Number(wk), name: names[wk] || wk }, geometry: { type: 'MultiPolygon', coordinates: pc.union(...(polys.map(p => [p]) as [never, ...never[]])) } }));   // Gemeinden je Wahlkreis verschmelzen, sonst bleiben innere Grenzen stehen
fs.writeFileSync(`${J.dir}/${J.out}`, JSON.stringify({ type: 'FeatureCollection', crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::25832' } }, features }));
console.log(`${J.dir}/${J.out}:`, features.length, 'Wahlkreise');
