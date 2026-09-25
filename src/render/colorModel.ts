// Farbregel → Füllfarbe je Gebiet + Legendenmodell
import { CATEGORICAL, CONT_STEPS, OTHER_GREY, STEP_T, classOf, contColor, divergingBreaks, divergingColors, equalBreaks, mixWhite, niceBreaks, quantileBreaks } from '../lib/color';
import { areaRowIndex, colIndex, groupMetrics, partyShare } from '../data/derive';
import { datasetFor } from '../data/aggregate';
import { partyDef, partyOf } from '../data/parties';

const NEG_GREY = '#BDB6A8';
import type { Dataset, Group } from '../data/types';
import type { Doc, VeraenderungRule, WertRef } from '../model/types';
import { fokusIdx, geoOf } from './scene';

export interface LegendEntry { key: string; label: string; color: string; count: number }
export interface ColorModel {
  mode: Doc['color']['mode'];
  fills: string[];            // je Gebietsindex
  cls: number[];              // Klasse, -1 = keine Daten
  keys: (string | null)[];    // Kategorie/Partei je Gebiet
  breaks: number[]; unit: string;
  steps: number;
  entries: LegendEntry[];     // Kategorien im Fokus (Sieger, Kategorie)
  counts: Record<string, number>;
  missing: number;            // Gebiete im Fokus ohne Wert
  free: number;               // davon gemeindefreie Gebiete (unbewohnt, keine Wahl): nicht als „keine Daten“ gezählt
  hue: string;
  dataset: Dataset | null; group: Group | null;
  mismatch: string | null;    // Datensatz gehört zu anderem Gebietsstand
  valueOf: (i: number) => number | null;
  partyOfArea: (i: number) => string | null;
  classColors: string[];      // Farbe je Klasse (für die Legende)
  shown: [number, number] | null;   // Veränderung: Klassen, die in der Legende erscheinen
  continuous: { min: number; max: number; hue: string } | null;   // stetige Skala
  diverging: { step: number; unit: string; against: string } | null;
}
export const partyColor = (doc: Doc, key: string | null) => (key && doc.partyColors[key]) || partyDef(key || '')?.color || OTHER_GREY;
export const partyLabel = (key: string) => partyDef(key)?.label || key;
/** Union: in Landesdaten steht nur CDU oder nur CSU – dann diesen Namen zeigen statt „CDU/CSU“ */
export function unionLabelOf(ds: Dataset, grp: Group): string {
  const sh = [...new Set(grp.columns.map(id => ds.columns.find(c => c.id === id)).filter(c => c?.party === 'Union').map(c => c!.short || ''))];
  return sh.length === 1 && sh[0] ? sh[0] : partyLabel('Union');
}

