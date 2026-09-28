// Schritt „Diagramm“ (M7): Art, Daten, Ausschnitt, Vergleich, Darstellung
import React from 'react';
import { update, setUI, useStore } from '../../model/store';
import type { ChartScope, ChartSource, ChartSpec, ChartType, Doc } from '../../model/types';
import type { Dataset } from '../../data/types';
import { dsLabel } from '../../data/aggregate';
import { latestPeriod, periodText } from '../../data/time';
import { GEO, LAENDER } from '../../geo/geo';
import { chartModel, defaultChart } from '../../render/chart';
import { chartTexts, cmpOptions, defaultSource, isOwnTable, numCols, partyGroups, typeFor } from '../../render/chartSource';
import { Check, ColorField, Field, Icon, Note, NumInput, Section, Seg } from '../common';

const HUES = ['#2F5D8A', '#1F7A6D', '#8A5A2F', '#6B4C9A', '#A33B4F', '#3C3F45'];
const PLACEHOLDER = /^(Titel der Grafik|Unterzeile: )/;

/** Diagramm ändern; Titel und Unterzeile ziehen mit, solange sie automatisch sind (Platzhalter bzw. zuletzt erzeugt) */
function setChart(fn: (c: ChartSpec) => ChartSpec) {
  update(d => {
    const before = d.chart ? JSON.parse(JSON.stringify(d.chart)) as ChartSpec : defaultChart();
    const next = fn(before);
    const plain = d as unknown as Doc;
    const oldTx = chartTexts(plain, before), newTx = chartTexts({ ...plain, chart: next } as Doc, next);
    d.chart = next as never;
    if (newTx) {
      if (PLACEHOLDER.test(d.texts.title.text) || (oldTx && d.texts.title.text === oldTx.title)) d.texts.title.text = newTx.title;
      if (PLACEHOLDER.test(d.texts.subtitle.text) || (oldTx && d.texts.subtitle.text === oldTx.subtitle)) d.texts.subtitle.text = newTx.subtitle;
    }
  }, { key: 'chart' });
}
const setSource = (src: ChartSource | null) => setChart(c => ({ ...c, source: src, type: typeFor(src, c.type) }));
/** Farbe eines einzelnen Balkens setzen bzw. (hex null) auf die allgemeine Farbe zurücksetzen. */
function setBarColor(key: string, hex: string | null) {
  setChart(c => {
    const bc = { ...c.barColors };
    if (hex) bc[key] = hex; else delete bc[key];
    return { ...c, barColors: Object.keys(bc).length ? bc : undefined };
  });
}
/** Namen eines einzelnen Balkens setzen; leerer Text = zurück zum automatischen Namen (Gebiets- bzw. Spaltenname). */
function setBarLabel(key: string, text: string) {
  setChart(c => {
    const bl = { ...c.barLabels };
    if (text) bl[key] = text; else delete bl[key];
    return { ...c, barLabels: Object.keys(bl).length ? bl : undefined };
  });
}

