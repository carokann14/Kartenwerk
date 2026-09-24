import { create } from 'zustand';
import { produce, Draft, freeze } from 'immer';
import type { Doc, Sel } from './types';
import type { Dataset } from '../data/types';

export type Step = 'gebiete' | 'daten' | 'faerbung' | 'elemente' | 'export';
export interface UI {
  step: Step; panelOpen: boolean; sel: Sel; mapMode: 'main' | 'inset' | null;
  view: { x: number; y: number; z: number }; hover: number | null; menu: string | null;
  expanded: Record<string, boolean>; search: string; tableSort: { k: string; dir: number }; tableDataset: string | null;
  exportProfile: 'svg' | 'png'; pngWidth: number | null;
  wizard: null | { mode: 'new' | 'replace'; datasetId?: string };
  start: boolean;            // Startdialog
  toast: { msg: string; t: number } | null;
  saveState: 'saved' | 'saving' | 'error' | 'idle';
  tool: null | 'marker' | 'text' | 'arrow';   // Setzen per Klick bzw. Ziehen in der Grafik
  busy: string | null;       // längerer Ladevorgang (z. B. Gemeindegrenzen)
}
interface State {
  doc: Doc | null; ui: UI; past: Doc[]; future: Doc[]; lastKey: string; lastAt: number;
}
export const useStore = create<State>(() => ({
  doc: null,
  ui: {
    step: 'gebiete', panelOpen: true, sel: { kind: 'graphic' }, mapMode: null, view: { x: 0, y: 0, z: 0.5 }, hover: null, menu: null,
    expanded: {}, search: '', tableSort: { k: 'nr', dir: 1 }, tableDataset: null, exportProfile: 'svg', pngWidth: null,
    wizard: null, start: true, toast: null, saveState: 'idle', tool: null, busy: null,
  },
  past: [], future: [], lastKey: '', lastAt: 0,
}));
const get = () => useStore.getState();

/** Dokument ändern. history=false für Zwischenschritte (z. B. beim Ziehen), key fasst schnelle Änderungen zusammen. */
export function update(recipe: (d: Draft<Doc>) => void, opts: { history?: boolean; key?: string } = {}) {
  const s = get(); if (!s.doc) return;
  const next = produce(s.doc, recipe);
  if (next === s.doc) return;
  const now = Date.now();
  const coalesce = opts.key && opts.key === s.lastKey && now - s.lastAt < 1200;
  if (opts.history === false || coalesce) useStore.setState({ doc: next, lastAt: now });
  else useStore.setState({ doc: next, past: [...s.past.slice(-149), s.doc], future: [], lastKey: opts.key || '', lastAt: now });
}
/** Vor einer Geste (Ziehen) einmal den Stand merken. */
export function beginGesture() { const s = get(); if (s.doc) useStore.setState({ past: [...s.past.slice(-149), s.doc], future: [], lastKey: '' }); }
export function undo() { const s = get(); if (!s.past.length || !s.doc) return; useStore.setState({ doc: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.doc, ...s.future], lastKey: '' }); toast('Rückgängig'); }
export function redo() { const s = get(); if (!s.future.length || !s.doc) return; useStore.setState({ doc: s.future[0], future: s.future.slice(1), past: [...s.past, s.doc], lastKey: '' }); toast('Wiederholt'); }
export function setDoc(doc: Doc, keepHistory = false) { useStore.setState({ doc: freeze(doc, true), past: keepHistory ? get().past : [], future: [] }); }
export function setUI(patch: Partial<UI> | ((u: UI) => Partial<UI>)) {
  const u = get().ui; const p = typeof patch === 'function' ? patch(u) : patch;
  useStore.setState({ ui: { ...u, ...p } });
}
let toastTimer = 0;
export function toast(msg: string) { setUI({ toast: { msg, t: Date.now() } }); clearTimeout(toastTimer); toastTimer = window.setTimeout(() => setUI({ toast: null }), 2200); }
export const getDoc = () => get().doc!;
export const getUI = () => get().ui;
export const useDoc = () => useStore(s => s.doc!);
export const useUI = () => useStore(s => s.ui);
export type { Dataset };
