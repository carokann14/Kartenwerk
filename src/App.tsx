import React, { useEffect, useState } from 'react';
import { loadGeo } from './geo/geo';
import { loadFonts } from './lib/fonts';
import { scheduleAutosave, setOverride, toggleGuidesVisible } from './model/actions';
import { Step, getDoc, getUI, redo, setUI, toast, undo, update, useStore } from './model/store';
import { clamp } from './lib/util';
import { addTextNode, sanitizeSel, copyNodes, deleteNodes, duplicateNodes, hasClip, nudge, pasteNodes, reorder, selIds, selectAll } from './model/transform';
import { Canvas, fitViewToCanvas } from './ui/Canvas';
import { Icon } from './ui/common';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { ImportWizard } from './ui/ImportWizard';
import { GeoImportWizard } from './ui/GeoImportWizard';
import { TableEditor } from './ui/TableEditor';
import { SuggestDialog } from './ui/SuggestDialog';
import { KatalogDialog } from './ui/KatalogDialog';
import { RightPanel } from './ui/RightPanel';
import { StartDialog } from './ui/StartDialog';
import { TopBar } from './ui/TopBar';
import { saveProjectFile } from './model/projectIO';
import { duplicateEl, removeEl } from './model/annotations';
import { removeOverlay } from './model/overlays';
import { PanelDaten } from './ui/panels/Daten';
import { PanelElemente } from './ui/panels/Elemente';
import { PanelExport } from './ui/panels/Export';
import { PanelFaerbung } from './ui/panels/Faerbung';
import { PanelGebiete } from './ui/panels/Gebiete';
import { PanelDiagramm } from './ui/panels/Diagramm';
import { isChart } from './model/graphicKeys';

type StepDef = { id: Step; label: string; C: () => JSX.Element };
const MAP_STEPS: StepDef[] = [
  { id: 'gebiete', label: 'Gebiete', C: PanelGebiete },
  { id: 'daten', label: 'Daten', C: PanelDaten },
  { id: 'faerbung', label: 'Färbung', C: PanelFaerbung },
  { id: 'elemente', label: 'Elemente', C: PanelElemente },
  { id: 'export', label: 'Export', C: PanelExport },
];
// Diagramm (M7): Daten · Diagramm · Elemente · Export
const CHART_STEPS: StepDef[] = [
  { id: 'daten', label: 'Daten', C: PanelDaten },
  { id: 'diagramm', label: 'Diagramm', C: PanelDiagramm },
  { id: 'elemente', label: 'Elemente', C: PanelElemente },
  { id: 'export', label: 'Export', C: PanelExport },
];
const useSteps = () => useStore(s => (s.doc && isChart(s.doc) ? CHART_STEPS : MAP_STEPS));

