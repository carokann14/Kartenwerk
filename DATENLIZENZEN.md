# Datenquellen und Lizenzen

Kartenwerk bringt vorbereitete Geodaten, Beispieldateien und Schriften mit. Sie stehen nicht unter der MIT-Lizenz des Codes, sondern unter den Lizenzen unten. Die Quellenzeile jeder Grafik nennt die nötigen Vermerke automatisch.

## Wahlkreisgeometrien

| Datei | Inhalt | Quelle | Lizenz |
| --- | --- | --- | --- |
| `public/data/btw-wk-2025.json` | 299 Wahlkreise der Bundestagswahl 2025 | © Die Bundeswahlleiterin, Statistisches Bundesamt, Wiesbaden 2024; Geoinformationen © GeoBasis-DE / BKG 2024 | Datenlizenz Deutschland – Namensnennung – Version 2.0 (dl-de/by-2-0) |
| `public/data/btw-wk-2021.json` | 299 Wahlkreise der Bundestagswahl 2021 | © Der Bundeswahlleiter, Wiesbaden 2020; Geoinformationen © GeoBasis-DE / BKG 2020 | dl-de/by-2-0 |

Bezug: bundeswahlleiterin.de, *Bundestagswahl › Wahlkreiseinteilung › Downloads*. Aufbereitung für Kartenwerk: nach ETRS89 / UTM 32 (EPSG:25832) projiziert, auf rund 150 m vereinfacht, als gemeinsame Topologie gespeichert. Deshalb steht in der Quellenzeile „vereinfacht“.

Lizenztext dl-de/by-2-0: https://www.govdata.de/dl-de/by-2-0

## Verwaltungsgrenzen (Länder bis Gemeinden)

| Datei | Inhalt | Quelle | Lizenz |
| --- | --- | --- | --- |
| `public/data/vg250-2025.json` | Länder, Regierungsbezirke, Kreise, Gemeindeverbände und Gemeinden, Gebietsstand 01.01.2025 | © BKG (2026), Verwaltungsgebiete 1 : 250 000 (VG250), Datenquellen: https://sgx.geodatenzentrum.de/web_public/gdz/datenquellen/datenquellen_vg_nuts.pdf | dl-de/by-2-0 |
| `public/data/vg250-2026.json` | dieselben Ebenen, Gebietsstand 01.01.2026 | wie oben | dl-de/by-2-0 |

Bezug: https://daten.gdz.bkg.bund.de/produkte/vg/ (Shapefile, UTM32s, „ebenen“, Stand 01.01.). Aufbereitung für Kartenwerk: nur Landflächen (GF = 4), auf rund 40 m vereinfacht, nach ETRS89 / UTM 32 auf ein 10-m-Raster gebracht. Kreise, Regierungsbezirke, Länder und Gemeindeverbände sind aus den Gemeinden zusammengefasst, damit alle Grenzen exakt aufeinanderliegen; ihre Namen stammen aus den VG250-Ebenen. In Ländern ohne Regierungsbezirke steht auf dieser Ebene das Land. Die Quellenzeile nennt den Vermerk des BKG samt Gebietsstand und den Veränderungshinweis „vereinfacht“.

## Berlin: Wahlgebiete der Abgeordnetenhauswahl 2026

| Datei | Inhalt | Quelle | Lizenz |
| --- | --- | --- | --- |
| `public/data/berlin-2026.json` | 2.542 Urnenwahlbezirke, daraus 1.572 Briefwahlbezirke, 78 Wahlkreise und 12 Bezirke | Amt für Statistik Berlin-Brandenburg, Geometrien der Wahlbezirke (`RBS_OD_UWB_AH26`, Stand 04.05.2026) | Creative Commons Namensnennung 3.0 Deutschland (CC BY 3.0 DE) |

Bezug: https://daten.berlin.de/datensaetze/geometrien-der-wahlbezirke-fur-die-wahl-zum-20-abgeordnetenhaus-von-berlin-und-bvv-2026 (Shapefile, ETRS89 / UTM 33). Aufbereitung für Kartenwerk (`npm run berlin`): nach ETRS89 / UTM 32 auf ein 10-m-Raster gebracht, auf rund 10 m vereinfacht. Briefwahlbezirke, Wahlkreise und Bezirke sind aus den Wahlbezirken zusammengesetzt (sie bestehen aus ihnen) und gegen die amtliche Wahlkreisdatei `RBS_OD_Wahlkreise_AH2026` geprüft (Flächenabweichung höchstens 0,3 %). Namen der Wahlkreise aus dem Datenexport der Ergebnisse. Die Quellenzeile nennt den Vermerk und „vereinfacht“.

Lizenztext CC BY 3.0 DE: https://creativecommons.org/licenses/by/3.0/de/

## Landtagswahlkreise der Länder

