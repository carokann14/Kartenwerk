// Mappe: Grafiken anlegen, wechseln, duplizieren, umbenennen, löschen.
// Die aktive Grafik steht mit ihren Feldern (GRAPHIC_KEYS) oben im Doc; so arbeiten Karte, Farbregeln, Texte und Export
// unverändert. Beim Wechsel wird ihr Zustand in `pageData` abgelegt und der Zustand der Zielgrafik nach oben geholt.
import { current, Draft } from 'immer';
import { getDoc, setUI, toast, update } from './store';
import { defaultDoc } from './defaults';
import { makeVariant } from './layout';
import { GRAPHIC_KEYS, pickGraphic } from './graphicKeys';
import type { Doc, GraphicKind, GraphicMeta } from './types';
import { GEO } from '../geo/geo';
import { isVirtualGeo } from '../geo/userGeo';
import { uid } from '../lib/util';
import { autoRule, loadGeoSets } from './actions';
import { usableDatasets } from '../data/aggregate';

const KIND_NAME: Record<GraphicKind, string> = { map: 'Karte', chart: 'Diagramm' };

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
  return [s.geoSet, ...(s.overlays || []).map(o => o.geoSet)].filter(Boolean);
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
/** Neue Grafik: gleiche Formate wie die aktive, gemerktes Logo und Gebietsstand übernommen, sonst leer */
export function addGraphic(kind: GraphicKind = 'map') {
  const d0 = getDoc();
  const base = defaultDoc(d0.geoSet);
  base.logo = JSON.parse(JSON.stringify(d0.logo));
  base.inset.visible = d0.inset.visible && GEO[d0.geoSet]?.meta.level === 'btw-wk';
  // Daten der Mappe: die neue Karte färbt gleich mit dem ersten passenden Datensatz
  const use = usableDatasets({ ...d0, geoSet: d0.geoSet } as Doc).find(x => !x.derived) || usableDatasets(d0)[0];
  if (kind === 'map' && use) base.color = autoRule(use);
  base.variants = d0.variants.map(v => makeVariant(base, v.preset, v.w, v.h, JSON.parse(JSON.stringify(v.guides))));
  const n = d0.graphics.filter(g => g.kind === kind).length + 1;
  const meta: GraphicMeta = { id: uid('g'), name: `${KIND_NAME[kind]} ${n}`, kind };
  update(d => {
    d.graphics.push(meta);
    d.pageData[meta.id] = pickGraphic(base) as Draft<Partial<Doc>>;
    swapTo(d, d.graphics.length - 1);
  });
  setUI({ sel: { kind: 'graphic' }, mapMode: null, step: kind === 'map' ? 'gebiete' : 'daten' });
  toast(`„${meta.name}“ angelegt`);
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
