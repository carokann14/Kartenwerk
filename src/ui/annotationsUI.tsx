import { dsLabel, usableDatasets } from '../data/aggregate';
import React, { useMemo } from 'react';
import { areaRowIndex, colIndex } from '../data/derive';
import { fmtNum } from '../lib/util';
import { HATCH_PRESETS } from '../model/defaults';
import {
  addColumnRule, addExtra, addHatch, assignHatch, clearAssignments, moveEntry, removeExtra, removeHatch, removeRule,
  resetLegendEdits, setEntryLabel, setNoDataHatch, toggleEntry, updateExtra, updateHatch, updateRule,
} from '../model/annotations';
import { setUI, update, useStore } from '../model/store';
import type { Doc, HatchPattern, HatchRule, HatchStyle } from '../model/types';
import { PATTERN_LABEL, hatchMap, hatchPathD, rectRing } from '../render/hatch';
import { LegEntry, entryColorSetter, legendModel } from '../render/legend';
import { geoOf } from '../render/scene';
import { Check, Field, Icon, Note, NumInput, Section, Seg } from './common';

// ---------- Vorschau ----------
export function HatchSwatch({ h, w = 30, hgt = 18, base = '#FFFFFF' }: { h: HatchStyle; w?: number; hgt?: number; base?: string }) {
  const d = useMemo(() => hatchPathD(h, [rectRing(0, 0, w, hgt)]), [h, w, hgt]);
  return (
    <svg className="hatch-sw" width={w} height={hgt} viewBox={`0 0 ${w} ${hgt}`} aria-hidden="true">
      <rect width={w} height={hgt} fill={h.bg || base} />
      {h.pattern === 'punkte' ? <path d={d} fill={h.color} /> : <path d={d} stroke={h.color} strokeWidth={h.width} fill="none" />}
      <rect x={0.5} y={0.5} width={w - 1} height={hgt - 1} fill="none" stroke="rgba(0,0,0,.18)" />
    </svg>
  );
}

// ---------- Liste (Elemente-Schritt und Ebene „Schraffuren“) ----------
export function HatchList({ doc }: { doc: Doc }) {
  const hm = hatchMap(doc);
  const nd = doc.hatchRules.find(r => r.source === 'nodata');
  return (
    <>
      {doc.hatches.length > 0 && <div className="hatch-list">{doc.hatches.map(h => {
        const n = hm.counts[h.id] || 0, rules = doc.hatchRules.filter(r => r.hatch === h.id);
        const how = [nd?.hatch === h.id ? 'keine Daten' : '', rules.some(r => r.source === 'column') ? 'aus Daten' : '', Object.values(doc.hatchAssign).includes(h.id) ? 'von Hand' : ''].filter(Boolean).join(' · ') || 'noch nicht zugewiesen';
        return (
          <button key={h.id} className="hatch-row" onClick={() => setUI({ sel: { kind: 'hatch', id: h.id } })}>
            <HatchSwatch h={h} /><span><b>{h.name}</b><span className="hint">{how}</span></span><span className="count num">{n ? n + ' Geb.' : '–'}</span>
          </button>);
      })}</div>}
      <div className="row-btns">{HATCH_PRESETS.map((p, k) => <button key={p.name} className="btn small" onClick={() => addHatch(k)} title={'Neue Schraffur: ' + p.name}><HatchSwatch h={{ ...p, id: 'p' + k }} w={18} hgt={12} /> {p.name}</button>)}</div>
      <Check checked={doc.layers.hatches} onChange={on => update(d => { d.layers.hatches = on; })}>Schraffuren anzeigen</Check>
    </>
  );
}

