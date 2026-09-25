// Koordinatensysteme: bekannte Punkte (Berliner Fernsehturm, 13.40940 E, 52.52085 N) in verschiedenen Systemen
import { crsFromCode, crsFromWkt, guessCrs, toGridFn, CRS_LIST } from '../src/geo/crs';
import { lonLatToGrid } from '../src/geo/proj';
import proj4 from 'proj4';
const ok = (c: boolean, m: string) => { console.log((c ? 'ok: ' : 'FEHLER: ') + m); if (!c) process.exitCode = 1; };
const ref = lonLatToGrid(13.40940, 52.52085).map(Math.round);
// Referenz: proj4 (Hilfsbibliothek von mapshaper) rechnet den Punkt in die Systeme, Kartenwerk rechnet zurück
const P: Record<string, string> = {
  'EPSG:25833': '+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs',
  'EPSG:25832': '+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs',
  'EPSG:5650': '+proj=tmerc +lat_0=0 +lon_0=15 +k=0.9996 +x_0=33500000 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:4647': '+proj=tmerc +lat_0=0 +lon_0=9 +k=0.9996 +x_0=32500000 +y_0=0 +ellps=GRS80 +units=m +no_defs',
  'EPSG:31466': '+proj=tmerc +lat_0=0 +lon_0=6 +k=1 +x_0=2500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs',
  'EPSG:31467': '+proj=tmerc +lat_0=0 +lon_0=9 +k=1 +x_0=3500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs',
  'EPSG:31468': '+proj=tmerc +lat_0=0 +lon_0=12 +k=1 +x_0=4500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs',
  'EPSG:31469': '+proj=tmerc +lat_0=0 +lon_0=15 +k=1 +x_0=5500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs',
  'EPSG:3857': '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs',
  'EPSG:3035': '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +units=m +no_defs',
};
for (const [lon, lat, ort] of [[13.40940, 52.52085, 'Berlin'], [6.95830, 50.94130, 'Köln'], [11.57550, 48.13710, 'München'], [9.99370, 53.55070, 'Hamburg']] as const) {
  for (const [id, def] of Object.entries(P)) {
    const c = crsFromCode(id)!; const [x, y] = proj4('EPSG:4326', def, [lon, lat]);
    const [lo, la] = c.toLonLat(x, y), dm = Math.hypot((lo - lon) * 111320 * Math.cos(lat * Math.PI / 180), (la - lat) * 110570);
    ok(dm < 3, `${ort} ${id}: Abweichung ${dm.toFixed(2)} m`);
  }
}
const g33 = toGridFn(crsFromCode(25833)!)(...(proj4('EPSG:4326', P['EPSG:25833'], [13.4094, 52.52085]) as [number, number]));
ok(Math.abs(g33[0] - ref[0]) <= 1 && Math.abs(g33[1] - ref[1]) <= 1, `UTM33 → Raster ${g33} (Soll ${ref})`);
const wkt33 = 'PROJCS["ETRS_1989_UTM_Zone_33N",GEOGCS["GCS_ETRS_1989",DATUM["D_ETRS_1989",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",15.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';
ok(crsFromWkt(wkt33)?.id === 'EPSG:25833', 'ESRI-WKT UTM33 erkannt: ' + crsFromWkt(wkt33)?.id);
const wktGK4 = 'PROJCS["DHDN_3_Degree_Gauss_Zone_4",GEOGCS["GCS_Deutsches_Hauptdreiecksnetz",DATUM["D_Deutsches_Hauptdreiecksnetz",SPHEROID["Bessel_1841",6377397.155,299.1528128]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Gauss_Kruger"],PARAMETER["False_Easting",4500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",12.0],PARAMETER["Scale_Factor",1.0],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';
ok(crsFromWkt(wktGK4)?.id === 'EPSG:31468', 'ESRI-WKT GK4 erkannt: ' + crsFromWkt(wktGK4)?.id);
const ogc = 'PROJCS["ETRS89 / UTM zone 33N",GEOGCS["ETRS89",DATUM["European_Terrestrial_Reference_System_1989",SPHEROID["GRS 1980",6378137,298.257222101,AUTHORITY["EPSG","7019"]],AUTHORITY["EPSG","6258"]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",15],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",0],UNIT["metre",1],AUTHORITY["EPSG","25833"]]';
ok(crsFromWkt(ogc)?.id === 'EPSG:25833', 'OGC-WKT mit AUTHORITY erkannt');
// Raten
ok(guessCrs([13.08, 52.33, 13.76, 52.68]).crs.id === 'EPSG:4326', 'Raten: Länge/Breite');
ok(guessCrs([370000, 5799000, 416000, 5838000], 'RBS_OD_UWB_AH26').crs.id === 'EPSG:25832', 'Raten ohne Hinweis im Namen: UTM32 (mehrdeutig) → ' + guessCrs([370000, 5799000, 416000, 5838000], 'RBS_OD_UWB_AH26').crs.id);
ok(guessCrs([370000, 5799000, 416000, 5838000], 'Berlin').crs.id === 'EPSG:25833', 'Raten mit „Berlin“: UTM33');
ok(guessCrs([4570000, 5800000, 4620000, 5840000]).crs.id === 'EPSG:31468', 'Raten: GK4 → ' + guessCrs([4570000, 5800000, 4620000, 5840000]).crs.id);
ok(guessCrs([33370000, 5799000, 33416000, 5838000]).crs.id === 'EPSG:5650', 'Raten: UTM33 mit Präfix');
ok(guessCrs([1460000, 6860000, 1530000, 6930000]).crs.id === 'EPSG:3857', 'Raten: Web-Mercator → ' + guessCrs([1460000, 6860000, 1530000, 6930000]).crs.id);
console.log(CRS_LIST.length, 'Systeme');
