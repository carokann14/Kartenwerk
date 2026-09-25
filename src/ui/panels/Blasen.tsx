// Einstellungen für Blasen (proportionale Kreise aus einer Zahlenspalte)
import { usableDatasets } from '../../data/aggregate';
import React from 'react';
import { update, useStore } from '../../model/store';
import type { Bubbles, Doc } from '../../model/types';
import { colorModel } from '../../render/colorModel';
import { geoOf } from '../../render/scene';
import { Check, Field, Note, NumInput, Section, Seg } from '../common';

const PREF = /^(Wählende|Gültige|Wahlberechtigte|Einwohner|Bevölkerung)/i;
export function defaultBubbles(doc: Doc): Bubbles | null {
  const cm = colorModel(doc);
  const same = usableDatasets(doc);
  const ds = (cm.dataset && same.some(d => d.id === cm.dataset!.id) ? cm.dataset : null) || same[0];
  if (!ds) return null;
  const nums = ds.columns.filter(c => c.kind === 'number' && c.role !== 'id' && c.role !== 'ignore');
  const col = nums.find(c => /^Wählende/i.test(c.label)) || nums.find(c => PREF.test(c.label)) || nums[0];
  if (!col) return null;
  const n = geoOf(doc).areas.length;
  return { visible: true, dataset: ds.id, column: col.id, maxR: n > 3000 ? 14 : n > 350 ? 16 : 20, ref: null, color: 'regel', stroke: '#FFFFFF', strokeW: 0.8, opacity: 0.9, legend: true, title: '' };
}
const setB = (p: Partial<Bubbles>, key?: string) => update(d => { if (d.bubbles) Object.assign(d.bubbles, p); }, key ? { key } : {});

export function BubbleSection({ inPanel = false }: { inPanel?: boolean }) {
  const doc = useStore(s => s.doc!);
  const b = doc.bubbles;
  const same = usableDatasets(doc);
  const def = !b ? defaultBubbles(doc) : null;
  const body = !b ? <>
    <Check checked={false} onChange={() => { if (def) update(d => { d.bubbles = def; }); }}>Blasen zeigen</Check>
    <p className="hint">{def ? 'Kreise an den Gebieten, deren Fläche einem Wert entspricht, etwa der Zahl der Wählenden. Die Farbe folgt der Färbung oder ist fest.' : 'Braucht einen Datensatz mit Zahlen für diesen Gebietsstand.'}</p>
  </> : (() => {
    const ds = same.find(d => d.id === b.dataset) || null;
    const nums = ds ? ds.columns.filter(c => c.kind === 'number' && c.role !== 'id' && c.role !== 'ignore') : [];
    return <>
      <Check checked={b.visible} onChange={v => setB({ visible: v })}>Blasen zeigen</Check>
      {!ds && <Note kind="warn">Der Datensatz der Blasen gehört nicht zu diesem Gebietsstand.</Note>}
      {same.length > 1 && <Field label="Datensatz"><select value={b.dataset} onChange={e => { const d2 = same.find(x => x.id === e.target.value)!; const c2 = d2.columns.find(c => c.kind === 'number' && c.role !== 'id'); setB({ dataset: d2.id, column: c2?.id || '' }); }}>{same.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>}
      <Field label="Größe nach"><select value={b.column} onChange={e => setB({ column: e.target.value })} aria-label="Spalte für die Größe">{nums.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
      <Field label="Größter Kreis (px)"><NumInput min={2} max={120} value={b.maxR} onChange={n => setB({ maxR: n }, 'bmax')} ariaLabel="Radius des größten Kreises" /></Field>
      <Field label="Bezugswert"><div className="row-btns"><NumInput min={0} max={1e12} value={b.ref ?? 0} onChange={n => setB({ ref: n > 0 ? n : null }, 'bref')} ariaLabel="Wert für den größten Kreis" />{b.ref != null ? <button className="btn small ghost" onClick={() => setB({ ref: null })}>größter Wert</button> : <span className="hint">größter Wert</span>}</div></Field>
      <Field label="Farbe"><div className="row-btns"><Seg items={[['regel', 'Wie Färbung'], ['fest', 'Eigene']]} value={b.color === 'regel' ? 'regel' : 'fest'} onChange={v => setB({ color: v === 'regel' ? 'regel' : '#16181B' })} />{b.color !== 'regel' && <input type="color" value={b.color} onChange={e => setB({ color: e.target.value.toUpperCase() }, 'bcol')} aria-label="Farbe der Blasen" />}</div></Field>
      <Field label="Deckkraft"><div className="row-btns"><input type="range" min={0.3} max={1} step={0.05} value={b.opacity ?? 1} onChange={e => setB({ opacity: +e.target.value }, 'bop')} aria-label="Deckkraft der Blasen" /><span className="hint num">{Math.round((b.opacity ?? 1) * 100)} %</span></div></Field>
      <Field label="Rand"><div className="row-btns"><input type="color" value={b.stroke} onChange={e => setB({ stroke: e.target.value.toUpperCase() }, 'bstr')} aria-label="Randfarbe" /><NumInput min={0} max={4} step={0.1} value={b.strokeW} onChange={n => setB({ strokeW: n }, 'bsw')} ariaLabel="Randstärke" /></div></Field>
      <Check checked={b.legend} onChange={v => setB({ legend: v })}>In der Legende zeigen</Check>
      {b.legend && <Field label="Titel" stack><input type="text" value={b.title} placeholder={nums.find(c => c.id === b.column)?.label || ''} onChange={e => setB({ title: e.target.value }, 'btitle')} /></Field>}
      <Check checked={!doc.layers.wkFill} onChange={v => update(d => { d.layers.wkFill = !v; })}>Flächen neutral (reine Blasenkarte)</Check>
      <p className="hint">Die Fläche jedes Kreises entspricht dem Wert. Der Bezugswert legt fest, welcher Wert den größten Kreis ergibt; ein fester Wert macht mehrere Karten vergleichbar. Kleinere Kreise liegen oben.</p>
      <button className="btn small ghost danger" onClick={() => update(d => { d.bubbles = null; })}>Blasen entfernen</button>
    </>;
  })();
  return inPanel ? <>{body}</> : <Section title="Blasen" aside="Größe aus einer Zahlenspalte">{body}</Section>;
}
