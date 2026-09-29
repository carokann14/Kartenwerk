// Eingebauter Kennzahlen-Katalog (M8): Tabellen der Regionaldatenbank (Flat-File-CSV) auf die Kennzahlen des Katalogs
// verkleinern und nach public/katalog/ schreiben, dazu public/katalog/index.json. Die App liest die Dateien mit
// derselben Import-Logik wie eine selbst heruntergeladene Tabelle (Vorlage „Regionaldatenbank“).
//   RDB=<Ordner mit den Flat-File-CSVs> npm run katalog      (Standard: data-src/rdb; je Tabelle die größte Datei)
//   KATALOG_STRICT=1: Abbruch, wenn eine Tabelle fehlt (GitHub Action), sonst wird der Eintrag übersprungen
// Verkleinert wird nur, was die App nicht liest: Regierungsbezirke, nicht gewählte Merkmale, und in allen Zeilen außer der
// ersten die Wiederholungen (Statistik-, Zeit- und Merkmalsbezeichnungen, Gebietsname nach dem ersten Auftreten).
// Zeilen werden nach Periode und Gebiet sortiert (stabil), damit gleiche Daten immer dieselbe Datei ergeben: Unveränderte
// Einträge behalten ihr Abrufdatum, und die GitHub Action erkennt „nichts Neues“ am unveränderten Ordner.
import fs from 'node:fs';
import path from 'node:path';
import { readFile } from '../src/data/parse';
import { parseGenesis, TABLE_TITLES } from '../src/data/genesis';
import { DEFS } from './katalog-defs';
import { deriveAltersgruppen } from './katalog-derive';

