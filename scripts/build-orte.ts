// Ortsliste aus dem Gemeindeverzeichnis (Destatis, GV-ISys „Auszug GV“) für die Ortssuche der Marker.
//   npm run orte   (liest data-src/AuszugGV*.xlsx, schreibt public/data/orte.json)
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { lonLatToGrid } from '../src/geo/proj';

const src = fs.readdirSync('data-src').filter(f => /^AuszugGV.*\.xlsx$/i.test(f)).sort().pop();
if (!src) throw new Error('data-src/AuszugGV….xlsx fehlt (destatis: Gemeindeverzeichnis, Alle politisch selbständigen Gemeinden)');
const wb = XLSX.read(fs.readFileSync(path.join('data-src', src)), { type: 'buffer' });
const sheet = wb.SheetNames.find(n => /Gemeinden/i.test(n)) || wb.SheetNames[1];
const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets[sheet], { header: 1, raw: true, defval: null });
const title = String(rows[0]?.[0] || '');
const stand = (title.match(/am (\d{2}\.\d{2}\.\d{4})/) || [])[1] || '';
const s = (v: unknown) => (v == null ? '' : String(v).trim());
const num = (v: unknown) => (typeof v === 'number' ? v : parseFloat(s(v).replace(/\./g, '').replace(',', '.')));
const coord = (v: unknown) => parseFloat(s(v).replace(',', '.'));
const kreise: Record<string, string> = {};
const out: (string | number)[][] = [];
let skipped = 0;
for (const r of rows) {
  const sa = s(r[0]);
  if (sa === '40') kreise[s(r[2]) + s(r[3]) + s(r[4])] = s(r[7]);
  if (sa !== '60') continue;
  const tk = s(r[1]);
  const lon = coord(r[14]), lat = coord(r[15]);
  if (!isFinite(lon) || !isFinite(lat) || tk === '66') { skipped++; continue; }
  const ags = s(r[2]) + s(r[3]) + s(r[4]) + s(r[6]);            // Amtlicher Gemeindeschlüssel (8 Stellen)
  const [x, y] = lonLatToGrid(lon, lat);
  const ew = num(r[9]);
  out.push([ags, s(r[7]), Math.round(x), Math.round(y), isFinite(ew) ? ew : 0, +tk]);
}
out.sort((a, b) => (b[4] as number) - (a[4] as number));
const res = {
  meta: {
    source: 'Gemeindeverzeichnis-Informationssystem GV-ISys, Auszug: Alle politisch selbständigen Gemeinden', stand, file: src,
    attribution: `© Statistisches Bundesamt (Destatis), ${stand.slice(-4) || new Date().getFullYear()}`,
    note: 'Geografische Mittelpunktkoordinaten, umgerechnet nach ETRS89 / UTM 32 (Kartenraster 10 m). Bevölkerung auf Grundlage des Zensus 2022.',
    cols: ['ags', 'name', 'x', 'y', 'ew', 'typ'],
    kreise,   // Kreisschlüssel (5 Stellen) → Name
  },
  rows: out,
};
fs.writeFileSync('public/data/orte.json', JSON.stringify(res));
console.log('public/data/orte.json', out.length, 'Gemeinden,', skipped, 'übersprungen, Stand', stand, (fs.statSync('public/data/orte.json').size / 1024).toFixed(0), 'KB');