const cache = new WeakMap<Doc['color'], { deps: unknown[]; cm: ColorModel }>();
export function colorModel(doc: Doc): ColorModel {
  const deps = [doc.datasets, doc.partyColors, doc.categoryColors, doc.fokus, doc.geoSet, doc.style.noData, geoOf(doc)];
  const hit = cache.get(doc.color);
  if (hit && hit.deps.every((d, i) => d === deps[i])) return hit.cm;
  const cm = compute(doc);
  cache.set(doc.color, { deps, cm });
  return cm;
}
function compute(doc: Doc): ColorModel {
  const g = geoOf(doc), n = g.areas.length, rule = doc.color;
  const cm: ColorModel = {
    mode: rule.mode, fills: new Array(n).fill(doc.style.noData), cls: new Array(n).fill(-1), keys: new Array(n).fill(null),
    breaks: [], unit: '', steps: 0, entries: [], counts: {}, missing: 0, free: 0, hue: '#2F5D8A', dataset: null, group: null, mismatch: null,
    valueOf: () => null, partyOfArea: () => null, classColors: [], shown: null, continuous: null, diverging: null,
  };
  if (rule.mode === 'none') { cm.missing = 0; return cm; }
  const ds = datasetFor(doc, rule.dataset);   // auf gröberen Ebenen summiert, wo möglich
  if (!ds) return cm;
  cm.dataset = ds;
  if (ds.geoSet !== doc.geoSet) { cm.mismatch = ds.geoSet; return cm; }
  const rowOf = areaRowIndex(ds);
  const rowIdx = (i: number) => rowOf.get(g.areas[i].id);
  if (rule.mode === 'siegerStaerke' || rule.mode === 'sieger' || rule.mode === 'anteil') {
    const grp = ds.groups.find(x => x.id === rule.group) || ds.groups[0];
    if (!grp) return cm;
    cm.group = grp;
    const gm = groupMetrics(ds, grp);
    const colParty = grp.columns.map(id => { const c = ds.columns.find(x => x.id === id); return c?.party || null; });
    const colLabel = grp.columns.map(id => { const c = ds.columns.find(x => x.id === id); return c ? (c.short || c.label.split(' · ')[0]) : id; });
    const catKey = (k: number) => colParty[k] || colLabel[k];
    cm.partyOfArea = i => { const r = rowIdx(i); if (r == null || gm[r].win < 0) return null; return colLabel[gm[r].win]; };
    if (rule.mode === 'anteil') {
      cm.valueOf = i => { const r = rowIdx(i); return r == null ? null : partyShare(ds, grp, r, rule.party); };
      const vals = g.all.map(i => cm.valueOf(i));
      const base = partyColor(doc, rule.party);
      cm.unit = ' %';
      if (rule.stetig) {
        const fin = vals.filter((x): x is number => x != null && x > 0);
        const lo = fin.length ? Math.min(...fin) : 0, hi = fin.length ? Math.max(...fin) : 1;
        cm.continuous = { min: lo, max: hi, hue: base }; cm.steps = CONT_STEPS;
        for (const i of g.all) { const v = cm.valueOf(i); if (v == null || v === 0) continue; cm.cls[i] = 0; cm.keys[i] = rule.party; cm.fills[i] = contColor(base, hi > lo ? (v - lo) / (hi - lo) : 1); }
      } else {
        cm.breaks = niceBreaks(vals, 5); cm.steps = 5; cm.classColors = STEP_T[5].map(t => mixWhite(base, t));
        for (const i of g.all) {
          const v = cm.valueOf(i);
          if (v == null || v === 0) continue;
          const c = classOf(v, cm.breaks); cm.cls[i] = c; cm.keys[i] = rule.party; cm.fills[i] = mixWhite(base, STEP_T[5][c]);
        }
      }
    } else {
      const val = (i: number) => { const r = rowIdx(i); if (r == null) return null; return rule.mode === 'siegerStaerke' && rule.basis === 'vorsprung' ? gm[r].margin : gm[r].winShare; };
      cm.valueOf = val;
      const steps = rule.mode === 'siegerStaerke' ? rule.steps : 1;
      cm.steps = steps;
      if (rule.mode === 'siegerStaerke') { cm.breaks = niceBreaks(g.all.map(val), steps); cm.unit = rule.basis === 'anteil' ? ' %' : ' Pkt.'; }
      const others: string[] = [];
      for (const i of g.all) {
        const r = rowIdx(i); if (r == null || gm[r].win < 0) continue;
        const key = catKey(gm[r].win);
        let base = colParty[gm[r].win] ? partyColor(doc, key) : null;
        if (!base) { if (!others.includes(key)) others.push(key); base = doc.categoryColors[key] || CATEGORICAL[others.indexOf(key) % CATEGORICAL.length]; }
        cm.keys[i] = key;
        if (rule.mode === 'siegerStaerke') { const v = val(i); const c = v == null ? 0 : classOf(v, cm.breaks); cm.cls[i] = c; cm.fills[i] = mixWhite(base, STEP_T[steps][c]); }
        else { cm.cls[i] = 0; cm.fills[i] = base; }
      }
      const colorOfKey = (key: string) => colParty.includes(key) ? partyColor(doc, key) : doc.categoryColors[key] || CATEGORICAL[Math.max(0, others.indexOf(key)) % CATEGORICAL.length];
      finishEntries(doc, cm, key => ({ label: colParty.includes(key) ? (key === 'Union' ? unionLabelOf(ds, grp) : partyLabel(key)) : key, color: colorOfKey(key) }));
      return cm;
    }
  } else if (rule.mode === 'wert') {
    const ci = colIndex(ds, rule.column);
    cm.valueOf = i => { const r = rowIdx(i); if (r == null) return null; const v = ds.rows[r][ci]; return typeof v === 'number' ? v : null; };
    const vals = g.all.map(i => cm.valueOf(i));
    const k = rule.classes;
    cm.hue = rule.hue;
    if (rule.method === 'stetig') {
      const fin = vals.filter((x): x is number => x != null);
      const lo = fin.length ? Math.min(...fin) : 0, hi = fin.length ? Math.max(...fin) : 1;
      cm.continuous = { min: lo, max: hi, hue: rule.hue }; cm.steps = CONT_STEPS;
      for (const i of g.all) { const v = cm.valueOf(i); if (v == null) continue; cm.cls[i] = 0; cm.fills[i] = contColor(rule.hue, hi > lo ? (v - lo) / (hi - lo) : 1); }
    } else {
      cm.breaks = rule.method === 'quantil' ? quantileBreaks(vals, k) : rule.method === 'gleich' ? equalBreaks(vals, k) : niceBreaks(vals, k);
      cm.steps = cm.breaks.length + 1;
      const T = STEP_T[cm.steps] || STEP_T[5];
      cm.classColors = Array.from({ length: cm.steps }, (_, c) => mixWhite(rule.hue, T[Math.min(c, T.length - 1)]));
      for (const i of g.all) { const v = cm.valueOf(i); if (v == null) continue; const c = classOf(v, cm.breaks); cm.cls[i] = c; cm.fills[i] = cm.classColors[c]; }
    }
  } else if (rule.mode === 'veraenderung') {
    computeChange(doc, cm, rule);
  } else if (rule.mode === 'kategorie') {
    const ci = colIndex(ds, rule.column);
    const freq: Record<string, number> = {};
    for (const i of g.all) { const r = rowIdx(i); if (r == null) continue; const v = String(ds.rows[r][ci] ?? '').trim(); if (v) freq[v] = (freq[v] || 0) + 1; }
    const order = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
    // Parteinamen (auch Varianten wie „CDU“, „Die Linke“) bekommen die Parteifarbe, verneinende Werte ein neutrales Grau,
    // übrige Kategorien die Palette in der Reihenfolge ihrer Häufigkeit
    const isNeg = (v: string) => /^(nicht|kein|keine|ohne|–|-|n\. ?a\.?)(\s|$)/i.test(v);
    const others = order.filter(v => !doc.partyColors[v] && !partyDef(v) && !partyOf(v) && !isNeg(v));
    const colorOf = (v: string) => {
      if (doc.categoryColors[v]) return doc.categoryColors[v];
      if (doc.partyColors[v]) return doc.partyColors[v];
      const p = partyDef(v) || partyOf(v); if (p) return partyColor(doc, p.key);
      if (isNeg(v)) return NEG_GREY;
      const k = others.indexOf(v); return k >= 0 && k < CATEGORICAL.length ? CATEGORICAL[k] : OTHER_GREY;
    };
    // Varianten einer Partei (CDU und CSU → Union) bilden eine Kategorie mit einem Legendeneintrag
    const keyOf = (v: string) => { if (doc.partyColors[v] || partyDef(v)) return v; const p = partyOf(v); return p ? p.key : v; };
    const labelOf = (k: string) => (partyDef(k) ? partyLabel(k) : k);
    for (const i of g.all) { const r = rowIdx(i); if (r == null) continue; const v = String(ds.rows[r][ci] ?? '').trim(); if (!v) continue; const k = keyOf(v); cm.keys[i] = k; cm.cls[i] = 0; cm.fills[i] = colorOf(k); }
    finishEntries(doc, cm, key => ({ label: labelOf(key), color: colorOf(key) }));
    return cm;
  }
  finishEntries(doc, cm, key => ({ label: key === 'Union' && cm.dataset && cm.group ? unionLabelOf(cm.dataset, cm.group) : partyLabel(key), color: partyColor(doc, key) }));
  return cm;
}
/** Veränderung: Wert A minus Vergleichswert B je Gebiet, zweiseitige Klassen um 0 */
export const CHANGE_NEG = { partei: '#6B6B6B', blaurot: '#2F5D8A' } as const;
export const CHANGE_POS_WERT = '#B23A2E';
function refValue(doc: Doc, r: WertRef, kind: 'anteil' | 'wert', party: string): ((areaId: string) => number | null) | null {
  const ds = datasetFor(doc, r.dataset); if (!ds || ds.geoSet !== doc.geoSet) return null;
  const rows = areaRowIndex(ds);
  if (kind === 'anteil') {
    const grp = ds.groups.find(x => x.id === r.group); if (!grp) return null;
    return id => { const row = rows.get(id); return row == null ? null : partyShare(ds, grp, row, party); };
  }
  const ci = colIndex(ds, r.column); if (ci < 0) return null;
  return id => { const row = rows.get(id); if (row == null) return null; const v = ds.rows[row][ci]; return typeof v === 'number' ? v : null; };
}
export function refLabel(doc: Doc, r: WertRef, kind: 'anteil' | 'wert'): string {
  const ds = doc.datasets.find(d => d.id === r.dataset); if (!ds) return '?';
  const part = kind === 'anteil' ? ds.groups.find(x => x.id === r.group)?.label : ds.columns.find(c => c.id === r.column)?.label;
  return part || ds.name;
}
function computeChange(doc: Doc, cm: ColorModel, rule: VeraenderungRule) {
  const g = geoOf(doc);
  const A = refValue(doc, rule.a, rule.kind, rule.party), B = refValue(doc, rule.b, rule.kind, rule.party);
  const dsB = datasetFor(doc, rule.b.dataset);
  if (dsB && dsB.geoSet !== doc.geoSet) { cm.mismatch = dsB.geoSet; return; }
  if (!A || !B) return;
  cm.valueOf = i => {
    const id = g.areas[i].id, a = A(id), b = B(id);
    if (a == null || b == null) return null;
    if (rule.kind === 'wert' && rule.rel) return b === 0 ? null : (a - b) / Math.abs(b) * 100;
    return a - b;
  };
  const vals = g.all.map(i => cm.valueOf(i));
  const { breaks, step } = divergingBreaks(vals, rule.classes, rule.step);
  cm.breaks = breaks; cm.steps = rule.classes;
  const pos = rule.palette === 'partei' ? (rule.kind === 'anteil' ? partyColor(doc, rule.party) : '#1F7A6D') : CHANGE_POS_WERT;
  const neg = CHANGE_NEG[rule.palette];
  cm.classColors = divergingColors(neg, pos, rule.classes);
  cm.unit = rule.kind === 'anteil' ? ' Pkt.' : rule.rel ? ' %' : '';
  // „gegenüber …“: Vorperiode, sonst der Name des Vergleichsdatensatzes bzw. die Spalte
  const bLabel = refLabel(doc, rule.b, rule.kind);
  const against = /Vorperiode/i.test(bLabel) ? 'der Vorperiode' : rule.b.dataset !== rule.a.dataset ? (doc.datasets.find(d => d.id === rule.b.dataset)?.name || bLabel) : bLabel;
  cm.diverging = { step, unit: rule.kind === 'anteil' ? 'Prozentpunkten' : rule.rel ? '%' : '', against };
  let lo = Infinity, hi = -Infinity;
  const F = new Set(fokusIdx(doc));
  for (const i of g.all) {
    const v = cm.valueOf(i); if (v == null) continue;
    const c = classOf(v, cm.breaks); cm.cls[i] = c; cm.fills[i] = cm.classColors[c];
    if (F.has(i)) { lo = Math.min(lo, c); hi = Math.max(hi, c); }
  }
  // Legende: nur Klassen, in denen Gebiete des Fokus liegen
  if (lo <= hi) cm.shown = [lo, hi];
}
function finishEntries(doc: Doc, cm: ColorModel, info: (key: string) => { label: string; color: string }) {
  const F = fokusIdx(doc);
  const g = geoOf(doc);
  for (const i of F) { const k = cm.keys[i]; if (k) cm.counts[k] = (cm.counts[k] || 0) + 1; if (cm.cls[i] < 0) { if (g.areas[i].free) cm.free++; else cm.missing++; } }
  cm.entries = Object.keys(cm.counts).sort((a, b) => cm.counts[b] - cm.counts[a]).map(k => ({ key: k, ...info(k), count: cm.counts[k] }));
}
export const fillOf = (doc: Doc, cm: ColorModel, i: number) => doc.overrides[doc.geoSet + ':' + geoOf(doc).areas[i].id] || cm.fills[i];
export function legendTitleAuto(doc: Doc, cm: ColorModel): string {
  const r = doc.color, grp = cm.group?.label || '';
  if (r.mode === 'siegerStaerke') return r.basis === 'anteil' ? `Stärkste Partei · Anteil (${grp})` : `Stärkste Partei · Vorsprung (${grp})`;
  if (r.mode === 'sieger') return `Stärkste Partei (${grp})`;
  if (r.mode === 'anteil') return `${partyLabel(r.party)} · Anteil (${grp})`;
  if (r.mode === 'wert') return cm.dataset?.columns.find(c => c.id === r.column)?.label || 'Wert';
  if (r.mode === 'kategorie') return cm.dataset?.columns.find(c => c.id === r.column)?.label || 'Kategorie';
  if (r.mode === 'veraenderung') return r.kind === 'anteil' ? `${partyLabel(r.party)} · Veränderung (${refLabel(doc, r.a, 'anteil')})` : `${refLabel(doc, r.a, 'wert')} · Veränderung`;
  return '';
}
