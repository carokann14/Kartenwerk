// Tabellen des Kennzahlen-Katalogs über die GENESIS-Schnittstelle der Regionaldatenbank laden (GitHub Action, monatlich).
// Ergebnis: je Tabelle eine Flat-File-CSV in data-src/rdb/ (bzw. RDB), danach `npm run katalog`.
//   REGIONALSTATISTIK_TOKEN=…  oder  REGIONALSTATISTIK_USERNAME=… REGIONALSTATISTIK_PASSWORD=…  npm run katalog:laden
// Schnittstelle: https://www.regionalstatistik.de/genesisws/rest/2020, POST, Zugangsdaten im Header (username/password,
// mit Token: Token als username), übrige Felder als application/x-www-form-urlencoded. Seit Mai 2025 nur mit kostenlosem
// Konto. Große Tabellen werden in Jahresblöcken abgefragt, damit keine Hintergrund-Aufträge (job=true) nötig sind.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { FETCH, TABLES } from './katalog-defs';

const BASE = process.env.REGIONALSTATISTIK_URL || 'https://www.regionalstatistik.de/genesisws/rest/2020';
const OUT = process.env.RDB || 'data-src/rdb';
const FIRST = +(process.env.RDB_START || 1990), LAST = new Date().getFullYear(), STEP = +(process.env.RDB_STEP || 6);
const token = process.env.REGIONALSTATISTIK_TOKEN, user = process.env.REGIONALSTATISTIK_USERNAME, pw = process.env.REGIONALSTATISTIK_PASSWORD;
// In der GitHub Action zusätzlich als Anmerkung (::error::/::notice::): steht dann direkt in der Zusammenfassung des Laufs
const GH = !!process.env.GITHUB_ACTIONS;
const esc = (m: string) => m.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const note = (m: string) => { console.log(m); if (GH) console.log(`::notice title=Katalog laden::${esc(m)}`); };
const die = (m: string): never => { console.error('FEHLER: ' + m); if (GH) console.log(`::error title=Katalog laden::${esc(m)}`); process.exit(1); };
if (!token && !(user && pw)) die('Zugangsdaten fehlen: Repo-Secret REGIONALSTATISTIK_TOKEN oder REGIONALSTATISTIK_USERNAME und REGIONALSTATISTIK_PASSWORD anlegen.');
// Mit Token: Token als username, password leer (Beispiel von Destatis: 'username': TOKEN, 'password': "")
const auth: Record<string, string> = token ? { username: token.trim(), password: '' } : { username: user!.trim(), password: pw! };

async function post(method: string, params: Record<string, string>) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(`${BASE}/${method}`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ language: 'de', ...params }), signal: AbortSignal.timeout(180_000) });
      return { status: r.status, type: r.headers.get('content-type') || '', buf: Buffer.from(await r.arrayBuffer()) };
    } catch (e) {
      if (attempt >= 3) throw e;
      console.warn(`   ${method}: ${(e as Error).message} – neuer Versuch in ${attempt * 20} s`);
      await new Promise(res => setTimeout(res, attempt * 20_000));
    }
  }
}
/** Antwort als Text: Zip (Flat-File-CSV) entpacken, sonst UTF-8 bzw. Windows-1252 */
function asText(buf: Buffer): string {
  if (buf[0] === 0x50 && buf[1] === 0x4b) {   // „PK“: Zip
    const tmp = path.join(os.tmpdir(), `rdb-${process.pid}.zip`);
    fs.writeFileSync(tmp, buf);
    try { buf = execFileSync('unzip', ['-p', tmp], { maxBuffer: 512 * 1024 * 1024 }); } finally { fs.rmSync(tmp, { force: true }); }
  }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); } catch { return new TextDecoder('windows-1252').decode(buf); }
}
/** JSON-Antwort statt Datei: Status der Schnittstelle (Code, Text) */
function status(text: string): { code: number; content: string } | null {
  if (!/^\s*[{[]/.test(text)) return null;
  try { const j = JSON.parse(text); const s = j.Status || j.status || j; return { code: +(s.Code ?? s.code ?? -1), content: String(s.Content ?? s.content ?? text).slice(0, 300) }; }
  catch { return { code: -1, content: text.slice(0, 300) }; }
}

// Anmeldung prüfen (zeigt früh, ob die Server von hier erreichbar sind und die Zugangsdaten stimmen)
{
  let r;
  try { r = await post('helloworld/logincheck', {}); }
  catch (e) { die(`regionalstatistik.de nicht erreichbar (${BASE}): ${(e as Error).message}${(e as { cause?: Error }).cause ? ' – ' + (e as { cause: Error }).cause.message : ''}`); }
  const t = asText(r!.buf).trim().slice(0, 300);
  note(`Anmeldung mit ${token ? 'Token' : 'Benutzername/Passwort'}: HTTP ${r!.status} (${r!.type || 'ohne Typ'}): ${t}`);
  if (r!.status !== 200 || !/erfolgreich|success/i.test(t)) die(`Anmeldung bei regionalstatistik.de fehlgeschlagen (HTTP ${r!.status}): ${t} – Zugangsdaten im Repo-Secret prüfen.`);
}
fs.mkdirSync(OUT, { recursive: true });
const warn = (m: string) => { console.warn(m); if (GH) console.log(`::warning title=Katalog laden::${esc(m)}`); };
for (const table of TABLES) {
  // Neue Tabellen sind „optional“: Fehler werden gemeldet, die Action läuft mit dem vorigen Stand weiter
  const F = FETCH[table], fail = (m: string): never => { if (F.optional) throw new Error(m); return die(m); };
  try {
  let header = '';
  const rows = new Set<string>();
  const first = Math.max(FIRST, F.from ?? FIRST), step = process.env.RDB_STEP ? STEP : F.step ?? STEP;
  for (let from = first; from <= LAST; from += step) {
    const to = Math.min(LAST, from + step - 1);
    const r = await post('data/tablefile', { name: table, area: 'all', compress: 'false', transpose: 'false', startyear: String(from), endyear: String(to), format: 'ffcsv' });
    const text = asText(r.buf), st = status(text);
    if (st) { console.log(`   ${table} ${from}–${to}: keine Daten (${st.code}: ${st.content})`); continue; }
    if (r.status !== 200) fail(`${table} ${from}–${to}: HTTP ${r.status}`);
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines[0]?.includes('statistics_code')) fail(`${table} ${from}–${to}: unerwartete Antwort: ${text.slice(0, 200)}`);
    header ||= lines[0];
    if (lines[0] !== header) fail(`${table}: Spalten der Jahresblöcke weichen voneinander ab`);
    for (const l of lines.slice(1)) rows.add(l);
    console.log(`   ${table} ${from}–${to}: ${lines.length - 1} Zeilen`);
    await new Promise(res => setTimeout(res, 1500));   // freundlich zur Schnittstelle
  }
  if (!rows.size) fail(`${table}: keine Daten erhalten`);
  note(`${table}: ${rows.size} Zeilen geladen`);
  const file = path.join(OUT, `${table}_api.csv`);
  fs.writeFileSync(file, header + '\n' + [...rows].join('\n') + '\n');
  console.log(`${file}: ${rows.size} Zeilen`);
  } catch (e) { if (!F.optional) throw e; warn(`${table}: übersprungen – ${(e as Error).message}; der Katalog behält den vorigen Stand.`); }
}
