import React, { useMemo } from 'react';
import { fmt1, fmtInt } from '../../lib/util';
import { areaRowIndex, groupMetrics } from '../../data/derive';
import { PRESET_LABELS } from '../../data/pipeline';
import { GEO } from '../../geo/geo';
import { removeDataset, setGeoSet } from '../../model/actions';
import { setUI, update, useStore } from '../../model/store';
import { colorModel, fillOf, partyColor } from '../../render/colorModel';
import { geoOf } from '../../render/scene';
import { Icon, Note, Section } from '../common';

export function PanelDaten() {
  const doc = useStore(s => s.doc!);
  const ui = useStore(s => s.ui);
  const cm = colorModel(doc);
  const g = geoOf(doc);
  const active = doc.datasets.find(d => d.id === (ui.tableDataset || cm.dataset?.id)) || doc.datasets[0];
  const grp = active && (cm.dataset?.id === active.id && cm.group ? cm.group : active.groups[0]);
  const rows = useMemo(() => {
    if (!active) return [];
    const ix = areaRowIndex(active), G = GEO[active.geoSet];
    const gm = grp ? groupMetrics(active, grp) : null;
    return G.all.map(i => {
      const a = G.areas[i], r = ix.get(a.id);
      const m = r != null && gm ? gm[r] : null;
      const col = m && m.win >= 0 ? active.columns.find(c => c.id === grp!.columns[m.win]) : null;
      return { i, id: a.id, nr: a.nr, name: a.name, has: r != null, win: col ? (col.short || col.label.split(' · ')[0]) : '', party: col?.party || null, share: m?.winShare ?? null, margin: m?.margin ?? null };
    });
  }, [active, grp]);
  const { k, dir } = ui.tableSort;
  const sorted = [...rows].sort((a, b) => { const x = (a as Record<string, unknown>)[k], y = (b as Record<string, unknown>)[k]; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'string' ? (x as string).localeCompare(y as string, 'de') : (x as number) - (y as number)) * dir; });
  const sel = new Set(ui.sel.kind === 'area' ? ui.sel.ids : []);
  const th = (key: string, label: string, r?: boolean) => <th className={r ? 'r' : ''} onClick={() => setUI({ tableSort: { k: key, dir: ui.tableSort.k === key ? -dir : (['nr', 'name', 'win'].includes(key) ? 1 : -1) } })} aria-sort={ui.tableSort.k === key ? (dir > 0 ? 'ascending' : 'descending') : 'none'}>{label}{ui.tableSort.k === key ? (dir > 0 ? ' ↑' : ' ↓') : ''}</th>;
  return (
    <>
      <Section title="Datensätze" aside={`${doc.datasets.length} im Projekt`}>
        <button className="btn primary" onClick={() => setUI({ wizard: { mode: 'new' } })}><Icon.upload /> Datei importieren …</button>
        {!doc.datasets.length && <p className="hint">CSV oder Excel. Für Wahlergebnisse der Bundeswahlleiterin gibt es fertige Vorlagen, Beispieldateien findest du im Importassistenten.</p>}
        {doc.datasets.map(d => {
          const r = d.report, used = cm.dataset?.id === d.id, other = d.geoSet !== doc.geoSet;
          const open = r.ambiguous + r.unknown + r.duplicate;
          return (
            <div key={d.id} className={'card ds' + (used ? ' used' : '')}>
              <div className="ds-head"><h4>{d.name}</h4>{used && <span className="chip accent">färbt die Karte</span>}</div>
              <p className="hint">{d.fileName} · {PRESET_LABELS[d.preset]} · {GEO[d.geoSet]?.meta.label}</p>
              <div className="meta-row">
                <span className={'chip ' + (open ? 'warn' : 'ok')}><span className="dot" />{r.exact + r.byName + r.ruled - r.ignored} von {GEO[d.geoSet]?.areas.length} zugeordnet</span>
                {r.summary > 0 && <span className="chip">{r.summary} Summenzeilen ausgeschlossen</span>}
                {r.byName > 0 && <span className="chip">{r.byName} über Namen</span>}
                {open > 0 && <span className="chip err">{open} offen</span>}
                {r.missing.length > 0 && <span className="chip warn">{r.missing.length} Gebiete ohne Daten</span>}
              </div>
              <div className="row-btns">
                <button className="btn small" onClick={() => setUI({ wizard: { mode: 'replace', datasetId: d.id } })} title="Neue Version derselben Datei laden, Gestaltung bleibt"><Icon.refresh /> Daten ersetzen …</button>
                <button className="btn small ghost" onClick={() => setUI({ tableDataset: d.id })}>Tabelle</button>
                {other && <button className="btn small ghost" onClick={() => setGeoSet(d.geoSet)}>Karte auf {GEO[d.geoSet]?.meta.year}</button>}
                <button className="btn small ghost danger" onClick={() => removeDataset(d.id)} aria-label={'Datensatz ' + d.name + ' entfernen'}><Icon.trash /></button>
              </div>
            </div>
          );
        })}
      </Section>
      {active && <Section title="Tabelle" aside={`${active.name} · nur lesen`}>
        {active.geoSet !== doc.geoSet && <Note kind="warn">Dieser Datensatz gehört zu „{GEO[active.geoSet].meta.label}“. Die Karte zeigt „{g.meta.label}“.</Note>}
        {grp && <p className="hint">Abgeleitet aus der Gruppe <b>{grp.label}</b>: stärkste Spalte, ihr Anteil und der Vorsprung auf Platz 2.</p>}
        <div className="dtable-wrap"><div className="dtable-scroll"><table className="dtable">
          <thead><tr>{th('nr', 'Nr.', true)}{th('name', 'Gebiet')}{grp && th('win', 'Stärkste')}{grp && th('share', '%', true)}{grp && th('margin', 'Vorspr.', true)}</tr></thead>
          <tbody>{sorted.map(r => (
            <tr key={r.id} className={(sel.has(r.id) ? 'sel' : '') + (r.has ? '' : ' nodata')} onClick={() => setUI({ sel: { kind: 'area', ids: [r.id] } })}>
              <td className="r num">{r.nr}</td><td className="nm" title={r.name}>{r.name}</td>
              {grp && <td>{r.has ? <><span className="sw" style={{ background: r.party ? partyColor(doc, r.party) : fillOf(doc, cm, r.i) }} />{r.win}</> : <span className="hint">keine Daten</span>}</td>}
              {grp && <td className="r num">{fmt1(r.share)}</td>}{grp && <td className="r num">{fmt1(r.margin)}</td>}
            </tr>))}</tbody>
        </table></div></div>
      </Section>}
    </>
  );
}
export { fmtInt };
