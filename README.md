# Kartenwerk

Karten zur deutschen Politik für Social Media. Daten aus CSV oder Excel importieren, Gebiete einfärben und beschriften, als **Canva-SVG** (echte Vektoren) oder **PNG** exportieren.

Kartenwerk läuft komplett im Browser. Deine Dateien werden nirgendwohin hochgeladen, es gibt keinen Server, kein Konto, keine Cookies und keine Anfragen an Dritte.

**Stand: M3 · Etappe 1 (Verwaltungsebenen: Länder bis Gemeinden)**

## Was Kartenwerk kann

- **Gebiete:** Bundestagswahlkreise 2025 und 2021 sowie Länder, Regierungsbezirke, Kreise, Gemeindeverbände und Gemeinden (amtliche Grenzen des BKG, Gebietsstand 01.01.2025 und 01.01.2026). Jede Ebene ist ein eigener Gebietsstand. Fokus auf Deutschland, ein Land, einen Kreis, ein Gebiet oder eine freie Kombination, mit Umfeld und Fokusumriss. Gebietsbaum Land › Kreis › Gemeinde, Suche nach Name, Kreis oder Schlüssel, im Kartenmodus per Doppelklick eine Ebene tiefer. Große Ebenen wie die Gemeinden werden erst geladen, wenn man sie braucht, und je nach Maßstab vereinfacht gezeichnet.
- **Daten importieren:** Assistent in fünf Schritten (Datei, Aufbau, Spalten, Gebiete, Zuordnung).
  - Vorlagen für die Dateien der Bundeswahlleiterin: `kerg.csv`, `kerg2.csv`, die Umrechnungen auf neue Wahlkreise, die Ergebnisse nach Kreisen (`btw2025kreis.csv`) und die Wahlbezirksstatistik (`btw25_wbz.zip` direkt, ohne Entpacken).
  - Wahlbezirke → Gemeinden: Die Bezirke werden je Gemeinde zusammengefasst. Wo mehrere Gemeinden die Briefwahl gemeinsam auszählen, wählst du: Briefwahl **anteilig verteilen** (geschätzt, in der Spalte „Briefwahl“ gekennzeichnet) oder die Gemeinden **als eine Fläche** zeigen. Gemeinden ohne eigenen Wahlbezirk („einschl. …“) erscheinen mit ihrer Nachbargemeinde.
  - Allgemeine CSV- und Excel-Dateien: Kodierung, Trennzeichen, Kopfzeilen und deutsches Zahlenformat werden erkannt.
  - Zuordnung über Wahlkreisnummer, Gemeindeschlüssel (8 oder 12 Stellen) oder Kreisschlüssel und Gebietsstand, ergänzend über den Namen. Ebene und Stand werden aus den Kennungen vorgeschlagen. Mehrdeutige, unbekannte und doppelte Zeilen werden angezeigt und lassen sich korrigieren. Fehlende Werte sind nie 0.
  - „Daten ersetzen“ lädt eine neue Fassung derselben Datei, Layout und Gestaltung bleiben.
