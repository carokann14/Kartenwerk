// Importierte Geodaten im Schritt „Gebiete“: Liste, umbenennen, Quelle, entfernen
import React, { useState } from 'react';
import { setGeoSet } from '../../model/actions';
import { removeUserGeo, updateUserGeo, userGeoUsage } from '../../model/geodataActions';
import { setUI, useStore } from '../../model/store';
import { UG } from '../../geo/userGeo';
import { Icon, Section } from '../common';

export function ImportGeoButton() {
  return <button className="btn small" onClick={() => setUI({ geoWizard: true })}><Icon.upload /> Eigene Geodaten importieren …</button>;
}
export function UserGeoSection() {
  const doc = useStore(s => s.doc!);
  const [edit, setEdit] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!doc.geodata.length) return null;
  return (
    <Section title="Importierte Geodaten" aside={`${doc.geodata.length} im Projekt`}>
      <div className="stack-8">{doc.geodata.map(u => {
        const on = doc.geoSet === UG + u.id, use = userGeoUsage(doc, u.id);
        const more = [use.datasets.length ? `${use.datasets.length} ${use.datasets.length > 1 ? 'Datensätzen' : 'Datensatz'}` : '', use.regions.length ? `${use.regions.length} Einteilung${use.regions.length > 1 ? 'en' : ''}` : ''].filter(Boolean).join(', ');
        return (
          <div key={u.id} className={'card ug-card' + (on ? ' on' : '')}>
            <div className="ug-head">
              <b>{u.label}</b>
              <span className="hint">{u.raw.areas.length.toLocaleString('de-DE')} {u.levelLabel} · {u.fileName}</span>
            </div>
            {edit === u.id ? <div className="stack-8">
              <input type="text" value={u.label} onChange={e => updateUserGeo(u.id, { label: e.target.value })} aria-label="Name der Karte" />
              <input type="text" value={u.levelLabel} onChange={e => updateUserGeo(u.id, { levelLabel: e.target.value }, 'ugl-' + u.id)} aria-label="Bezeichnung der Gebiete" />
              <textarea rows={2} value={u.attribution} onChange={e => updateUserGeo(u.id, { attribution: e.target.value }, 'uga-' + u.id)} aria-label="Quellenvermerk" />
              <button className="btn small" onClick={() => setEdit(null)}>Fertig</button>
            </div> : <p className="hint ug-src">{u.attribution}</p>}
            <div className="row-btns">
              {!on && <button className="btn small" onClick={() => { void setGeoSet(UG + u.id, { fokus: { kind: 'de' } }); }}>Als Karte zeigen</button>}
              {edit !== u.id && <button className="btn small ghost" onClick={() => setEdit(u.id)}>Bearbeiten</button>}
              {confirm === u.id
                ? <><button className="btn small danger-solid" onClick={() => { setConfirm(null); void removeUserGeo(u.id); }}>Entfernen{more ? ` (mit ${more})` : ''}</button><button className="btn small ghost" onClick={() => setConfirm(null)}>Nein</button></>
                : <button className="btn small ghost danger" onClick={() => setConfirm(u.id)}><Icon.trash /> Entfernen</button>}
            </div>
          </div>);
      })}</div>
      <p className="hint">Die Geometrien sind im Projekt gespeichert, auch in der Projektdatei. Tabellen mit passender Kennung lassen sich im Schritt „Daten“ direkt auf diese Gebiete importieren.</p>
    </Section>
  );
}
