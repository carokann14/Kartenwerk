// Grafiken der Mappe: Leiste über der Arbeitsfläche (wechseln, anlegen, umbenennen, duplizieren, verschieben, löschen)
import React, { useEffect, useRef, useState } from 'react';
import { setUI, useStore } from '../model/store';
import { addGraphic, duplicateGraphic, moveGraphic, removeGraphic, renameGraphic, switchGraphic } from '../model/graphics';
import { fitViewToCanvas } from './Canvas';
import { Icon } from './common';

export function GraphicsBar() {
  const graphics = useStore(s => s.doc!.graphics);
  const page = useStore(s => s.doc!.page);
  const menu = useStore(s => s.ui.menu);
  const [edit, setEdit] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu?.startsWith('gfx')) return;
    const h = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setUI({ menu: null }); };
    window.addEventListener('pointerdown', h); return () => window.removeEventListener('pointerdown', h);
  }, [menu]);
  const go = async (k: number) => { setUI({ menu: null }); if (k !== page) { await switchGraphic(k); requestAnimationFrame(fitViewToCanvas); } };
  const openMenu = (k: number) => setUI({ menu: menu === 'gfx-' + k ? null : 'gfx-' + k });
  return (
    <div className="gfxbar" ref={ref} role="tablist" aria-label="Grafiken der Mappe" onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
      {graphics.map((g, k) => (
        <div key={g.id} className={'gfx' + (k === page ? ' on' : '')} onContextMenu={e => { e.preventDefault(); openMenu(k); }}>
          {edit === k
            ? <input className="gfx-name-edit" autoFocus defaultValue={g.name} aria-label="Name der Grafik"
                onBlur={e => { renameGraphic(k, e.target.value); setEdit(null); }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEdit(null); e.stopPropagation(); }} />
            : <button role="tab" aria-selected={k === page} className="gfx-btn" onClick={() => void go(k)} onDoubleClick={() => setEdit(k)} title={`${g.name} · Doppelklick: umbenennen · Rechtsklick: weitere Aktionen`}>
                {g.kind === 'chart' ? <Icon.chart size={14} /> : <Icon.gebiete size={14} />}<span>{g.name}</span></button>}
          <button className="gfx-more" onClick={() => openMenu(k)} aria-label={`Aktionen für „${g.name}“`} aria-haspopup="menu" aria-expanded={menu === 'gfx-' + k}><Icon.more size={14} /></button>
          {menu === 'gfx-' + k && <div className="menu gfx-menu" role="menu">
            <button className="menu-item" role="menuitem" onClick={() => { setUI({ menu: null }); setEdit(k); }}>Umbenennen</button>
            <button className="menu-item" role="menuitem" onClick={() => { setUI({ menu: null }); duplicateGraphic(k); requestAnimationFrame(fitViewToCanvas); }}><Icon.copy /> Duplizieren</button>
            {graphics.length > 1 && <>
              <button className="menu-item" role="menuitem" disabled={k === 0} onClick={() => { setUI({ menu: null }); moveGraphic(k, k - 1); }}><span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon.chev /></span> Nach links</button>
              <button className="menu-item" role="menuitem" disabled={k === graphics.length - 1} onClick={() => { setUI({ menu: null }); moveGraphic(k, k + 1); }}><Icon.chev /> Nach rechts</button>
              <button className="menu-item danger" role="menuitem" onClick={() => { setUI({ menu: null }); removeGraphic(k); requestAnimationFrame(fitViewToCanvas); }}><Icon.trash /> Löschen</button>
            </>}
          </div>}
        </div>))}
      <div className="gfx-add-wrap">
        <button className="btn small ghost gfx-add" onClick={() => setUI({ menu: menu === 'gfx-add' ? null : 'gfx-add' })} aria-haspopup="menu" aria-expanded={menu === 'gfx-add'}><Icon.plus size={13} /> Grafik</button>
        {menu === 'gfx-add' && <div className="menu gfx-menu" role="menu">
          <h6>Neue Grafik in dieser Mappe</h6>
          <button className="menu-item" role="menuitem" onClick={() => { setUI({ menu: null }); addGraphic('map'); requestAnimationFrame(fitViewToCanvas); }}><Icon.gebiete /> Karte</button>
          <button className="menu-item" role="menuitem" onClick={() => { setUI({ menu: null }); addGraphic('chart', 'saeulen'); }}><Icon.saeulen /> Säulen: Ergebnis</button>
          <button className="menu-item" role="menuitem" onClick={() => { setUI({ menu: null }); addGraphic('chart', 'gewinne'); }}><Icon.gewinne /> Gewinne und Verluste</button>
          <button className="menu-item" role="menuitem" onClick={() => { setUI({ menu: null }); addGraphic('chart', 'balken'); }}><Icon.balken /> Balken</button>
          <button className="menu-item" role="menuitem" onClick={() => { setUI({ menu: null }); addGraphic('chart', 'linie'); }}><Icon.linie /> Linie</button>
          <p className="hint menu-hint">Alle Grafiken teilen sich Daten, Parteifarben und Logo. Texte, Farbregel, Jahr und Formate gelten je Grafik.</p>
        </div>}
      </div>
    </div>
  );
}