function Rail() {
  const STEPS = useSteps();
  const step = useStore(s => s.ui.step);
  const open = useStore(s => s.ui.panelOpen);
  return (
    <nav className="rail" aria-label="Arbeitsschritte">
      {STEPS.map(s => { const I = Icon[s.id]; return (
        <button key={s.id} className={'rail-btn' + (step === s.id && open ? ' active' : '')} aria-current={step === s.id && open ? 'step' : undefined}
          onClick={() => setUI(u => ({ step: s.id, panelOpen: u.step === s.id ? !u.panelOpen : true }))} title={s.label}><I /><span>{s.label}</span></button>); })}
      <div className="rail-spacer" />
      <button className="rail-btn" onClick={() => setUI(u => ({ panelOpen: !u.panelOpen }))} title="Panel ein- oder ausklappen" aria-pressed={open}><Icon.panel /><span>Panel</span></button>
    </nav>
  );
}
function StepPanel() {
  const STEPS = useSteps();
  const step = useStore(s => s.ui.step);
  const open = useStore(s => s.ui.panelOpen);
  const doc = useStore(s => s.doc);
  if (!open) return <aside className="steppanel" aria-hidden="true" />;
  // Schritt gibt es bei dieser Grafik nicht (Karte ↔ Diagramm): Färbung/Gebiete ↔ Diagramm
  const k0 = STEPS.findIndex(s => s.id === step), k = k0 >= 0 ? k0 : STEPS.findIndex(s => s.id === (step === 'diagramm' ? 'faerbung' : 'diagramm')) >= 0 ? STEPS.findIndex(s => s.id === (step === 'diagramm' ? 'faerbung' : 'diagramm')) : 0, S = STEPS[k];
  return (
    <aside className="steppanel" aria-label={S.label}>
      <StepResize />
      <div className="sp-head"><span className="step-no">{k + 1}/{STEPS.length}</span><h2>{S.label}</h2>
        {k < STEPS.length - 1 && <button className="btn small ghost" onClick={() => setUI({ step: STEPS[k + 1].id })}>Weiter: {STEPS[k + 1].label} <Icon.chev size={12} /></button>}</div>
      <div className="sp-body"><ErrorBoundary key={S.id} area={S.label} resetKey={doc}><S.C /></ErrorBoundary></div>
    </aside>
  );
}
/** Ziehgriff am rechten Rand: Arbeitsschritt-Panel breiter/schmaler ziehen (z. B. wenn ein Farbwähler darin sonst am Rand abgeschnitten wäre). */
function StepResize() {
  const onDown = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement; el.setPointerCapture(e.pointerId); el.classList.add('active');
    const startX = e.clientX, startW = getUI().stepW;
    const move = (ev: PointerEvent) => setUI({ stepW: clamp(startW + (ev.clientX - startX), 296, 640) });
    const up = () => { el.classList.remove('active'); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  return <div className="step-resize" onPointerDown={onDown} role="separator" aria-orientation="vertical" aria-label="Panel-Breite ziehen" />;
}
function Toast() {
  const t = useStore(s => s.ui.toast);
  return t ? <div className="toast" role="status" key={t.t}>{t.msg}</div> : null;
}
function Busy() {
  const b = useStore(s => s.ui.busy);
  return b ? <div className="busy" role="status"><span className="spinner" aria-hidden="true" />{b}</div> : null;
}

const isTyping = (e: KeyboardEvent) => { const t = e.target as HTMLElement; return !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable); };
function useShortcuts() {
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      // Solange ein Dialog offen ist, gelten die Tastenkürzel der Arbeitsfläche nicht (sonst löschte z. B. Entf mit Fokus auf
      // einem Knopf im Tabellen-Dialog den in der Grafik ausgewählten Marker, Strg+Z machte im Hintergrund rückgängig)
      const u = getUI(); if (u.start || u.wizard || u.geoWizard || u.tableEdit || u.katalog || u.suggest || !getDoc()) return;
      if (document.querySelector('.modal-back')) return;
      const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
      if (mod && key === 'z' && !isTyping(e)) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (mod && key === 'y' && !isTyping(e)) { e.preventDefault(); redo(); return; }
      if (mod && key === 's') { e.preventDefault(); saveProjectFile(); return; }
      if (mod && e.key === '0') { e.preventDefault(); fitViewToCanvas(); return; }
      if (isTyping(e)) return;
      if (key === 'r' && e.shiftKey && !mod) { e.preventDefault(); toggleGuidesVisible(); return; }
      if (e.key === 'Escape') {
        if (u.tool) { setUI({ tool: null }); return; }
        if (u.menu) { setUI({ menu: null }); return; }
        if (u.mapMode) { setUI({ mapMode: null }); return; }
        if (u.sel.kind === 'area') { setUI({ sel: { kind: 'frame', id: 'main' } }); return; }   // eine Ebene zurück: Gebiet → Karte (Q16)
        setUI({ sel: { kind: 'graphic' } }); return;
      }
      // Objekte (M11 · Etappe 2): Titel, Karte, Legende, Textfelder … – auch mehrere
      const ids = u.mapMode ? [] : selIds(u.sel);
      if (mod && key === 'a') { e.preventDefault(); selectAll(); return; }
      if (!mod && !e.shiftKey && !e.altKey && key === 't') { e.preventDefault(); addTextNode(); return; }
      if (mod && key === 'v' && hasClip()) { e.preventDefault(); pasteNodes(); return; }
      if (ids.length) {
        const fwd = e.key === ']' || e.key === '}' || e.key === 'ArrowUp', back = e.key === '[' || e.key === '{' || e.key === 'ArrowDown';
        if (mod && (fwd || back)) { e.preventDefault(); reorder(ids, e.shiftKey ? (fwd ? 'top' : 'bottom') : (fwd ? 'up' : 'down')); return; }
        if (e.key.startsWith('Arrow') && !mod) {
          e.preventDefault();
          const st = e.shiftKey ? 10 : 1;
          nudge(ids, e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0);
          return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteNodes(ids); return; }
        if (mod && key === 'd') { e.preventDefault(); duplicateNodes(ids); return; }
        // Strg+C/X: markierter Text auf der Seite (etwa ein Hinweis) geht vor
        if (mod && (key === 'c' || key === 'x') && !window.getSelection()?.toString()) { e.preventDefault(); if (copyNodes(ids) && key === 'x') deleteNodes(ids); return; }
      }
      if (e.key.startsWith('Arrow') && u.sel.kind === 'ann' && !u.mapMode) {
        e.preventDefault();
        const st = e.shiftKey ? 10 : 1, id = u.sel.id;
        const dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
        update(d => { const V = d.variants[d.active]; const o = V.ann[id] || [0, 0]; V.ann[id] = [o[0] + dx, o[1] + dy]; }, { key: 'nudge-' + id });
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && u.sel.kind === 'ann') { e.preventDefault(); removeEl(u.sel.id); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && u.sel.kind === 'overlay') { e.preventDefault(); removeOverlay(u.sel.id); return; }
      if (mod && key === 'd' && u.sel.kind === 'ann') { e.preventDefault(); duplicateEl(u.sel.id); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && u.sel.kind === 'area') {
        const d = getDoc(); const ids = u.sel.ids.filter(id => d.overrides[d.geoSet + ':' + id]);
        if (ids.length) { e.preventDefault(); setOverride(ids, null); }
      }
    };
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }, []);
}
function useAutosave() {
  useEffect(() => useStore.subscribe((s, prev) => { if (s.doc && s.doc !== prev.doc) { sanitizeSel(); if (!s.ui.start) scheduleAutosave(); } }), []);
}

