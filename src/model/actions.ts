// Fachliche Aktionen auf dem Dokument
import { current, Draft } from 'immer';
import { getDoc, getUI, setDoc, setUI, toast, update } from './store';
import { defaultDoc } from './defaults';
import { fitInset, fitMain, makeVariant, relayout } from './layout';
import type { ColorRule, Doc, Fokus, Variant } from './types';
import type { Dataset } from '../data/types';
import { GEO } from '../geo/geo';
import { saveLocal } from './persist';

const refit = (d: Draft<Doc>, which: 'main' | 'inset' | 'both' = 'main') => {
  const plain = current(d) as Doc;
  d.variants.forEach((v, k) => {
    const pv = plain.variants[k] as Variant;
    const copy: Variant = JSON.parse(JSON.stringify(pv));
    if ((which === 'main' || which === 'both') && !pv.locked.main) { fitMain(plain, copy); v.L.main.view = copy.L.main.view; }
    if ((which === 'inset' || which === 'both') && !pv.locked.inset) { fitInset(plain, copy); v.L.inset.view = copy.L.inset.view; }
  });
};

export function newProject(geoSet = 'btw-wk-2025', name = 'Neues Projekt') {
  const d = defaultDoc(geoSet); d.name = name;
  d.variants = [makeVariant(d, '4:5')];
  setDoc(d); setUI({ start: false, sel: { kind: 'graphic' }, mapMode: null, step: 'gebiete', panelOpen: true });
}
export function openDoc(d: Doc) {
  if (!GEO[d.geoSet]) throw new Error('Unbekannter Gebietsstand: ' + d.geoSet);
  setDoc(d); setUI({ start: false, sel: { kind: 'graphic' }, mapMode: null });
}
export function setFokus(f: Fokus) {
  update(d => {
    const wasDE = d.fokus.kind === 'de';
    d.fokus = f;
    if (f.kind !== 'de' && wasDE && d.inset.visible) { d.inset.visible = false; d.inset.autoHidden = true; }
    if (f.kind === 'de' && d.inset.autoHidden) { d.inset.visible = true; d.inset.autoHidden = false; }
    refit(d);
  });
}
export function setGeoSet(id: string) {
  if (!GEO[id] || getDoc().geoSet === id) return;
  update(d => {
    d.geoSet = id; d.fokus = { kind: 'de' };
    for (const v of d.variants) v.labelOffsets = {};
    refit(d, 'both');
    // Farbregel auf passenden Datensatz umstellen, falls vorhanden
    const cur = d.color as ColorRule & { dataset?: string };
    const ds = d.datasets.find(x => x.id === cur.dataset);
    if (ds && ds.geoSet !== id) { const alt = d.datasets.find(x => x.geoSet === id); if (alt) d.color = autoRule(alt as Dataset); }
  });
  setUI({ sel: { kind: 'graphic' } });
  toast('Gebietsstand: ' + GEO[id].meta.label);
}
export function autoRule(ds: Dataset): ColorRule {
  const grp = ds.groups.find(g => g.parties && /Zweit/.test(g.label)) || ds.groups.find(g => g.parties) || ds.groups[0];
  if (grp) return { mode: 'siegerStaerke', dataset: ds.id, group: grp.id, basis: 'anteil', steps: 4 };
  const num = ds.columns.find(c => c.role === 'value' && c.kind === 'number');
  if (num) return { mode: 'wert', dataset: ds.id, column: num.id, method: 'rund', classes: 5, hue: '#2F5D8A' };
  const cat = ds.columns.find(c => c.role === 'category');
  if (cat) return { mode: 'kategorie', dataset: ds.id, column: cat.id };
  return { mode: 'none' };
}
export function addDataset(ds: Dataset, useIt = true) {
  update(d => {
    d.datasets.push(ds as Draft<Dataset>);
    if (useIt) {
      if (d.geoSet !== ds.geoSet) { d.geoSet = ds.geoSet; d.fokus = { kind: 'de' }; }
      d.color = autoRule(ds);
      if (d.texts.title.text === 'Titel der Grafik' && ds.groups.some(g => g.parties)) {
        d.texts.title.text = 'Stärkste Partei je Wahlkreis';
        const grp = ds.groups.find(g => g.parties && /Zweit/.test(g.label)) || ds.groups.find(g => g.parties);
        d.texts.subtitle.text = `${grp ? grp.label + ', ' : ''}${ds.name}. Je kräftiger die Farbe, desto höher der Anteil der stärksten Partei.`;
        d.name = d.name === 'Neues Projekt' ? ds.name : d.name;
      }
      const plain = current(d) as Doc;
      d.variants.forEach((v, k) => { const copy: Variant = JSON.parse(JSON.stringify(plain.variants[k])); relayout(plain, copy); d.variants[k] = copy as Draft<Variant>; });
    }
  });
  if (useIt) setUI({ sel: { kind: 'graphic' }, mapMode: null });
  toast(`Datensatz „${ds.name}“ übernommen`);
}
export function replaceDataset(ds: Dataset) {
  update(d => {
    const k = d.datasets.findIndex(x => x.id === ds.id); if (k < 0) return;
    const old = d.datasets[k];
    const rule = d.color as ColorRule & { column?: string; group?: string };
    if (rule.column && (rule as { dataset?: string }).dataset === ds.id) {
      const lab = old.columns.find(c => c.id === rule.column)?.label;
      const nc = ds.columns.find(c => c.label === lab); if (nc) rule.column = nc.id;
    }
    if (rule.group && (rule as { dataset?: string }).dataset === ds.id && !ds.groups.some(g => g.id === rule.group) && ds.groups[0]) rule.group = ds.groups[0].id;
    d.datasets[k] = ds as Draft<Dataset>;
  });
  toast(`Daten ersetzt · Layout und Gestaltung bleiben`);
}
export function removeDataset(id: string) {
  update(d => {
    d.datasets = d.datasets.filter(x => x.id !== id);
    const cur = d.color as ColorRule & { dataset?: string };
    if (cur.dataset === id) d.color = d.datasets.length ? autoRule(current(d.datasets[0]) as Dataset) : { mode: 'none' };
  });
}
export function addVariant(preset: string) {
  update(d => { const plain = current(d) as Doc; d.variants.push(makeVariant(plain, preset) as Draft<Variant>); d.active = d.variants.length - 1; });
  setUI({ menu: null, mapMode: null, sel: { kind: 'graphic' } });
  toast('Variante ' + preset + ' angelegt');
}
export function relayoutActive() { update(d => { const plain = current(d) as Doc; const copy: Variant = JSON.parse(JSON.stringify(plain.variants[plain.active])); relayout(plain, copy); d.variants[d.active] = copy as Draft<Variant>; }); }
export function refitMain() { update(d => refit(d)); }
export function refitFrame(id: 'main' | 'inset') {
  update(d => { const plain = current(d) as Doc; const v: Variant = JSON.parse(JSON.stringify(plain.variants[plain.active])); if (id === 'main') { fitMain(plain, v); d.variants[d.active].L.main.view = v.L.main.view; } else { fitInset(plain, v); d.variants[d.active].L.inset.view = v.L.inset.view; } });
}
export function refitAfterInset() { update(d => refit(d, 'both')); }

