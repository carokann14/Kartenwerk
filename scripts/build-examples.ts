// Beispieldatei „Bundestagswahl 2025 nach Gemeinden“ aus der Wahlbezirksstatistik (data-src/btw25_wbz.zip)
// Briefwahl gemeinsam ausgezählter Gemeinden anteilig verteilt, nur Zweitstimmen der größeren Parteien.
//   npx esbuild scripts/build-examples.ts --bundle --platform=node --format=esm --outfile=data-src/.tmp/build-examples.mjs && node data-src/.tmp/build-examples.mjs
import fs from 'node:fs';
import { readFile } from '../src/data/parse';
import { aggregateWbz } from '../src/data/wbz';

const buf = fs.readFileSync('data-src/btw25_wbz.zip');
const raw = await readFile('btw25_wbz.zip', buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const cells = raw.sheets[0].cells, h = cells.findIndex(r => r.includes('Bezirksart'));
const w = aggregateWbz(cells, h, 'anteilig');
const H = w.header, ix = (n: string) => { const i = H.indexOf(n); if (i < 0) throw new Error('Spalte fehlt: ' + n); return i; };
const P = ['CDU', 'CSU', 'SPD', 'AfD', 'GRÜNE', 'FDP', 'Die Linke', 'BSW', 'FREIE WÄHLER'];
const fmt = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',');
const lines = [
  '# (c) Die Bundeswahlleiterin (im Auftrag der Herausgebergemeinschaft), Wiesbaden 2025',
  '# Bundestagswahl 2025, Zweitstimmen nach Gemeinden (Wahlbezirksstatistik, gemeinsam ausgezählte Briefwahl anteilig verteilt, geschätzt)',
  ['Gemeindeschlüssel', 'Gemeinde', 'Wahlberechtigte', 'Wählende', 'Gültige · Zweitstimmen', ...P.map(p => p + ' · Zweitstimmen'), 'Übrige · Zweitstimmen', 'Briefwahl', 'Auszählungseinheit', 'Enthält'].join(';'),
];
for (const r of w.body) {
  const n = (c: string) => r[ix(c)] as number;
  const valid = n('Gültige - Zweitstimmen'), parts = P.map(p => n(p + ' - Zweitstimmen'));
  const rest = valid - parts.reduce((a, b) => a + b, 0);
  lines.push([r[0], r[1], fmt(n('Wahlberechtigte (A)')), fmt(n('Wählende (B)')), fmt(valid), ...parts.map(fmt), fmt(Math.max(0, rest)), r[ix('Briefwahl')], r[ix('Auszählungseinheit')], r[ix('Enthält')]].join(';'));
}
fs.writeFileSync('public/beispiele/btw2025_gemeinden.csv', '﻿' + lines.join('\r\n') + '\r\n');
fs.copyFileSync('data-src/btw2025kreis.csv', 'public/beispiele/btw2025_kreise.csv');
console.log('btw2025_gemeinden.csv', w.body.length, 'Gemeinden,', (fs.statSync('public/beispiele/btw2025_gemeinden.csv').size / 1024).toFixed(0), 'KB');
