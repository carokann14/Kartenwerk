// Oberflächen-Hilfen ohne Browser: Platzierung des Farbwählers im Fenster (Fehler 02.10.2026: Farbwähler wurde am
// Rand der Leisten bzw. des Fensters abgeschnitten).
// Aufruf: npx esbuild test/ui.test.ts --bundle --platform=node --format=esm --outfile=/tmp/ui.test.mjs && node /tmp/ui.test.mjs
import { placePopover } from '../src/lib/place';

const ok = (c: boolean, m: string) => { console.log((c ? 'ok: ' : 'FEHLER: ') + m); if (!c) process.exitCode = 1; };
const W = 1440, H = 900, PW = 220, PH = 250;
const box = (left: number, top: number, w = 28, h = 24) => ({ left, top, right: left + w, bottom: top + h });
const inside = (p: { left: number; top: number }, vw = W, vh = H) => p.left >= 0 && p.top >= 0 && p.left + PW <= vw && p.top + PH <= vh;
const overlaps = (p: { left: number; top: number }, a: ReturnType<typeof box>) => !(p.left + PW <= a.left || p.left >= a.right || p.top + PH <= a.top || p.top >= a.bottom);

// Normalfall: genug Platz darunter → linksbündig unter dem Feld
let a = box(100, 200), p = placePopover(a, PW, PH, W, H);
ok(p.left === 100 && p.top === 228, 'genug Platz: unter dem Feld, linksbündig ' + JSON.stringify(p));

// Rechter Fensterrand (rechte Leiste): rechtsbündig am Feld, ganz im Fenster
a = box(1400, 200); p = placePopover(a, PW, PH, W, H);
ok(inside(p) && p.left + PW === a.right, 'rechter Rand: rechtsbündig und ganz sichtbar ' + JSON.stringify(p));

// Unterer Fensterrand: über dem Feld
a = box(300, 860); p = placePopover(a, PW, PH, W, H);
ok(inside(p) && p.top + PH <= a.top, 'unterer Rand: über dem Feld, ganz sichtbar ' + JSON.stringify(p));

// Ecke unten rechts
a = box(1410, 870); p = placePopover(a, PW, PH, W, H);
ok(inside(p) && !overlaps(p, a), 'Ecke unten rechts: ganz sichtbar, Feld bleibt frei ' + JSON.stringify(p));

// Linker Rand (Feld teils außerhalb)
a = box(-10, 100); p = placePopover(a, PW, PH, W, H);
ok(inside(p), 'linker Rand: ins Fenster geschoben ' + JSON.stringify(p));

// Niedriges Fenster, weder darüber noch darunter genug Platz: trotzdem ganz im Fenster
a = box(200, 140); p = placePopover(a, PW, PH, 1100, 300);
ok(inside(p, 1100, 300), 'niedriges Fenster: ganz sichtbar ' + JSON.stringify(p));

console.log(process.exitCode ? '' : 'Alle Oberflächen-Tests bestanden.');

// ---------- Import: Summenzeilen einer reinen Ländertabelle (Fehler 02.10.2026) ----------
// Landeszeilen gelten in Kreis-/Gemeindetabellen als Summen. In einer Tabelle, die nur Länder enthält, waren dadurch alle
// Zeilen „Summenzeilen“: nichts wurde zugeordnet, „Übernehmen“ blieb gesperrt und die Ebene „Länder“ wurde nicht erkannt.
import { summaryFlags } from '../src/data/pipeline';
import type { Column, ImportSettings } from '../src/data/types';
const cols: Column[] = [
  { id: 'c0', label: 'Schlüssel', kind: 'text', role: 'id', party: null, short: null },
  { id: 'c1', label: 'Land', kind: 'text', role: 'name', party: null, short: null },
  { id: 'c2', label: 'Quote', kind: 'number', role: 'value', party: null, short: null },
];
const st = { preset: 'allgemein', excludeSummary: true, geoSet: '' } as unknown as ImportSettings;
const laender = [['01', 'Schleswig-Holstein', 5.6], ['02', 'Hamburg', 7.4], ['09', 'Bayern', 3.8], ['16', 'Thüringen', 6.2]];
let fl = summaryFlags([...laender, ['', 'Deutschland', 6.3]], cols, st);
ok(fl.slice(0, 4).every(f => !f) && fl[4] === true, 'Ländertabelle: Länder sind Daten, „Deutschland“ bleibt Summenzeile ' + JSON.stringify(fl));
fl = summaryFlags([...laender, ['', '', null]], cols, st);
ok(fl.slice(0, 4).every(f => !f), 'Ländertabelle mit Leerzeile am Ende: Länder bleiben Daten');
const kreise = [['01', 'Schleswig-Holstein', 5.6], ['01001', 'Flensburg', 8.1], ['01002', 'Kiel', 8.9], ['09', 'Bayern', 3.8], ['09162', 'München', 4.6]];
fl = summaryFlags(kreise, cols, st);
ok(fl[0] && !fl[1] && !fl[2] && fl[3] && !fl[4], 'Kreistabelle: Landeszeilen bleiben Summenzeilen ' + JSON.stringify(fl));
fl = summaryFlags(kreise, cols, { ...st, excludeSummary: false });
ok(fl.every(f => !f), 'Summenzeilen nicht ausschließen: keine Zeile ist Summe');
console.log(process.exitCode ? '' : 'Alle Import-Summen-Tests bestanden.');
