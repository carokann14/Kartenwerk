// WGS84/ETRS89 (Längen- und Breitengrad) ↔ ETRS89 / UTM Zone 32N (EPSG:25832) ↔ Kartenraster von Kartenwerk
// Transverse Mercator nach Krüger (Reihen 4. Ordnung, Genauigkeit im Millimeterbereich).
const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, lon0 = 9 * Math.PI / 180, FE = 500000;
const n = f / (2 - f), n2 = n * n, n3 = n2 * n, n4 = n3 * n;
const A = a / (1 + n) * (1 + n2 / 4 + n4 / 64);
const al = [n / 2 - 2 * n2 / 3 + 5 * n3 / 16 + 41 * n4 / 180, 13 * n2 / 48 - 3 * n3 / 5 + 557 * n4 / 1440, 61 * n3 / 240 - 103 * n4 / 140, 49561 * n4 / 161280];
const be = [n / 2 - 2 * n2 / 3 + 37 * n3 / 96 - n4 / 360, n2 / 48 + n3 / 15 - 437 * n4 / 1440, 17 * n3 / 480 - 37 * n4 / 840, 4397 * n4 / 161280];
const de = [2 * n - 2 * n2 / 3 - 2 * n3 + 116 * n4 / 45, 7 * n2 / 3 - 8 * n3 / 5 - 227 * n4 / 45, 56 * n3 / 15 - 136 * n4 / 35, 4279 * n4 / 630];
const e2n = 2 * Math.sqrt(n) / (1 + n);

/** Längengrad, Breitengrad (Grad) → UTM32 Ost, Nord (Meter) */
export function toUTM32(lon: number, lat: number): [number, number] {
  const phi = lat * Math.PI / 180, dl = lon * Math.PI / 180 - lon0, s = Math.sin(phi);
  const t = Math.sinh(Math.atanh(s) - e2n * Math.atanh(e2n * s));
  const xi1 = Math.atan2(t, Math.cos(dl)), eta1 = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
  let xi = xi1, eta = eta1;
  for (let j = 1; j <= 4; j++) { xi += al[j - 1] * Math.sin(2 * j * xi1) * Math.cosh(2 * j * eta1); eta += al[j - 1] * Math.cos(2 * j * xi1) * Math.sinh(2 * j * eta1); }
  return [FE + k0 * A * eta, k0 * A * xi];
}
/** UTM32 Ost, Nord (Meter) → Längengrad, Breitengrad (Grad) */
export function fromUTM32(E: number, N: number): [number, number] {
  const xi = N / (k0 * A), eta = (E - FE) / (k0 * A);
  let xi1 = xi, eta1 = eta;
  for (let j = 1; j <= 4; j++) { xi1 -= be[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); eta1 -= be[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); }
  const chi = Math.asin(Math.sin(xi1) / Math.cosh(eta1));
  let phi = chi;
  for (let j = 1; j <= 4; j++) phi += de[j - 1] * Math.sin(2 * j * chi);
  const lam = lon0 + Math.atan2(Math.sinh(eta1), Math.cos(xi1));
  return [lam * 180 / Math.PI, phi * 180 / Math.PI];
}
// Kartenraster: 10 m, Ursprung wie in scripts/build-geodata.mjs, y nach unten
export const GRID = 10, X0 = -120000, Y0 = 6502000;
export const utmToGrid = ([E, N]: [number, number]): [number, number] => [(E - X0) / GRID, (Y0 - N) / GRID];
export const gridToUtm = ([x, y]: [number, number]): [number, number] => [x * GRID + X0, Y0 - y * GRID];
export const lonLatToGrid = (lon: number, lat: number) => utmToGrid(toUTM32(lon, lat));
export const gridToLonLat = (p: [number, number]) => fromUTM32(...gridToUtm(p));
