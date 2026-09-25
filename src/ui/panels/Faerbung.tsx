import { datasetFor, dsLabel, usableDatasets } from '../../data/aggregate';
import { GEO, countLabel } from '../../geo/geo';
import React from 'react';
import { STEP_T, divergingColors, mixWhite, shortRangeLabels, signed } from '../../lib/color';
import { PARTY_DEFS, SHARE_KEYS } from '../../data/parties';
import { setUI, update, useStore } from '../../model/store';
import { showDataset } from '../../model/actions';
import type { ColorRule, VeraenderungRule } from '../../model/types';
import { CHANGE_NEG, CHANGE_POS_WERT, colorModel, fillOf, partyColor } from '../../render/colorModel';
import { geoOf } from '../../render/scene';
import { Check, Field, Icon, Note, NumInput, Section, Seg } from '../common';
import { BubbleSection } from './Blasen';

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
  // Vergleichswerte für „Veränderung“: alle Datensätze dieses Gebietsstands
  const same = usableDatasets(doc);   // eigener Gebietsstand oder auf die Karte summierbar
  const shareRefs = same.flatMap(d => d.groups.filter(g => g.parties).map(g => ({ v: d.id + '|' + g.id, l: (same.length > 1 ? dsLabel(doc, d) + ' · ' : '') + g.label, ds: d.id, grp: g.id })));
  const numRefs = same.flatMap(d => d.columns.filter(c => c.kind === 'number' && c.role === 'value').map(c => ({ v: d.id + '|' + c.id, l: (same.length > 1 ? dsLabel(doc, d) + ' · ' : '') + c.label, ds: d.id, col: c.id })));
  const mkChange = (): ColorRule => {
    if (shareRefs.length >= 2) {
      const cur = shareRefs.filter(r => r.ds === ds?.id), a = cur.find(r => /Zweit/.test(r.l) && !/Vorperiode/.test(r.l)) || cur[0] || shareRefs[0];
      const b = shareRefs.find(r => r.ds === a.ds && /Vorperiode/.test(r.l) && /Zweit/.test(r.l) === /Zweit/.test(a.l)) || shareRefs.find(r => r.ds !== a.ds && /Zweit/.test(r.l)) || shareRefs.find(r => r.v !== a.v)!;
      return { mode: 'veraenderung', dataset: a.ds, kind: 'anteil', party: 'AfD', a: { dataset: a.ds, group: a.grp, column: '' }, b: { dataset: b.ds, group: b.grp, column: '' }, rel: false, palette: 'partei', classes: 6, step: null };
    }
    const a = numRefs[0], b = numRefs[1];
    return { mode: 'veraenderung', dataset: a.ds, kind: 'wert', party: 'AfD', a: { dataset: a.ds, group: '', column: a.col }, b: { dataset: b.ds, group: '', column: b.col }, rel: false, palette: 'blaurot', classes: 6, step: null };
  };
  const changeOk = shareRefs.length >= 2 || numRefs.length >= 2;
  const nColors = new Set(geoOf(doc).all.map(i => fillOf(doc, cm, i))).size;
  return (
    <>
      <Section title="Datensatz">
        <select value={ds?.id} onChange={e => void showDataset(e.target.value)} aria-label="Datensatz für die Färbung">
          {doc.datasets.map(d => { const u = datasetFor(doc, d.id)!; return <option key={d.id} value={d.id}>{dsLabel(doc, d)}{u.derived ? ' · summiert' : u.geoSet !== doc.geoSet ? ' · andere Ebene' : ''}</option>; })}
        </select>
        {cm.dataset?.derived && <p className="hint">Auf {geoOf(doc).meta.levelLabel} summiert: Zahlen aus {countLabel(cm.dataset.derived.sources, GEO[cm.dataset.derived.from]?.meta.level || '')} addiert{cm.dataset.derived.rates.length ? ', Anteile und Quoten der Tabelle bleiben leer' : ''}. Details unter „Daten“.</p>}
      </Section>
      <Section title="Darstellung">
        <div className="modes">{modes.map(m => (
          <button key={m.id} className={'mode' + (rule.mode === m.id ? ' on' : '') + (m.ok ? '' : ' soon')} disabled={!m.ok} onClick={() => m.ok && set(m.mk())}>
            <span className="swatches">{m.sw.map((c, k) => <i key={k} style={{ background: c }} />)}</span><span><b>{m.t}</b><span>{m.d}</span></span>
          </button>))}
          <button className={'mode' + (rule.mode === 'veraenderung' ? ' on' : '') + (changeOk ? '' : ' soon')} disabled={!changeOk} onClick={() => changeOk && set(mkChange())} title={changeOk ? '' : 'Braucht eine Vorperiode oder einen zweiten Datensatz desselben Gebietsstands'}>
            <span className="swatches">{divergingColors(CHANGE_NEG.partei, A, 6).map((c, k) => <i key={k} style={{ background: c }} />)}</span><span><b>Veränderung</b><span>{changeOk ? 'Gewinne und Verluste gegenüber einer Vorwahl, zweiseitig um 0' : 'braucht Vorperiode oder zweiten Datensatz'}</span></span></button>
        </div>
      </Section>
      {(rule.mode === 'siegerStaerke' || rule.mode === 'sieger' || rule.mode === 'anteil') && <Section title="Optionen">
        <Field label="Stimmen"><select value={rule.group} onChange={e => set({ ...rule, group: e.target.value })}>{groups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select></Field>
        {rule.mode === 'siegerStaerke' && <>
          <Field label="Stärke nach"><Seg items={[['anteil', 'Anteil'], ['vorsprung', 'Vorsprung']]} value={rule.basis} onChange={v => set({ ...rule, basis: v })} /></Field>
          <Field label="Stufen"><Seg items={[['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']]} value={String(rule.steps) as '1' | '2' | '3' | '4'} onChange={v => set({ ...rule, steps: +v as 1 | 2 | 3 | 4 })} /></Field>
          {rule.steps > 1 && <Field label="Grenzen"><div className="meta-row">{shortRangeLabels(cm.breaks, rule.basis === 'anteil' ? ' %' : '').map(x => <span key={x} className="chip num">{x}</span>)}</div></Field>}
          <p className="hint">{rule.steps > 1 ? 'Runde Grenzen aus den Quartilen aller Gebiete. So bleiben die Farben beim Wechsel in ein Land vergleichbar.' : 'Ein Kasten je Partei, ohne Abstufung nach Stärke.'}</p>
        </>}
        {rule.mode === 'anteil' && <>
          <Field label="Partei"><select value={rule.party} onChange={e => set({ ...rule, party: e.target.value })}>{SHARE_KEYS.map(p => <option key={p} value={p}>{PARTY_DEFS.find(x => x.key === p)?.label}</option>)}</select></Field>
          <Check checked={!!rule.stetig} onChange={v => set({ ...rule, stetig: v })}>Stetige Skala statt Stufen</Check>
          {!rule.stetig && <Field label="Grenzen"><div className="meta-row">{shortRangeLabels(cm.breaks, ' %').map(x => <span key={x} className="chip num">{x}</span>)}</div></Field>}
          {rule.stetig && cm.continuous && <p className="hint">Von {fmtN(cm.continuous.min)} % (hell) bis {fmtN(cm.continuous.max)} % (kräftig), fließend.</p>}
          {cm.missing > 0 && <Note>{cm.missing} Gebiete ohne Wert (etwa nicht angetreten). Sie erscheinen als „keine Daten“, nicht als 0.</Note>}
        </>}
      </Section>}
      {rule.mode === 'wert' && <Section title="Optionen">
        <Field label="Spalte"><select value={rule.column} onChange={e => set({ ...rule, column: e.target.value })}>{numCols.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
        <Field label="Skala"><Seg items={[['rund', 'Rund'], ['quantil', 'Quantile'], ['gleich', 'Gleich'], ['stetig', 'Stetig']]} value={rule.method} onChange={v => set({ ...rule, method: v })} /></Field>
        {rule.method !== 'stetig' && <Field label="Anzahl"><Seg items={[['3', '3'], ['4', '4'], ['5', '5']]} value={String(rule.classes) as '5'} onChange={v => set({ ...rule, classes: +v })} /></Field>}
        <Field label="Farbe"><div className="swatch-grid">{HUES.map(h => <button key={h} className={'swatch-btn' + (rule.hue === h ? ' on' : '')} style={{ background: h }} onClick={() => set({ ...rule, hue: h })} aria-label={'Farbton ' + h} />)}</div></Field>
        {rule.method !== 'stetig' && <Field label="Grenzen"><div className="meta-row">{shortRangeLabels(cm.breaks).map(x => <span key={x} className="chip num">{x}</span>)}</div></Field>}
        <p className="hint">{rule.method === 'rund' ? 'Runde Zahlen nahe den Quantilen, gut lesbar in der Legende.' : rule.method === 'quantil' ? 'Gleich viele Gebiete je Klasse, Grenzen ungerundet.' : rule.method === 'gleich' ? 'Gleich breite Klassen zwischen kleinstem und größtem Wert.' : `Farbe wächst gleichmäßig vom kleinsten (${fmtN(cm.continuous?.min)}) zum größten Wert (${fmtN(cm.continuous?.max)}). Ohne Klassen ist die Karte schwerer genau abzulesen.`}</p>
        {cm.missing > 0 && <Note>{cm.missing} Gebiete im Fokus ohne Wert. Sie erscheinen als „keine Daten“, nicht als 0.</Note>}
      </Section>}
      {rule.mode === 'veraenderung' && <ChangeOptions rule={rule} set={set} shareRefs={shareRefs} numRefs={numRefs} cm={cm} />}
      {rule.mode === 'kategorie' && <Section title="Optionen">
        <Field label="Spalte"><select value={rule.column} onChange={e => set({ ...rule, column: e.target.value })}>{catCols.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
        <button className="btn small" onClick={() => setUI({ sel: { kind: 'el', id: 'legend' } })}><Icon.legend /> Legende bearbeiten</button>
        <p className="hint">Werte, die wie Parteinamen aussehen, bekommen die Parteifarbe. Andere Kategorien bekommen der Häufigkeit nach eine Farbe, ab der neunten grau. Farben und Texte einzelner Kategorien änderst du in der Legende.</p>
      </Section>}
      <BubbleSection />
      <Section title="Parteifarben" aside="gilt im Projekt">
        <div className="ptable">{PARTY_DEFS.map(p => (
          <div key={p.key} className="prow">
            <input type="color" value={partyColor(doc, p.key)} onChange={e => { const v = e.target.value.toUpperCase(); update(d => { d.partyColors[p.key] = v; }, { key: 'pc-' + p.key }); }} aria-label={'Farbe ' + p.label} />
            <span><span className="pname">{p.label}</span><span className="pvar">{[...new Set(p.variants.map(v => v[0]))].slice(0, 4).join(' · ')}</span></span>
            <span className="count">{cm.counts[p.key] ? cm.counts[p.key] + ' Geb.' : '–'}</span>
          </div>))}</div>
        <Note>Die Karte nutzt gerade <b>{nColors}</b> Farben.</Note>
      </Section>
    </>
  );
}
const fmtN = (v: number | null | undefined) => v == null ? '–' : v.toLocaleString('de-DE', { maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0 });

function ChangeOptions({ rule, set, shareRefs, numRefs, cm }: { rule: VeraenderungRule; set: (r: ColorRule) => void; shareRefs: { v: string; l: string; ds: string; grp: string }[]; numRefs: { v: string; l: string; ds: string; col: string }[]; cm: ReturnType<typeof colorModel> }) {
  const refs = rule.kind === 'anteil' ? shareRefs.map(r => ({ v: r.v, l: r.l })) : numRefs.map(r => ({ v: r.v, l: r.l }));
  const key = (r: VeraenderungRule['a']) => r.dataset + '|' + (rule.kind === 'anteil' ? r.group : r.column);
  const toRef = (v: string) => { const [d, x] = v.split('|'); return rule.kind === 'anteil' ? { dataset: d, group: x, column: '' } : { dataset: d, group: '', column: x }; };
  const upd = (p: Partial<VeraenderungRule>) => { const n = { ...rule, ...p }; n.dataset = n.a.dataset; set(n); };
  const setKind = (kind: 'anteil' | 'wert') => {
    if (kind === rule.kind) return;
    if (kind === 'anteil' && shareRefs.length >= 2) upd({ kind, palette: 'partei', a: { dataset: shareRefs[0].ds, group: shareRefs[0].grp, column: '' }, b: { dataset: shareRefs[1].ds, group: shareRefs[1].grp, column: '' } });
    if (kind === 'wert' && numRefs.length >= 2) upd({ kind, palette: 'blaurot', a: { dataset: numRefs[0].ds, group: '', column: numRefs[0].col }, b: { dataset: numRefs[1].ds, group: '', column: numRefs[1].col } });
  };
  const kinds: ['anteil' | 'wert', string][] = [];
  if (shareRefs.length >= 2) kinds.push(['anteil', 'Parteianteil']);
  if (numRefs.length >= 2) kinds.push(['wert', 'Zahlenwert']);
  return <Section title="Optionen">
    {kinds.length > 1 && <Field label="Vergleich von"><Seg items={kinds} value={rule.kind} onChange={setKind} /></Field>}
    {rule.kind === 'anteil' && <Field label="Partei"><select value={rule.party} onChange={e => upd({ party: e.target.value })}>{SHARE_KEYS.map(p => <option key={p} value={p}>{PARTY_DEFS.find(x => x.key === p)?.label}</option>)}</select></Field>}
    <Field label="Neu"><select value={key(rule.a)} onChange={e => upd({ a: toRef(e.target.value) })} aria-label="Neuer Wert">{refs.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}</select></Field>
    <Field label="Gegenüber"><select value={key(rule.b)} onChange={e => upd({ b: toRef(e.target.value) })} aria-label="Vergleichswert">{refs.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}</select></Field>
    {rule.kind === 'wert' && <Field label="Angabe"><Seg items={[['abs', 'Absolut'], ['rel', 'In %']]} value={rule.rel ? 'rel' : 'abs'} onChange={v => upd({ rel: v === 'rel' })} /></Field>}
    <Field label="Farben"><Seg items={[['partei', rule.kind === 'anteil' ? 'Partei / Grau' : 'Grün / Grau'], ['blaurot', 'Blau / Rot']]} value={rule.palette} onChange={v => upd({ palette: v })} /></Field>
    <Field label="Klassen"><Seg items={[['4', '4'], ['6', '6'], ['8', '8']]} value={String(rule.classes) as '6'} onChange={v => upd({ classes: +v as 4 | 6 | 8 })} /></Field>
    <Field label="Stufe"><div className="row-btns"><NumInput min={0.1} max={100000} step={rule.kind === 'anteil' || rule.rel ? 0.5 : 1} value={cm.diverging?.step ?? rule.step ?? 1} onChange={n => upd({ step: n })} ariaLabel="Breite einer Klasse" />{rule.step != null ? <button className="btn small ghost" onClick={() => upd({ step: null })}>automatisch</button> : <span className="hint">automatisch</span>}</div></Field>
    <Field label="Grenzen"><div className="meta-row">{cm.breaks.map(b => <span key={b} className="chip num">{signed(b)}{cm.unit}</span>)}</div></Field>
    <p className="hint">{rule.palette === 'partei' ? (rule.kind === 'anteil' ? 'Parteifarbe = Zuwachs, Grau = Verlust.' : 'Grün = Zuwachs, Grau = Rückgang.') : 'Rot = Zuwachs, Blau = Rückgang.'} Die Stufe wird aus dem Bereich ohne Ausreißer gewählt (5 bis 95 %). Gebiete ohne Wert in einer der beiden Spalten erscheinen als „keine Daten“.</p>
    {cm.mismatch && <Note kind="warn">Der Vergleichswert gehört zu einem anderen Gebietsstand. Beide Werte brauchen dieselben Gebiete, etwa die Bundestagswahl 2021 umgerechnet auf die Wahlkreise 2025.</Note>}
  </Section>;
}
export { Icon };