- **Färbung:** Sieger + Stärke, Stärkste Partei, Parteianteil, Zahlenwert, Kategorie. Parteifarben je Projekt änderbar, einzelne Gebiete manuell überschreibbar.
- **Kreisgrenzen:** In Gemeindekarten als eigene, kräftigere Linienebene. Gemeindefreie Gebiete (Forste, Truppenübungsplätze) erscheinen neutral und nicht als „keine Daten“.
- **Elemente:** Titel, Unterzeile, Quellenzeile (Pflichtteil automatisch), Legende, Detail-Lupe (Berlin, Hamburg, München, Köln, Frankfurt, Bremen), Beschriftungen mit Vorlagen und Kollisionsprüfung.
- **Schraffuren:** schräg, gegenläufig, Kreuz, waagrecht, senkrecht, Punkte; Farbe, Stärke und Abstand einstellbar, über der Datenfarbe oder auf eigener Fläche. Zuweisung aus Daten (Spalte hat einen Wert bzw. liegt über oder unter einer Schwelle), für alle Gebiete ohne Daten oder von Hand. Im Canva-SVG echte Linien und Punkte.
- **Legende bearbeiten:** Texte ändern, Einträge ausblenden und sortieren, Farben von Parteien und Kategorien ändern, eigene Einträge (Fläche, Schraffur, Linie), Anordnung untereinander, nebeneinander oder als Raster.
- **Ortsmarker:** Ortssuche über das amtliche Gemeindeverzeichnis (10.749 Gemeinden), Klick in die Karte oder Koordinaten. Formen Kreis, Quadrat, Dreieck, Raute, Stern, Stecknadel oder eigenes einfarbiges SVG-Symbol; Beschriftung mit Position, verschiebbar mit Führungslinie; Marker mit gleichem Legendentext bilden einen Legendeneintrag.
- **Textkästen:** an einen Kartenpunkt gehängt (mit Führungslinie) oder frei auf der Fläche; Umbruchbreite, Ausrichtung, Hintergrund und Rahmen.
- **Pfeile:** gerade oder gebogen, Spitze am Ziel, am Start, an beiden Enden oder keine, auch gestrichelt. Die Enden rasten an Markern, Textkästen und Gebietsmitten ein und bleiben verbunden, wenn du die Elemente verschiebst.
- **Formate:** 4:5, 1:1, 9:16, 16:9, LinkedIn und frei. Jede Variante hat ihr eigenes Layout.
- **Export:** Canva-SVG mit Prüfbericht (SVG 1.1, Text als Pfade, keine Transparenz, unter 3 MB) und PNG in beliebiger Breite, auch mit transparentem Hintergrund. Bei sehr vielen Gebieten (Gemeinden) fasst der Export Gebiete gleicher Farbe zu einer Fläche zusammen, damit die Datei unter der Canva-Grenze bleibt; die Grenzen bleiben als eigene Linien erhalten.
- **Speichern:** Jedes Projekt wird laufend im Browser gesichert. Zusätzlich lässt es sich als Projektdatei (`.kartenwerk.json`) speichern und wieder öffnen.

Als Nächstes in M3: Navigation über Ebenen hinweg (Grenzen anderer Ebenen einblenden), Farbmodi Veränderung und stetig, Blasen aus Tabellenwerten, eigene Gebiete. Danach M4 mit eigenen Geodaten und Landtagswahlkreisen.

## Einrichten auf GitHub Pages (einmalig)

1. Auf GitHub ein öffentliches Repository anlegen (hier: `Kartenwerk`). Kein README, keine Lizenz anhaken, beides ist schon im Ordner.
2. Die ZIP-Datei auf dem Rechner entpacken. GitHub packt ZIP-Dateien nicht aus, deshalb nie die ZIP selbst hochladen.
3. Im Repo **Add file › Upload files**. Den entpackten Ordner `kartenwerk` öffnen, **alles darin** markieren (Strg+A) und in das Upload-Feld ziehen. Nicht den Ordner `kartenwerk` selbst ziehen, sonst liegt `docs` eine Ebene zu tief.
4. Unten **Commit changes**.
5. **Settings › Pages**. Bei „Build and deployment“: Source **Deploy from a branch**, Branch **main**, Ordner **/docs**. **Save**.
6. Nach ein bis zwei Minuten läuft Kartenwerk unter `https://carokann14.github.io/Kartenwerk/`.

Danach liegen im Repo direkt `docs`, `src`, `public` und `README.md`.

### Neue Version einspielen

Den neuen Ordner genauso hochladen (**Add file › Upload files**) und committen. Gleichnamige Dateien werden ersetzt. Deine Projekte bleiben erhalten, weil sie in deinem Browser liegen, nicht im Repo.

Wenn Dateien in einer neuen Version wegfallen, stehen sie in den Versionshinweisen. Sie lassen sich auf GitHub einzeln löschen, stören aber auch nicht.

GitHub nimmt beim Hochladen im Browser höchstens 100 Dateien und je Datei höchstens 25 MB. Die größten Dateien (Verwaltungsgrenzen) haben rund 7,5 MB.

