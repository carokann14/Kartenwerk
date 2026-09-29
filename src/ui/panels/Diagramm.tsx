// Schritt „Diagramm“ (M7): Art, Daten, Ausschnitt, Vergleich, Darstellung
import React from 'react';
import { getDoc, update, setUI, useStore } from '../../model/store';
import { addDataset } from '../../model/actions';
import { duplicateGraphic } from '../../model/graphics';
import { ensureSeatLegend } from '../../model/layout';
import { tableDataset } from '../TableEditor';
import type { ChartScope, ChartSource, ChartSpec, ChartType, Doc } from '../../model/types';
import type { Dataset } from '../../data/types';
import { dsLabel } from '../../data/aggregate';
import { latestPeriod, periodText } from '../../data/time';
import { GEO, LAENDER } from '../../geo/geo';
import { chartModel, defaultChart, SeatModel } from '../../render/chart';
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
    // Sitzverteilung: sobald Sitze da sind (neue Art, erste Daten), wird die Beschriftung der Parteien zur Legende (eigenes Element, Layout neu)
    ensureSeatLegend(d);
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
    if (d0 && ((type === 'balken') !== (s!.kind !== 'partei') || (type === 'gewinne' && s!.kind === 'partei' && !s!.cmp) || (type === 'linie') !== (s!.kind === 'linie') || (type === 'sitze') !== (s!.kind === 'sitze'))) s = defaultSource(doc, d0, type) || (type === 'sitze' ? null : s);
    return { ...c, type, source: s };
  });
  if (!doc.datasets.length) return <Section title="Diagramm">
    <Note>Für ein Diagramm brauchst du Daten: eine importierte Datei (etwa Wahlergebnisse oder eine Tabelle der Regionaldatenbank) oder eine eigene kleine Tabelle.</Note>
    <div className="row-btns">
      <button className="btn primary" onClick={() => setUI({ wizard: { mode: 'new' } })}><Icon.upload /> Datei importieren …</button>
      <button className="btn" onClick={() => setUI({ tableEdit: 'new' })}><Icon.daten /> Neue Tabelle …</button>
    </div>
    {spec.type === 'sitze' && <SeatTemplate />}
  </Section>;
  return <>
    <Section title="Art">
      <Seg full items={[['saeulen', 'Säulen'], ['gewinne', 'Gewinne'], ['balken', 'Balken'], ['linie', 'Linie'], ['sitze', 'Sitze']]} value={spec.type} onChange={setType} />
      <p className="hint">{spec.type === 'saeulen' ? 'Ergebnis je Partei, nach Größe, „Sonstige“ am Ende. Vergleich als schmale helle Säule.' : spec.type === 'gewinne' ? 'Gewinne und Verluste je Partei in Prozentpunkten, gleiche Reihenfolge wie das Ergebnis.' : spec.type === 'balken' ? 'Werte je Gebiet oder Zeile, waagerecht und sortiert – gut für lange Namen.' : spec.type === 'linie' ? 'Verlauf über die Zeit; mehrere Merkmale eines Datensatzes mit Zeitachse als eigene Linien.' : 'Sitzverteilung im Halbkreis: Sitze aus einer Tabelle oder als Projektion aus Prozenten, mit Mehrheit und Koalitionen.'}</p>
      {spec.type === 'sitze' && !usable.length && <SeatTemplate />}
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
      {src?.kind === 'sitze' && ds && <SitzeOptions ds={ds} src={src} />}
      {M.empty && src && <Note kind="warn">{M.empty}</Note>}
    </Section>
    <Section title="Darstellung">
      {spec.type === 'saeulen' && M.hasCmp && <Check checked={spec.showCmp} onChange={v => setChart(c => ({ ...c, showCmp: v }))}>Vergleich als schmale Säule daneben</Check>}
      {spec.type === 'saeulen' && M.hasCmp && spec.showCmp && <Check checked={spec.keyVisible} onChange={v => setChart(c => ({ ...c, keyVisible: v }))}>Zeichenerklärung ({M.curLabel} · {M.cmpLabel})</Check>}
      {isPartyLike && <Field label="Sonstige unter"><div className="row-btns"><NumInput min={0} max={20} step={0.5} value={spec.minShare} onChange={n => setChart(c => ({ ...c, minShare: n }))} ariaLabel="Schwelle für Sonstige in Prozent" /><span className="hint">%</span></div></Field>}
      {M.seats && <SeatDisplay spec={spec} S={M.seats} />}
      {spec.type === 'sitze' && !M.seats && spec.seatEdit && <p className="hint">Von Hand gesetzte Sitze ergeben keine Verteilung. <button className="btn small ghost" onClick={() => setChart(c => ({ ...c, seatEdit: undefined }))}>Alle zurücksetzen</button></p>}
      {spec.type !== 'sitze' && <Field label="Nachkommastellen"><Seg items={[['0', '0'], ['1', '1'], ['2', '2']]} value={String(spec.decimals) as '1'} onChange={v => setChart(c => ({ ...c, decimals: +v }))} /></Field>}
      {!isPartyLike && spec.type !== 'sitze' && !(src?.kind === 'linie' && src.mode === 'werte' && src.columns.length > 1) && <Field label="Farbe"><div className="swatch-grid">{HUES.map(h => <button key={h} className={'swatch-btn' + (spec.color === h ? ' on' : '')} style={{ background: h }} onClick={() => setChart(c => ({ ...c, color: h }))} aria-label={'Farbton ' + h} />)}<ColorField value={spec.color || HUES[0]} onChange={hex => setChart(c => ({ ...c, color: hex }))} ariaLabel="Eigene Farbe" /></div></Field>}
      {!isPartyLike && M.bars.length > 1 && <Field label={spec.type === 'linie' ? 'Farbe und Name je Linie' : spec.type === 'sitze' ? 'Farbe und Name je Partei' : 'Farbe und Name je Balken'}>
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

// ---------- Sitzverteilung (M9) ----------
/** Vorlage: Sitze des 21. Bundestags (Wahl 2025) als eigene Tabelle */
function SeatTemplate() {
  const add = () => {
    const ds = tableDataset('Bundestag 2025: Sitze', ['Partei', 'Sitze'], [['CDU/CSU', '208'], ['AfD', '152'], ['SPD', '120'], ['Grüne', '85'], ['Die Linke', '64'], ['SSW', '1']]);
    ds.settings.attribution = 'Die Bundeswahlleiterin';
    ds.settings.sourceTitle = 'Bundestagswahl 2025, Sitzverteilung (amtliches Endergebnis)';
    addDataset(ds);
    if (!getDoc().chart?.source) setSource(defaultSource(getDoc(), ds, 'sitze'));
  };
  return <p className="hint"><button className="btn small" onClick={add}><Icon.sitze /> Beispiel: Bundestag 2025</button> legt die Sitze des Bundestags als eigene Tabelle an – zum Ausprobieren oder als Vorlage für eigene Zahlen.</p>;
}
function SitzeOptions({ ds, src }: { ds: Dataset; src: Extract<ChartSource, { kind: 'sitze' }> }) {
  const calc = src.calc;
  const setCalc = (p: Partial<NonNullable<typeof calc>>) => setSource({ ...src, calc: { seats: calc?.seats ?? 630, threshold: calc?.threshold ?? 5, ...p } } as ChartSource);
  const calcFields = calc && <>
    <Field label="Sitze insgesamt"><NumInput min={1} max={2000} value={calc.seats} onChange={n => setCalc({ seats: n })} ariaLabel="Zahl der Sitze" /></Field>
    <Field label="Hürde"><div className="row-btns"><NumInput min={0} max={20} step={0.5} value={calc.threshold} onChange={n => setCalc({ threshold: n })} ariaLabel="Sperrklausel in Prozent" /><span className="hint">%</span></div></Field>
    <p className="hint">Projektion nach Sainte-Laguë wie im Bundestag, ohne Grundmandate, Direktmandate und Ausnahmen (etwa SSW). Die Unterzeile sagt „Projektion“.</p>
  </>;
  if (src.from === 'tabelle') {
    const nc = numCols(ds);
    return <>
      <Field label="Spalte"><select value={src.column} onChange={e => setSource({ ...src, column: e.target.value })}>{nc.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
      <Check checked={!!calc} onChange={on => setSource({ ...src, calc: on ? { seats: 630, threshold: 5 } : null })}>Sitze aus Prozenten bzw. Stimmen berechnen</Check>
      {calcFields}
      <button className="btn small" onClick={() => setUI({ tableEdit: ds.id })}><Icon.daten /> Tabelle bearbeiten …</button>
    </>;
  }
  const groups = partyGroups(ds);
  return <>
    {groups.length > 1 && <Field label="Stimmen"><select value={src.group} onChange={e => setSource({ ...src, group: e.target.value })}>{groups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select></Field>}
    <PeriodSelect ds={ds} value={src.period} onChange={p => setSource({ ...src, period: p })} />
    <ScopeField ds={ds} scope={src.scope} onChange={s => setSource({ ...src, scope: s })} />
    {calcFields}
  </>;
}
function SeatDisplay({ spec, S }: { spec: ChartSpec; S: SeatModel }) {
  const coal = spec.coalition || [];
  const flip = (k: string, on: boolean) => setChart(c => { const x = (c.coalition || []).filter(y => y !== k); const n = on ? [...x, k] : x; return { ...c, coalition: n.length ? n : undefined }; });
  // Reihenfolge ohne Koalitions-Vorzug: so wie sie ohne Koalition stünde
  const order = S.groups.map(g => g.key);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const o = [...order]; const [k] = o.splice(from, 1); o.splice(to, 0, k);
    setChart(c => ({ ...c, seatOrder: o }));
  };
  const [drag, setDrag] = React.useState<number | null>(null);
  // Sitze von Hand: nur die abweichenden Werte werden gemerkt (seatEdit), gleich dem berechneten Wert = zurück auf automatisch
  const edit = spec.seatEdit || {}, nEdit = S.parties.filter(p => p.seats !== p.auto).length;
  const setSeats = (k: string, n: number | null) => setChart(c => { const e = { ...(c.seatEdit || {}) }; if (n == null) delete e[k]; else e[k] = Math.max(0, Math.round(n)); return { ...c, seatEdit: Object.keys(e).length ? e : undefined }; });
  return <>
    <Field label="Sitze" stack>
      <div className="ptable seat-edit">{S.parties.map(p => (
        <div key={p.key} className={'prow' + (p.seats !== p.auto ? ' edited' : '')}>
          <span className="dot" style={{ background: p.color }} /><span className="grow">{p.label}</span>
          <NumInput min={0} max={5000} value={p.seats} onChange={n => setSeats(p.key, Math.round(n) === p.auto ? null : n)} ariaLabel={`Sitze ${p.label}`} />
          <button className="btn icon ghost small" disabled={p.seats === p.auto && edit[p.key] == null} onClick={() => setSeats(p.key, null)} aria-label={`${p.label} auf ${p.auto} zurücksetzen`} title={`Zurück auf ${p.auto}`}>↺</button>
        </div>
      ))}</div>
      <p className="hint">Zusammen <b>{S.total}</b> Sitze, Mehrheit ab {S.majority}. {nEdit > 0 ? <>Von Hand geändert: {nEdit}. <button className="btn small ghost" onClick={() => setChart(c => ({ ...c, seatEdit: undefined }))}>Alle zurücksetzen</button></> : S.calc ? 'Die Zahlen kommen aus dem Rechner; hier lassen sie sich von Hand ändern, auch für Parteien unter der Hürde.' : 'Die Zahlen kommen aus der Tabelle; hier lassen sie sich von Hand ändern, ohne die Tabelle anzufassen.'}</p>
    </Field>
    <Field label="Form"><Seg items={[['punkte', 'Punkte'], ['ring', 'Halbring']] as ['punkte' | 'ring', string][]} value={spec.seatStyle || 'punkte'} onChange={v => setChart(c => ({ ...c, seatStyle: v }))} /></Field>
    <Check checked={spec.majorityOn !== false} onChange={on => setChart(c => ({ ...c, majorityOn: on }))}>Mehrheitsmarke ({S.majority} von {S.total})</Check>
    <Field label="Koalition" stack>
      <div className="ptable">{S.groups.map(g => (
        <div key={g.key} className="prow"><Check checked={coal.includes(g.key)} onChange={on => flip(g.key, on)}><span className="dot" style={{ background: g.color }} /> {g.label} <span className="hint">{g.seats}</span></Check></div>
      ))}</div>
      {S.coalition ? <p className="hint"><b>{S.coalition.seats} von {S.total} Sitzen</b> – {S.coalition.reached ? `Mehrheit (${S.majority}) erreicht` : `es fehlen ${S.majority - S.coalition.seats} zur Mehrheit (${S.majority})`}. Weitere Koalition: <button className="btn small ghost" onClick={() => duplicateGraphic(getDoc().page)}><Icon.copy size={13} /> Grafik duplizieren</button></p>
        : <p className="hint">Parteien ankreuzen: Sie stehen dann links beisammen und kräftig, die übrigen blass. In der Mitte steht ihre Summe.</p>}
    </Field>
    <Field label="Reihenfolge" stack>
      <div className="ptable seat-order">{S.groups.map((g, i) => (
        <div key={g.key} className={'prow' + (drag === i ? ' dragging' : '')} draggable onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)}
          onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (drag != null) move(drag, i); setDrag(null); }}>
          <span className="grip" aria-hidden="true">⋮⋮</span><span className="dot" style={{ background: g.color }} /><span className="grow">{g.label}</span>
          <button className="btn icon ghost small" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`${g.label} nach links`}>↑</button>
          <button className="btn icon ghost small" disabled={i === S.groups.length - 1} onClick={() => move(i, i + 1)} aria-label={`${g.label} nach rechts`}>↓</button>
        </div>
      ))}</div>
      <p className="hint">Von links nach rechts im Halbkreis; ziehen oder mit den Pfeilen verschieben. {spec.seatOrder && <button className="btn small ghost" onClick={() => setChart(c => ({ ...c, seatOrder: undefined }))}>Politisch links → rechts</button>}</p>
    </Field>
  </>;
}
