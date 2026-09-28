// Eingebauter Kennzahlen-Katalog (M8): Tabellen der Regionaldatenbank (Flat-File-CSV) auf die Kennzahlen des Katalogs
// verkleinern und nach public/katalog/ schreiben, dazu public/katalog/index.json. Die App liest die Dateien mit
// derselben Import-Logik wie eine selbst heruntergeladene Tabelle (Vorlage „Regionaldatenbank“).
//   RDB=<Ordner mit den Flat-File-CSVs> npm run katalog      (Standard: data-src/rdb)
// Verkleinert wird nur, was die App nicht liest: Regierungsbezirke, nicht gewählte Merkmale, und in allen Zeilen außer der
// ersten die Wiederholungen (Statistik-, Zeit- und Merkmalsbezeichnungen, Gebietsname nach dem ersten Auftreten).
import fs from 'node:fs';
import path from 'node:path';
import { readFile } from '../src/data/parse';
import { parseGenesis, TABLE_TITLES } from '../src/data/genesis';

interface Def {
  id: string; thema: string; label: string; hint: string; table: string;
  /** Zeile übernehmen? v = Code des Werts (value_variable_code), a = Ausprägungen der übrigen Merkmale (leer = Insgesamt) */
  keep: (v: string, a: string) => boolean;
  /** kürzere Bezeichnungen der Werte (value_variable_label) */
  rename?: Record<string, string>;
}
export const DEFS: Def[] = [
  { id: 'bevoelkerung', thema: 'Bevölkerung', table: '12411-01-01-4', label: 'Bevölkerung', hint: 'Einwohnerinnen und Einwohner insgesamt, weiblich und männlich, jeweils am 31.12.', keep: () => true },
  { id: 'arbeitslosigkeit', thema: 'Arbeit', table: '13211-02-05-4', label: 'Arbeitslosenquote', hint: 'Jahresdurchschnitt, bezogen auf alle zivilen Erwerbspersonen; auch für Frauen, Männer, Ausländer und 15- bis 25-Jährige, dazu die Zahl der Arbeitslosen', keep: (v, a) => v === 'ERWP10' || (v === 'ERWP06' && !a), rename: { ERWP10: 'Arbeitslosenquote' } },
  { id: 'wahlbeteiligung', thema: 'Wahlen', table: '14111-01-04-4', label: 'Wahlbeteiligung bei Bundestagswahlen', hint: 'Wahlberechtigte und Wahlbeteiligung je Bundestagswahl', keep: v => v === 'WAHL01' || v === 'WAHLSR' },
  { id: 'bundestagswahlen', thema: 'Wahlen', table: '14111-01-04-4', label: 'Bundestagswahlen: Zweitstimmen', hint: 'Zweitstimmen von CDU/CSU, SPD, AfD, Grünen, FDP und Linken je Bundestagswahl, dazu Wahlbeteiligung', keep: () => true },
];
const LEVELS = new Set(['DINSG', 'DLAND', 'KREISE']);   // Deutschland, Länder, Kreise (auch frühere Kreise); ohne Regierungsbezirke

const DIR = process.env.RDB || 'data-src/rdb', OUT = 'public/katalog';
const files = fs.readdirSync(DIR).filter(f => /\.csv$/i.test(f));
const decode = (b: Buffer) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(b).replace(/^﻿/, ''); } catch { return new TextDecoder('windows-1252').decode(b); } };
const entries: unknown[] = [];
fs.mkdirSync(OUT, { recursive: true });
for (const d of DEFS) {
  const src = files.filter(f => f.startsWith(d.table)).sort((a, b) => fs.statSync(path.join(DIR, b)).size - fs.statSync(path.join(DIR, a)).size)[0];
  if (!src) { console.warn(`übersprungen: ${d.id} – keine Datei ${d.table}* in ${DIR}`); continue; }
  const lines = decode(fs.readFileSync(path.join(DIR, src))).split(/\r?\n/).filter(Boolean);
  const H = lines[0].split(';'), ix = (n: string) => H.indexOf(n);
  const iVal = ix('value_variable_code'), iMeas = ix('value_variable_label');
  const vars: { code: number; attr: number; label: number; name: number }[] = [];
  for (let k = 1; k < 10; k++) { const c = ix(`${k}_variable_code`); if (c < 0) break; vars.push({ code: c, attr: ix(`${k}_variable_attribute_code`), label: ix(`${k}_variable_attribute_label`), name: ix(`${k}_variable_label`) }); }
  const body = lines.slice(1).map(l => l.split(';'));
  const reg = vars.findIndex(v => body.slice(0, 200).every(r => LEVELS.has(r[v.code]) || r[v.code] === 'REGBEZ' || r[v.code] === 'GEMEIN'));
  if (reg < 0) throw new Error(`${src}: Gebietsmerkmal nicht gefunden`);
  const others = vars.filter((_, k) => k !== reg);
  const blank = [ix('statistics_label'), ix('time_code'), ix('time_label'), ...vars.map(v => v.name)].filter(i => i >= 0);
  const seen = new Set<string>(), out: string[] = [H.join(';')];
  for (const r of body) {
    if (!LEVELS.has(r[vars[reg].code])) continue;
    if (!d.keep(r[iVal], others.map(v => r[v.attr]).filter(Boolean).join('|'))) continue;
    const row = [...r];
    if (d.rename?.[r[iVal]]) row[iMeas] = d.rename[r[iVal]];
    if (out.length > 1) for (const i of blank) row[i] = '';
    const key = r[vars[reg].attr];
    if (seen.has(key)) row[vars[reg].label] = ''; else seen.add(key);
    out.push(row.join(';'));
  }
  const file = `${d.table}_${d.id}.csv`, text = out.join('\n') + '\n';
  fs.writeFileSync(path.join(OUT, file), '﻿' + text);
  // Prüfen mit der Import-Logik der App
  const buf = fs.readFileSync(path.join(OUT, file));
  const raw = await readFile(file, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const G = parseGenesis(raw.sheets[0].cells, file);
  const n = (l: 'de' | 'lan' | 'krs') => G.levels[l]?.size || 0;
  const e = { id: d.id, thema: d.thema, label: d.label, hint: d.hint, table: d.table, title: TABLE_TITLES[d.table] || G.title, file,
    timeLabel: G.timeLabel, periods: G.periods, columns: G.columns, levels: { de: n('de'), lan: n('lan'), krs: n('krs') },
    source: src, retrieved: fs.statSync(path.join(DIR, src)).mtime.toISOString().slice(0, 10), bytes: buf.length };
  entries.push(e);
  console.log(`${file}: ${out.length - 1} Zeilen, ${(buf.length / 1024).toFixed(0)} KB, ${G.periods.length} ${G.timeLabel} (${G.periods[0]} – ${G.periods[G.periods.length - 1]}), ${G.columns.length} Spalten, Kreise ${n('krs')}, Länder ${n('lan')}, DE ${n('de')}`);
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ built: new Date().toISOString().slice(0, 10), entries }, null, 1) + '\n');
console.log(`${OUT}/index.json: ${entries.length} Einträge`);
