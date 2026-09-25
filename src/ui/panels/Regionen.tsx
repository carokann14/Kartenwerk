// Eigene Gebiete im Gebiete-Panel: Einteilung anlegen, Regionen aus Auswahl bilden, als Karte zeigen
import React, { useState } from 'react';
import { GEO, countLabel } from '../../geo/geo';
import { EG } from '../../geo/regions';
import { addRegion, assignMembers, baseLabel, currentDivision, divisionsFor, editDivision, newDivision, removeDivision, removeRegion, renameRegion, showDivision, toMembers, unassignMembers, updateDivision } from '../../model/regionActions';
import { setFokus } from '../../model/actions';
import { setUI, useStore } from '../../model/store';
import type { Doc, RegionSet } from '../../model/types';
import type { UI } from '../../model/store';
import { colorModel, fillOf } from '../../render/colorModel';
import { fokusIdx, geoOf } from '../../render/scene';
import { Check, Field, Icon, Section } from '../common';

/** Gebiete, aus denen eine Region entstehen kann: Auswahl in der Karte, sonst der Fokus */
export function pickOf(doc: Doc, ui: UI): { ids: string[]; src: 'Auswahl' | 'Fokus' } | null {
  if (ui.sel.kind === 'area' && ui.sel.ids.length) return { ids: ui.sel.ids, src: 'Auswahl' };
  if (doc.fokus.kind !== 'de') { const g = geoOf(doc); return { ids: fokusIdx(doc).map(i => g.areas[i].id), src: 'Fokus' }; }
  return null;
}
const baseLevel = (rs: RegionSet) => GEO[rs.base]?.meta.level || '';

