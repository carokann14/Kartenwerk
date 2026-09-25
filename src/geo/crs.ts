// Koordinatensysteme eingelesener Geodaten erkennen und auf das Kartenraster (ETRS89 / UTM 32, 10 m) bringen.
// Unterstützt die in Deutschland üblichen Systeme: Länge/Breite (WGS84, ETRS89), UTM 32 und 33 (auch mit Zonenpräfix),
// Gauß-Krüger (DHDN, Bessel, mit 7-Parameter-Helmert nach ETRS89), Web-Mercator und LAEA Europa.
import { toUTM32, utmToGrid } from './proj';

type Ell = { a: number; f: number };
const GRS80: Ell = { a: 6378137, f: 1 / 298.257222101 }, WGS84: Ell = { a: 6378137, f: 1 / 298.257223563 }, BESSEL: Ell = { a: 6377397.155, f: 1 / 299.1528128 };

/** Transversale Mercator-Abbildung (Krüger, Reihen 4. Ordnung), umgekehrt: Ost/Nord → Länge/Breite (Grad) */
function tmInverse(e: Ell, lon0: number, k0: number, FE: number, FN: number) {
  const n = e.f / (2 - e.f), n2 = n * n, n3 = n2 * n, n4 = n3 * n;
  const A = e.a / (1 + n) * (1 + n2 / 4 + n4 / 64);
  const be = [n / 2 - 2 * n2 / 3 + 37 * n3 / 96 - n4 / 360, n2 / 48 + n3 / 15 - 437 * n4 / 1440, 17 * n3 / 480 - 37 * n4 / 840, 4397 * n4 / 161280];
  const de = [2 * n - 2 * n2 / 3 - 2 * n3 + 116 * n4 / 45, 7 * n2 / 3 - 8 * n3 / 5 - 227 * n4 / 45, 56 * n3 / 15 - 136 * n4 / 35, 4279 * n4 / 630];
  const L0 = lon0 * Math.PI / 180;
  return (E: number, N: number): [number, number] => {
    const xi = (N - FN) / (k0 * A), eta = (E - FE) / (k0 * A);
    let xi1 = xi, eta1 = eta;
    for (let j = 1; j <= 4; j++) { xi1 -= be[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); eta1 -= be[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); }
    const chi = Math.asin(Math.sin(xi1) / Math.cosh(eta1));
    let phi = chi; for (let j = 1; j <= 4; j++) phi += de[j - 1] * Math.sin(2 * j * chi);
    return [(L0 + Math.atan2(Math.sinh(eta1), Math.cos(xi1))) * 180 / Math.PI, phi * 180 / Math.PI];
  };
}
/** Datumsübergang per 7-Parameter-Helmert (Positionsvektor-Konvention) über geozentrische Koordinaten */
function helmert(from: Ell, to: Ell, p: [number, number, number, number, number, number, number]) {
  const [tx, ty, tz, rxs, rys, rzs, sppm] = p, sec = Math.PI / 180 / 3600, rx = rxs * sec, ry = rys * sec, rz = rzs * sec, s = 1 + sppm * 1e-6;
  const e2f = from.f * (2 - from.f), e2t = to.f * (2 - to.f);
  return ([lon, lat]: [number, number]): [number, number] => {
    const la = lat * Math.PI / 180, lo = lon * Math.PI / 180, sl = Math.sin(la);
    const Nr = from.a / Math.sqrt(1 - e2f * sl * sl);
    const X = Nr * Math.cos(la) * Math.cos(lo), Y = Nr * Math.cos(la) * Math.sin(lo), Z = Nr * (1 - e2f) * sl;
    const X2 = tx + s * (X - rz * Y + ry * Z), Y2 = ty + s * (rz * X + Y - rx * Z), Z2 = tz + s * (-ry * X + rx * Y + Z);
    const pp = Math.hypot(X2, Y2); let phi = Math.atan2(Z2, pp * (1 - e2t));
    for (let k = 0; k < 5; k++) { const sp = Math.sin(phi), Nn = to.a / Math.sqrt(1 - e2t * sp * sp); phi = Math.atan2(Z2 + e2t * Nn * sp, pp); }
    return [Math.atan2(Y2, X2) * 180 / Math.PI, phi * 180 / Math.PI];
  };
}
// DHDN → ETRS89 für Deutschland (Mittelwerte, Genauigkeit wenige Meter; für Karten im 10-m-Raster ausreichend)
const DHDN_ETRS89 = helmert(BESSEL, GRS80, [598.1, 73.7, 418.2, 0.202, 0.045, -2.455, 6.7]);

