import React from 'react';
import { STEP_T, mixWhite, shortRangeLabels } from '../../lib/color';
import { PARTY_DEFS, SHARE_KEYS } from '../../data/parties';
import { setUI, update, useStore } from '../../model/store';
import type { ColorRule } from '../../model/types';
import { colorModel, fillOf, partyColor } from '../../render/colorModel';
import { geoOf } from '../../render/scene';
import { Field, Icon, Note, Section, Seg } from '../common';

const HUES = ['#2F5D8A', '#1F7A6D', '#8A5A2F', '#6B4C9A', '#A33B4F', '#3C3F45'];

export function PanelFaerbung() {
  const doc = useStore(s => s.doc!);
  const cm = colorModel(doc);
  const rule = doc.color;
  const ds = cm.dataset || doc.datasets[0] || null;
  const set = (r: ColorRule) => update(d => { d.color = r; });
  if (!doc.datasets.length) return <Section title="Färbung"><Note>Importiere zuerst Daten im Schritt „Daten“. Danach wählst du hier, wie die Gebiete eingefärbt werden.</Note></Section>;
  const groups = ds?.groups || [];
  const partyGroups = groups.filter(g => g.parties);
  const numCols = ds?.columns.filter(c => c.kind === 'number' && c.role === 'value') || [];
  const catCols = ds?.columns.filter(c => c.role === 'category' || c.role === 'label') || [];
  const grpId = 'group' in rule ? rule.group : (partyGroups[0] || groups[0])?.id;
  const S = partyColor(doc, 'SPD'), U = partyColor(doc, 'Union'), A = partyColor(doc, 'AfD');
  const modes: { id: ColorRule['mode']; t: string; d: string; sw: string[]; ok: boolean; mk: () => ColorRule }[] = [
    { id: 'siegerStaerke', t: 'Sieger + Stärke', d: 'Farbe = stärkste Partei, Tiefe = Anteil oder Vorsprung', sw: [mixWhite(S, .4), mixWhite(S, .7), S, mixWhite(U, .4), mixWhite(U, .7), U], ok: groups.length > 0, mk: () => ({ mode: 'siegerStaerke', dataset: ds!.id, group: grpId!, basis: 'anteil', steps: 4 }) },
    { id: 'sieger', t: 'Stärkste Partei', d: 'Eine Farbe je Partei', sw: [S, U, A, partyColor(doc, 'GRÜNE'), S, U], ok: groups.length > 0, mk: () => ({ mode: 'sieger', dataset: ds!.id, group: grpId! }) },
    { id: 'anteil', t: 'Parteianteil', d: 'Stufen einer Partei, runde Grenzen', sw: [...STEP_T[5], 1].map(t => mixWhite(A, t)), ok: partyGroups.length > 0, mk: () => ({ mode: 'anteil', dataset: ds!.id, group: (partyGroups[0] || groups[0]).id, party: 'AfD' }) },
    { id: 'wert', t: 'Zahlenwert', d: 'Beliebige Zahlenspalte in Klassen', sw: [...STEP_T[5], 1].map(t => mixWhite(HUES[0], t)), ok: numCols.length > 0, mk: () => ({ mode: 'wert', dataset: ds!.id, column: numCols[0].id, method: 'rund', classes: 5, hue: HUES[0] }) },
    { id: 'kategorie', t: 'Kategorie', d: 'Textspalte, eine Farbe je Wert', sw: ['#3A6EA5', '#D08C2F', '#5E9C6B', '#A34E6E', '#6C5FA8', '#2F8F95'], ok: catCols.length > 0, mk: () => ({ mode: 'kategorie', dataset: ds!.id, column: catCols[0].id }) },
  ];
  const nColors = new Set(geoOf(doc).all.map(i => fillOf(doc, cm, i))).size;
  return (
    <>
      <Section title="Datensatz">
        <select value={ds?.id} onChange={e => { const d2 = doc.datasets.find(x => x.id === e.target.value)!; const g0 = d2.groups.find(g => g.parties) || d2.groups[0]; set(g0 ? { mode: 'siegerStaerke', dataset: d2.id, group: g0.id, basis: 'anteil', steps: 4 } : { mode: 'none' }); }} aria-label="Datensatz für die Färbung">
          {doc.datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Section>
      <Section title="Darstellung">
        <div className="modes">{modes.map(m => (
          <button key={m.id} className={'mode' + (rule.mode === m.id ? ' on' : '') + (m.ok ? '' : ' soon')} disabled={!m.ok} onClick={() => m.ok && set(m.mk())}>
            <span className="swatches">{m.sw.map((c, k) => <i key={k} style={{ background: c }} />)}</span><span><b>{m.t}</b><span>{m.d}</span></span>
          </button>))}
          <div className="mode soon" title="Braucht eine zweite Wahl oder Vorperiode – folgt in M3"><span className="swatches">{['#3B6FB6', '#9DB7DD', '#EEE', '#EEE', '#E6A08F', '#C4452D'].map((c, k) => <i key={k} style={{ background: c }} />)}</span><span><b>Veränderung</b><span>Zweiseitige Skala um 0 · folgt in M3</span></span></div>
        </div>
      </Section>
      {(rule.mode === 'siegerStaerke' || rule.mode === 'sieger' || rule.mode === 'anteil') && <Section title="Optionen">
        <Field label="Stimmen"><select value={rule.group} onChange={e => set({ ...rule, group: e.target.value })}>{groups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select></Field>
        {rule.mode === 'siegerStaerke' && <>
          <Field label="Stärke nach"><Seg items={[['anteil', 'Anteil'], ['vorsprung', 'Vorsprung']]} value={rule.basis} onChange={v => set({ ...rule, basis: v })} /></Field>
          <Field label="Stufen"><Seg items={[['3', '3'], ['4', '4']]} value={String(rule.steps) as '3' | '4'} onChange={v => set({ ...rule, steps: +v as 3 | 4 })} /></Field>
          <Field label="Grenzen"><div className="meta-row">{shortRangeLabels(cm.breaks, rule.basis === 'anteil' ? ' %' : '').map(x => <span key={x} className="chip num">{x}</span>)}</div></Field>
          <p className="hint">Runde Grenzen aus den Quartilen aller Gebiete. So bleiben die Farben beim Wechsel in ein Land vergleichbar.</p>
        </>}
        {rule.mode === 'anteil' && <>
          <Field label="Partei"><select value={rule.party} onChange={e => set({ ...rule, party: e.target.value })}>{SHARE_KEYS.map(p => <option key={p} value={p}>{PARTY_DEFS.find(x => x.key === p)?.label}</option>)}</select></Field>
          <Field label="Grenzen"><div className="meta-row">{shortRangeLabels(cm.breaks, ' %').map(x => <span key={x} className="chip num">{x}</span>)}</div></Field>
          {cm.missing > 0 && <Note>{cm.missing} Gebiete ohne Wert (etwa nicht angetreten). Sie erscheinen als „keine Daten“, nicht als 0.</Note>}
        </>}
      </Section>}
      {rule.mode === 'wert' && <Section title="Optionen">
        <Field label="Spalte"><select value={rule.column} onChange={e => set({ ...rule, column: e.target.value })}>{numCols.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
        <Field label="Klassen"><Seg items={[['rund', 'Rund'], ['quantil', 'Quantile'], ['gleich', 'Gleich']]} value={rule.method} onChange={v => set({ ...rule, method: v })} /></Field>
        <Field label="Anzahl"><Seg items={[['3', '3'], ['4', '4'], ['5', '5']]} value={String(rule.classes) as '5'} onChange={v => set({ ...rule, classes: +v })} /></Field>
        <Field label="Farbe"><div className="swatch-grid">{HUES.map(h => <button key={h} className={'swatch-btn' + (rule.hue === h ? ' on' : '')} style={{ background: h }} onClick={() => set({ ...rule, hue: h })} aria-label={'Farbton ' + h} />)}</div></Field>
        <Field label="Grenzen"><div className="meta-row">{shortRangeLabels(cm.breaks).map(x => <span key={x} className="chip num">{x}</span>)}</div></Field>
        <p className="hint">{rule.method === 'rund' ? 'Runde Zahlen nahe den Quantilen, gut lesbar in der Legende.' : rule.method === 'quantil' ? 'Gleich viele Gebiete je Klasse, Grenzen ungerundet.' : 'Gleich breite Klassen zwischen kleinstem und größtem Wert.'}</p>
        {cm.missing > 0 && <Note>{cm.missing} Gebiete im Fokus ohne Wert. Sie erscheinen als „keine Daten“, nicht als 0.</Note>}
      </Section>}
      {rule.mode === 'kategorie' && <Section title="Optionen">
        <Field label="Spalte"><select value={rule.column} onChange={e => set({ ...rule, column: e.target.value })}>{catCols.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
        <button className="btn small" onClick={() => setUI({ sel: { kind: 'el', id: 'legend' } })}><Icon.legend /> Legende bearbeiten</button>
        <p className="hint">Werte, die wie Parteinamen aussehen, bekommen die Parteifarbe. Andere Kategorien bekommen der Häufigkeit nach eine Farbe, ab der neunten grau. Farben und Texte einzelner Kategorien änderst du in der Legende.</p>
      </Section>}
      <Section title="Parteifarben" aside="gilt im Projekt">
        <div className="ptable">{PARTY_DEFS.map(p => (
          <div key={p.key} className="prow">
            <input type="color" value={partyColor(doc, p.key)} onChange={e => { const v = e.target.value.toUpperCase(); update(d => { d.partyColors[p.key] = v; }, { key: 'pc-' + p.key }); }} aria-label={'Farbe ' + p.label} />
            <span><span className="pname">{p.label}</span><span className="pvar">{[...new Set(p.variants.map(v => v[0]))].slice(0, 4).join(' · ')}</span></span>
            <span className="count">{cm.counts[p.key] ? cm.counts[p.key] + ' Geb.' : '–'}</span>
          </div>))}</div>
        <Note>Die Karte nutzt gerade <b>{nColors}</b> exakte Farben. Im Canva-Export wird jede davon ein Farbfeld, mit dem du eine ganze Klasse umfärbst.</Note>
      </Section>
    </>
  );
}
export { Icon };