export function RegionsSection() {
  const doc = useStore(s => s.doc!);
  const ui = useStore(s => s.ui);
  const [name, setName] = useState('');
  const cur = currentDivision(doc);
  if (cur) return <CustomView doc={doc} rs={cur} />;
  const g = geoOf(doc), lv = g.meta.level;
  const divs = divisionsFor(doc, doc.geoSet);
  const others = doc.regions.filter(r => r.base !== doc.geoSet && GEO[EG + r.id]);
  const rs = divs.find(r => r.id === ui.regionEdit) || divs[0];
  const pick = pickOf(doc, ui);
  const members = rs && pick ? toMembers(rs, doc.geoSet, pick.ids) : [];
  const assigned = new Map<string, string>(); if (rs) for (const r of rs.regions) for (const m of r.members) assigned.set(m, r.id);
  const nFree = rs ? g.areas.length - assigned.size : 0;
  const nextNr = rs ? rs.regions.reduce((m, r) => Math.max(m, +r.id || 0), 0) + 1 : 1;
  const create = () => { if (!rs || !members.length) return; addRegion(rs.id, name, members); setName(''); setUI({ sel: { kind: 'graphic' } }); };
  const plural = countLabel(2, lv).replace(/^2 /, '');
  return (
    <Section title="Eigene Gebiete" aside={rs ? 'aus ' + baseLabel(rs) : 'Regionen bilden'}>
      {!rs && <>
        <p className="hint">{plural} zu eigenen Regionen zusammenfassen, etwa Landtagswahlkreise aus Gemeinden oder „Ruhrgebiet“ aus Kreisen. Zahlen der {plural} werden je Region addiert.</p>
        <button className="btn" onClick={() => newDivision(doc.geoSet)}><Icon.plus /> Neue Einteilung aus {plural}</button>
      </>}
      {rs && <>
        {divs.length > 1 && <select value={rs.id} onChange={e => setUI({ regionEdit: e.target.value })} aria-label="Einteilung">{divs.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}
        <Field label="Einteilung"><input type="text" value={rs.name} onChange={e => updateDivision(rs.id, { name: e.target.value }, 'dn-' + rs.id)} aria-label="Name der Einteilung" /></Field>
        <div className="region-new">
          <input type="text" value={name} placeholder={`Region ${nextNr}`} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create(); }} aria-label="Name der neuen Region" />
          <button className="btn small primary" disabled={!members.length} onClick={create}><Icon.plus /> Region aus {pick?.src || 'Auswahl'}</button>
        </div>
        <p className="hint">{pick ? <>{pick.src}: <b>{countLabel(members.length, baseLevel(rs))}</b>{members.some(m => assigned.has(m)) ? ', teils schon in einer Region (wird verschoben)' : ''}</> : <>{plural} in der Karte anklicken (<span className="kbd">Umschalt</span> + Klick für mehrere) oder im Gebietsbaum ankreuzen.</>}</p>
        {rs.regions.length > 0 && <div className="region-list" role="list">
          {rs.regions.map(r => (
            <div key={r.id} className="region-row" role="listitem">
              <span className="num" title="Nummer = Schlüssel beim Import">{r.id}</span>
              <input type="text" value={r.name} onChange={e => renameRegion(rs.id, r.id, e.target.value)} aria-label={'Name der Region ' + r.id} />
              <button className="chip-btn" title="Bausteine in der Karte markieren" onClick={() => setUI({ sel: r.members.length ? { kind: 'area', ids: r.members.filter(m => g.byId.has(m)) } : { kind: 'graphic' } })}>{r.members.length}</button>
              <button className="btn icon small ghost" disabled={!members.length} title={pick ? `${pick.src} hinzufügen` : 'Erst Gebiete auswählen'} aria-label={'Auswahl zu ' + r.name + ' hinzufügen'} onClick={() => assignMembers(rs.id, r.id, members)}><Icon.plus /></button>
              <button className="btn icon small ghost danger" title="Region löschen" aria-label={'Region ' + r.name + ' löschen'} onClick={() => removeRegion(rs.id, r.id)}><Icon.trash /></button>
            </div>))}
        </div>}
        {members.some(m => assigned.has(m)) && <button className="btn small ghost" onClick={() => unassignMembers(rs.id, members)}><Icon.minus /> {pick!.src} aus den Regionen nehmen</button>}
        <Check checked={rs.rest} onChange={v => updateDivision(rs.id, { rest: v })}>Übrige {plural} als eigene Region{nFree > 0 && rs.regions.length ? ` (${nFree.toLocaleString('de-DE')})` : ''}</Check>
        {rs.rest && <Field label="Name"><input type="text" value={rs.restName} onChange={e => updateDivision(rs.id, { restName: e.target.value }, 'rn-' + rs.id)} aria-label="Name der übrigen Region" /></Field>}
        <div className="row-btns">
          <button className="btn primary" disabled={!rs.regions.some(r => r.members.length)} onClick={() => { void showDivision(rs.id); }}><Icon.gebiete /> Als Karte zeigen</button>
          <button className="btn ghost" onClick={() => newDivision(doc.geoSet)} title="Weitere Einteilung auf dieser Ebene"><Icon.plus /></button>
          <button className="btn ghost danger" onClick={() => { void removeDivision(rs.id); }} aria-label="Einteilung löschen" title="Einteilung löschen"><Icon.trash /></button>
        </div>
        <p className="hint">Als Karte werden Zahlen der {plural} je Region addiert. Anteile und Quoten lassen sich nicht addieren und bleiben leer.</p>
      </>}
      {others.length > 0 && <p className="hint">Weitere Einteilungen: {others.map((o, k) => <React.Fragment key={o.id}>{k > 0 && ', '}<button className="linkish" onClick={() => { void showDivision(o.id); }}>{o.name}</button> <small>({baseLabel(o)})</small></React.Fragment>)}</p>}
    </Section>
  );
}

