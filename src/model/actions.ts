// Fachliche Aktionen auf dem Dokument
import { current, Draft } from 'immer';
import { getDoc, getUI, setDoc, setUI, toast, update } from './store';
import { defaultDoc, normalizeDoc } from './defaults';
import { fitInset, fitMain, makeVariant, relayout } from './layout';
import type { ColorRule, Doc, Fokus, Variant } from './types';
import type { Dataset } from '../data/types';
import { GEO, ensureGeo, geoLabel } from '../geo/geo';
import { translateFokus } from '../geo/relate';
import { syncRegions } from '../geo/regions';
import { isVirtualGeo, syncUserGeo } from '../geo/userGeo';
import { datasetFor, usableDatasets } from '../data/aggregate';
import { fokusLabel } from '../render/scene';
import { saveLocal } from './persist';
import { withDefaultLogo } from './logo';

export const refit = (d: Draft<Doc>, which: 'main' | 'inset' | 'both' = 'main') => {
  const plain = current(d) as Doc;
  d.variants.forEach((v, k) => {
    const pv = plain.variants[k] as Variant;
    const copy: Variant = JSON.parse(JSON.stringify(pv));
    if ((which === 'main' || which === 'both') && !pv.locked.main) { fitMain(plain, copy); v.L.main.view = copy.L.main.view; }
    if ((which === 'inset' || which === 'both') && !pv.locked.inset) { fitInset(plain, copy); v.L.inset.view = copy.L.inset.view; }
  });
};

/** Gebietsstände bei Bedarf nachladen (Gemeinden usw. werden erst geladen, wenn man sie braucht). */
export async function loadGeoSets(ids: (string | null | undefined)[]): Promise<boolean> {
  const need = [...new Set(ids.filter((x): x is string => !!x && !GEO[x] && !isVirtualGeo(x)))];   // Regionen und importierte Geodaten liegen im Projekt
  if (!need.length) return true;
  setUI({ busy: 'Lade ' + need.map(geoLabel).join(', ') + ' …' });
  try { await ensureGeo(need); return true; }
  catch (e) { toast('Geometrien konnten nicht geladen werden: ' + (e as Error).message); return false; }
  finally { setUI({ busy: null }); }
}
export function newProject(geoSet = 'btw-wk-2025', name = 'Neues Projekt') {
  const d = withDefaultLogo(defaultDoc(geoSet)); d.name = name;   // gemerktes Logo gleich mit Platz in der Grafik
  if (GEO[geoSet] && GEO[geoSet].meta.level !== 'btw-wk') d.inset.visible = false;   // Detail-Lupen sind für Bundestagswahlkreise gedacht
  d.variants = [makeVariant(d, '4:5')];
  setDoc(d); setUI({ start: false, sel: { kind: 'graphic' }, mapMode: null, step: 'gebiete', panelOpen: true });
}
export async function openDoc(d0: Doc) {
  await loadGeoSets([d0.geoSet, ...(d0.datasets || []).map(x => x.geoSet), ...(d0.overlays || []).map(o => o.geoSet), ...(d0.regions || []).map(r => r.base)]);
  syncUserGeo(d0); syncRegions(d0);
  if (!GEO[d0.geoSet]) throw new Error('Unbekannter Gebietsstand: ' + d0.geoSet);
  const d = normalizeDoc(d0);
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
/** Ebene bzw. Gebietsstand wechseln. Der Fokus wird mitgenommen (Kreis Görlitz bleibt Kreis Görlitz,
 *  egal ob als Gemeinden, Kreise oder Wahlkreise); `from` übersetzt stattdessen einen anderen Fokus. */
export async function setGeoSet(id: string, opts: { fokus?: Fokus; from?: Fokus } = {}) {
  if (getDoc().geoSet === id && !opts.fokus && !opts.from) return;
  if (!(await loadGeoSets([id])) || !GEO[id]) return;
  const d0 = getDoc(), from = GEO[d0.geoSet];
  const nf = opts.fokus || (from ? translateFokus(opts.from || d0.fokus, from, GEO[id]) : { kind: 'de' as const });
  update(d => {
    d.geoSet = id; d.fokus = nf;
    if (nf.kind !== 'de' && d.inset.visible) { d.inset.visible = false; d.inset.autoHidden = true; }
    for (const v of d.variants) v.labelOffsets = {};
    refit(d, 'both');
    // Farbregel: Daten feinerer Ebenen werden summiert (Gemeinden → Kreise, Regionen); sonst auf einen passenden Datensatz umstellen
    const plain = current(d) as Doc, cur = plain.color as ColorRule & { dataset?: string };
    const ds = datasetFor(plain, cur.dataset, id);
    if (ds && ds.geoSet !== id) { const alt = usableDatasets(plain, id).find(x => !x.derived) || usableDatasets(plain, id)[0]; if (alt) d.color = autoRule(alt); }
  });
  setUI({ sel: { kind: 'graphic' } });
  const fl = fokusLabel(getDoc()), gl = GEO[id].meta.label;
  toast(gl + (nf.kind !== 'de' && !fl.startsWith(gl) ? ' · ' + fl : ''));
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
      if (d.geoSet !== ds.geoSet) { d.geoSet = ds.geoSet; d.fokus = { kind: 'de' }; if (GEO[ds.geoSet] && GEO[ds.geoSet].meta.level !== 'btw-wk' && d.inset.visible) d.inset.visible = false; }
      d.color = autoRule(ds);
      if (d.texts.title.text === 'Titel der Grafik' && ds.groups.some(g => g.parties)) {
        const SING: Record<string, string> = { 'btw-wk': 'Wahlkreis', lan: 'Land', rbz: 'Regierungsbezirk', krs: 'Kreis', vwg: 'Gemeindeverband', gem: 'Gemeinde', custom: 'Region', 'be-wk': 'Wahlkreis', 'be-bez': 'Bezirk', 'be-bwb': 'Briefwahlbezirk', 'be-wbz': 'Wahlbezirk' };
        d.texts.title.text = 'Stärkste Partei je ' + (SING[GEO[ds.geoSet]?.meta.level] || 'Gebiet');
        const grp = ds.groups.find(g => g.parties && /Zweit/.test(g.label)) || ds.groups.find(g => g.parties);
        d.texts.subtitle.text = `${grp && !ds.name.includes(grp.label) ? grp.label + ', ' : ''}${ds.name}. Je kräftiger die Farbe, desto höher der Anteil der stärksten Partei.`;
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
    if (cur.dataset === id) { const plain = current(d) as Doc, u = usableDatasets(plain); d.color = u.length ? autoRule(u[0]) : plain.datasets.length ? autoRule(plain.datasets[0]) : { mode: 'none' }; }
    if (d.bubbles?.dataset === id) d.bubbles = null;
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
