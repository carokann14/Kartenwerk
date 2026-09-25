import React, { useEffect, useState } from 'react';
import { loadGeo } from './geo/geo';
import { loadFonts } from './lib/fonts';
import { scheduleAutosave, setOverride, toggleGuidesVisible } from './model/actions';
import { Step, getDoc, getUI, redo, setUI, toast, undo, update, useStore } from './model/store';
import { setLogoVisible } from './model/logo';
import { Canvas, fitViewToCanvas } from './ui/Canvas';
import { Icon } from './ui/common';
import { ImportWizard } from './ui/ImportWizard';
import { GeoImportWizard } from './ui/GeoImportWizard';
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

const STEPS: { id: Step; label: string; C: () => JSX.Element }[] = [
  { id: 'gebiete', label: 'Gebiete', C: PanelGebiete },
  { id: 'daten', label: 'Daten', C: PanelDaten },
  { id: 'faerbung', label: 'Färbung', C: PanelFaerbung },
  { id: 'elemente', label: 'Elemente', C: PanelElemente },
  { id: 'export', label: 'Export', C: PanelExport },
];

function Rail() {
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
  const step = useStore(s => s.ui.step);
  const open = useStore(s => s.ui.panelOpen);
  if (!open) return <aside className="steppanel" aria-hidden="true" />;
  const k = STEPS.findIndex(s => s.id === step), S = STEPS[k];
  return (
    <aside className="steppanel" aria-label={S.label}>
      <div className="sp-head"><span className="step-no">{k + 1}/5</span><h2>{S.label}</h2>
        {k < 4 && <button className="btn small ghost" onClick={() => setUI({ step: STEPS[k + 1].id })}>Weiter: {STEPS[k + 1].label} <Icon.chev size={12} /></button>}</div>
      <div className="sp-body"><S.C /></div>
    </aside>
  );
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
      const u = getUI(); if (u.start || u.wizard || u.geoWizard || !getDoc()) return;
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
        setUI({ sel: { kind: 'graphic' } }); return;
      }
      if (e.key.startsWith('Arrow') && (u.sel.kind === 'el' || u.sel.kind === 'frame') && !u.mapMode) {
        e.preventDefault();
        const st = e.shiftKey ? 10 : 1, id = u.sel.id;
        const dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
        update(d => { const L = d.variants[d.active].L[id]; L.x += dx; L.y += dy; }, { key: 'nudge-' + id });
        return;
      }
      if (e.key.startsWith('Arrow') && u.sel.kind === 'ann' && !u.mapMode) {
        e.preventDefault();
        const st = e.shiftKey ? 10 : 1, id = u.sel.id;
        const dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
        update(d => { const V = d.variants[d.active]; const o = V.ann[id] || [0, 0]; V.ann[id] = [o[0] + dx, o[1] + dy]; }, { key: 'nudge-' + id });
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && u.sel.kind === 'el' && u.sel.id === 'logo') { e.preventDefault(); if (getDoc().logo.visible) { setLogoVisible(false); toast('Logo ausgeblendet · einblenden unter Ebenen oder „Elemente“'); } return; }
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
  useEffect(() => useStore.subscribe((s, prev) => { if (s.doc && s.doc !== prev.doc && !s.ui.start) scheduleAutosave(); }), []);
}

export function App() {
  const [ready, setReady] = useState<'loading' | 'ok' | string>('loading');
  const hasDoc = useStore(s => !!s.doc);
  const start = useStore(s => s.ui.start);
  const wizard = useStore(s => s.ui.wizard);
  const geoWizard = useStore(s => s.ui.geoWizard);
  const panelOpen = useStore(s => s.ui.panelOpen);
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
        <div className={'main' + (panelOpen ? '' : ' panel-closed')}>
          <Rail />
          <StepPanel />
          <Canvas />
          <RightPanel />
        </div>
      </> : <div className="boot" />}
      {(start || !hasDoc) && <StartDialog />}
      {wizard && hasDoc && <ImportWizard />}
      {geoWizard && hasDoc && <GeoImportWizard />}
      <Toast />
      <Busy />
    </div>
  );
}
