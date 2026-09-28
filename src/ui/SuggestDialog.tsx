// Vorschläge aus Daten (M7): passende Karten und Diagramme zu einem Datensatz ankreuzen und anlegen.
import React, { useMemo, useState } from 'react';
import { getDoc, setUI, toast, useStore } from '../model/store';
import { loadGeoSets } from '../model/actions';
import { createGraphic, switchGraphic } from '../model/graphics';
import { Suggestion, suggestFor } from '../model/suggest';
import { fitViewToCanvas } from './Canvas';
import { Icon } from './common';

export async function applySuggestions(list: Suggestion[], dsId: string, replaceFirst: boolean) {
  if (!list.length) return;
  await loadGeoSets(list.map(s => s.geoSet));
  const d0 = getDoc(), first = replaceFirst ? d0.page : d0.graphics.length;
  list.forEach((s, i) => createGraphic({ kind: s.kind, type: s.type, dsId, geoSet: s.geoSet, color: s.color, source: s.source, title: s.title, subtitle: s.subtitle, name: s.name }, replaceFirst && i === 0));
  if (list.length > 1) await switchGraphic(first);
  requestAnimationFrame(fitViewToCanvas);
  toast(list.length === 1 ? `„${list[0].name}“ angelegt` : `${list.length} Grafiken angelegt · Leiste oben wechselt zwischen ihnen`);
}

export function SuggestDialog() {
  const dsId = useStore(s => s.ui.suggest)!;
  const fresh = useStore(s => s.ui.suggestFresh);
  const doc = useStore(s => s.doc)!;
  const ds = doc.datasets.find(d => d.id === dsId);
  const list = useMemo(() => (ds ? suggestFor(doc, dsId) : []), [dsId, doc.datasets]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [on, setOn] = useState<Set<string>>(() => new Set(list.slice(0, fresh ? 2 : 1).map(s => s.id)));
  const [busy, setBusy] = useState(false);
  const close = () => setUI({ suggest: null, suggestFresh: false });
  const chosen = list.filter(s => on.has(s.id));
  const go = async () => { setBusy(true); try { await applySuggestions(chosen, dsId, fresh); } finally { setBusy(false); close(); } };
  const flip = (id: string) => setOn(o => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="sug-title" onKeyDown={e => { if (e.key === 'Escape') close(); }}>
      <div className="modal suggest">
        <header className="modal-head"><h2 id="sug-title"><Icon.spark /> Passende Grafiken</h2><span className="spacer" /><button className="btn icon ghost" onClick={close} aria-label="Schließen"><Icon.x /></button></header>
        <div className="modal-body stack-12">
          <p className="hint">Zu <b>{ds?.name || 'diesem Datensatz'}</b> passen diese Karten und Diagramme. Angekreuzte werden als Grafiken in der Mappe angelegt{fresh ? ' (die erste ersetzt die leere Grafik)' : ''} und lassen sich danach frei ändern.</p>
          {!list.length ? <p className="hint">Für diesen Datensatz gibt es noch keine Vorschläge.</p> :
            <div className="sug-list" role="group" aria-label="Vorschläge">{list.map(s => { const I = Icon[s.icon]; return (
              <label key={s.id} className={'sug' + (on.has(s.id) ? ' on' : '')}>
                <input type="checkbox" checked={on.has(s.id)} onChange={() => flip(s.id)} />
                <I size={22} />
                <span><b>{s.label}</b><span className="hint">{s.hint}</span><span className="sug-title">„{s.title}“</span></span>
              </label>); })}</div>}
        </div>
        <footer className="modal-foot"><button className="btn" onClick={close}>{fresh && ds?.geoSet ? 'Nur die Karte behalten' : 'Nicht jetzt'}</button><span className="spacer" />
          <button className="btn primary" disabled={!chosen.length || busy} onClick={go}>{busy ? 'Wird angelegt …' : chosen.length === 1 ? 'Grafik anlegen' : `${chosen.length || ''} Grafiken anlegen`}</button></footer>
      </div>
    </div>
  );
}
