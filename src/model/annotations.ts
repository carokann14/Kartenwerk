// Aktionen für Schraffuren und Legende
import { uid } from '../lib/util';
import { HATCH_PRESETS } from './defaults';
import { getDoc, setUI, toast, update } from './store';
import type { AnnEl, Doc, HatchRule, HatchStyle, LegendExtra, MarkerEl, TextBoxEl } from './types';

// ---------- Schraffuren ----------
export function addHatch(preset?: number, assignTo?: string[]): string {
  const d0 = getDoc();
  // ohne Vorgabe reihum ein anderes Muster, damit neue Schraffuren unterscheidbar sind
  const p = HATCH_PRESETS[preset ?? d0.hatches.filter(h => h.id !== 'h-nodata').length % HATCH_PRESETS.length] || HATCH_PRESETS[0];
  const n = d0.hatches.filter(h => h.name.startsWith(p.name)).length;
  const h: HatchStyle = { ...p, id: uid('h'), name: n ? `${p.name} ${n + 1}` : p.name };
  update(d => {
    d.hatches.push(h);
    d.layers.hatches = true;
    if (assignTo) for (const id of assignTo) d.hatchAssign[d.geoSet + ':' + id] = h.id;
  });
  setUI({ sel: assignTo ? { kind: 'area', ids: assignTo } : { kind: 'hatch', id: h.id } });
  return h.id;
}
export function updateHatch(id: string, patch: Partial<HatchStyle>, key?: string) {
  update(d => { const h = d.hatches.find(x => x.id === id); if (h) Object.assign(h, patch); }, { key: key ? 'hatch-' + id + key : undefined });
}
export function removeHatch(id: string) {
  const name = getDoc().hatches.find(h => h.id === id)?.name;
  update(d => {
    d.hatches = d.hatches.filter(h => h.id !== id);
    d.hatchRules = d.hatchRules.filter(r => r.hatch !== id);
    for (const k of Object.keys(d.hatchAssign)) if (d.hatchAssign[k] === id) delete d.hatchAssign[k];
    for (const x of d.legend.extra) if (x.hatch === id) { x.hatch = null; x.kind = 'fill'; }
  });
  setUI({ sel: { kind: 'layer', id: 'hatches' } });
  toast(`Schraffur „${name}“ gelöscht`);
}
/** hatch: Schraffur-ID, '' = ausdrücklich keine (auch nicht aus Regeln), null = Zuweisung entfernen (Regeln gelten wieder) */
export function assignHatch(ids: string[], hatch: string | null) {
  update(d => { for (const id of ids) { const k = d.geoSet + ':' + id; if (hatch === null) delete d.hatchAssign[k]; else d.hatchAssign[k] = hatch; } d.layers.hatches = true; });
}
export function clearAssignments(hatch: string) {
  update(d => { for (const k of Object.keys(d.hatchAssign)) if (d.hatchAssign[k] === hatch && k.startsWith(d.geoSet + ':')) delete d.hatchAssign[k]; });
}
export function setNoDataHatch(hatch: string | null) {
  update(d => {
    d.hatchRules = d.hatchRules.filter(r => r.source !== 'nodata');
    if (hatch) d.hatchRules.unshift({ id: 'r-nodata', hatch, source: 'nodata' });
  });
}
export function addColumnRule(hatch: string, dataset: string, column: string) {
  update(d => { d.hatchRules.push({ id: uid('r'), hatch, source: 'column', dataset, column, op: 'in', values: [], num: null }); });
}
export function updateRule(id: string, patch: Partial<Extract<HatchRule, { source: 'column' }>>, key?: string) {
  update(d => { const r = d.hatchRules.find(x => x.id === id); if (r && r.source === 'column') Object.assign(r, patch); }, { key: key ? 'rule-' + id + key : undefined });
}
export function removeRule(id: string) { update(d => { d.hatchRules = d.hatchRules.filter(r => r.id !== id); }); }

// ---------- Legende ----------
export function setEntryLabel(key: string, text: string, auto: string) {
  update(d => { const x = extraOf(d, key); if (x) { x.label = text; return; } if (text === '') delete d.legend.labels[key]; else d.legend.labels[key] = text; }, { key: 'lglabel-' + key });
}
const extraOf = (d: Doc, key: string): LegendExtra | undefined => key.startsWith('x:') ? d.legend.extra.find(e => 'x:' + e.id === key) : undefined;
export function toggleEntry(key: string) {
  update(d => { const h = new Set(d.legend.hidden); h.has(key) ? h.delete(key) : h.add(key); d.legend.hidden = [...h]; });
}
/** Eintrag innerhalb seines Abschnitts verschieben; die ganze Reihenfolge des Abschnitts wird gespeichert. */
export function moveEntry(sectionKeys: string[], key: string, dir: -1 | 1) {
  const k = sectionKeys.indexOf(key), j = k + dir;
  if (k < 0 || j < 0 || j >= sectionKeys.length) return;
  const next = [...sectionKeys]; [next[k], next[j]] = [next[j], next[k]];
  update(d => { d.legend.order = [...next, ...d.legend.order.filter(x => !next.includes(x))]; });
}
export function addExtra(kind: LegendExtra['kind']) {
  const d0 = getDoc();
  const hatch = kind === 'hatch' ? d0.hatches[0]?.id || null : null;
  update(d => { d.legend.extra.push({ id: uid('x'), label: kind === 'line' ? 'Grenze' : kind === 'hatch' ? 'Schraffur' : 'Eigener Eintrag', kind: kind === 'hatch' && !hatch ? 'fill' : kind, color: kind === 'line' ? '#16181B' : '#8D939B', hatch }); d.legend.visible = true; });
}
export function updateExtra(id: string, patch: Partial<LegendExtra>, key?: string) {
  update(d => { const x = d.legend.extra.find(e => e.id === id); if (x) Object.assign(x, patch); }, { key: key ? 'extra-' + id + key : undefined });
}
export function removeExtra(id: string) { update(d => { d.legend.extra = d.legend.extra.filter(e => e.id !== id); d.legend.order = d.legend.order.filter(k => k !== 'x:' + id); }); }
export function resetLegendEdits() { update(d => { d.legend.labels = {}; d.legend.hidden = []; d.legend.order = []; d.legend.caption = null; }); toast('Legende auf automatisch zurückgesetzt'); }