export function PanelDiagramm() {
  const doc = useStore(s => s.doc!);
  const spec = doc.chart || defaultChart();
  const src = spec.source;
  const ds = src ? doc.datasets.find(d => d.id === src.dataset) || null : null;
  const M = chartModel(doc);
  const isPartyLike = src?.kind === 'partei' || (src?.kind === 'linie' && src.mode === 'partei');
  const usable = doc.datasets.filter(d => defaultSource(doc, d, spec.type));
  const setType = (type: ChartType) => setChart(c => {
    let s = c.source;
    const d0 = s ? doc.datasets.find(d => d.id === s!.dataset) : null;
    // Balken zeigen Gebiete bzw. eine Tabelle, Säulen und Gewinne/Verluste ein Parteiergebnis, Linie eine eigene Quelle mit Zeitachse
    if (d0 && ((type === 'balken') !== (s!.kind !== 'partei') || (type === 'gewinne' && s!.kind === 'partei' && !s!.cmp) || (type === 'linie') !== (s!.kind === 'linie'))) s = defaultSource(doc, d0, type) || s;
    return { ...c, type, source: s };
  });
  if (!doc.datasets.length) return <Section title="Diagramm">
    <Note>Für ein Diagramm brauchst du Daten: eine importierte Datei (etwa Wahlergebnisse oder eine Tabelle der Regionaldatenbank) oder eine eigene kleine Tabelle.</Note>
    <div className="row-btns">
      <button className="btn primary" onClick={() => setUI({ wizard: { mode: 'new' } })}><Icon.upload /> Datei importieren …</button>
      <button className="btn" onClick={() => setUI({ tableEdit: 'new' })}><Icon.daten /> Neue Tabelle …</button>
    </div>
  </Section>;
  return <>
    <Section title="Art">
      <Seg full items={[['saeulen', 'Säulen'], ['gewinne', 'Gewinne/Verluste'], ['balken', 'Balken'], ['linie', 'Linie']]} value={spec.type} onChange={setType} />
      <p className="hint">{spec.type === 'saeulen' ? 'Ergebnis je Partei, nach Größe, „Sonstige“ am Ende. Vergleich als schmale helle Säule.' : spec.type === 'gewinne' ? 'Veränderung je Partei in Prozentpunkten, gleiche Reihenfolge wie das Ergebnis.' : spec.type === 'balken' ? 'Werte je Gebiet oder Zeile, waagerecht und sortiert – gut für lange Namen.' : 'Verlauf über die Zeit; mehrere Merkmale eines Datensatzes mit Zeitachse als eigene Linien.'}</p>
    </Section>
    <Section title="Daten">
      <Field label="Datensatz"><select value={ds?.id || ''} onChange={e => { const d = doc.datasets.find(x => x.id === e.target.value); if (d) setSource(defaultSource(doc, d, spec.type)); }} aria-label="Datensatz">
        {!ds && <option value="">– wählen –</option>}
        {usable.map(d => <option key={d.id} value={d.id}>{dsLabel(doc, d)}{isOwnTable(d) ? ' · eigene Tabelle' : !d.geoSet ? ' · ohne Gebiet' : ''}</option>)}
      </select></Field>
      {src?.kind === 'partei' && ds && <ParteiOptions doc={doc} ds={ds} src={src} />}
      {src?.kind === 'gebiete' && ds && <GebieteOptions ds={ds} src={src} />}
      {src?.kind === 'tabelle' && ds && <TabelleOptions ds={ds} src={src} type={spec.type} />}
      {src?.kind === 'linie' && ds && <LinieOptions doc={doc} ds={ds} src={src} />}
      {M.empty && src && <Note kind="warn">{M.empty}</Note>}
    </Section>
    <Section title="Darstellung">
      {spec.type === 'saeulen' && M.hasCmp && <Check checked={spec.showCmp} onChange={v => setChart(c => ({ ...c, showCmp: v }))}>Vergleich als schmale Säule daneben</Check>}
      {spec.type === 'saeulen' && M.hasCmp && spec.showCmp && <Check checked={spec.keyVisible} onChange={v => setChart(c => ({ ...c, keyVisible: v }))}>Zeichenerklärung ({M.curLabel} · {M.cmpLabel})</Check>}
      {isPartyLike && <Field label="Sonstige unter"><div className="row-btns"><NumInput min={0} max={20} step={0.5} value={spec.minShare} onChange={n => setChart(c => ({ ...c, minShare: n }))} ariaLabel="Schwelle für Sonstige in Prozent" /><span className="hint">%</span></div></Field>}
      <Field label="Nachkommastellen"><Seg items={[['0', '0'], ['1', '1'], ['2', '2']]} value={String(spec.decimals) as '1'} onChange={v => setChart(c => ({ ...c, decimals: +v }))} /></Field>
      {!isPartyLike && !(src?.kind === 'linie' && src.mode === 'werte' && src.columns.length > 1) && <Field label="Farbe"><div className="swatch-grid">{HUES.map(h => <button key={h} className={'swatch-btn' + (spec.color === h ? ' on' : '')} style={{ background: h }} onClick={() => setChart(c => ({ ...c, color: h }))} aria-label={'Farbton ' + h} />)}<ColorField value={spec.color || HUES[0]} onChange={hex => setChart(c => ({ ...c, color: hex }))} ariaLabel="Eigene Farbe" /></div></Field>}
      {!isPartyLike && M.bars.length > 1 && <Field label={spec.type === 'linie' ? 'Farbe und Name je Linie' : 'Farbe und Name je Balken'}>
        <div className="ptable">{M.bars.map(b => (
          <div key={b.key} className="prow">
            <ColorField value={b.color} onChange={hex => setBarColor(b.key, hex)} ariaLabel={'Farbe ' + b.label} />
            <input type="text" value={spec.barLabels?.[b.key] ?? ''} placeholder={b.auto || b.label} onChange={e => setBarLabel(b.key, e.target.value)} aria-label={'Name für „' + (b.auto || b.label) + '“'} />
            {spec.barColors?.[b.key] && <button className="btn icon ghost small" onClick={() => setBarColor(b.key, null)} aria-label={'Eigene Farbe für „' + (b.auto || b.label) + '“ zurücksetzen'} title="Nur die Farbe auf die allgemeine zurücksetzen"><Icon.x size={13} /></button>}
          </div>
        ))}</div>
        <p className="hint">Leeres Namensfeld übernimmt wieder den automatischen Namen (grau als Platzhalter zu sehen).</p>
      </Field>}
      <p className="hint">Parteien bekommen ihre Farbe aus der Parteifarben-Tabelle (Schritt „Daten“ bzw. „Färbung“ einer Karte). Titel und Unterzeile passen sich an, solange du sie nicht selbst geändert hast.</p>
    </Section>
  </>;
}

