// Wahlbezirksstatistik der Bundeswahlleiterin → Ergebnisse je Gemeinde
//
// Die Datei enthält je Zeile einen Urnen- oder Briefwahlbezirk. Viele Ämter, Samt- und Verbandsgemeinden
// zählen die Briefwahl gemeinsam für mehrere Gemeinden aus („Kennziffer Briefwahlzugehörigkeit“).
// Diese Stimmen lassen sich amtlich keiner einzelnen Gemeinde zuordnen. Zwei Wege:
//   anteilig  – Briefwahlstimmen nach der Zahl der Wahlberechtigten mit Wahlschein (Sperrvermerk W) je Gemeinde verteilt,
//               die Parteianteile der gemeinsamen Briefwahl gelten dabei für alle Gemeinden (geschätzt, gekennzeichnet)
//   gemeinsam – die Gemeinden erhalten die gemeinsame Summe und erscheinen als eine Fläche
// Gemeinden, deren Wahlbezirk nach § 68 BWO in einer Nachbargemeinde enthalten ist, sind immer gemeinsam.
import type { Cell } from './types';

export type BriefwahlMode = 'anteilig' | 'gemeinsam';
export const BRIEF_LABEL = { own: 'eigene Auszählung', est: 'anteilig geschätzt', joint: 'gemeinsam ausgezählt' } as const;

interface Unit { ags: string; name: string; urn: Float64Array; brief: Float64Array; w: number; wa: number; bz: string; kbz: string; u68: Set<string>; incl: Set<string> }

/** „Hennstedt (einschl. Bergewöhrden)“ → [„Bergewöhrden“]: Gemeinden ohne eigenen Wahlbezirk */
const included = (s: string) => { const m = s.match(/\(\s*einschl\.\s*([^)]*)\)?\s*$/i); return m ? m[1].split(/\s*,\s*|\s+und\s+/).map(x => x.trim()).filter(Boolean) : []; };
const clean = (s: string) => s
  .replace(/\s*\(\s*in .*? enthalten\)?\s*$/i, '').replace(/\s*\(einschl\..*\)?\s*$/i, '')
  .replace(/,\s*Bezirk .*$/i, '').replace(/\s*\(Teil\)\s*$/i, '').trim();

export interface WbzResult { header: string[]; body: Cell[][]; notes: string[]; joint: Record<string, string>; stats: { gemeinden: number; own: number; est: number; joint: number; orphans: number } }

