// Farbregel → Füllfarbe je Gebiet + Legendenmodell
import { CATEGORICAL, OTHER_GREY, STEP_T, classOf, equalBreaks, mixWhite, niceBreaks, quantileBreaks } from '../lib/color';
import { areaRowIndex, colIndex, groupMetrics, partyShare } from '../data/derive';
import { partyDef, partyOf } from '../data/parties';

const NEG_GREY = '#BDB6A8';
import type { Dataset, Group } from '../data/types';
import type { Doc } from '../model/types';
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
  hue: string;
  dataset: Dataset | null; group: Group | null;
  mismatch: string | null;    // Datensatz gehört zu anderem Gebietsstand
  valueOf: (i: number) => number | null;
  partyOfArea: (i: number) => string | null;
}
export const partyColor = (doc: Doc, key: string | null) => (key && doc.partyColors[key]) || partyDef(key || '')?.color || OTHER_GREY;
export const partyLabel = (key: string) => partyDef(key)?.label || key;

const cache = new WeakMap<Doc['color'], { deps: unknown[]; cm: ColorModel }>();
export function colorModel(doc: Doc): ColorModel {
  const deps = [doc.datasets, doc.partyColors, doc.fokus, doc.geoSet, doc.style.noData];
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
    breaks: [], unit: '', steps: 0, entries: [], counts: {}, missing: 0, hue: '#2F5D8A', dataset: null, group: null, mismatch: null,
    valueOf: () => null, partyOfArea: () => null,
  };
  if (rule.mode === 'none') { cm.missing = 0; return cm; }
  const ds = doc.datasets.find(d => d.id === rule.dataset) || null;
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
      cm.breaks = niceBreaks(vals, 5); cm.unit = ' %'; cm.steps = 5;
      const base = partyColor(doc, rule.party);
      for (const i of g.all) {
        const v = cm.valueOf(i);
        if (v == null || v === 0) continue;
        const c = classOf(v, cm.breaks); cm.cls[i] = c; cm.keys[i] = rule.party; cm.fills[i] = mixWhite(base, STEP_T[5][c]);
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
        if (!base) { if (!others.includes(key)) others.push(key); base = CATEGORICAL[others.indexOf(key) % CATEGORICAL.length]; }
        cm.keys[i] = key;
        if (rule.mode === 'siegerStaerke') { const v = val(i); const c = v == null ? 0 : classOf(v, cm.breaks); cm.cls[i] = c; cm.fills[i] = mixWhite(base, STEP_T[steps][c]); }
        else { cm.cls[i] = 0; cm.fills[i] = base; }
      }
      const colorOfKey = (key: string) => colParty.includes(key) ? partyColor(doc, key) : CATEGORICAL[Math.max(0, others.indexOf(key)) % CATEGORICAL.length];
      finishEntries(doc, cm, key => ({ label: colParty.includes(key) ? partyLabel(key) : key, color: colorOfKey(key) }));
      return cm;
    }
  } else if (rule.mode === 'wert') {
    const ci = colIndex(ds, rule.column);
    cm.valueOf = i => { const r = rowIdx(i); if (r == null) return null; const v = ds.rows[r][ci]; return typeof v === 'number' ? v : null; };
    const vals = g.all.map(i => cm.valueOf(i));
    const k = rule.classes;
    cm.breaks = rule.method === 'quantil' ? quantileBreaks(vals, k) : rule.method === 'gleich' ? equalBreaks(vals, k) : niceBreaks(vals, k);
    cm.steps = cm.breaks.length + 1; cm.hue = rule.hue;
    const T = STEP_T[cm.steps] || STEP_T[5];
    for (const i of g.all) { const v = cm.valueOf(i); if (v == null) continue; const c = classOf(v, cm.breaks); cm.cls[i] = c; cm.fills[i] = mixWhite(rule.hue, T[Math.min(c, T.length - 1)]); }
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
  finishEntries(doc, cm, key => ({ label: partyLabel(key), color: partyColor(doc, key) }));
  return cm;
}
function finishEntries(doc: Doc, cm: ColorModel, info: (key: string) => { label: string; color: string }) {
  const F = fokusIdx(doc);
  for (const i of F) { const k = cm.keys[i]; if (k) cm.counts[k] = (cm.counts[k] || 0) + 1; if (cm.cls[i] < 0) cm.missing++; }
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
  return '';
}