function ScopeField({ ds, scope, onChange }: { ds: Dataset; scope: ChartScope; onChange: (s: ChartScope) => void }) {
  const g = GEO[ds.geoSet]; if (!g) return null;
  const lands = [...new Set(ds.rowArea.map(a => (a ? g.areas[g.byId.get(a) ?? -1]?.bl : null)).filter((x): x is string => !!x))].sort();
  const areas = ds.rowArea.map(a => (a ? g.areas[g.byId.get(a) ?? -1] : null)).filter((a): a is NonNullable<typeof a> => !!a).sort((x, y) => x.name.localeCompare(y.name, 'de'));
  return <>
    <Field label="Ausschnitt"><Seg items={[['alle', 'Alle'], ['land', 'Land'], ['gebiet', g.meta.levelLabel.replace(/e$|en$/, '') || 'Gebiet']] as ['alle' | 'land' | 'gebiet', string][]} value={scope.kind}
      onChange={k => onChange(k === 'alle' ? { kind: 'alle' } : k === 'land' ? { kind: 'land', bl: lands[0] || '01' } : { kind: 'gebiet', id: areas[0]?.id || '' })} /></Field>
    {scope.kind === 'land' && <Field label="Land"><select value={scope.bl} onChange={e => onChange({ kind: 'land', bl: e.target.value })}>{lands.map(b => <option key={b} value={b}>{LAENDER[b]?.[0] || b}</option>)}</select></Field>}
    {scope.kind === 'gebiet' && <Field label="Gebiet"><select value={scope.id} onChange={e => onChange({ kind: 'gebiet', id: e.target.value })}>{areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
  </>;
}
function PeriodSelect({ ds, value, onChange, label }: { ds: Dataset; value: string | null | undefined; onChange: (p: string) => void; label?: string }) {
  if (!ds.time) return null;
  return <Field label={label || ds.time.label}><select value={value || latestPeriod(ds)!} onChange={e => onChange(e.target.value)}>{[...ds.time.periods].reverse().map(p => <option key={p} value={p}>{periodText(p)}</option>)}</select></Field>;
}
function ParteiOptions({ doc, ds, src }: { doc: Doc; ds: Dataset; src: Extract<ChartSource, { kind: 'partei' }> }) {
  const set = (p: Partial<typeof src>) => setSource({ ...src, ...p });
  const groups = partyGroups(ds);
  const opts = cmpOptions(doc, ds, src.group, src.period);
  const key = (c: typeof src.cmp) => (c ? `${c.dataset}|${c.group}|${c.period || ''}` : '');
  return <>
    {groups.length > 1 && <Field label="Stimmen"><select value={src.group} onChange={e => set({ group: e.target.value, cmp: cmpOptions(doc, ds, e.target.value, src.period)[0]?.value || null })}>{groups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select></Field>}
    <PeriodSelect ds={ds} value={src.period} onChange={p => set({ period: p, cmp: src.cmp?.period === p ? cmpOptions(doc, ds, src.group, p)[0]?.value || null : src.cmp })} />
    <ScopeField ds={ds} scope={src.scope} onChange={s => set({ scope: s })} />
    <Field label="Vergleich"><select value={key(src.cmp)} onChange={e => set({ cmp: opts.find(o => key(o.value) === e.target.value)?.value || null })}>
      <option value="">– keiner –</option>
      {opts.map(o => <option key={key(o.value)} value={key(o.value)}>{o.label}</option>)}
    </select></Field>
    {!opts.length && <p className="hint">Für einen Vergleich braucht es eine Vorwahl in derselben Datei, ein weiteres Jahr oder einen zweiten Datensatz mit denselben Stimmen.</p>}
  </>;
}
function GebieteOptions({ ds, src }: { ds: Dataset; src: Extract<ChartSource, { kind: 'gebiete' }> }) {
  const set = (p: Partial<typeof src>) => setSource({ ...src, ...p });
  return <>
    <Field label="Spalte"><select value={src.column} onChange={e => set({ column: e.target.value })}>{numCols(ds).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
    <PeriodSelect ds={ds} value={src.period} onChange={p => set({ period: p })} />
    <Field label="Zeigen"><Seg items={[['top', 'Höchste'], ['bottom', 'Niedrigste'], ['alle', 'Alle']]} value={src.select} onChange={v => set({ select: v })} /></Field>
    {src.select !== 'alle' && <Field label="Anzahl"><NumInput min={1} max={60} value={src.n} onChange={n => set({ n })} ariaLabel="Anzahl der Balken" /></Field>}
    <ScopeField ds={ds} scope={src.scope} onChange={s => set({ scope: s })} />
  </>;
}
function TabelleOptions({ ds, src, type }: { ds: Dataset; src: Extract<ChartSource, { kind: 'tabelle' }>; type: ChartType }) {
  const set = (p: Partial<typeof src>) => setSource({ ...src, ...p });
  const nc = numCols(ds);
  return <>
    <Field label="Werte"><select value={src.column} onChange={e => set({ column: e.target.value })}>{nc.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
    <Field label="Vergleich"><select value={src.cmp || ''} onChange={e => set({ cmp: e.target.value || null })}>
      <option value="">– keiner –</option>{nc.filter(c => c.id !== src.column).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
    {type === 'gewinne' && !src.cmp && <p className="hint">Gewinne und Verluste rechnen „Werte“ minus „Vergleich“.</p>}
    <button className="btn small" onClick={() => setUI({ tableEdit: ds.id })}><Icon.daten /> Tabelle bearbeiten …</button>
  </>;
}
function LinieOptions({ doc, ds, src }: { doc: Doc; ds: Dataset; src: Extract<ChartSource, { kind: 'linie' }> }) {
  const groups = partyGroups(ds), nc = numCols(ds);
  const setMode = (mode: 'partei' | 'werte') => {
    if (mode === 'partei') { const g = groups[0]; if (g) setSource({ kind: 'linie', dataset: ds.id, mode: 'partei', group: g.id, scope: src.scope }); }
    else { const c = nc[0]; if (c) setSource({ kind: 'linie', dataset: ds.id, mode: 'werte', columns: [c.id], scope: src.scope }); }
  };
  return <>
    {groups.length > 0 && nc.length > 0 && <Field label="Art der Reihen"><Seg items={[['partei', 'Parteien'], ['werte', 'Zahlenspalten']] as ['partei' | 'werte', string][]} value={src.mode} onChange={setMode} /></Field>}
    {src.mode === 'partei' && groups.length > 1 && <Field label="Stimmen"><select value={src.group} onChange={e => setSource({ ...src, group: e.target.value })}>{groups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select></Field>}
    {src.mode === 'werte' && <Field label="Spalten (mehrere möglich)">
      <div className="ptable">{nc.map(c => (
        <div key={c.id} className="prow">
          <Check checked={src.columns.includes(c.id)} onChange={on => setSource({ ...src, columns: on ? [...src.columns, c.id] : src.columns.filter(x => x !== c.id) })}>{c.label}</Check>
        </div>
      ))}</div>
      {!src.columns.length && <p className="hint">Mindestens eine Spalte wählen.</p>}
      {src.columns.length > 1 && <p className="hint">Mehrere Spalten bekommen zunächst automatisch verschiedene Farben, einzeln anpassbar unten bei „Farbe und Name je Linie“.</p>}
    </Field>}
    <ScopeField ds={ds} scope={src.scope} onChange={s => setSource({ ...src, scope: s })} />
    {ds.time && <p className="hint">Zeigt den Verlauf über {ds.time.label === 'Jahr' ? 'die Jahre' : 'alle Zeitpunkte'} des Datensatzes ({periodText(ds.time.periods[0])}–{periodText(ds.time.periods[ds.time.periods.length - 1])}).</p>}
  </>;
}