let saveTimer = 0;
export function scheduleAutosave() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    const d = getDoc(); if (!d || getUI().start) return;
    setUI({ saveState: 'saving' });
    try { await saveLocal(d.id, d); setUI({ saveState: 'saved' }); } catch { setUI({ saveState: 'error' }); }
  }, 900);
}

export function switchVariant(k: number) {
  update(d => { d.active = k; }, { history: false });
  setUI({ menu: null, mapMode: null, sel: { kind: 'graphic' } });
}
export function removeVariant(k: number) {
  const d0 = getDoc(); if (d0.variants.length < 2) return;
  const name = d0.variants[k].preset;
  update(d => { d.variants.splice(k, 1); if (d.active >= d.variants.length) d.active = d.variants.length - 1; else if (d.active > k) d.active--; });
  setUI({ menu: null, mapMode: null, sel: { kind: 'graphic' } });
  toast('Variante ' + name + ' entfernt');
}
export function resizeVariant(w: number, h: number) {
  update(d => { const plain = current(d) as Doc; const copy: Variant = JSON.parse(JSON.stringify(plain.variants[plain.active])); copy.w = w; copy.h = h; relayout(plain, copy); d.variants[d.active] = copy as Draft<Variant>; });
}
export function setTextScale(ts: number) {
  update(d => { d.variants[d.active].ts = ts; }, { key: 'ts' });
}
export function setOverride(ids: string[], color: string | null) {
  update(d => { for (const id of ids) { const k = d.geoSet + ':' + id; if (color) d.overrides[k] = color; else delete d.overrides[k]; } }, { key: color ? 'ov-' + ids.join(',') : '' });
}