export function App() {
  const [ready, setReady] = useState<'loading' | 'ok' | string>('loading');
  const hasDoc = useStore(s => !!s.doc);
  const doc = useStore(s => s.doc);
  const start = useStore(s => s.ui.start);
  const wizard = useStore(s => s.ui.wizard);
  const geoWizard = useStore(s => s.ui.geoWizard);
  const tableEdit = useStore(s => s.ui.tableEdit);
  const suggest = useStore(s => s.ui.suggest);
  const katalog = useStore(s => s.ui.katalog);
  const panelOpen = useStore(s => s.ui.panelOpen);
  const panelW = useStore(s => s.ui.panelW);
  const stepW = useStore(s => s.ui.stepW);
  useShortcuts();
  useAutosave();
  useEffect(() => {
    Promise.all([loadGeo(), loadFonts()]).then(() => setReady('ok')).catch(e => setReady(String((e as Error)?.message || e)));
  }, []);
  if (ready === 'loading') return <div className="boot"><div className="boot-card"><span className="spinner" aria-hidden="true" />Kartenwerk lädt Geometrien und Schriften …</div></div>;
  if (ready !== 'ok') return <div className="boot"><div className="boot-card err"><Icon.warn /> Laden fehlgeschlagen: {ready}<br /><span className="hint">Wird die Seite direkt als Datei geöffnet? Dann über GitHub Pages oder einen lokalen Server starten (siehe README).</span></div></div>;
  return (
    <div id="app">
      {hasDoc ? <>
        <TopBar />
        <div className={'main' + (panelOpen ? '' : ' panel-closed')} style={{ '--panelw': panelW + 'px', '--stepw': (panelOpen ? stepW : 0) + 'px' } as React.CSSProperties}>
          <Rail />
          <StepPanel />
          <ErrorBoundary area="Arbeitsfläche" resetKey={doc}><Canvas /></ErrorBoundary>
          <RightPanel />
        </div>
      </> : <div className="boot" />}
      {/* Dialoge: ein Fehler darin schließt nur den Dialog, nicht die ganze App */}
      {(start || !hasDoc) && <ErrorBoundary area="Startdialog" onClose={hasDoc ? () => setUI({ start: false }) : undefined}><StartDialog /></ErrorBoundary>}
      {wizard && hasDoc && <ErrorBoundary area="Datenimport" onClose={() => setUI({ wizard: null, afterImport: null })}><ImportWizard /></ErrorBoundary>}
      {geoWizard && hasDoc && <ErrorBoundary area="Geodaten-Import" onClose={() => setUI({ geoWizard: false })}><GeoImportWizard /></ErrorBoundary>}
      {tableEdit && hasDoc && <ErrorBoundary area="Tabelle" onClose={() => setUI({ tableEdit: null })}><TableEditor /></ErrorBoundary>}
      {katalog && hasDoc && <ErrorBoundary area="Katalog" onClose={() => setUI({ katalog: false })}><KatalogDialog /></ErrorBoundary>}
      {suggest && hasDoc && <ErrorBoundary area="Vorschläge" onClose={() => setUI({ suggest: null, suggestFresh: false })}><SuggestDialog /></ErrorBoundary>}
      <Toast />
      <Busy />
    </div>
  );
}
