// Mappe: Grafiken anlegen, wechseln, duplizieren, umbenennen, löschen.
// Die aktive Grafik steht mit ihren Feldern (GRAPHIC_KEYS) oben im Doc; so arbeiten Karte, Farbregeln, Texte und Export
// unverändert. Beim Wechsel wird ihr Zustand in `pageData` abgelegt und der Zustand der Zielgrafik nach oben geholt.
import { current, Draft } from 'immer';
import { getDoc, setUI, toast, update } from './store';
import { defaultDoc } from './defaults';
import { makeVariant } from './layout';
import { GRAPHIC_KEYS, pickGraphic } from './graphicKeys';
import type { ChartSource, ChartSpec, ChartType, ColorRule, Doc, GraphicKind, GraphicMeta } from './types';
import { chartModel, defaultChart } from '../render/chart';
import { chartTexts, defaultSource, typeFor } from '../render/chartSource';
import { GEO } from '../geo/geo';
import { isVirtualGeo } from '../geo/userGeo';
import { uid } from '../lib/util';
import { autoRule, loadGeoSets } from './actions';
import { usableDatasets } from '../data/aggregate';

const KIND_NAME: Record<GraphicKind, string> = { map: 'Karte', chart: 'Diagramm' };
export const CHART_NAME: Record<ChartType, string> = { saeulen: 'Ergebnis', gewinne: 'Gewinne und Verluste', balken: 'Balken', linie: 'Entwicklung', sitze: 'Sitzverteilung' };

/** Zustand der aktiven Grafik ablegen und Grafik k nach oben holen (im selben Änderungsschritt) */
function swapTo(d: Draft<Doc>, k: number) {
  if (k === d.page || !d.graphics[k]) return;
  const plain = current(d) as Doc;
  d.pageData[d.graphics[d.page].id] = pickGraphic(plain) as Draft<Partial<Doc>>;
  const target = d.graphics[k], snap = plain.pageData[target.id];
  if (snap) for (const key of GRAPHIC_KEYS) (d as unknown as Record<string, unknown>)[key] = (snap as Record<string, unknown>)[key];
  delete d.pageData[target.id];
  d.page = k;
}
const geoOk = (id: string | undefined) => !!id && (!!GEO[id] || isVirtualGeo(id));
/** Gebietsstände, die eine Grafik zum Zeichnen braucht */
function geoNeeds(d: Doc, k: number): string[] {
  const s = k === d.page ? d : { ...d, ...(d.pageData[d.graphics[k].id] || {}) } as Doc;
  const cds = s.chart?.source ? d.datasets.find(x => x.id === s.chart!.source!.dataset)?.geoSet : null;
  return [s.geoSet, cds, ...(s.overlays || []).map(o => o.geoSet)].filter((x): x is string => !!x);
}

export async function switchGraphic(k: number) {
  const d0 = getDoc(); if (k === d0.page || !d0.graphics[k]) return;
  await loadGeoSets(geoNeeds(d0, k));
  update(d => {
    swapTo(d, k);
    if (!geoOk(d.geoSet)) d.geoSet = (current(d) as Doc).datasets[0]?.geoSet || 'btw-wk-2025';   // Gebietsstand entfernt (etwa gelöschte Geodaten)
  }, { history: false });
  setUI({ sel: { kind: 'graphic' }, mapMode: null, tool: null });
}
/** Zustand einer neuen Diagramm-Grafik: ohne Legende und Lupe, Quelle aus dem ersten passenden Datensatz */
export function chartState(d0: Doc, type: ChartType, dsId?: string): Partial<Doc> & { chart: ChartSpec } {
  const spec = defaultChart(type);
  // Datensatz mit einer Quelle, die mindestens zwei Säulen bzw. Balken ergibt (Balken: keine Parteisummen, kein Deutschland-Einzelwert)
  const usable = (x: Doc['datasets'][number]) => {
    const src = defaultSource(d0, x, type); if (!src || (type === 'balken' && src.kind === 'partei')) return false;
    return chartModel({ ...d0, chart: { ...spec, type: typeFor(src, type), source: src } } as Doc).bars.length >= 2;
  };
  const ds = (dsId && d0.datasets.find(x => x.id === dsId)) || [...d0.datasets].reverse().find(usable);
  if (ds) { spec.source = defaultSource(d0, ds, type); spec.type = typeFor(spec.source, type); }
  return { chart: spec };
}
function applyChartDefaults(base: Doc, d0: Doc, type: ChartType, dsId?: string, source?: ChartSource | null) {
  const { chart } = chartState(d0, type, dsId);
  if (source) { chart.source = source; chart.type = type; }
  base.chart = chart; base.legend.visible = false; base.inset.visible = false; base.color = { mode: 'none' };
  const tx = chartTexts({ ...d0, chart } as Doc, chart);
  if (tx) { base.texts.title.text = tx.title; base.texts.subtitle.text = tx.subtitle; }
  else { base.texts.subtitle.text = 'Unterzeile: Was zeigt das Diagramm, welche Wahl, welcher Stand?'; }
}
/** Was eine neue Grafik mitbringt (Vorschläge, Startdialog); alles optional */
export interface GraphicInit {
  kind: GraphicKind; type?: ChartType; dsId?: string;
  geoSet?: string; color?: ColorRule; source?: ChartSource | null;
  title?: string; subtitle?: string; name?: string;
}
/** Neue Grafik: gleiche Formate wie die aktive, gemerktes Logo und Gebietsstand übernommen, sonst leer.
 *  replace: statt anzuhängen die aktive Grafik ersetzen (erste Grafik nach „Mit Daten starten“).
 *  Der Gebietsstand muss geladen sein. */
