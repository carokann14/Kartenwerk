// Prüft die Projektion: Jeder Gemeindemittelpunkt muss in einem Wahlkreis des richtigen Landes liegen.
import fs from 'node:fs';
const assets: Record<string, string> = {};
for (const f of fs.readdirSync('public/data')) assets['data/' + f] = fs.readFileSync('public/data/' + f, 'utf8');
(globalThis as any).window = { __KW_ASSETS__: assets };
const { loadGeo, GEO } = await import('../src/geo/geo');
const { toUTM32, fromUTM32, lonLatToGrid } = await import('../src/geo/proj');
await loadGeo();
// Rundreise
let maxErr = 0;
for (const [lon, lat] of [[6, 47.3], [15, 55], [9, 51], [13.4, 52.5], [7.1, 50.7]]) { const [E, N] = toUTM32(lon, lat); const [l2, b2] = fromUTM32(E, N); maxErr = Math.max(maxErr, Math.abs(l2 - lon), Math.abs(b2 - lat)); }
console.log('Rundreise max. Fehler (Grad):', maxErr.toExponential(2));
// Referenz: Zentralmeridian 9° auf dem Äquator → E = 500000, N = 0
console.log('Referenz 9°/0°:', toUTM32(9, 0).map(v => v.toFixed(3)));
const orte = JSON.parse(assets['data/orte.json']);
const g = GEO['btw-wk-2025'];
const inside = (rings: number[][][], x: number, y: number) => { let c = false; for (const r of rings) for (let j = 0, k = r.length - 1; j < r.length; k = j++) { const [xi, yi] = r[j], [xk, yk] = r[k]; if ((yi > y) !== (yk > y) && x < (xk - xi) * (y - yi) / (yk - yi) + xi) c = !c; } return c; };
let ok = 0, wrongLand = 0, none = 0; const miss: string[] = [];
for (const [ags, name, x, y] of orte.rows) {
  let hit = null;
  for (const a of g.areas) { const b = a.bbox; if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue; if (a.polys.some((p: number[][][]) => inside(p, x, y))) { hit = a; break; } }
  if (!hit) { none++; if (miss.length < 8) miss.push(name); continue; }
  if (hit.bl === ags.slice(0, 2)) ok++; else wrongLand++;
}
console.log({ ok, wrongLand, none, total: orte.rows.length }, 'außerhalb (Küste, Vereinfachung):', miss.join(' | '));
console.log('Berlin', orte.rows[0], lonLatToGrid(13.404954, 52.520008).map(Math.round));
