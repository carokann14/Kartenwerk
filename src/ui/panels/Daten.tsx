import React, { useMemo, useState } from 'react';
import { fmt1, fmtInt } from '../../lib/util';
import { areaRowIndex, groupMetrics } from '../../data/derive';
import { PRESET_LABELS } from '../../data/pipeline';
import { datasetFor, dsLabel } from '../../data/aggregate';
import type { Dataset } from '../../data/types';
import { periodText, periodYear, selectedPeriod } from '../../data/time';
import type { TimeAxis } from '../../data/types';
/** „Zeitreihe 2015–2025“, bei nur einem Zeitpunkt „Stichtag 31.12.2024“ bzw. „Jahr 2024“ */
const timeSpan = (x: TimeAxis) => x.periods.length > 1 ? `Zeitreihe ${periodYear(x.periods[0])}–${periodYear(x.periods[x.periods.length - 1])}` : `${x.label} ${periodText(x.periods[0])}`;
import { countLabel } from '../../geo/geo';
import { GEO } from '../../geo/geo';
import { removeDataset, setGeoSet, showDataset } from '../../model/actions';
import { ensureSeatLegend } from '../../model/layout';
import { setUI, update, useStore } from '../../model/store';
import { colorModel, fillOf, partyColor } from '../../render/colorModel';
import { geoOf } from '../../render/scene';
import { Icon, Note, Section } from '../common';
import { isChart } from '../../model/graphicKeys';
import { addGraphic } from '../../model/graphics';
import { chartTexts, defaultSource, typeFor } from '../../render/chartSource';
import type { Doc } from '../../model/types';

/** Diagramm der aktiven Grafik auf diesen Datensatz umstellen */
function useInChart(id: string) {
  update(d => {
    const plain = d as unknown as Doc, ds = plain.datasets.find(x => x.id === id); if (!ds || !d.chart) return;
    const src = defaultSource(plain, ds, d.chart.type); if (!src) return;
    const old = chartTexts(plain, d.chart as never);
    d.chart.source = src as never; d.chart.type = typeFor(src, d.chart.type);
    const tx = chartTexts(plain, d.chart as never);
    if (tx && (!old || d.texts.title.text === old.title || /^Titel der Grafik/.test(d.texts.title.text))) d.texts.title.text = tx.title;
    if (tx && (!old || d.texts.subtitle.text === old.subtitle || /^Unterzeile: /.test(d.texts.subtitle.text))) d.texts.subtitle.text = tx.subtitle;
    ensureSeatLegend(d);
  });
}
/** Datensatz ohne Gebiet (eigene Tabelle, Deutschland-Werte) */
function NoGeoCard({ doc, d, used }: { doc: Doc; d: Dataset; used: boolean }) {
  const own = d.preset === 'eigene';
  return <div className={'card ds' + (used ? ' used' : '')}>
    <div className="ds-head"><h4>{dsLabel(doc, d)}</h4>{used && <span className="chip accent">im Diagramm</span>}</div>
    <p className="hint">{own ? 'Eigene Tabelle' : d.fileName + ' · ' + PRESET_LABELS[d.preset]} · ohne Gebiet, für Diagramme</p>
    <div className="meta-row"><span className="chip ok"><span className="dot" />{d.rows.length} {d.rows.length === 1 ? 'Zeile' : 'Zeilen'} · {d.columns.filter(c => c.kind === 'number').length} Werte-Spalten</span>
      {d.time && <span className="chip">{timeSpan(d.time)}</span>}</div>
    <div className="row-btns">
      {isChart(doc) && !used && <button className="btn small primary" onClick={() => useInChart(d.id)}><Icon.diagramm /> Im Diagramm zeigen</button>}
      {!isChart(doc) && <button className="btn small primary" onClick={() => addGraphic('chart', 'saeulen', d.id)}><Icon.diagramm /> Diagramm anlegen</button>}
      {own && <button className="btn small" onClick={() => setUI({ tableEdit: d.id })}><Icon.daten /> Bearbeiten …</button>}
      <button className="btn small ghost" onClick={() => setUI({ tableDataset: d.id })}>Tabelle</button>
      <button className="btn small ghost" onClick={() => setUI({ suggest: d.id })}>Passende Grafiken …</button>
      <button className="btn small ghost danger" onClick={() => removeDataset(d.id)} aria-label={'Datensatz ' + d.name + ' entfernen'}><Icon.trash /></button>
    </div>
  </div>;
}
/** Einfache Tabelle (Datensätze ohne Gebiet) */
function PlainTable({ ds }: { ds: Dataset }) {
  return <div className="dtable-wrap"><div className="dtable-scroll"><table className="dtable">
    <thead><tr>{ds.columns.map(c => <th key={c.id} className={c.kind === 'number' ? 'r' : ''}>{c.label}</th>)}</tr></thead>
    <tbody>{ds.rows.slice(0, 300).map((r, i) => <tr key={i}>{ds.columns.map((c, k) => <td key={c.id} className={c.kind === 'number' ? 'r num' : 'nm'}>{c.kind === 'number' ? fmtCell(r[k]) : String(r[k] ?? '')}</td>)}</tr>)}</tbody>
  </table></div></div>;
}
const fmtCell = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('de-DE', { maximumFractionDigits: 2 }) : v == null ? '–' : String(v));

