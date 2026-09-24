import React, { useEffect, useRef, useState } from 'react';
import { EXAMPLES } from '../data/examples';
import { GEO_INDEX } from '../geo/geo';
import { ProjectMeta, listLocal } from '../model/persist';
import { openLocalProject, openProjectFile, removeLocalProject, startEmpty, startExample } from '../model/projectIO';
import { setUI, useStore } from '../model/store';
import { Icon } from './common';
import { APP_VERSION } from './TopBar';

const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };

export function StartDialog() {
  const hasDoc = useStore(s => !!s.doc);
  const [list, setList] = useState<ProjectMeta[] | null>(null);
  const [geo, setGeo] = useState(GEO_INDEX[0]?.id || 'btw-wk-2025');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => listLocal().then(setList);
  useEffect(() => { refresh(); }, []);
  const close = hasDoc ? () => setUI({ start: false }) : undefined;
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="start-title" onKeyDown={e => { if (e.key === 'Escape' && close) close(); }}>
      <div className="modal start">
        <header className="modal-head">
          <h2 id="start-title">Kartenwerk <span className="proto-badge">{APP_VERSION}</span></h2>
          <span className="spacer" />
          {close && <button className="btn icon ghost" onClick={close} aria-label="Schließen"><Icon.x /></button>}
        </header>
        <div className="modal-body start-grid">
          <div className="stack-12">
            <h3 className="wiz-h">Neu beginnen</h3>
            <button className="start-card primary" disabled={busy} onClick={async () => { setBusy(true); await startExample(0); setBusy(false); }}>
              <Icon.faerbung size={22} /><span><b>{busy ? 'Wird geladen …' : 'Beispiel: Stärkste Partei je Wahlkreis'}</b><span className="hint">{EXAMPLES[0].label}. Fertig eingefärbt, zum Ausprobieren und als Vorlage.</span></span>
            </button>
            <div className="start-card">
              <Icon.gebiete size={22} />
              <span className="stack-8"><b>Leeres Projekt</b>
                <select value={geo} onChange={e => setGeo(e.target.value)} aria-label="Gebietsstand für das neue Projekt">{GEO_INDEX.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
                <span className="row-btns"><button className="btn primary small" onClick={() => startEmpty(geo)}>Anlegen und Daten importieren</button></span>
              </span>
            </div>
            <button className="start-card" onClick={() => fileRef.current?.click()}>
              <Icon.upload size={22} /><span><b>Projektdatei öffnen …</b><span className="hint">Eine gespeicherte .kartenwerk.json von deinem Rechner.</span></span>
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) openProjectFile(f); }} />
          </div>
          <div className="stack-12">
            <h3 className="wiz-h">Projekte in diesem Browser {list && list.length > 0 && <span className="hint">{list.length}</span>}</h3>
            {list === null ? <p className="hint">Wird geladen …</p> : !list.length ? <p className="hint">Noch keine. Jedes Projekt wird beim Arbeiten automatisch hier gesichert, nur in diesem Browser auf diesem Rechner.</p> :
              <div className="proj-list">{list.map((p, k) => (
                <div key={p.id} className={'proj-row' + (k === 0 ? ' last' : '')}>
                  <button className="proj-open" onClick={() => openLocalProject(p.id)}>
                    <Icon.file /><span><b>{p.name}</b><span className="hint">{fmtDate(p.modified)} · {p.datasets} {p.datasets === 1 ? 'Datensatz' : 'Datensätze'} · {p.variants.join(', ')}</span></span>
                    {k === 0 && <span className="chip accent">zuletzt</span>}
                  </button>
                  {confirm === p.id
                    ? <span className="row-btns nowrap"><button className="btn small danger-solid" onClick={async () => { await removeLocalProject(p.id); setConfirm(null); refresh(); }}>Löschen</button><button className="btn small ghost" onClick={() => setConfirm(null)}>Nein</button></span>
                    : <button className="btn icon ghost small" onClick={() => setConfirm(p.id)} aria-label={'Projekt ' + p.name + ' löschen'} title="Aus dem Browser löschen"><Icon.trash /></button>}
                </div>))}</div>}
            <p className="hint">Deine Daten verlassen den Rechner nicht. Browserdaten können beim Aufräumen verloren gehen: Wichtige Projekte zusätzlich als Projektdatei speichern.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