/** LAEA umgekehrt (Snyder, ellipsoidisch) */
function laeaInverse(e: Ell, lat0d: number, lon0d: number, FE: number, FN: number) {
  const e2 = e.f * (2 - e.f), ee = Math.sqrt(e2), lat0 = lat0d * Math.PI / 180, lon0 = lon0d * Math.PI / 180;
  const q = (phi: number) => { const s = Math.sin(phi); return (1 - e2) * (s / (1 - e2 * s * s) - Math.log((1 - ee * s) / (1 + ee * s)) / (2 * ee)); };
  const qp = q(Math.PI / 2), Rq = e.a * Math.sqrt(qp / 2), b1 = Math.asin(q(lat0) / qp);
  const m1 = Math.cos(lat0) / Math.sqrt(1 - e2 * Math.sin(lat0) ** 2), D = e.a * m1 / (Rq * Math.cos(b1));
  return (x: number, y: number): [number, number] => {
    const X = x - FE, Y = y - FN, rho = Math.hypot(X / D, D * Y);
    if (rho < 1e-9) return [lon0d, lat0d];
    const C = 2 * Math.asin(rho / (2 * Rq));
    const qq = qp * (Math.cos(C) * Math.sin(b1) + D * Y * Math.sin(C) * Math.cos(b1) / rho);
    let phi = Math.asin(qq / 2);
    for (let k = 0; k < 8; k++) { const s = Math.sin(phi); phi += (1 - e2 * s * s) ** 2 / (2 * Math.cos(phi)) * (qq / (1 - e2) - s / (1 - e2 * s * s) + Math.log((1 - ee * s) / (1 + ee * s)) / (2 * ee)); }
    const lam = lon0 + Math.atan2(X * Math.sin(C), D * rho * Math.cos(b1) * Math.cos(C) - D * D * Y * Math.sin(b1) * Math.sin(C));
    return [lam * 180 / Math.PI, phi * 180 / Math.PI];
  };
}

export interface Crs { id: string; label: string; toLonLat: (x: number, y: number) => [number, number] }
const ll: Crs = { id: 'EPSG:4326', label: 'Länge/Breite (WGS84 bzw. ETRS89)', toLonLat: (x, y) => [x, y] };
const utm = (zone: number, prefix = false): Crs => ({ id: prefix ? (zone === 32 ? 'EPSG:4647' : 'EPSG:5650') : 'EPSG:258' + zone, label: `UTM Zone ${zone} (ETRS89${prefix ? ', Ostwert mit Zonenpräfix' : ''})`, toLonLat: tmInverse(GRS80, zone * 6 - 183, 0.9996, (prefix ? zone * 1e6 : 0) + 500000, 0) });
const gk = (zone: number): Crs => { const inv = tmInverse(BESSEL, zone * 3, 1, zone * 1e6 + 500000, 0); return { id: 'EPSG:' + (31464 + zone), label: `Gauß-Krüger Streifen ${zone} (DHDN)`, toLonLat: (x, y) => DHDN_ETRS89(inv(x, y)) }; };
const R = 6378137;
const webm: Crs = { id: 'EPSG:3857', label: 'Web-Mercator (Online-Karten)', toLonLat: (x, y) => [x / R * 180 / Math.PI, (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI] };
const laea: Crs = { id: 'EPSG:3035', label: 'LAEA Europa (ETRS89)', toLonLat: laeaInverse(GRS80, 52, 10, 4321000, 3210000) };

export const CRS_LIST: Crs[] = [ll, utm(32), utm(33), utm(32, true), utm(33, true), gk(2), gk(3), gk(4), gk(5), webm, laea];
export const crsById = (id: string) => CRS_LIST.find(c => c.id === id) || null;
const EPSG_ALIAS: Record<string, string> = { '4258': 'EPSG:4326', '4326': 'EPSG:4326', '4230': 'EPSG:4326', '32632': 'EPSG:25832', '32633': 'EPSG:25833', '3044': 'EPSG:25832', '3045': 'EPSG:25833', '3857': 'EPSG:3857', '900913': 'EPSG:3857', '3395': 'EPSG:3857' };
/** EPSG-Code (Zahl oder „EPSG:25833“, „urn:ogc:def:crs:EPSG::25833“, CRS84) → bekanntes System */
export function crsFromCode(code: string | number | null | undefined): Crs | null {
  if (code == null) return null;
  const s = String(code);
  if (/CRS84/i.test(s)) return ll;
  const m = s.match(/(\d{4,6})\s*$/); if (!m) return null;
  return crsById(EPSG_ALIAS[m[1]] || 'EPSG:' + m[1]);
}

/** Koordinatensystem aus WKT (.prj-Datei, GeoPackage) lesen. Unbekannte Transversal-Mercator-Varianten werden aus den Parametern gebaut. */
export function crsFromWkt(wkt: string | null | undefined): Crs | null {
  if (!wkt || !wkt.trim()) return null;
  const w = wkt.replace(/\s+/g, ' ');
  const auth = w.match(/AUTHORITY\["EPSG","?(\d+)"?\]\]\s*$/i) || w.match(/ID\["EPSG",(\d+)\]\]\s*$/i);
  if (auth) { const c = crsFromCode(auth[1]); if (c) return c; }
  const projcs = /^\s*(PROJCS|PROJCRS|PROJECTEDCRS)\[/i.test(w);
  const bessel = /bessel|DHDN|Deutsches_Hauptdreiecksnetz|Potsdam/i.test(w);
  if (!projcs) return bessel ? { ...ll, id: 'EPSG:4314', label: 'Länge/Breite (DHDN)', toLonLat: (x, y) => DHDN_ETRS89([x, y]) } : ll;
  const par = (names: string[], d: number) => { for (const n of names) { const m = w.match(new RegExp('PARAMETER\\["' + n + '",\\s*(-?[\\d.eE+-]+)', 'i')); if (m) return parseFloat(m[1]); } return d; };
  if (/Mercator_Auxiliary_Sphere|Pseudo.?Mercator|Popular_Visualisation|Web_Mercator/i.test(w)) return webm;
  if (/Lambert_Azimuthal_Equal_Area|Lambert Azimuthal Equal Area/i.test(w)) {
    const inv = laeaInverse(GRS80, par(['latitude_of_center', 'latitude_of_origin', 'Latitude of natural origin'], 52), par(['longitude_of_center', 'central_meridian', 'Longitude of natural origin'], 10), par(['false_easting', 'False easting'], 4321000), par(['false_northing', 'False northing'], 3210000));
    return { id: 'EPSG:3035', label: laea.label, toLonLat: inv };
  }
  if (/Transverse_Mercator|Transverse Mercator|Gauss_Kruger|Gauss-Kruger/i.test(w)) {
    const lon0 = par(['central_meridian', 'Longitude of natural origin', 'longitude_of_origin'], 9), k0 = par(['scale_factor', 'Scale factor at natural origin'], 0.9996);
    const FE = par(['false_easting', 'False easting'], 500000), FN = par(['false_northing', 'False northing'], 0);
    const inv = tmInverse(bessel ? BESSEL : GRS80, lon0, k0, FE, FN), f = bessel ? (x: number, y: number) => DHDN_ETRS89(inv(x, y)) : inv;
    const probe: [number, number][] = [[FE, 5800000], [FE + 100000, 5500000]];
    const known = CRS_LIST.find(c => c.id !== 'EPSG:4326' && probe.every(([x, y]) => { const a = c.toLonLat(x, y), b = f(x, y); return Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7; }));
    return known || { id: 'TM', label: `Transversal-Mercator ${lon0}° (${bessel ? 'DHDN' : 'ETRS89'})`, toLonLat: f };
  }
  return null;
}