| Datei | Inhalt | Quelle | Lizenzstand |
| --- | --- | --- | --- |
| `public/data/ltw-mv-2026.json` | 36 Wahlkreise der Landtagswahl Mecklenburg-Vorpommern 2026 | © Landesamt für innere Verwaltung Mecklenburg-Vorpommern (LAiV), Karte Landtagswahlkreise 1 : 250 000 (KLWK250MV), `LTwahl_Wahlkreise.zip` | **keine Lizenz angegeben**; das LAiV stellt die Datei kostenlos zum Download bereit und vermerkt „© LAiV“. Eine ausdrückliche Erlaubnis zur Weitergabe liegt nicht vor. |
| `public/data/ltw-bw-2026.json` | 70 Wahlkreise der Landtagswahl Baden-Württemberg 2026 | © Statistisches Landesamt Baden-Württemberg, Fellbach 2025, Wahlkreiskarte für die Landtagswahl 2026 in Baden-Württemberg; Kartengrundlage: LGL (www.lgl-bw.de), Stadt Freiburg, Stadt Karlsruhe, Stadt Mannheim, Landeshauptstadt Stuttgart (`LTWahlkreise2026-BW_SHP.zip`) | **keine Lizenz angegeben**; Weiterverwendung nur mit diesem Copyright-Vermerk |
| `public/data/ltw-rp-2026.json` | 52 Wahlkreise der Landtagswahl Rheinland-Pfalz 2026 | Statistisches Landesamt Rheinland-Pfalz, Geodaten zur Landtagswahl 2026, Stand 09.12.2025 (`Geodaten_LW2026_RP.zip`, Ebene `LW2026_RP_WK_2_WK`) | **keine Lizenz angegeben** |
| `public/data/ltw-he-2023.json` | 55 Wahlkreise der Landtagswahl Hessen 2023 | © Hessisches Statistisches Landesamt, Wiesbaden 2022, Wahlkreiskarte für die Wahl zum 21. Hessischen Landtag im Herbst 2023; Kartengrundlage der Geoinformationen © GeoBasis-DE / BKG 2021, Stadt Darmstadt, Stadt Frankfurt am Main, Stadt Kassel, Landeshauptstadt Wiesbaden (`hsl_landtagswahlkreise_2023.zip`) | **keine Lizenz angegeben**; Weiterverwendung nur mit diesem Copyright-Vermerk |
| `public/data/ltw-sh-2022.json` | 35 Wahlkreise der Landtagswahl Schleswig-Holstein 2022 | Statistisches Amt für Hamburg und Schleswig-Holstein, Open-Data-Portal Schleswig-Holstein (`landtagswahlkreise_sh_2022.zip`) | Open-Data-Portal; genaue Lizenz noch zu prüfen |
| `public/data/ltw-ni-2022.json` | 87 Wahlkreise der Landtagswahl Niedersachsen 2022 | © Landesamt für Statistik Niedersachsen, Hannover 2022, Wahlkreiskarte für die Wahl zum 19. Niedersächsischen Landtag; Grundlage der Geoinformationen: Auszug aus den Geodaten des Landesamtes für Geoinformation und Landesvermessung Niedersachsen, © 2022; © Stadt Braunschweig – Open GeoData (dl-de/by-2-0); Stadt Göttingen; Landeshauptstadt Hannover; Stadt Oldenburg; Stadt Osnabrück; Stadt Salzgitter; Stadt Wolfsburg (`Landtagswahlkreise_Niedersachsen_2022.zip`); drei in der Datei gekürzte Namen nach wahlen.statistik.niedersachsen.de ergänzt | **keine Lizenz angegeben**; Weiterverwendung nur mit diesem Copyright-Vermerk (Nutzungshinweise des LSN) |
| `public/data/ltw-st-2026.json` | 41 Wahlkreise der Landtagswahl Sachsen-Anhalt 2026 | © Statistisches Landesamt Sachsen-Anhalt (`Wahlkreise_LTW_2026.zip`); Schreibfehler „Wittenebrg“ im Namen korrigiert | **alle Rechte vorbehalten** |
| `public/data/ltw-nw-2022.json` | 128 Wahlkreise der Landtagswahl Nordrhein-Westfalen 2022 | © Ministerium des Innern des Landes Nordrhein-Westfalen, IT.NRW, Düsseldorf, Wahlkreiseinteilung des Landes Nordrhein-Westfalen zur Landtagswahl am 15. Mai 2022 (`16_LW2022_NRW_Wahlkreise.zip`) | Pflichtvermerk, keine weitere Lizenz angegeben |