// ---------- Marker und Textkästen ----------
export const MARKER_DEFAULT: Omit<MarkerEl, 'id' | 'at' | 'place' | 'label'> = {
  type: 'marker', shape: 'kreis', symbol: null, size: 12, fill: '#16181B', stroke: '#FFFFFF', strokeW: 1.5,
  labelPos: 'r', labelSize: 15, labelCut: 'bold', labelHalo: true, legend: '', inset: true,
};
export function addMarker(at: [number, number], place: MarkerEl['place'] = null, label = '') {
  const d0 = getDoc();
  // neue Marker übernehmen das Aussehen des zuletzt gesetzten
  const last = [...d0.els].reverse().find((e): e is MarkerEl => e.type === 'marker');
  const base = last ? { ...MARKER_DEFAULT, shape: last.shape, symbol: last.symbol, size: last.size, fill: last.fill, stroke: last.stroke, strokeW: last.strokeW, labelPos: last.labelPos, labelSize: last.labelSize, labelCut: last.labelCut, labelHalo: last.labelHalo, legend: last.legend } : MARKER_DEFAULT;
  const m: MarkerEl = { ...base, id: uid('m'), at: [Math.round(at[0]), Math.round(at[1])], place, label };
  update(d => { d.els.push(m); });
  setUI({ sel: { kind: 'ann', id: m.id }, tool: null });
  return m.id;
}
export function addTextBox(anchor: TextBoxEl['anchor'], at: [number, number]) {
  const t: TextBoxEl = { id: uid('t'), type: 'text', anchor, at, text: anchor === 'map' ? 'Hinweis zur Karte' : 'Textkasten', size: 18, cut: 'text', color: 'ink', width: 0, align: 'start', bg: anchor === 'map' ? '#FFFFFF' : null, border: null, pad: anchor === 'map' ? 6 : 0, leader: anchor === 'map' };
  update(d => { d.els.push(t); });
  setUI({ sel: { kind: 'ann', id: t.id }, tool: null });
  return t.id;
}
export function updateEl(id: string, patch: Partial<MarkerEl> | Partial<TextBoxEl>, key?: string) {
  update(d => { const e = d.els.find(x => x.id === id); if (e) Object.assign(e, patch); }, { key: key ? 'el-' + id + key : undefined });
}
/** Aussehen auf alle Marker übertragen (Legende, Serien) */
export function applyMarkerStyleToAll(id: string) {
  update(d => {
    const src = d.els.find((e): e is MarkerEl => e.id === id && e.type === 'marker'); if (!src) return;
    for (const e of d.els) if (e.type === 'marker' && e.id !== id) Object.assign(e, { shape: src.shape, symbol: src.symbol, size: src.size, fill: src.fill, stroke: src.stroke, strokeW: src.strokeW, labelPos: src.labelPos, labelSize: src.labelSize, labelCut: src.labelCut, labelHalo: src.labelHalo, legend: src.legend });
  });
  toast('Aussehen auf alle Marker übertragen');
}
export function removeEl(id: string) {
  update(d => { d.els = d.els.filter(e => e.id !== id); for (const v of d.variants) delete v.ann[id]; });
  setUI({ sel: { kind: 'graphic' } });
}
export function duplicateEl(id: string) {
  const e = getDoc().els.find(x => x.id === id); if (!e) return;
  const copy: AnnEl = JSON.parse(JSON.stringify(e)); copy.id = uid(e.type === 'marker' ? 'm' : 't');
  if (copy.type === 'marker') copy.at = [copy.at[0] + 1500, copy.at[1] + 1500];
  else if (copy.anchor === 'board') copy.at = [Math.min(0.95, copy.at[0] + 0.03), Math.min(0.95, copy.at[1] + 0.03)];
  else copy.at = [copy.at[0] + 1500, copy.at[1] + 1500];
  update(d => { d.els.push(copy); });
  setUI({ sel: { kind: 'ann', id: copy.id } });
}
export function moveElOrder(id: string, dir: -1 | 1) {
  update(d => { const k = d.els.findIndex(e => e.id === id), j = k + dir; if (k < 0 || j < 0 || j >= d.els.length) return; [d.els[k], d.els[j]] = [d.els[j], d.els[k]]; });
}
export function resetElOffset(id: string) { update(d => { delete d.variants[d.active].ann[id]; }); }
