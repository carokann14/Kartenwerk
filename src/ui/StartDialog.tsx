import React, { useEffect, useRef, useState } from 'react';
import { EXAMPLES, berlinExample } from '../data/examples';
import { GEO_INDEX } from '../geo/geo';
import { GeoPicker } from './common';
import { ProjectMeta, listLocal } from '../model/persist';
import { openLocalProject, openProjectFile, removeLocalProject, startEmpty, startExample } from '../model/projectIO';
import { setUI, useStore } from '../model/store';
import { makeChartProject } from '../model/graphics';
import type { ChartType } from '../model/types';
import { Icon } from './common';
import { APP_VERSION } from './TopBar';

const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };

export function StartDialog() {
  const hasDoc = useStore(s => !!s.doc);
  const [list, setList] = useState<ProjectMeta[] | null>(null);
  const [geo, setGeo] = useState(GEO_INDEX[0]?.id || 'btw-wk-2025');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pick, setPick] = useState<'map' | null>(null);
  const startChart = async (type: ChartType) => { setBusy(true); await startEmpty(GEO_INDEX[0]?.id || 'btw-wk-2025'); makeChartProject(type); setBusy(false); };
  const startWithData = async (how: 'file' | 'table') => {
    setBusy(true); await startEmpty(GEO_INDEX[0]?.id || 'btw-wk-2025'); setBusy(false);
    setUI({ afterImport: 'suggest', step: 'daten', ...(how === 'file' ? { wizard: { mode: 'new' } } : { tableEdit: 'new' }) });
  };
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
            <h3 className="wiz-h">Was möchtest du bauen?</h3>
            <div className="build-grid">
              <button className={'build' + (pick === 'map' ? ' on' : '')} disabled={busy} onClick={() => setPick(pick === 'map' ? null : 'map')} aria-expanded={pick === 'map'}><Icon.gebiete size={22} /><b>Karte</b><span className="hint">Gebiete einfärben, beschriften, markieren</span></button>
              <button className="build" disabled={busy} onClick={() => startChart('saeulen')}><Icon.saeulen size={22} /><b>Säulen</b><span className="hint">Wahlergebnis mit Vergleich</span></button>
              <button className="build" disabled={busy} onClick={() => startChart('gewinne')}><Icon.gewinne size={22} /><b>Gewinne/Verluste</b><span className="hint">Veränderung in Punkten</span></button>
              <button className="build" disabled={busy} onClick={() => startChart('balken')}><Icon.balken size={22} /><b>Balken</b><span className="hint">Rangliste, Top 10, eigene Werte</span></button>
              <button className="build" disabled title="kommt mit M8"><Icon.linie size={22} /><b>Linie</b><span className="hint">bald</span></button>
              <button className="build" disabled title="kommt mit M9"><Icon.sitze size={22} /><b>Sitzverteilung</b><span className="hint">bald</span></button>
            </div>
            {pick === 'map' && <div className="start-card">
              <Icon.gebiete size={22} />
              <span className="stack-8"><b>Neue Karte</b>
                <GeoPicker value={geo} onChange={setGeo} label="Gebietsstand für das neue Projekt" />
                <span className="row-btns"><button className="btn primary small" disabled={busy} onClick={async () => { setBusy(true); await startEmpty(geo); setBusy(false); }}>Anlegen und Daten importieren</button></span>
              </span>
            </div>}
            <div className="start-card primary">
              <Icon.spark size={22} />
              <span className="stack-8"><b>Mit Daten starten</b><span className="hint">Excel- oder CSV-Datei laden (Wahlergebnis, Regionaldatenbank, eigene Tabelle). Kartenwerk schlägt passende Karten und Diagramme vor.</span>
                <span className="row-btns"><button className="btn primary small" disabled={busy} onClick={() => startWithData('file')}><Icon.upload size={13} /> Datei importieren …</button>
                  <button className="btn small" disabled={busy} onClick={() => startWithData('table')}><Icon.daten size={13} /> Tabelle eintippen …</button></span>
              </span>
            </div>
            <h3 className="wiz-h">Beispiele</h3>
            <button className="start-card" disabled={busy} onClick={async () => { setBusy(true); await startExample(0); setBusy(false); }}>
              <Icon.faerbung size={22} /><span><b>{busy ? 'Wird geladen …' : 'Stärkste Partei je Wahlkreis'}</b><span className="hint">{EXAMPLES[0].label}, Zweitstimmen. Fertig eingefärbt, zum Ausprobieren und als Vorlage.</span></span>
            </button>
            <div className="row-btns start-more"><span className="hint">Weitere:</span>
              <button className="btn small" disabled={busy} onClick={async () => { setBusy(true); await startExample(1); setBusy(false); }}>nach Kreisen</button>
              <button className="btn small" disabled={busy} onClick={async () => { setBusy(true); await startExample(2); setBusy(false); }}>nach Gemeinden</button>
              <button className="btn small" disabled={busy} onClick={async () => { setBusy(true); await startExample(berlinExample()); setBusy(false); }}>Berlin 2026</button>
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