Bezug: Fundstellen je Land im Katalog `src/data/ltw.ts` (MV: https://www.laiv-mv.de/Wahlen/Landtagswahlen/2026/Wahlkreise-und-%E2%80%93leiter/, Shapefile ETRS89 / UTM 33; NRW: Gauß-Krüger Zone 2, per 7-Parameter-Helmert nach ETRS89). Aufbereitung für Kartenwerk (`npm run ltw`): nach ETRS89 / UTM 32 auf ein 10-m-Raster gebracht, auf rund 10 m vereinfacht (NRW 20 m); Namen und Nummern aus der Datei. Die Quellenzeile nennt den Vermerk und „vereinfacht“.

## Ortsliste für Marker

`public/data/orte.json` stammt aus dem Gemeindeverzeichnis-Informationssystem GV-ISys des Statistischen Bundesamts (Auszug „Alle politisch selbständigen Gemeinden“, Gebietsstand 30.09.2026): Name, Gemeindeschlüssel, Einwohnerzahl und geografischer Mittelpunkt, umgerechnet nach ETRS89 / UTM 32. © Statistisches Bundesamt (Destatis), 2026; Vervielfältigung und Verbreitung mit Quellenangabe gestattet. Die Quellenzeile nennt das Gemeindeverzeichnis, sobald ein Marker aus der Ortssuche verwendet wird.

## Kontext: Nachbarstaaten und Gewässer

`public/data/context.json` stammt aus Natural Earth (1:10 Mio., Länder und Seen), gemeinfrei (public domain). Quelle: https://www.naturalearthdata.com

## Beispieldaten

| Datei | Inhalt | Quelle |
| --- | --- | --- |
| `public/beispiele/btw2025_kerg2.csv` | Bundestagswahl 2025, amtliches Endergebnis nach Wahlkreisen (kerg2.csv) | © Die Bundeswahlleiterin, Wiesbaden 2025, Datenlizenz Deutschland – Namensnennung – Version 2.0 |
| `public/beispiele/btw2021_kerg.csv` | Bundestagswahl 2021, amtliches Endergebnis nach Wahlkreisen | © Der Bundeswahlleiter, Wiesbaden 2021 |
| `public/beispiele/btwkr25_umrechnung_btw21.csv` | Ergebnis 2021, umgerechnet auf die Wahlkreise 2025 | © Die Bundeswahlleiterin, Wiesbaden 2024 |
| `public/beispiele/btw2025_kreise.csv` | Bundestagswahl 2025 nach kreisfreien Städten und Landkreisen (btw2025kreis.csv) | © Die Bundeswahlleiterin, Wiesbaden 2025 |
| `public/beispiele/btw2025_gemeinden.csv` | Bundestagswahl 2025, Zweitstimmen nach Gemeinden, **abgeleitet** aus der Wahlbezirksstatistik (btw25_wbz.zip) | © Die Bundeswahlleiterin (im Auftrag der Herausgebergemeinschaft), Wiesbaden 2025 |

Die Bundeswahlleiterin erlaubt die Verwendung der Ergebnisse mit Quellenangabe. Die Dateien sind unverändert, außer `btw2025_gemeinden.csv`: Dort sind die Wahlbezirke je Gemeinde zusammengefasst, und die Briefwahl, die mehrere Gemeinden gemeinsam ausgezählt haben (Ämter, Samt- und Verbandsgemeinden), ist nach der Zahl der Wahlberechtigten mit Wahlschein auf die Gemeinden verteilt. Diese Werte sind geschätzt und in der Spalte „Briefwahl“ gekennzeichnet; der Titel in der Datei sagt das auch. Die Originaldatei lässt sich im Importassistenten direkt öffnen (ZIP), dann mit Wahl zwischen „anteilig“ und „als eine Fläche“.

## Schriften

- **Merriweather** (Grafiken, auch als Pfade im Export): © The Merriweather Project Authors, SIL Open Font License 1.1. In vier Schnitte instanziiert und auf lateinische Zeichen reduziert.
- **IBM Plex Sans / IBM Plex Mono** (Oberfläche): © IBM Corp., SIL Open Font License 1.1, über das Paket @fontsource eingebunden.

Lizenztext: https://openfontlicense.org

## Bibliotheken

React, zustand, immer, opentype.js (MIT) und SheetJS Community Edition 0.18.5 (Apache-2.0) für Excel-Dateien.

## Geodaten neu aufbereiten

`npm run geodata` liest GeoJSON-Dateien aus `data-src/` (nicht im Repo, weil groß): `wkr2025.geojson`, `wkr2021.geojson` (Wahlkreisgeometrien der Bundeswahlleiterin), `ne_10m_countries.geojson`, `ne_10m_lakes.geojson` (Natural Earth).

`npm run vg250` liest `data-src/vg250-2025.zip` und `data-src/vg250-2026.zip` (die Shapefile-ZIPs des BKG, umbenannt) und schreibt `public/data/vg250-<Jahr>.json` sowie die Einträge in `index.json`. `npm run vg250:preview` erzeugt eine gröbere Fassung nur für die Vorschau-Datei.

`npm run beispiele` erzeugt `btw2025_gemeinden.csv` aus `data-src/btw25_wbz.zip` und kopiert `data-src/btw2025kreis.csv`.
| `public/beispiele/berlin2026_wahlbezirke.csv` | Abgeordnetenhauswahl Berlin 2026, Zweitstimmen nach Urnen- und Briefwahlbezirken, vorläufig (`Datenexport_AGH2026_Zweitstimme_W_BE.csv`, Stand 20.09.2026) | Amt für Statistik Berlin-Brandenburg, CC BY 3.0 DE, wahlen-berlin.de |
| `public/beispiele/berlin2026_wahlkreise.csv` | dieselbe Wahl nach Wahlkreisen, Bezirken und Bundestagswahlkreisen (`Datenexport_AGH2026_Zweitstimme_A_BE.csv`, Stand 21.09.2026) | Amt für Statistik Berlin-Brandenburg, CC BY 3.0 DE |