/** Deutschland in Länge/Breite, großzügig */
const inDE = ([lon, lat]: [number, number]) => lon > 5 && lon < 16 && lat > 46.8 && lat < 55.4;
/** Koordinatensystem nach dem Wertebereich raten. Mehrdeutig sind UTM 32 und 33 ohne Präfix: dann gilt UTM 32, außer der Dateiname deutet auf 33 hin. */
export function guessCrs(bb: [number, number, number, number], hint = ''): { crs: Crs; sure: boolean; alternatives: Crs[] } {
  const [x0, y0, x1, y1] = bb, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const fits = CRS_LIST.filter(c => { try { return inDE(c.toLonLat(x0, y0)) && inDE(c.toLonLat(x1, y1)) && inDE(c.toLonLat(cx, cy)); } catch { return false; } });
  if (!fits.length) return { crs: Math.abs(x0) <= 180 && Math.abs(y1) <= 90 ? ll : utm(32), sure: false, alternatives: [] };
  let pick = fits[0];
  if (fits.some(c => c.id === 'EPSG:25832') && fits.some(c => c.id === 'EPSG:25833')) pick = /33|berlin|brandenburg|sachsen|mecklenburg|vorpommern|thüringen|thueringen/i.test(hint) ? crsById('EPSG:25833')! : crsById('EPSG:25832')!;
  else if (fits.some(c => c.id === 'EPSG:25832')) pick = crsById('EPSG:25832')!;
  return { crs: pick, sure: fits.length === 1, alternatives: fits.filter(c => c !== pick) };
}

/** Punkt → Kartenraster (ganze 10-m-Zellen) */
export function toGridFn(crs: Crs): (x: number, y: number) => [number, number] {
  if (crs.id === 'EPSG:25832') return (x, y) => { const g = utmToGrid([x, y]); return [Math.round(g[0]), Math.round(g[1])]; };
  return (x, y) => { const [lon, lat] = crs.toLonLat(x, y); const g = utmToGrid(toUTM32(lon, lat)); return [Math.round(g[0]), Math.round(g[1])]; };
}