// ---------- Eigenschaften einer Schraffur ----------
const PATTERNS: HatchPattern[] = ['diag', 'diag2', 'kreuz', 'horizontal', 'vertikal', 'punkte'];
export function HatchProps({ doc, id }: { doc: Doc; id: string }) {
  const h = doc.hatches.find(x => x.id === id);
  if (!h) return <p className="hint">Diese Schraffur gibt es nicht mehr.</p>;
  const hm = hatchMap(doc), n = hm.counts[h.id] || 0;
  const manual = Object.entries(doc.hatchAssign).filter(([k, v]) => v === h.id && k.startsWith(doc.geoSet + ':')).length;
  const nd = doc.hatchRules.find(r => r.source === 'nodata');
  const rules = doc.hatchRules.filter((r): r is Extract<HatchRule, { source: 'column' }> => r.hatch === h.id && r.source === 'column');
  const ds0 = usableDatasets(doc)[0];
  return (
    <>
      <div className="rp-head"><h2>Eigenschaften</h2></div>
      <h3 className="props-title">Schraffur</h3>
      <p className="props-sub">{n} Gebiete im Fokus · Export als echte Linien</p>
      <Field label="Name"><input type="text" value={h.name} onChange={e => updateHatch(h.id, { name: e.target.value }, 'name')} aria-label="Name der Schraffur" /></Field>
      <div className="pattern-grid" role="group" aria-label="Muster">{PATTERNS.map(p => (
        <button key={p} className={'pattern-btn' + (h.pattern === p ? ' on' : '')} onClick={() => updateHatch(h.id, { pattern: p })} aria-pressed={h.pattern === p} title={PATTERN_LABEL[p]}>
          <HatchSwatch h={{ ...h, pattern: p, bg: null }} w={34} hgt={22} /><span>{PATTERN_LABEL[p]}</span>
        </button>))}</div>
      <Field label="Farbe"><input type="color" value={h.color} onChange={e => updateHatch(h.id, { color: e.target.value.toUpperCase() }, 'color')} aria-label="Farbe der Schraffur" /></Field>
      <Field label={h.pattern === 'punkte' ? 'Punktgröße' : 'Strichstärke'}><NumInput min={0.2} max={8} step={0.1} value={h.width} onChange={v => updateHatch(h.id, { width: v }, 'w')} ariaLabel="Stärke in px" /></Field>
      <Field label="Abstand (px)"><NumInput min={2} max={40} step={0.5} value={h.spacing} onChange={v => updateHatch(h.id, { spacing: v }, 's')} ariaLabel="Abstand in px" /></Field>
      <Field label="Untergrund"><Seg items={[['over', 'Datenfarbe'], ['own', 'Eigene Fläche']]} value={h.bg ? 'own' : 'over'} onChange={v => updateHatch(h.id, { bg: v === 'own' ? '#FFFFFF' : null })} /></Field>
      {h.bg && <Field label="Flächenfarbe"><input type="color" value={h.bg} onChange={e => updateHatch(h.id, { bg: e.target.value.toUpperCase() }, 'bg')} aria-label="Farbe der Grundfläche" /></Field>}
      <Section title="Zuweisung">
        <Check checked={nd?.hatch === h.id} onChange={on => setNoDataHatch(on ? h.id : null)}>Alle Gebiete ohne Daten</Check>
        {rules.map(r => <RuleEditor key={r.id} doc={doc} r={r} />)}
        {ds0 ? <button className="btn small" onClick={() => { const c = ds0.columns.find(x => x.role === 'category') || ds0.columns.find(x => x.role === 'value'); if (c) addColumnRule(h.id, ds0.id, c.id); }}><Icon.plus /> Aus Daten zuweisen</button>
          : <p className="hint">Für „Aus Daten“ braucht das Projekt einen Datensatz zu diesem Gebietsstand.</p>}
        <p className="hint">Von Hand: Gebiete auf der Karte auswählen (Umschalt + Klick für mehrere), dann rechts unter „Schraffur“ wählen. {manual > 0 && <>Gerade <b>{manual}</b> von Hand.</>}</p>
        {manual > 0 && <button className="btn small" onClick={() => clearAssignments(h.id)}>Zuweisungen von Hand entfernen</button>}
      </Section>
      <div className="row-btns"><button className="btn small ghost danger" onClick={() => removeHatch(h.id)}><Icon.trash /> Schraffur löschen</button></div>
    </>
  );
}
function RuleEditor({ doc, r }: { doc: Doc; r: Extract<HatchRule, { source: 'column' }> }) {
  const dsList = usableDatasets(doc);
  const ds = dsList.find(d => d.id === r.dataset) || dsList[0];
  const col = ds?.columns.find(c => c.id === r.column);
  const values = useMemo(() => {
    if (!ds || !col || col.kind === 'number') return [];
    const ci = colIndex(ds, col.id), cnt = new Map<string, number>();
    for (const row of areaRowIndex(ds).values()) { const v = String(ds.rows[row][ci] ?? '').trim(); if (v) cnt.set(v, (cnt.get(v) || 0) + 1); }
    return [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
  }, [ds, col]);
  if (!ds) return null;
  const cols = ds.columns.filter(c => c.role !== 'id' && c.role !== 'name' && c.role !== 'ignore');
  const sel = new Set(r.values);
  return (
    <div className="card rule">
      <div className="rule-head"><b>Aus Daten</b><button className="btn icon ghost small" onClick={() => removeRule(r.id)} aria-label="Regel entfernen"><Icon.x size={13} /></button></div>
      {dsList.length > 1 && <Field label="Datensatz"><select value={ds.id} onChange={e => updateRule(r.id, { dataset: e.target.value, values: [] })} aria-label="Datensatz">{dsList.map(d => <option key={d.id} value={d.id}>{dsLabel(doc, d)}</option>)}</select></Field>}
      <Field label="Spalte"><select value={col?.id || ''} onChange={e => { const c = ds.columns.find(x => x.id === e.target.value); updateRule(r.id, { column: e.target.value, values: [], op: c?.kind === 'number' ? 'gt' : 'in', num: null }); }} aria-label="Spalte">
        <option value="" disabled>– wählen –</option>{cols.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
      {col && col.kind !== 'number' && <div className="value-list">{values.map(([v, n]) => (
        <label key={v} className="check"><input type="checkbox" checked={sel.has(v)} onChange={e => updateRule(r.id, { op: 'in', values: e.target.checked ? [...r.values, v] : r.values.filter(x => x !== v) })} />{v}<span className="dim num">{n}</span></label>))}
        {!values.length && <p className="hint">Die Spalte hat keine Werte.</p>}</div>}
      {col && col.kind === 'number' && <Field label="Bedingung"><div className="row-btns nowrap">
        <Seg items={[['lt', 'kleiner'], ['gt', 'größer']]} value={r.op === 'lt' ? 'lt' : 'gt'} onChange={v => updateRule(r.id, { op: v })} />
        <NumInput value={r.num ?? 0} onChange={v => updateRule(r.id, { num: v }, 'num')} ariaLabel="Schwellenwert" />
      </div></Field>}
      {col && col.kind === 'number' && r.num == null && <p className="hint">Schwellenwert eingeben, z. B. {fmtNum(50, 0)}.</p>}
    </div>
  );
}

// ---------- Schraffur für ausgewählte Gebiete ----------
export function AreaHatch({ doc, ids }: { doc: Doc; ids: string[] }) {
  const g = geoOf(doc), hm = hatchMap(doc);
  const keys = ids.map(id => doc.geoSet + ':' + id);
  const manual = keys.map(k => (k in doc.hatchAssign ? doc.hatchAssign[k] : undefined));
  const same = manual.every(v => v === manual[0]) ? manual[0] : 'mixed';
  const eff = ids.map(id => { const i = g.byId.get(id); return i == null ? null : hm.byArea[i]; });
  const value = same === 'mixed' ? '__mixed' : same === undefined ? '__rule' : same === '' ? '__none' : same;
  const effName = eff.every(e => e === eff[0]) && eff[0] ? hm.styles.get(eff[0])?.name : null;
  return (
    <Section title="Schraffur" aside="von Hand">
      <select value={value} onChange={e => {
        const v = e.target.value;
        if (v === '__new') { addHatch(undefined, ids); return; }
        assignHatch(ids, v === '__rule' ? null : v === '__none' ? '' : v);
      }} aria-label="Schraffur für die Auswahl">
        {value === '__mixed' && <option value="__mixed" disabled>unterschiedlich</option>}
        <option value="__rule">Automatisch (Regeln){same === undefined && effName ? ` · jetzt: ${effName}` : ''}</option>
        <option value="__none">Keine</option>
        {doc.hatches.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
        <option value="__new">+ Neue Schraffur …</option>
      </select>
      <p className="hint">„Automatisch“ folgt den Regeln der Schraffuren, etwa „keine Daten“. Die Zuweisung von Hand hängt an Kennung und Gebietsstand und bleibt beim Ersetzen der Daten erhalten.</p>
    </Section>
  );
}

// ---------- Legende bearbeiten ----------
function LegRow({ doc, e, section }: { doc: Doc; e: LegEntry; section: LegEntry[] }) {
  const setColor = entryColorSetter(e.target);
  const keys = section.map(x => x.key), k = keys.indexOf(e.key);
  const x = e.key.startsWith('x:') ? doc.legend.extra.find(q => 'x:' + q.id === e.key) : null;
  return (
    <div className={'leg-row' + (e.hidden ? ' off' : '')}>
      {e.kind === 'hatch' && e.hatch ? <button className="leg-sw" onClick={() => setUI({ sel: { kind: 'hatch', id: e.hatch!.id } })} title="Schraffur bearbeiten"><HatchSwatch h={e.hatch} w={22} hgt={16} /></button>
        : setColor ? <input type="color" value={e.color} onChange={ev => { const v = ev.target.value.toUpperCase(); update(d => setColor(d, v), { key: 'lgc-' + e.key }); }} aria-label={'Farbe ' + e.label} title={e.target?.type === 'party' ? 'Parteifarbe (gilt im ganzen Projekt)' : 'Farbe'} />
        : <span className="leg-sw" />}
      <input type="text" value={x ? x.label : doc.legend.labels[e.key] ?? ''} placeholder={e.auto} onChange={ev => setEntryLabel(e.key, ev.target.value, x ? '' : e.auto)} aria-label={'Text für ' + e.auto} />
      <span className="leg-btns">
        <button className="btn icon ghost small" disabled={k <= 0} onClick={() => moveEntry(keys, e.key, -1)} aria-label="nach oben" title="nach oben">↑</button>
        <button className="btn icon ghost small" disabled={k >= keys.length - 1} onClick={() => moveEntry(keys, e.key, 1)} aria-label="nach unten" title="nach unten">↓</button>
        <button className="btn icon ghost small" onClick={() => toggleEntry(e.key)} aria-label={e.hidden ? 'einblenden' : 'ausblenden'} title={e.hidden ? 'einblenden' : 'ausblenden'}>{e.hidden ? <Icon.eyeOff /> : <Icon.eye />}</button>
        {x && <button className="btn icon ghost small danger" onClick={() => removeExtra(x.id)} aria-label="Eintrag entfernen" title="Eintrag entfernen"><Icon.trash /></button>}
      </span>
      {x && <div className="leg-extra">
        <Seg items={[['fill', 'Fläche'], ['hatch', 'Schraffur'], ['line', 'Linie']]} value={x.kind} onChange={kind => updateExtra(x.id, { kind, hatch: kind === 'hatch' ? (x.hatch || doc.hatches[0]?.id || null) : x.hatch })} />
        {x.kind === 'hatch' && (doc.hatches.length ? <select value={x.hatch || ''} onChange={ev => updateExtra(x.id, { hatch: ev.target.value })} aria-label="Schraffur">{doc.hatches.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select> : <span className="hint">Erst eine Schraffur anlegen.</span>)}
      </div>}
    </div>
  );
}

export function LegendProps({ doc }: { doc: Doc }) {
  const M = legendModel(doc), lg = doc.legend;
  const isMatrix = M?.main === 'matrix';
  return (
    <>
      <div className="rp-head"><h2>Eigenschaften</h2></div>
      <h3 className="props-title">Legende</h3>
      <p className="props-sub">aus der Färbung erzeugt, Texte und Reihenfolge änderbar</p>
      <Field stack label="Titel" htmlFor="p-lt"><input type="text" id="p-lt" value={lg.title} placeholder={M?.titleAuto || ''} onChange={e => { const val = e.target.value; update(d => { d.legend.title = val; }, { key: 'lg-title' }); }} /></Field>
      {isMatrix && <Check checked={lg.simple} onChange={on => update(d => { d.legend.simple = on; })}>Ein Kasten je Partei, ohne Abstufung in der Legende</Check>}
      {isMatrix && lg.simple && <p className="hint">Die Karte zeigt weiterhin alle Abstufungen nach Stärke; nur die Legende wird auf einen Kasten je Partei vereinfacht.</p>}
      <Field label="Anordnung"><Seg items={[['vertical', 'Unter'], ['horizontal', 'Neben'], ['grid', 'Raster']]} value={lg.orientation} onChange={o => update(d => { d.legend.orientation = o; })} /></Field>
      {lg.orientation === 'grid' && <Field label="Spalten"><Seg items={[['2', '2'], ['3', '3'], ['4', '4']]} value={String(lg.cols) as '2'} onChange={v => update(d => { d.legend.cols = +v; })} /></Field>}
      {isMatrix && !lg.simple && lg.orientation !== 'vertical' && <p className="hint">Bei Abstufung nach Stärke steht die Klassengrenzen-Skala nur „untereinander“ über der Legende; bei „Neben“/„Raster“ entfällt sie, die Kästen je Partei bleiben aber vollständig erhalten.</p>}
      {M?.main === 'bar' && lg.orientation !== 'vertical' && <p className="hint">Bei „Neben“/„Raster“ bekommt jede Klasse eine eigene Bereichsbeschriftung statt der gemeinsamen Skala darunter.</p>}
      <Check checked={lg.counts} onChange={on => update(d => { d.legend.counts = on; })}>Anzahl der Gebiete zeigen</Check>
      <Field label="Größe (px)"><NumInput min={9} max={40} value={lg.size} onChange={n => update(d => { d.legend.size = n; }, { key: 'lg-size' })} ariaLabel="Schriftgröße der Legende" /></Field>
      {!M && <Note>Die Legende erscheint, sobald eine Färbung mit Daten aktiv ist.</Note>}
      {M && M.rows.length > 0 && <Section title={M.main === 'matrix' ? 'Parteien' : 'Einträge'} aside="Farbe · Text · Reihenfolge">
        <div className="leg-list">{M.rows.map(e => <LegRow key={e.key} doc={doc} e={e} section={M.rows} />)}</div>
        {M.rows.some(e => e.target?.type === 'party') && <p className="hint">Parteifarben gelten im ganzen Projekt, auch für die Karte.</p>}
      </Section>}
      {M && <Section title="Weitere Einträge">
        {M.more.length > 0 && <div className="leg-list">{M.more.map(e => <LegRow key={e.key} doc={doc} e={e} section={M.more} />)}</div>}
        <div className="row-btns"><button className="btn small" onClick={() => addExtra('fill')}><Icon.plus /> Fläche</button><button className="btn small" onClick={() => addExtra('hatch')}><Icon.plus /> Schraffur</button><button className="btn small" onClick={() => addExtra('line')}><Icon.plus /> Linie</button></div>
        <p className="hint">Schraffuren und „keine Daten“ erscheinen automatisch, sobald sie auf der Karte vorkommen.</p>
      </Section>}
      {M?.caption && <Section title="Fußzeile">
        <div className={'leg-row' + (M.caption.hidden ? ' off' : '')}>
          <span className="leg-sw" />
          <input type="text" value={lg.caption ?? ''} placeholder={M.caption.auto} onChange={e => { const v = e.target.value; update(d => { d.legend.caption = v === '' ? null : v; }, { key: 'lg-cap' }); }} aria-label="Fußzeile der Legende" />
          <span className="leg-btns"><button className="btn icon ghost small" onClick={() => toggleEntry('caption')} aria-label={M.caption.hidden ? 'einblenden' : 'ausblenden'}>{M.caption.hidden ? <Icon.eyeOff /> : <Icon.eye />}</button></span>
        </div>
      </Section>}
      {M?.ovNote && <Check checked={!M.ovNote.hidden} onChange={() => toggleEntry('ov')}>Hinweis „{M.ovNote.text}“ zeigen</Check>}
      <div className="row-btns"><button className="btn small ghost" onClick={resetLegendEdits}>Auf automatisch zurücksetzen</button></div>
    </>
  );
}
