// Kartenwerk – Berlin: Wahlgebiete zur Abgeordnetenhauswahl 2026 (Open Data, CC BY)
//   npm run berlin
// Liest data-src/berlin/RBS_OD_UWB_AH26.zip (Urnenwahlbezirke) und für die Namen der Wahlkreise
// data-src/berlin/Datenexport_AGH2026_Zweitstimme_A_BE.csv. Schreibt public/data/berlin-2026.json mit vier Ebenen
// auf einer gemeinsamen Topologie: Wahlbezirke, Briefwahlbezirke, Wahlkreise, Bezirke.
// Briefwahlbezirke, Wahlkreise und Bezirke entstehen aus den Wahlbezirken (sie bestehen aus ihnen); geprüft gegen
// die amtliche Wahlkreis-Datei RBS_OD_Wahlkreise_AH2026.zip.
import fs from 'node:fs';
import polylabel from 'polylabel';
import { GEO, Pt, RawArea, mergedArcRings, setFromRaw } from '../src/geo/geo';
import { readGeoFiles } from '../src/geo/readers';
import { buildUserGeo } from '../src/geo/buildUserGeo';
import { crsFromWkt } from '../src/geo/crs';
import { userMeta } from '../src/geo/userGeo';

const SRC = 'data-src/berlin', OUT = 'public/data';
const buf = (p: string) => { const b = fs.readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const wkRaw = JSON.parse(fs.readFileSync(OUT + '/btw-wk-2025.json', 'utf8'));
GEO['btw-wk-2025'] = setFromRaw({ ...wkRaw.meta, showNr: true }, wkRaw);

const BEZ: Record<string, string> = { '01': 'Mitte', '02': 'Friedrichshain-Kreuzberg', '03': 'Pankow', '04': 'Charlottenburg-Wilmersdorf', '05': 'Spandau', '06': 'Steglitz-Zehlendorf', '07': 'Tempelhof-Schöneberg', '08': 'Neukölln', '09': 'Treptow-Köpenick', '10': 'Marzahn-Hellersdorf', '11': 'Lichtenberg', '12': 'Reinickendorf' };
// Namen der Wahlkreise („Mitte 1“) aus der Ergebnisdatei
const wkName: Record<string, string> = {};
{
  const lines = fs.readFileSync(SRC + '/Datenexport_AGH2026_Zweitstimme_A_BE.csv', 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  const h = lines[0].split(';'), ga = h.indexOf('Gebietsart'), gn = h.indexOf('Gebietsname'), nr = h.indexOf('Nummer');
  for (const l of lines.slice(1)) { const c = l.split(';'); if (c[ga] === 'Abgeordnetenhauswahlkreis') wkName[c[nr]] = c[gn]; }
}

const main = async () => {
  const [L] = await readGeoFiles([{ name: 'RBS_OD_UWB_AH26.zip', buf: buf(SRC + '/RBS_OD_UWB_AH26.zip') }]);
  const crs = crsFromWkt(L.wkt)!;
  console.log('Wahlbezirke:', L.features.length, 'Flächen, KS', crs.id);
  const { raw, report } = buildUserGeo(L, { crs, idField: 'UWB', nameField: null, tol: 1 });
  console.log('gebaut:', report.areas, 'Gebiete,', report.points, 'Punkte, zusammengefasst', report.merged.length, ', entfallen', report.dropped);
  const props = new Map(L.features.map(f => [String(f.props.UWB), f.props]));
  const P = (id: string) => props.get(id)!;
  const PARENTS = ['be-wk-2026', 'be-bwb-2026', 'be-bez-2026', 'btw-wk-2025'];
  for (const a of raw.areas) {
    const p = P(a.id); a.bl = '11';
    a.name = `${BEZ[String(p.BEZ)]} ${String(p.UWB3)}`;
    (a as RawArea & { p?: string[] }).p = [String(p.AWK), String(p.BWB), String(p.BEZ), String(Number(p.BWK))];
  }
  const G = setFromRaw(userMeta('be-wbz-2026', 'Wahlbezirke', 'Wahlbezirke', '', '', 5, 2026), raw);
  // gröbere Ebenen aus den Wahlbezirken
  const level = (key: (id: string) => string, name: (k: string) => string, par: (k: string) => string[]) => {
    const groups = new Map<string, number[]>();
    for (const a of G.areas) { const k = key(a.id); const L2 = groups.get(k); if (L2) L2.push(a.i); else groups.set(k, [a.i]); }
    const out: (RawArea & { p?: string[] })[] = [];
    for (const [k, m] of [...groups].sort((x, y) => x[0].localeCompare(y[0]))) {
      const rings = mergedArcRings(G, m);
      let sa = 0, best: number[] | null = null, bestA = -1;
      for (const i of m) sa += G.areas[i].area;
      // Beschriftung: Pol der Unerreichbarkeit im größten Ring
      const ptsOf = (r: number[]) => { const pts: Pt[] = []; for (const ai of r) { const a = ai >= 0 ? G.arcs[ai] : G.arcs[~ai].slice().reverse(); for (let i = pts.length ? 1 : 0; i < a.length; i++) pts.push(a[i]); } return pts; };
      const area = (pts: Pt[]) => { let s = 0; for (let i = 0, n = pts.length; i < n; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n]; s += x1 * y2 - x2 * y1; } return Math.abs(s / 2); };
      for (const r of rings) { const A = area(ptsOf(r)); if (A > bestA) { bestA = A; best = r; } }
      const lp = polylabel([ptsOf(best!)] as unknown as number[][][], Math.max(1, Math.sqrt(bestA) / 60));
      out.push({ id: k, nr: /^\d+$/.test(k) ? Number(k) : out.length + 1, name: name(k), bl: '11', area: Math.round(sa * 1000) / 1000, label: [Math.round(lp[0]), Math.round(lp[1])], polys: rings.map(r => [r]), p: par(k) });
    }
    return out;
  };
  const first = (k: string, f: (p: Record<string, unknown>) => string) => f(P(raw.areas.find(a => (a as RawArea & { p?: string[] }).p!.includes(k))!.id) as never);
  const bwb = level(id => String(P(id).BWB), k => `${BEZ[k.slice(0, 2)]} Briefwahlbezirk ${k.slice(2)}`, k => [first(k, p => String(p.AWK)), k, k.slice(0, 2), first(k, p => String(Number(p.BWK)))]);
  const wk = level(id => String(P(id).AWK), k => wkName[k] || `${BEZ[k.slice(0, 2)]} ${Number(k.slice(2))}`, k => [k, '', k.slice(0, 2), '']);
  const bez = level(id => String(P(id).BEZ), k => BEZ[k], k => ['', '', k, '']);
  // Prüfung gegen die amtliche Wahlkreisdatei
  const [LW] = await readGeoFiles([{ name: 'RBS_OD_Wahlkreise_AH2026.zip', buf: buf(SRC + '/RBS_OD_Wahlkreise_AH2026.zip') }]);
  const off = buildUserGeo(LW, { crs, idField: 'AWK', nameField: null, tol: 1 });
  let maxDiff = 0; for (const a of wk) { const o = off.raw.areas.find(x => x.id === a.id); if (!o) throw new Error('Wahlkreis fehlt in amtlicher Datei: ' + a.id); maxDiff = Math.max(maxDiff, Math.abs(o.area - a.area) / o.area); }
  console.log('Wahlkreise aus Wahlbezirken:', wk.length, '· größte Flächenabweichung zur amtlichen Datei', (maxDiff * 100).toFixed(2), '%');
  if (wk.length !== 78 || maxDiff > 0.01) throw new Error('Wahlkreise passen nicht zur amtlichen Datei');
  // Datei: gemeinsame Bögen, vier Ebenen; Elternschlüssel kompakt als Liste in der Reihenfolge PARENTS
  const meta = {
    election: 'Wahl zum Abgeordnetenhaus von Berlin 2026', year: 2026,
    attribution: 'Amt für Statistik Berlin-Brandenburg, Geometrien der Wahlgebiete 2026 (CC BY 3.0 DE)',
    source: 'https://daten.berlin.de/datensaetze/geometrien-der-wahlbezirke-fur-die-wahl-zum-20-abgeordnetenhaus-von-berlin-und-bvv-2026',
    grid: 10, origin: [-120000, 6502000], crs: 'EPSG:25832',
  };
  const strip = (a: RawArea & { p?: string[] }) => { const { nb: _nb, ...r } = a; void _nb; return r; };
  const out = {
    meta, parents: PARENTS, krFrom: 'be-bez-2026', arcs: raw.arcs,
    levels: {
      wbz: { level: 'be-wbz', levelLabel: 'Wahlbezirke', label: 'Wahlbezirke Berlin 2026', keyLen: 5, areas: raw.areas.map(strip) },
      bwb: { level: 'be-bwb', levelLabel: 'Briefwahlbezirke', label: 'Briefwahlbezirke Berlin 2026', keyLen: 4, areas: bwb.map(strip) },
      wk: { level: 'be-wk', levelLabel: 'Wahlkreise', label: 'Wahlkreise Abgeordnetenhaus Berlin 2026', keyLen: 4, areas: wk.map(strip) },
      bez: { level: 'be-bez', levelLabel: 'Bezirke', label: 'Bezirke Berlin', keyLen: 2, areas: bez.map(strip) },
    },
  };
  const file = OUT + '/berlin-2026.json';
  fs.writeFileSync(file, JSON.stringify(out));
  console.log(file, (fs.statSync(file).size / 1024).toFixed(0), 'KB ·', raw.areas.length, 'Wahlbezirke,', bwb.length, 'Briefwahlbezirke,', wk.length, 'Wahlkreise,', bez.length, 'Bezirke');
  // Verzeichnis der Gebietsstände
  const idxFile = OUT + '/index.json', idx = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
  const keep = idx.sets.filter((s: { file?: string }) => s.file !== 'berlin-2026.json');
  const E = (part: string, id: string, level: string, levelLabel: string, label: string, count: number) => ({ id, label, level, levelLabel, election: meta.election, year: 2026, file: 'berlin-2026.json', part, lazy: true, count, region: 'Berlin' });
  keep.push(E('wk', 'be-wk-2026', 'be-wk', 'Wahlkreise (Abgeordnetenhaus)', out.levels.wk.label, wk.length));
  keep.push(E('bez', 'be-bez-2026', 'be-bez', 'Bezirke', out.levels.bez.label, bez.length));
  keep.push(E('bwb', 'be-bwb-2026', 'be-bwb', 'Briefwahlbezirke', out.levels.bwb.label, bwb.length));
  keep.push(E('wbz', 'be-wbz-2026', 'be-wbz', 'Wahlbezirke', out.levels.wbz.label, raw.areas.length));
  fs.writeFileSync(idxFile, JSON.stringify({ sets: keep }));
  console.log('index.json:', keep.length, 'Gebietsstände');
};
main().catch(e => { console.error(e); process.exit(1); });
