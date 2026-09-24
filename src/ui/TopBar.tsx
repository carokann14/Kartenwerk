import React, { useEffect, useRef } from 'react';
import { PRESETS } from '../model/defaults';
import { addVariant, removeVariant, switchVariant } from '../model/actions';
import { duplicateProject, openProjectFile, renameProject, saveProjectFile } from '../model/projectIO';
import { redo, setUI, undo, useStore } from '../model/store';
import { activeVariant } from '../render/elements';
import { Icon, ratioIcon } from './common';

export const APP_VERSION = 'M1 · Pilot';

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    window.addEventListener('pointerdown', h, true);
    return () => window.removeEventListener('pointerdown', h, true);
  }, [open, close]);
  return ref;
}

export function TopBar() {
  const doc = useStore(s => s.doc!);
  const menu = useStore(s => s.ui.menu);
  const saveState = useStore(s => s.ui.saveState);
  const canUndo = useStore(s => s.past.length > 0);
  const canRedo = useStore(s => s.future.length > 0);
  const v = activeVariant(doc);
  const closeMenu = React.useCallback(() => setUI({ menu: null }), []);
  const varRef = useOutside(menu === 'variants', closeMenu);
  const projRef = useOutside(menu === 'project', closeMenu);
  const fileRef = useRef<HTMLInputElement>(null);
  const have = new Set(doc.variants.map(x => x.preset));
  const saveLabel = saveState === 'saving' ? 'speichert …' : saveState === 'saved' ? 'im Browser gesichert' : saveState === 'error' ? 'Sichern fehlgeschlagen' : '';
  return (
    <header className="topbar">
      <div className="brand">
        <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5 9.5 3l5 2.5L20 3v15.5l-5.5 2.5-5-2.5L4 21z" fill="var(--accent)" /><path d="M9.5 3v15.5M14.5 5.5V21" stroke="#fff" strokeWidth="1.4" fill="none" /></svg>
        <span>Kartenwerk</span>
        <span className="proto-badge">{APP_VERSION}</span>
      </div>
      <div className="tb-sep tb-hide-narrow" />
      <div className="tb-group menu-anchor tb-hide-narrow" ref={projRef}>
        <input className="proj-name" value={doc.name} onChange={e => renameProject(e.target.value)} aria-label="Projektname" size={Math.max(8, Math.min(34, doc.name.length + 1))} />
        <button className="btn icon ghost" onClick={() => setUI({ menu: menu === 'project' ? null : 'project' })} aria-haspopup="menu" aria-expanded={menu === 'project'} aria-label="Projektmenü"><Icon.chevDown /></button>
        {menu === 'project' && <div className="menu" role="menu">
          <h6>Projekt</h6>
          <button className="menu-item" role="menuitem" onClick={() => { setUI({ menu: null, start: true }); }}><Icon.folder /> Projekte im Browser …</button>
          <button className="menu-item" role="menuitem" onClick={() => { setUI({ menu: null }); saveProjectFile(); }}><Icon.download /> Projektdatei speichern<span className="dim">.kartenwerk.json</span></button>
          <button className="menu-item" role="menuitem" onClick={() => fileRef.current?.click()}><Icon.upload /> Projektdatei öffnen …</button>
          <button className="menu-item" role="menuitem" onClick={() => { setUI({ menu: null }); duplicateProject(); }}><Icon.copy /> Kopie anlegen</button>
          <p className="hint menu-hint">Änderungen werden laufend im Browser gesichert. Die Projektdatei enthält Daten und Layout, zum Weitergeben oder als Sicherung.</p>
        </div>}
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; setUI({ menu: null }); if (f) openProjectFile(f); }} />
      </div>
      <div className="tb-sep tb-hide-narrow" />
      <div className="tb-group menu-anchor" ref={varRef}>
        <span className="tb-label tb-hide-narrow">Variante</span>
        <button className="btn" onClick={() => setUI({ menu: menu === 'variants' ? null : 'variants' })} aria-haspopup="menu" aria-expanded={menu === 'variants'}>
          {ratioIcon(v.w, v.h)}<span>{v.preset}</span><span className="num dim">{v.w} × {v.h}</span><Icon.chevDown />
        </button>
        {menu === 'variants' && <div className="menu" role="menu">
          <h6>Varianten in diesem Projekt</h6>
          {doc.variants.map((x, k) => (
            <div key={x.id} className="menu-row">
              <button className={'menu-item' + (k === doc.active ? ' active' : '')} role="menuitem" onClick={() => switchVariant(k)}>{ratioIcon(x.w, x.h)}{PRESETS[x.preset]?.label || x.preset}<span className="dim">{x.w}×{x.h}</span></button>
              {doc.variants.length > 1 && <button className="btn icon ghost small" onClick={() => removeVariant(k)} aria-label={'Variante ' + x.preset + ' entfernen'} title="Variante entfernen"><Icon.x size={13} /></button>}
            </div>))}
          <h6>Variante hinzufügen</h6>
          {Object.entries(PRESETS).filter(([k]) => !have.has(k) || k === 'Frei').map(([k, p]) => <button key={k} className="menu-item" role="menuitem" onClick={() => addVariant(k)}>{ratioIcon(p.w, p.h)}{p.label}<span className="dim">{p.w}×{p.h}</span></button>)}
          <p className="hint menu-hint">Varianten teilen Daten, Farben und Texte. Ausschnitt, Positionen und verschobene Beschriftungen gelten je Variante.</p>
        </div>}
      </div>
      <div className="tb-group tb-hide-narrow">
        <button className="btn icon ghost" onClick={undo} disabled={!canUndo} title="Rückgängig (Strg+Z)" aria-label="Rückgängig"><Icon.undo /></button>
        <button className="btn icon ghost" onClick={redo} disabled={!canRedo} title="Wiederholen (Strg+Umschalt+Z)" aria-label="Wiederholen"><Icon.redo /></button>
      </div>
      <div className="tb-spacer" />
      {saveLabel && <span className={'tb-label save-state tb-hide-narrow' + (saveState === 'error' ? ' err' : '')} role="status">{saveState === 'saved' && <Icon.check size={13} />}{saveLabel}</span>}
      <button className="btn primary" onClick={() => setUI({ step: 'export', panelOpen: true })}><Icon.export />Export</button>
    </header>
  );
}