const LEVELS = ['DINSG', 'DLAND', 'KREISE'];   // Deutschland, Länder, Kreise (auch frühere Kreise); ohne Regierungsbezirke
const DIR = process.env.RDB || 'data-src/rdb', OUT = 'public/katalog', STRICT = !!process.env.KATALOG_STRICT;
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => /\.csv$/i.test(f)) : [];
const decode = (b: Buffer) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(b).replace(/^﻿/, ''); } catch { return new TextDecoder('windows-1252').decode(b); } };
type Entry = { id: string; retrieved: string; bytes: number; [k: string]: unknown };
const old: { built: string; entries: Entry[] } | null = fs.existsSync(path.join(OUT, 'index.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8')) : null;
const entries: Entry[] = [];
let changed = false;
fs.mkdirSync(OUT, { recursive: true });
for (const d of DEFS) {
  const src = files.filter(f => f.startsWith(d.table)).sort((a, b) => fs.statSync(path.join(DIR, b)).size - fs.statSync(path.join(DIR, a)).size)[0];
  if (!src) {
    const prev = old?.entries.find(e => e.id === d.id);
    if (STRICT && !(d.optional && prev)) throw new Error(`${d.id}: keine Datei ${d.table}* in ${DIR}`);   // optionale Einträge behalten den vorigen Stand
    if (prev) { entries.push(prev); console.warn(`unverändert übernommen: ${d.id} – keine Datei ${d.table}* in ${DIR}`); }
    else console.warn(`übersprungen: ${d.id} – keine Datei ${d.table}* in ${DIR}`);
    continue;
  }
  const lines = decode(fs.readFileSync(path.join(DIR, src))).split(/\r?\n/).filter(Boolean);
  const H = lines[0].split(';'), ix = (n: string) => H.indexOf(n);
  const iVal = ix('value_variable_code'), iMeas = ix('value_variable_label'), iTime = ix('time');
  const vars: { code: number; attr: number; label: number; name: number }[] = [];
  for (let k = 1; k < 10; k++) { const c = ix(`${k}_variable_code`); if (c < 0) break; vars.push({ code: c, attr: ix(`${k}_variable_attribute_code`), label: ix(`${k}_variable_attribute_label`), name: ix(`${k}_variable_label`) }); }
  const body = lines.slice(1).map(l => l.split(';'));
  const reg = vars.findIndex(v => body.slice(0, 200).every(r => LEVELS.includes(r[v.code]) || r[v.code] === 'REGBEZ' || r[v.code] === 'GEMEIN'));
  if (reg < 0) throw new Error(`${src}: Gebietsmerkmal nicht gefunden`);
  const R = vars[reg], others = vars.filter((_, k) => k !== reg);
  const blank = [ix('statistics_label'), ix('time_code'), ix('time_label'), ...vars.map(v => v.name)].filter(i => i >= 0);
  let rows = body.filter(r => LEVELS.includes(r[R.code]) && d.keep(r[iVal], others.map(v => r[v.attr]).filter(Boolean).join('|')));
  if (d.derive === 'altersgruppen') {
    const age = others.find(v => body.slice(0, 500).some(r => /^ALT/.test(r[v.attr]))), sex = others.find(v => v !== age) || null;
    if (!age) throw new Error(`${src}: Merkmal Altersgruppen nicht gefunden`);
    rows = deriveAltersgruppen(rows, { value: ix('value'), unit: ix('value_unit'), vcode: iVal, vlabel: iMeas, time: iTime, region: R, age, sex, levels: LEVELS });
    if (!rows.length) throw new Error(`${src}: keine Altersgruppen berechenbar`);
  }
  // Namen je Gebiet vor dem Sortieren merken (in verkleinerten Dateien steht er nur einmal)
  const names = new Map<string, string>();
  for (const r of rows) if (r[R.label] && !names.has(r[R.attr])) names.set(r[R.attr], r[R.label]);
  rows.sort((a, b) => (a[iTime] < b[iTime] ? -1 : a[iTime] > b[iTime] ? 1 : 0) || LEVELS.indexOf(a[R.code]) - LEVELS.indexOf(b[R.code]) || (a[R.attr] < b[R.attr] ? -1 : a[R.attr] > b[R.attr] ? 1 : 0));
  const first = body[0], seen = new Set<string>(), out: string[] = [H.join(';')];
  for (const r of rows) {
    const row = [...r];
    if (d.rename?.[r[iVal]]) row[iMeas] = d.rename[r[iVal]];
    if (out.length > 1) for (const i of blank) row[i] = '';
    else for (const i of blank) row[i] = first[i] || row[i];   // erste Zeile: Bezeichnungen vollständig (Statistik, Zeit)
    const key = r[R.attr];
    row[R.label] = seen.has(key) ? '' : names.get(key) || r[R.label];
    seen.add(key);
    out.push(row.join(';'));
  }
  const file = `${d.table}_${d.id}.csv`, text = '﻿' + out.join('\n') + '\n';
  const target = path.join(OUT, file), prevText = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  const same = prevText === text, prev = old?.entries.find(e => e.id === d.id);
  if (!same) { fs.writeFileSync(target, text); changed = true; }
  // Prüfen mit der Import-Logik der App
  const buf = fs.readFileSync(target);
  const raw = await readFile(file, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const G = parseGenesis(raw.sheets[0].cells, file);
  const n = (l: 'de' | 'lan' | 'krs') => G.levels[l]?.size || 0;
  if (!G.periods.length || !n('lan') || !n('de')) throw new Error(`${file}: unvollständig (${G.periods.length} Perioden, Länder ${n('lan')}, DE ${n('de')})`);
  const e: Entry = { id: d.id, thema: d.thema, label: d.label, hint: d.hint, ...(d.note ? { note: d.note } : {}), table: d.table, title: TABLE_TITLES[d.table] || G.title, file,
    timeLabel: G.timeLabel, periods: G.periods, columns: G.columns, levels: { de: n('de'), lan: n('lan'), krs: n('krs') },
    source: src, retrieved: same && prev ? prev.retrieved : fs.statSync(path.join(DIR, src)).mtime.toISOString().slice(0, 10), bytes: buf.length };
  if (JSON.stringify({ ...e, source: '' }) !== JSON.stringify({ ...prev, source: '' })) changed = true;
  if (same && prev) e.source = prev.source as string;
  entries.push(e);
  console.log(`${file}: ${same ? 'unverändert' : 'NEU'}, ${out.length - 1} Zeilen, ${(buf.length / 1024).toFixed(0)} KB, ${G.periods.length} ${G.timeLabel} (${G.periods[0]} – ${G.periods[G.periods.length - 1]}), ${G.columns.length} Spalten, Kreise ${n('krs')}, Länder ${n('lan')}, DE ${n('de')}`);
}
if (changed || !old) fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ built: new Date().toISOString().slice(0, 10), entries }, null, 1) + '\n');
console.log(`${OUT}/index.json: ${entries.length} Einträge, ${changed ? 'aktualisiert' : 'keine Änderung'}`);