export function aggregateWbz(cells: Cell[][], headerRow: number, mode: BriefwahlMode): WbzResult {
  const H = (cells[headerRow] || []).map(v => String(v ?? '').trim());
  const ix = (n: string) => H.indexOf(n);
  const I = { L: ix('Land'), R: ix('Regierungsbezirk'), K: ix('Kreis'), G: ix('Gemeinde'), U68: ix('Kennziffer Urnenwahlbezirke nach § 68 BWO'), BZ: ix('Kennziffer Briefwahlzugehörigkeit'), N: ix('Gemeindename'), A: ix('Bezirksart'), A2: ix('Wahlberechtigte mit Sperrvermerk (A2)'), WA: ix('Wahlberechtigte (A)') };
  if (Object.values(I).some(v => v < 0)) throw new Error('Das ist keine Datei der Wahlbezirksstatistik (Spalten fehlen).');
  // Zahlenspalten: von „Wahlberechtigte (A)“ bis vor die beiden Textspalten am Ende
  let last = H.length - 1; while (last > I.WA && /Bezeichnung|Wahlbezirksbezeichnung/.test(H[last])) last--;
  const numCols: number[] = []; for (let c = I.WA; c <= last; c++) numCols.push(c);
  const nc = numCols.length, a2 = numCols.indexOf(I.A2), wa = numCols.indexOf(I.WA);
  const num = (v: Cell) => typeof v === 'number' ? v : (v == null || v === '' ? 0 : Number(String(v).replace(/\./g, '').replace(',', '.')) || 0);
  const units = new Map<string, Unit>();
  const briefRows: { ags: string; kbz: string; vals: Float64Array; name: string }[] = [];
  for (let r = headerRow + 1; r < cells.length; r++) {
    const row = cells[r]; if (!row || row.length < H.length - 3) continue;
    const s = (i: number) => String(row[i] ?? '').trim();
    const L = s(I.L), R = s(I.R), K = s(I.K), G = s(I.G);
    if (!/^\d\d$/.test(L)) continue;
    // Berlin und Hamburg sind je eine Gemeinde; die Datei führt ihre Bezirke wie Kreise
    const ags = L === '02' || L === '11' ? L + '000000' : L + R + K + G, kbz = L + R + K + '|' + s(I.BZ);
    const vals = new Float64Array(nc); for (let k = 0; k < nc; k++) vals[k] = num(row[numCols[k]]);
    if (s(I.A) === '5') { briefRows.push({ ags, kbz, vals, name: s(I.N) }); continue; }
    let u = units.get(ags);
    if (!u) { u = { ags, name: clean(s(I.N)), urn: new Float64Array(nc), brief: new Float64Array(nc), w: 0, wa: 0, bz: s(I.BZ), kbz, u68: new Set(), incl: new Set() }; units.set(ags, u); }
    for (const x of included(s(I.N))) u.incl.add(x);
    for (let k = 0; k < nc; k++) u.urn[k] += vals[k];
    u.w += vals[a2]; u.wa += vals[wa];
    if (s(I.U68) !== '0000' && s(I.U68)) u.u68.add(L + '|' + s(I.U68));
    if (/\(einschl\./i.test(s(I.N)) || !u.name) u.name = clean(s(I.N));
  }
  // Briefwahl-Gruppen: Mitglieder je Land+RB+Kreis+Kennziffer
  const members = new Map<string, Unit[]>();
  for (const u of units.values()) if (u.bz !== '00') { const L = members.get(u.kbz); if (L) L.push(u); else members.set(u.kbz, [u]); }
  const groupBrief = new Map<string, { vals: Float64Array; name: string }>();
  let orphans = 0;
  for (const b of briefRows) {
    const M = b.kbz.endsWith('|00') ? null : members.get(b.kbz);
    if (!M || (M.length === 1 && M[0].ags === b.ags)) {
      const u = units.get(b.ags) || (M && M.length === 1 ? M[0] : undefined);
      if (u) { for (let k = 0; k < nc; k++) u.brief[k] += b.vals[k]; } else orphans++;
      continue;
    }
    let g = groupBrief.get(b.kbz); if (!g) { g = { vals: new Float64Array(nc), name: clean(b.name.replace(/^Briefwahl\s+/i, '')) }; groupBrief.set(b.kbz, g); }
    for (let k = 0; k < nc; k++) g.vals[k] += b.vals[k];
  }
  // Ergebnis je Gemeinde
  const status = new Map<string, keyof typeof BRIEF_LABEL>(), unitName = new Map<string, string>(), joint: Record<string, string> = {};
  const total = new Map<string, Float64Array>();
  for (const u of units.values()) { const t = new Float64Array(nc); for (let k = 0; k < nc; k++) t[k] = u.urn[k] + u.brief[k]; total.set(u.ags, t); status.set(u.ags, 'own'); }
  const makeJoint = (key: string, M: Unit[], extra: Float64Array | null, name: string) => {
    const sum = new Float64Array(nc);
    for (const u of M) { const t = total.get(u.ags)!; for (let k = 0; k < nc; k++) sum[k] += t[k]; }
    if (extra) for (let k = 0; k < nc; k++) sum[k] += extra[k];
    for (const u of M) { total.set(u.ags, sum); status.set(u.ags, 'joint'); joint[u.ags] = key; unitName.set(u.ags, name); }
  };
  for (const [key, g] of groupBrief) {
    const M = members.get(key) || [];
    if (!M.length) { orphans++; continue; }
    if (mode === 'gemeinsam') { makeJoint('bw:' + key, M, g.vals, g.name); continue; }
    let W = M.reduce((s, u) => s + u.w, 0); const useWa = W <= 0; if (useWa) W = M.reduce((s, u) => s + u.wa, 0);
    for (const u of M) {
      const f = W > 0 ? (useWa ? u.wa : u.w) / W : 1 / M.length, t = total.get(u.ags)!;
      for (let k = 0; k < nc; k++) if (k !== wa) t[k] += g.vals[k] * f;
      status.set(u.ags, 'est'); unitName.set(u.ags, g.name);
    }
  }
  // § 68 BWO: kleine Gemeinden, deren Wahlbezirk in einer Nachbargemeinde enthalten ist
  const u68 = new Map<string, Unit[]>();
  for (const u of units.values()) for (const c of u.u68) { const L = u68.get(c); if (L) { if (!L.includes(u)) L.push(u); } else u68.set(c, [u]); }
  for (const [c, M] of u68) {
    if (M.length < 2) continue;
    const host = M.find(u => u.urn[wa] > 0) || M[0];
    const key = 'u68:' + c;
    // bereits gemeinsam (Briefwahl) → Gruppen vereinigen
    const prev = M.map(u => joint[u.ags]).find(Boolean);
    const sum = new Float64Array(nc);
    const seen = new Set<Float64Array>();
    for (const u of M) { const t = total.get(u.ags)!; if (seen.has(t)) continue; seen.add(t); for (let k = 0; k < nc; k++) sum[k] += t[k]; }
    for (const u of M) { total.set(u.ags, sum); status.set(u.ags, 'joint'); joint[u.ags] = prev || key; unitName.set(u.ags, unitName.get(u.ags) || host.name); }
  }
  // Tabelle
  const labels = numCols.map(c => H[c]);
  const header = ['Gemeindeschlüssel', 'Gemeinde', ...labels, 'Briefwahl', 'Auszählungseinheit', 'Enthält'];
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const body: Cell[][] = [...units.values()].sort((a, b) => a.ags.localeCompare(b.ags)).map(u => {
    const t = total.get(u.ags)!, st = status.get(u.ags)!;
    return [u.ags, u.name, ...Array.from(t, r1), BRIEF_LABEL[st], st === 'own' ? '' : (unitName.get(u.ags) || ''), [...u.incl].join(', ')];
  });
  const cnt = { own: 0, est: 0, joint: 0 }; for (const s of status.values()) cnt[s]++;
  const notes = [
    `Wahlbezirke zu ${units.size.toLocaleString('de-DE')} Gemeinden zusammengefasst.`,
    mode === 'anteilig'
      ? `${cnt.est.toLocaleString('de-DE')} Gemeinden mit gemeinsam ausgezählter Briefwahl: Briefwahlstimmen anteilig nach Wahlscheinen verteilt (Spalte „Briefwahl“ = „${BRIEF_LABEL.est}“).`
      : `${(cnt.joint).toLocaleString('de-DE')} Gemeinden mit gemeinsam ausgezählter Briefwahl erhalten die gemeinsame Summe und erscheinen als eine Fläche.`,
  ];
  if (mode === 'anteilig' && cnt.joint) notes.push(`${cnt.joint} Gemeinden sind nach § 68 BWO mit einer Nachbargemeinde zusammengefasst und erscheinen gemeinsam.`);
  if (orphans) notes.push(`${orphans} Briefwahlbezirke ließen sich keiner Gemeinde zuordnen.`);
  return { header, body, notes, joint, stats: { gemeinden: units.size, own: cnt.own, est: cnt.est, joint: cnt.joint, orphans } };
}