function CustomView({ doc, rs }: { doc: Doc; rs: RegionSet }) {
  const g = geoOf(doc), cm = colorModel(doc), lv = baseLevel(rs);
  const list = g.all.filter(i => !g.areas[i].free);
  const ds = cm.dataset?.derived ? cm.dataset : null;
  return (
    <Section title="Eigene Gebiete" aside={'aus ' + baseLabel(rs)}>
      <Field label="Einteilung"><input type="text" value={rs.name} onChange={e => updateDivision(rs.id, { name: e.target.value }, 'dn-' + rs.id)} aria-label="Name der Einteilung" /></Field>
      <div className="region-list" role="list">
        {list.map(i => { const a = g.areas[i], r = rs.regions.find(x => x.id === a.id); return (
          <div key={a.id} className={'region-row' + (doc.fokus.kind === 'area' && doc.fokus.id === a.id ? ' cur' : '')} role="listitem">
            <span className="sw" style={{ background: fillOf(doc, cm, i) }} />
            {r ? <input type="text" value={r.name} onChange={e => renameRegion(rs.id, r.id, e.target.value)} aria-label={'Name der Region ' + r.id} />
              : <input type="text" value={rs.restName} onChange={e => updateDivision(rs.id, { restName: e.target.value }, 'rn-' + rs.id)} aria-label="Name der übrigen Region" />}
            <span className="ta" title={countLabel(g.memberN?.[i] || 0, lv)}>{g.memberN?.[i] || 0}</span>
            <button className="btn icon small ghost" title="Als Fokus" aria-label={a.name + ' als Fokus'} onClick={() => setFokus({ kind: 'area', id: a.id })}><Icon.target /></button>
          </div>); })}
      </div>
      <Check checked={rs.rest} onChange={v => updateDivision(rs.id, { rest: v })}>Übrige {countLabel(2, lv).replace(/^2 /, '')} als eigene Region</Check>
      {ds && <p className="hint">Färbung: <b>{ds.name}</b>, Zahlen aus {countLabel(ds.derived!.sources, GEO[ds.derived!.from]?.meta.level || '')} je Region addiert{ds.derived!.rates.length ? <>; nicht addierbar und leer: {ds.derived!.rates.slice(0, 3).join(', ')}{ds.derived!.rates.length > 3 ? ' …' : ''}</> : null}.</p>}
      <div className="row-btns">
        <button className="btn" onClick={() => { void editDivision(rs.id); }}><Icon.gebiete /> Bausteine bearbeiten</button>
        <button className="btn ghost danger" onClick={() => { void removeDivision(rs.id); }} aria-label="Einteilung löschen" title="Einteilung löschen"><Icon.trash /></button>
      </div>
    </Section>
  );
}

/** Rechte Leiste: ausgewählte Gebiete einer Region zuordnen (auf der Ebene der Bausteine) */
export function RegionAssign({ doc, ids }: { doc: Doc; ids: string[] }) {
  const edit = useStore(s => s.ui.regionEdit);
  const divs = divisionsFor(doc, doc.geoSet); if (!divs.length) return null;
  const rs = divs.find(r => r.id === edit) || divs[0];
  const S = new Set(ids);
  const cur = rs.regions.filter(r => r.members.some(m => S.has(m))).map(r => r.id);
  const value = cur.length === 1 ? cur[0] : cur.length > 1 ? '*' : '';
  return (
    <Section title="Region" aside={rs.name}>
      <select value={value} aria-label="Region zuordnen" onChange={e => { const v = e.target.value; if (v === '') unassignMembers(rs.id, ids); else if (v === '+') addRegion(rs.id, '', ids); else if (v !== '*') assignMembers(rs.id, v, ids); }}>
        <option value="">– keine –</option>
        {cur.length > 1 && <option value="*" disabled>mehrere Regionen</option>}
        {rs.regions.map(r => <option key={r.id} value={r.id}>{r.id} · {r.name}</option>)}
        <option value="+">+ neue Region aus {ids.length > 1 ? 'Auswahl' : 'diesem Gebiet'}</option>
      </select>
    </Section>
  );
}