export function PanelDaten() {
  const doc = useStore(s => s.doc!);
  const ui = useStore(s => s.ui);
  const cm = colorModel(doc);
  const g = geoOf(doc);
  const chart = isChart(doc);
  const src = doc.datasets.find(d => d.id === (ui.tableDataset || cm.dataset?.id)) || doc.datasets[0];
  const active = src ? (src.geoSet ? datasetFor(doc, src.id) : src) : undefined;   // auf gröberen Ebenen: summierte Tabelle
  const grp = active && (cm.dataset?.id === active.id && cm.group ? cm.group : active.groups[0]);
  const rows = useMemo(() => {
    if (!active || !GEO[active.geoSet]) return [];
    const ix = areaRowIndex(active), G = GEO[active.geoSet];
    const gm = grp ? groupMetrics(active, grp) : null;
    return G.all.filter(i => !(G.memberOf && G.areas[i].free)).map(i => {   // Restflächen eigener Einteilungen haben nie Daten
      const a = G.areas[i], r = ix.get(a.id);
      const m = r != null && gm ? gm[r] : null;
      const col = m && m.win >= 0 ? active.columns.find(c => c.id === grp!.columns[m.win]) : null;
      return { i, id: a.id, nr: a.nr, name: a.name, has: r != null, win: col ? (col.short || col.label.split(' · ')[0]) : '', party: col?.party || null, share: m?.winShare ?? null, margin: m?.margin ?? null };
    });
  }, [active, grp]);
  const { k, dir } = ui.tableSort;
  const sorted = [...rows].sort((a, b) => { const x = (a as Record<string, unknown>)[k], y = (b as Record<string, unknown>)[k]; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'string' ? (x as string).localeCompare(y as string, 'de') : (x as number) - (y as number)) * dir; });
  const sel = new Set(ui.sel.kind === 'area' ? ui.sel.ids : []);
  const [flt, setFlt] = useState(''), [lim, setLim] = useState(300);
  const G = active ? GEO[active.geoSet] : g, showNr = !!G?.meta.showNr;
  const fq = flt.trim().toLowerCase();
  const shown = fq ? sorted.filter(r => r.name.toLowerCase().includes(fq) || r.id.startsWith(fq) || r.win.toLowerCase() === fq) : sorted;
  const th = (key: string, label: string, r?: boolean) => <th className={r ? 'r' : ''} onClick={() => setUI({ tableSort: { k: key, dir: ui.tableSort.k === key ? -dir : (['nr', 'name', 'win'].includes(key) ? 1 : -1) } })} aria-sort={ui.tableSort.k === key ? (dir > 0 ? 'ascending' : 'descending') : 'none'}>{label}{ui.tableSort.k === key ? (dir > 0 ? ' ↑' : ' ↓') : ''}</th>;
  return (
    <>
      <Section title="Datensätze" aside={`${doc.datasets.length} im Projekt`}>
        <div className="row-btns">
          <button className="btn primary" onClick={() => setUI({ wizard: { mode: 'new' } })}><Icon.upload /> Datei importieren …</button>
          <button className="btn" onClick={() => setUI({ katalog: true })} title="Amtliche Kennzahlen (Bevölkerung, Arbeitslosenquote, Wahlen) für Kreise und Länder, mit allen Jahren"><Icon.katalog /> Aus dem Katalog …</button>
          <button className="btn" onClick={() => setUI({ tableEdit: 'new' })} title="Kleine Tabelle eintippen oder aus Excel einfügen, für Diagramme"><Icon.daten /> Neue Tabelle …</button>
        </div>
        {doc.datasets.length > 1 && <p className="hint">Welcher Datensatz die Karte färbt, wechselst du mit „Karte damit färben“ oder oben im Schritt „Färbung“.</p>}
        {!doc.datasets.length && <p className="hint">CSV oder Excel. Für Wahlergebnisse der Bundeswahlleiterin gibt es fertige Vorlagen, Beispieldateien findest du im Importassistenten.</p>}
        {doc.datasets.map(d => {
          const r = d.report, chartDs = doc.chart?.source?.dataset;
          if (!d.geoSet) return <NoGeoCard key={d.id} doc={doc} d={d} used={chart && chartDs === d.id} />;
          const used = chart ? chartDs === d.id : cm.dataset?.id === d.id, sum = datasetFor(doc, d.id)!.derived, other = d.geoSet !== doc.geoSet && !sum;
          const open = r.ambiguous + r.unknown + r.duplicate;
          return (
            <div key={d.id} className={'card ds' + (used ? ' used' : '')}>
              <div className="ds-head"><h4>{dsLabel(doc, d)}</h4>{used && <span className="chip accent">{chart ? 'im Diagramm' : 'färbt die Karte'}</span>}</div>
              <p className="hint">{d.fileName} · {PRESET_LABELS[d.preset]} · {GEO[d.geoSet]?.meta.label}</p>
              <div className="meta-row">
                <span className={'chip ' + (open ? 'warn' : 'ok')}><span className="dot" />{r.exact + r.byName + r.ruled - r.ignored} von {GEO[d.geoSet]?.areas.length} zugeordnet</span>
                {d.time && <span className="chip" title={`${d.time.label}: ${d.time.periods.map(periodText).join(', ')}`}>{timeSpan(d.time)}{used && selectedPeriod(doc.periodSel, d) !== d.time.periods[d.time.periods.length - 1] ? ` · Karte: ${periodText(selectedPeriod(doc.periodSel, d)!)}` : ''}</span>}
                {r.summary > 0 && <span className="chip">{r.summary} Summenzeilen ausgeschlossen</span>}
                {r.byName > 0 && <span className="chip">{r.byName} über Namen</span>}
                {open > 0 && <span className="chip err">{open} offen</span>}
                {r.missing.length > 0 && <span className="chip warn">{r.missing.length} Gebiete ohne Daten</span>}
                {sum && <span className="chip accent" title={`${sum.sources.toLocaleString('de-DE')} ${GEO[d.geoSet]?.meta.levelLabel} → ${sum.targets.toLocaleString('de-DE')} ${g.meta.levelLabel}`}>auf {g.meta.levelLabel} summiert</span>}
              </div>
              <div className="row-btns">
                {chart && !used && <button className="btn small primary" onClick={() => useInChart(d.id)}><Icon.diagramm /> Im Diagramm zeigen</button>}
                {!chart && !used && <button className="btn small primary" onClick={() => void showDataset(d.id)} title={other ? 'Karte auf „' + GEO[d.geoSet]?.meta.label + '“ umstellen und damit färben' : 'Die Karte mit diesem Datensatz färben; Darstellung und Optionen bleiben'}><Icon.faerbung /> Karte damit färben</button>}
                <button className="btn small" onClick={() => setUI({ wizard: { mode: 'replace', datasetId: d.id } })} title="Neue Version derselben Datei laden, Gestaltung bleibt"><Icon.refresh /> Daten ersetzen …</button>
                <button className="btn small ghost" onClick={() => setUI({ tableDataset: d.id })}>Tabelle</button>
                <button className="btn small ghost" onClick={() => setUI({ suggest: d.id })} title="Karten und Diagramme vorschlagen, die zu diesem Datensatz passen">Passende Grafiken …</button>
                {!chart && other && used && <button className="btn small ghost" onClick={() => setGeoSet(d.geoSet)} title={'Karte auf „' + GEO[d.geoSet]?.meta.label + '“ umstellen'}>Karte auf {GEO[d.geoSet]?.meta.levelLabel} {GEO[d.geoSet]?.meta.year}</button>}
                <button className="btn small ghost danger" onClick={() => removeDataset(d.id)} aria-label={'Datensatz ' + d.name + ' entfernen'}><Icon.trash /></button>
              </div>
            </div>
          );
        })}
      </Section>
      {active && !GEO[active.geoSet] && <Section title="Tabelle" aside={active.name}><PlainTable ds={active} /></Section>}
      {active && GEO[active.geoSet] && <Section title="Tabelle" aside={`${active.name} · nur lesen`}>
        {active.geoSet !== doc.geoSet && <Note kind="warn">Dieser Datensatz gehört zu „{GEO[active.geoSet].meta.label}“. Die Karte zeigt „{g.meta.label}“.</Note>}
        {active.derived && <DerivedNote ds={active} />}
        {grp && <p className="hint">Abgeleitet aus der Gruppe <b>{grp.label}</b>: stärkste Spalte, ihr Anteil und der Vorsprung auf Platz 2.</p>}
        {rows.length > 60 && <div className="search"><Icon.search /><input type="text" value={flt} onChange={e => setFlt(e.target.value)} placeholder={showNr ? 'Name, Nummer oder Partei' : 'Name, Schlüssel oder Partei'} aria-label="Tabelle filtern" /></div>}
        <div className="dtable-wrap"><div className="dtable-scroll"><table className="dtable">
          <thead><tr>{th('nr', showNr ? 'Nr.' : 'Schlüssel', true)}{th('name', 'Gebiet')}{grp && th('win', 'Stärkste')}{grp && th('share', '%', true)}{grp && th('margin', 'Vorspr.', true)}</tr></thead>
          <tbody>{shown.slice(0, lim).map(r => (
            <tr key={r.id} className={(sel.has(r.id) ? 'sel' : '') + (r.has ? '' : ' nodata')} onClick={() => setUI({ sel: { kind: 'area', ids: [r.id] } })}>
              <td className="r num">{showNr ? r.nr : r.id}</td><td className="nm" title={r.name}>{r.name}</td>
              {grp && <td>{r.has ? <><span className="sw" style={{ background: r.party ? partyColor(doc, r.party) : fillOf(doc, cm, r.i) }} />{r.win}</> : <span className="hint">keine Daten</span>}</td>}
              {grp && <td className="r num">{fmt1(r.share)}</td>}{grp && <td className="r num">{fmt1(r.margin)}</td>}
            </tr>))}</tbody>
        </table></div></div>
        {shown.length > lim && <button className="btn small ghost" onClick={() => setLim(lim + 1000)}>{shown.length - lim} weitere Zeilen zeigen</button>}
      </Section>}
    </>
  );
}
/** Hinweis zu summierten Daten: woraus, was fehlt, was nicht addierbar ist */
export function DerivedNote({ ds }: { ds: Dataset }) {
  const x = ds.derived!, lv = GEO[x.from]?.meta.level || '';
  return <Note>Summiert aus {countLabel(x.sources, lv)} ({GEO[x.from]?.meta.label}).
    {x.unassigned > 0 && <> {countLabel(x.unassigned, lv)} liegen in keiner Region.</>}
    {x.partial > 0 && <> In {x.partial} {x.partial === 1 ? 'Gebiet fehlen' : 'Gebieten fehlen'} Daten einzelner {countLabel(2, lv).replace(/^2 /, '')}.</>}
    {x.split > 0 && <> {x.split} gemeinsam ausgezählte {x.split === 1 ? 'Gruppe reicht' : 'Gruppen reichen'} über mehrere Gebiete und {x.split === 1 ? 'zählt' : 'zählen'} ganz zum größten Teil.</>}
    {x.rates.length > 0 && <> Nicht addierbar und leer: {x.rates.slice(0, 4).join(', ')}{x.rates.length > 4 ? ' …' : ''}.</>}</Note>;
}
export { fmtInt };
