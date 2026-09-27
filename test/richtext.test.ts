// Rich-Text-Marken (fett/kursiv/Farbe je Textstelle): Kernlogik ohne UI.
// Aufruf: npx esbuild test/richtext.test.ts --bundle --platform=node --format=esm --outfile=/tmp/rt.test.mjs && node /tmp/rt.test.mjs
import { boldCutOf, colorAtRange, isRangeBold, isRangeItalic, lineRuns, setMarkField, shiftMarksOnEdit, wrapRich } from '../src/lib/richtext';

const ok = (c: boolean, m: string) => { console.log((c ? 'ok: ' : 'FEHLER: ') + m); if (!c) process.exitCode = 1; };

// Beispiel aus dem Wunsch: "Die aktuelle Arbeitslosenquote in Deutschland liegt bei 6,4 Prozent."
const text = 'Die aktuelle Arbeitslosenquote in Deutschland liegt bei 6,4 Prozent.';
const start = text.indexOf('6,4 Prozent'), end = start + '6,4 Prozent'.length;

// Fett auf die Auswahl setzen
let marks = setMarkField(text, [], start, end, 'b', true);
ok(marks.length === 1 && marks[0].start === start && marks[0].end === end && marks[0].b === true, 'fett auf „6,4 Prozent“ ergibt genau eine Marke über den Bereich');
ok(isRangeBold(text, marks, start, end, false), 'Bereich gilt als fett');
ok(!isRangeBold(text, marks, 0, 3, false), 'Rest bleibt nicht fett');

// Kursiv zusätzlich auf einen Teilbereich (nur "6,4")
const mid = start + 3;
marks = setMarkField(text, marks, start, mid, 'i', true);
ok(marks.length === 2, 'Teilbereich mit zusätzlichem Kursiv spaltet die Marke auf (2 Läufe)');
ok(isRangeBold(text, marks, start, end, false) && isRangeItalic(text, marks, start, mid) && !isRangeItalic(text, marks, mid, end), '„6,4“ ist fett und kursiv, „Prozent“ nur fett');

// Farbe auf die ganze Auswahl
marks = setMarkField(text, marks, start, end, 'color', '#9E5B0B');
ok(colorAtRange(text, marks, start, start + 1, '') === '#9E5B0B', 'Farbe an der Auswahl gesetzt');

// Läufe für die Zeile (ganzer Text) ergeben: normal, fett+kursiv+farbig, fett+farbig, normal
const runs = lineRuns(text, 0, text.length, marks, 'text', '#16181B');
ok(runs.map(r => r.text).join('|') === [text.slice(0, start), text.slice(start, mid), text.slice(mid, end), text.slice(end)].join('|'), 'Läufe zerlegen den Text an den Markengrenzen: ' + runs.map(r => r.text).join('¦'));
ok(runs[1].cut === 'bold' && runs[1].italic === true && runs[1].color === '#9E5B0B', 'mittlerer Lauf ist MW Bold + kursiv + eigene Farbe');
ok(runs[0].cut === 'text' && !runs[0].italic, 'erster Lauf bleibt normal');

// boldCutOf: Grundschnitt bereits „bold“, Auswahl ausdrücklich „nicht fett“ → Textschnitt
ok(boldCutOf('bold', false) === 'text', 'nicht-fett auf fettem Grundschnitt ergibt den Textschnitt');
ok(boldCutOf('display', undefined) === 'display', 'ohne Marke bleibt der Grundschnitt');

// Tippen mitten in der Auswahl verschiebt die nachfolgende Marke, neue Zeichen erben ihren Stil
const withInsert = text.slice(0, mid) + 'XX' + text.slice(mid);
const shifted = shiftMarksOnEdit(text, withInsert, marks);
ok(isRangeBold(withInsert, shifted, start, end + 2, false), 'fette Formatierung wächst um die eingefügten 2 Zeichen: ' + JSON.stringify(shifted));
ok(isRangeItalic(withInsert, shifted, start, mid + 2) && !isRangeItalic(withInsert, shifted, mid + 2, end + 2), 'die eingefügten Zeichen übernehmen den Stil davor (kursiv wächst mit, der Rest bleibt nur fett)');

// Löschen vor der Auswahl verschiebt sie zurück, ohne den Stil zu ändern
const withDelete = text.slice(0, 4) + text.slice(10); // 6 Zeichen vor der Auswahl gelöscht
const shifted2 = shiftMarksOnEdit(text, withDelete, marks);
ok(isRangeBold(withDelete, shifted2, start - 6, end - 6, false), 'Löschen vor der Auswahl verschiebt die fette Formatierung um die gelöschte Länge zurück: ' + JSON.stringify(shifted2));

// Umbruch: ein fett gesetztes Wort ist (- mit echter Schrift) breiter, hier mit Fallback-Messung nur die Bereichslogik geprüft
const wrapped = wrapRich(text, marks, 'text', 20, 999999); // maxW riesig → eine Zeile
ok(wrapped.length === 1 && wrapped[0].from === 0 && wrapped[0].to === text.length, 'ohne Umbruchzwang bleibt alles eine Zeile');
const wrapped2 = wrapRich('Erste Zeile\nZweite Zeile', [], 'text', 20, 999999);
ok(wrapped2.length === 2, 'harter Zeilenumbruch \\n ergibt zwei Zeilen');
