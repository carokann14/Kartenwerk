# Datenquellen und Lizenzen

Kartenwerk bringt vorbereitete Geodaten, zwei Beispieldateien und Schriften mit. Sie stehen nicht unter der MIT-Lizenz des Codes, sondern unter den Lizenzen unten. Die Quellenzeile jeder Grafik nennt die nötigen Vermerke automatisch.

## Wahlkreisgeometrien

| Datei | Inhalt | Quelle | Lizenz |
| --- | --- | --- | --- |
| `public/data/btw-wk-2025.json` | 299 Wahlkreise der Bundestagswahl 2025 | © Die Bundeswahlleiterin, Statistisches Bundesamt, Wiesbaden 2024; Geoinformationen © GeoBasis-DE / BKG 2024 | Datenlizenz Deutschland – Namensnennung – Version 2.0 (dl-de/by-2-0) |
| `public/data/btw-wk-2021.json` | 299 Wahlkreise der Bundestagswahl 2021 | © Der Bundeswahlleiter, Wiesbaden 2020; Geoinformationen © GeoBasis-DE / BKG 2020 | dl-de/by-2-0 |

Bezug: bundeswahlleiterin.de, *Bundestagswahl › Wahlkreiseinteilung › Downloads*. Aufbereitung für Kartenwerk: nach ETRS89 / UTM 32 (EPSG:25832) projiziert, auf rund 150 m vereinfacht, als gemeinsame Topologie gespeichert. Deshalb steht in der Quellenzeile „vereinfacht“.

Lizenztext dl-de/by-2-0: https://www.govdata.de/dl-de/by-2-0

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

Die Bundeswahlleiterin erlaubt die Verwendung der Ergebnisse mit Quellenangabe. Die Dateien sind unverändert.

## Schriften

- **Merriweather** (Grafiken, auch als Pfade im Export): © The Merriweather Project Authors, SIL Open Font License 1.1. In vier Schnitte instanziiert und auf lateinische Zeichen reduziert.
- **IBM Plex Sans / IBM Plex Mono** (Oberfläche): © IBM Corp., SIL Open Font License 1.1, über das Paket @fontsource eingebunden.

Lizenztext: https://openfontlicense.org

## Bibliotheken

React, zustand, immer, opentype.js (MIT) und SheetJS Community Edition 0.18.5 (Apache-2.0) für Excel-Dateien.

## Geodaten neu aufbereiten

`npm run geodata` liest GeoJSON-Dateien aus `data-src/` (nicht im Repo, weil groß): `wkr2025.geojson`, `wkr2021.geojson` (Wahlkreisgeometrien der Bundeswahlleiterin), `ne_10m_countries.geojson`, `ne_10m_lakes.geojson` (Natural Earth).
