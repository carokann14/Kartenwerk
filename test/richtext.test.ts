// Rich-Text-Marken (fett/kursiv/Farbe je Textstelle): Kernlogik ohne UI.
// Aufruf: npx esbuild test/richtext.test.ts --bundle --platform=node --format=esm --outfile=/tmp/rt.test.mjs && node /tmp/rt.test.mjs
import { boldCutOf, clampRange, colorAtRange, isRangeBold, isRangeItalic, lineRuns, setMarkField, shiftMarksOnEdit, wrapRich } from '../src/lib/richtext';

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

// Veraltete Auswahl (Absturz 02.10.2026): Nach dem Löschen einer markierten Stelle am Textende fragte die Formatleiste noch mit der
// alten Auswahl nach – über das Textende hinaus. Das darf weder werfen noch etwas Falsches melden.
const kurz = 'Stärkste Partei je ';   // „Wahlkreis“ markiert und gelöscht, Auswahl steht noch bei 19–28
let warf = false;
try {
  ok(!isRangeBold(kurz, [], 19, 28, false), 'veraltete Auswahl hinter dem Textende: nicht fett, kein Fehler');
  ok(!isRangeItalic(kurz, [{ start: 0, end: 40, i: true }], 19, 28), 'veraltete Auswahl hinter dem Textende: nicht kursiv, kein Fehler');
  ok(colorAtRange(kurz, [{ start: 0, end: 40, color: '#E63946' }], 30, 40, '#16181B') === '#16181B', 'Farbe einer Auswahl ganz hinter dem Text: Grundfarbe');
  ok(isRangeBold(kurz, [], 5, 28, true), 'Auswahl teils hinter dem Text: der vorhandene Teil zählt (Grundschnitt fett)');
  const mk = setMarkField(kurz, [], 10, 99, 'b', true);
  ok(mk.length === 1 && mk[0].start === 10 && mk[0].end === kurz.length, 'Formatieren mit zu langer Auswahl endet am Textende: ' + JSON.stringify(mk));
  ok(JSON.stringify(clampRange('abc', 5, 2)) === '[2,3]' && JSON.stringify(clampRange('abc', -4, 1)) === '[0,1]', 'clampRange begrenzt und ordnet');
  ok(!isRangeBold('', [], 0, 3, true) && colorAtRange('', [], 0, 3, '#000') === '#000', 'leerer Text (alles gelöscht): kein Fehler');
  // Ersetzen einer Auswahl am Ende: Stil des Zeichens davor wird übernommen, Marken bleiben im Text
  const vorher = 'Hallo Welt', fett = setMarkField(vorher, [], 6, 10, 'b', true);
  const nachher = shiftMarksOnEdit(vorher, 'Hallo X', fett);
  ok(nachher.every(m => m.end <= 'Hallo X'.length), 'Ersetzen am Textende: keine Marke ragt über den Text hinaus ' + JSON.stringify(nachher));
  ok(isRangeBold('Hallo X', nachher, 6, 7, false), 'fett markiertes Wort überschrieben: das neue Wort bleibt fett');
  const davor = shiftMarksOnEdit(vorher, 'Hallo Welt!', fett);
  ok(isRangeBold('Hallo Welt!', davor, 6, 11, false), 'Tippen direkt hinter einem fetten Wort: Zeichen übernimmt den Stil davor');
  const normal = shiftMarksOnEdit(vorher, 'Hey Welt', fett);
  ok(!isRangeBold('Hey Welt', normal, 0, 3, false) && isRangeBold('Hey Welt', normal, 4, 8, false), 'nicht formatierten Teil ersetzen: bleibt normal, das fette Wort rückt nach');
  const leer = shiftMarksOnEdit(vorher, '', fett);
  ok(leer.length === 0, 'alles markiert und gelöscht: keine Marken übrig');
} catch (e) { warf = true; ok(false, 'Formatabfrage mit veralteter Auswahl warf: ' + (e as Error).message); }
ok(!warf, 'keine Ausnahme bei veralteter Auswahl');
