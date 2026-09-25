import React from 'react';
import { LABEL_PRESETS } from '../../model/defaults';
import { refitAfterInset } from '../../model/actions';
import { setUI, update, useStore } from '../../model/store';
import { INSET_DEFS, geoOf } from '../../render/scene';
import { Check, Field, Icon, Note, Section } from '../common';
import { HatchList } from '../annotationsUI';
import { ElementsSection } from '../elementsUI';
import { LogoRow } from '../LogoUI';

type ElId = 'title' | 'subtitle' | 'source' | 'legend';

export function PanelElemente() {
  const doc = useStore(s => s.doc!);
  const t = doc.texts, g = geoOf(doc);
  const row = (id: ElId, label: string, on: boolean, toggle: (v: boolean) => void, extra?: React.ReactNode) => (
    <div className="lrow flat" key={id}>
      <input type="checkbox" checked={on} onChange={e => toggle(e.target.checked)} aria-label={label + ' anzeigen'} />
      <span className="ln">{label}{extra}</span>
      <button className="btn ghost small" onClick={() => setUI({ sel: { kind: 'el', id } })}>bearbeiten</button>
    </div>
  );
  return (
    <>
      <Section title="Rahmenelemente">
        {row('title', 'Titel', t.title.visible, v => update(d => { d.texts.title.visible = v; }))}
        {row('subtitle', 'Unterzeile', t.subtitle.visible, v => update(d => { d.texts.subtitle.visible = v; }))}
        {row('source', 'Quellenzeile', t.source.visible, v => update(d => { d.texts.source.visible = v; }), <small className="dim"> Pflicht</small>)}
        {row('legend', 'Legende', doc.legend.visible, v => update(d => { d.legend.visible = v; }))}
        <LogoRow doc={doc} />
        {!t.source.visible && <Note kind="warn">Ohne Quellenzeile fehlt der lizenzrechtlich nötige Quellenvermerk. Kopiere ihn dann im Schritt „Export“ in die Bildunterschrift.</Note>}
      </Section>
      <Section title="Detail-Lupe (Inset)">
        <Check checked={doc.inset.visible} onChange={v => { update(d => { d.inset.visible = v; d.inset.autoHidden = false; }); refitAfterInset(); }}>Inset anzeigen</Check>
        <Field label="Gebiet"><select value={doc.inset.preset} onChange={e => { const v = e.target.value; update(d => { d.inset.preset = v; }); refitAfterInset(); }} aria-label="Gebiet der Detail-Lupe">
          {Object.entries(INSET_DEFS).map(([k, x]) => { const n = x.pick(g).length; return <option key={k} value={k} disabled={!n}>{x.label} ({n} Gebiete)</option>; })}
        </select></Field>
        <p className="hint">Das Inset übernimmt Farben und Beschriftungen der Hauptkarte. Der Rahmen auf der Hauptkarte zeigt, wo es liegt. Bei einem Fokus unterhalb von Deutschland wird es automatisch ausgeblendet.</p>
      </Section>
      <Section title="Beschriftungen">
        <Check checked={doc.layers.wkLabels} onChange={v => update(d => { d.layers.wkLabels = v; })}>Gebiete beschriften</Check>
        <Field label="Inhalt"><select value={doc.labels.preset} onChange={e => { const k = e.target.value; update(d => { d.labels.preset = k; const tpl = LABEL_PRESETS[k].template; if (tpl != null) d.labels.template = tpl; d.layers.wkLabels = true; }); }} aria-label="Inhalt der Beschriftung">
          {Object.entries(LABEL_PRESETS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
        </select></Field>
        <p className="hint">Überlappende Beschriftungen werden ausgeblendet, kleinere Flächen zuerst. Ziehen verschiebt eine Beschriftung, ab etwas Abstand erscheint eine Führungslinie. Vorlage und Größe unter „Ebenen › Gebiete“.</p>
        <button className="btn small" onClick={() => setUI({ sel: { kind: 'layer', id: 'labels' } })}><Icon.layer /> Beschriftung einstellen</button>
      </Section>
      <Section title="Schraffuren" aside={doc.hatches.length ? `${doc.hatches.length} im Projekt` : undefined}>
        <HatchList doc={doc} />
        <p className="hint">Eine Schraffur liegt über der Datenfarbe oder auf eigener Fläche. Zuweisen: aus Daten (in der Schraffur), für „keine Daten“ oder von Hand (Gebiete auswählen).</p>
      </Section>
      <ElementsSection doc={doc} />

    </>
  );
}