export function createGraphic(init: GraphicInit, replace = false) {
  const { kind, type = 'saeulen' } = init;
  const d0 = getDoc();
  const geoSet = init.geoSet && GEO[init.geoSet] ? init.geoSet : d0.geoSet;
  const base = defaultDoc(geoSet);
  base.logo = JSON.parse(JSON.stringify(d0.logo));
  base.inset.visible = (replace || d0.inset.visible) && GEO[geoSet]?.meta.level === 'btw-wk';
  if (kind === 'map') {
    // Daten der Mappe: die neue Karte färbt gleich mit dem ersten passenden Datensatz
    const use = usableDatasets({ ...d0, geoSet } as Doc).find(x => !x.derived) || usableDatasets({ ...d0, geoSet } as Doc)[0];
    if (init.color) base.color = init.color;
    else if (use) base.color = autoRule(use);
  }
  if (kind === 'chart') applyChartDefaults(base, d0, type, init.dsId, init.source);
  if (init.title != null) base.texts.title.text = init.title;
  if (init.subtitle != null) base.texts.subtitle.text = init.subtitle;
  const probe = { ...d0, ...pickGraphic(base), graphics: [{ id: 'x', name: '', kind }], page: 0 } as Doc;   // Layout kennt die Art der Grafik und die Daten
  base.variants = d0.variants.map(v => makeVariant(probe, v.preset, v.w, v.h, JSON.parse(JSON.stringify(v.guides))));
  // Name ohne Nummer, solange er frei ist („Karte“, „Karte 2“ …)
  const taken = new Set(d0.graphics.filter((_, i) => !(replace && i === d0.page)).map(g => g.name));
  const stem = init.name || (kind === 'chart' ? CHART_NAME[type] : KIND_NAME[kind]);
  let name = stem; for (let k = 2; taken.has(name); k++) name = `${stem} ${k}`;
  const meta: GraphicMeta = { id: uid('g'), name, kind };
  update(d => {
    if (replace) {
      for (const key of GRAPHIC_KEYS) (d as unknown as Record<string, unknown>)[key] = (pickGraphic(base) as Record<string, unknown>)[key];
      d.graphics[d.page] = { ...meta, id: d.graphics[d.page].id };
      if (d.name === 'Neues Projekt' && init.title) d.name = init.title;
      return;
    }
    d.graphics.push(meta);
    d.pageData[meta.id] = pickGraphic(base) as Draft<Partial<Doc>>;
    swapTo(d, d.graphics.length - 1);
  });
  setUI({ sel: { kind: 'graphic' }, mapMode: null, step: kind === 'map' ? (init.color ? 'faerbung' : 'gebiete') : 'diagramm' });
  return meta.name;
}
export function addGraphic(kind: GraphicKind = 'map', type: ChartType = 'saeulen', dsId?: string) {
  const name = createGraphic({ kind, type, dsId });
  toast(`„${name}“ angelegt`);
}
/** Aktive Grafik (etwa die leere Karte eines neuen Projekts) in ein Diagramm verwandeln */
export function makeChartProject(type: ChartType) {
  createGraphic({ kind: 'chart', type }, true);
  update(d => { d.name = d.name === 'Neues Projekt' ? `Neues Diagramm` : d.name; }, { history: false });
}
export function duplicateGraphic(k: number) {
  const d0 = getDoc(), src = d0.graphics[k]; if (!src) return;
  const state = JSON.parse(JSON.stringify(k === d0.page ? pickGraphic(d0) : d0.pageData[src.id])) as Partial<Doc>;
  for (const v of state.variants || []) v.id = uid('v');
  const meta: GraphicMeta = { id: uid('g'), name: `${src.name} (Kopie)`, kind: src.kind };
  update(d => {
    d.graphics.splice(k + 1, 0, meta);
    if (d.page > k) d.page++;
    d.pageData[meta.id] = state as Draft<Partial<Doc>>;
    swapTo(d, k + 1);
  });
  setUI({ sel: { kind: 'graphic' }, mapMode: null });
  toast(`„${meta.name}“ angelegt`);
}
export function renameGraphic(k: number, name: string) {
  const n = name.trim(); if (!n) return;
  update(d => { if (d.graphics[k]) d.graphics[k].name = n; }, { key: 'gname-' + k });
}
export function removeGraphic(k: number) {
  const d0 = getDoc(); if (d0.graphics.length < 2 || !d0.graphics[k]) return;
  const name = d0.graphics[k].name;
  update(d => {
    if (k === d.page) swapTo(d, k === 0 ? 1 : k - 1);   // erst wegwechseln, dann entfernen
    const id = d.graphics[k].id;
    d.graphics.splice(k, 1);
    delete d.pageData[id];
    if (d.page > k) d.page--;
  });
  setUI({ sel: { kind: 'graphic' }, mapMode: null });
  toast(`„${name}“ gelöscht · Strg+Z holt sie zurück`);
}
export function moveGraphic(k: number, to: number) {
  update(d => {
    if (!d.graphics[k] || to < 0 || to >= d.graphics.length || to === k) return;
    const activeId = d.graphics[d.page].id;
    const [g] = d.graphics.splice(k, 1); d.graphics.splice(to, 0, g);
    d.page = d.graphics.findIndex(x => x.id === activeId);
  });
}