## Daten

- Beispieldateien stecken im Importassistenten („Beispieldateien“) und im Startdialog.
- **Kreise und Gemeinden:** Beispiele „Bundestagswahl 2025 nach Kreisen“ (amtliche Datei) und „nach Gemeinden“ (aus der Wahlbezirksstatistik abgeleitet, Briefwahl teils anteilig geschätzt). Beide stehen auch im Startdialog.
- **Bundestagswahl 2025:** Das amtliche Endergebnis (`kerg2.csv`) ist als Beispiel dabei, mit den Werten der Vorperiode (2021, umgerechnet) und der Spalte „Direktmandat“ (Partei des gewählten Wahlkreisbewerbers oder „nicht zugeteilt“). Neuere Dateien gibt es auf bundeswahlleiterin.de unter *Ergebnisse › Open Data*; die Vorlage „Bundeswahlleiterin · kerg2 (Langformat)“ wird automatisch erkannt.
- Wahlkreisnummern gelten nur zusammen mit dem Gebietsstand. Ergebnisse 2021 gehören auf die Wahlkreise 2021, die amtliche Umrechnung auf die Wahlkreise 2025.

## Sicherung

Browserdaten können beim Aufräumen oder in privaten Fenstern verloren gehen. Wichtige Projekte daher zusätzlich über das Projektmenü (Pfeil neben dem Projektnamen) als Projektdatei speichern, Tastenkürzel **Strg+S**.

## Tastenkürzel

| Taste | Wirkung |
| --- | --- |
| Strg+Z / Strg+Umschalt+Z | Rückgängig / Wiederholen |
| Strg+S | Projektdatei speichern |
| Strg+0 | Ansicht einpassen |
| Leertaste + Ziehen | Ansicht verschieben |
| Doppelklick auf die Karte | Kartenmodus (Esc beendet) |
| Pfeiltasten (mit Umschalt) | ausgewähltes Element um 1 (10) px verschieben |
| Entf | ausgewählten Marker, Textkasten oder Pfeil löschen bzw. manuelle Farbe der ausgewählten Gebiete entfernen |
| Strg+D | ausgewählten Marker, Textkasten oder Pfeil duplizieren |

## Für Entwickler

Nur nötig, wenn du am Code arbeiten willst. Für die Nutzung reicht der Ordner `docs`.

```bash
npm install
npm run dev            # Entwicklungsserver
npm run build          # Typprüfung und Build nach docs/ (GitHub Pages)
npm run build:preview  # eine einzelne HTML-Datei mit eingebetteten Daten
npm run geodata        # Geodaten neu aufbereiten (Quelldateien in data-src/, siehe DATENLIZENZEN.md)
npm run orte           # Ortsliste aus dem Gemeindeverzeichnis (data-src/AuszugGV….xlsx)
npm run vg250          # Verwaltungsgrenzen aus data-src/vg250-<Jahr>.zip (BKG)
npm run beispiele      # Beispiel „nach Gemeinden“ aus data-src/btw25_wbz.zip
```

Bekannte Einschränkung: Excel wird mit SheetJS 0.18.5 gelesen, der letzten Fassung auf npm. Sie hat bekannte Schwachstellen bei präparierten Dateien (CVE-2023-30533, CVE-2024-22363). Weil alles lokal im Browser läuft, ist das Risiko gering. Excel-Dateien aus unbekannten Quellen besser vorher als CSV speichern. Das Update auf 0.20 folgt, sobald es sich hier einbinden lässt.

Aufbau: React, TypeScript und Vite. Geometrien liegen vorab projiziert (ETRS89 / UTM 32) und vereinfacht in `public/data`. Die Texte im SVG-Export werden mit opentype.js in Pfade umgewandelt.

## Lizenzen

- Code: MIT, siehe `LICENSE`.
- Geodaten, Beispieldaten und Schriften haben eigene Lizenzen, siehe `DATENLIZENZEN.md`. Die Quellenzeile der Grafiken erzeugt Kartenwerk automatisch passend dazu.
