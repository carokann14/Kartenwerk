import React from 'react';
import { BL_ORDER, GEO, GEO_INDEX, LAENDER } from '../../geo/geo';
import { setFokus, setGeoSet, refitMain } from '../../model/actions';
import { setUI, update, useStore } from '../../model/store';
import type { Fokus } from '../../model/types';
import { colorModel, fillOf } from '../../render/colorModel';
import { fokusIdx, geoOf } from '../../render/scene';
import { Check, Field, Icon, Section, Seg } from '../common';

function normFokus(ids: string[], geoId: string): Fokus {
  const g = GEO[geoId];
  const u = [...new Set(ids)];
  if (!u.length || u.length === g.areas.length) return { kind: 'de' };
  if (u.length === 1) return { kind: 'area', id: u[0] };
  const set = new Set(u);
  for (const bl of BL_ORDER) { const L = g.byBl[bl] || []; if (L.length === set.size && L.every(i => set.has(g.areas[i].id))) return { kind: 'land', bl }; }
  return { kind: 'custom', ids: u.sort((a, b) => +a - +b) };
}

export function PanelGebiete() {
  const doc = useStore(s => s.doc!);
  const ui = useStore(s => s.ui);
  const g = geoOf(doc), f = doc.fokus;
  const S = new Set(fokusIdx(doc).map(i => g.areas[i].id));
  const cm = colorModel(doc);
  const expand = (bl: string, v?: boolean) => setUI({ expanded: { ...ui.expanded, [bl]: v ?? !ui.expanded[bl] } });
  const toggleIds = (ids: string[]) => {
    const cur = new Set(f.kind === 'de' ? [] : [...S]);
    const all = ids.every(id => cur.has(id));
    for (const id of ids) all ? cur.delete(id) : cur.add(id);
    setFokus(normFokus([...cur], doc.geoSet));
  };
  const q = ui.search.trim().toLowerCase();
  const hits: { t: 'land' | 'area'; key: string; label: string; aside: string }[] = [];
  if (q) {
    for (const bl of BL_ORDER) if (LAENDER[bl][0].toLowerCase().includes(q) || LAENDER[bl][1].toLowerCase() === q) hits.push({ t: 'land', key: bl, label: LAENDER[bl][0], aside: 'Land' });
    for (const i of g.all) { const a = g.areas[i]; if (a.id === q || a.name.toLowerCase().includes(q) || 'wk ' + a.id === q) hits.push({ t: 'area', key: a.id, label: a.name, aside: 'Nr. ' + a.nr }); }
  }
  const crumbs: React.ReactNode[] = [];
  crumbs.push(f.kind === 'de' ? <span key="de" className="cur">Deutschland</span> : <button key="de" onClick={() => setFokus({ kind: 'de' })}>Deutschland</button>);
  if (f.kind === 'land') crumbs.push(<span key="l" className="cur">{LAENDER[f.bl][0]}</span>);
  if (f.kind === 'area') { const i = g.byId.get(f.id); if (i != null) { const a = g.areas[i]; crumbs.push(<button key="l" onClick={() => setFokus({ kind: 'land', bl: a.bl })}>{LAENDER[a.bl][0]}</button>, <span key="a" className="cur">{a.nr} {a.name}</span>); } }
  if (f.kind === 'custom') crumbs.push(<span key="c" className="cur">Freie Auswahl ({f.ids.length})</span>);
  return (
    <>
      <Section title="Gebietsebene" aside="Stand">
        <Field label="Ebene"><select value={doc.geoSet} onChange={e => setGeoSet(e.target.value)} aria-label="Gebietsstand">
          {GEO_INDEX.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select></Field>
        <p className="hint">Gemeinden, Kreise und Landtagswahlkreise folgen in M3 und M4. Die Ebenen sind getrennte Kartensysteme mit eigenem Gebietsstand.</p>
      </Section>
      <Section title="Fokus" aside="was die Karte zeigt">
        <div className="crumbs">{crumbs.map((c, k) => <React.Fragment key={k}>{k > 0 && <span className="sep">›</span>}{c}</React.Fragment>)}</div>
        <div className="search"><Icon.search /><input type="text" id="fokus-search" value={ui.search} onChange={e => setUI({ search: e.target.value })} placeholder="Name, Nummer oder Land" autoComplete="off" aria-label="Gebiet suchen" /></div>
        {q && <div className="tree">{hits.slice(0, 9).map(h => (
          <div key={h.t + h.key} className="tnode" onClick={() => { if (h.t === 'land') { expand(h.key, true); setFokus({ kind: 'land', bl: h.key }); } else setFokus({ kind: 'area', id: h.key }); }}>
            <span /><span /><span className="tl">{h.label}</span><span className="ta">{h.aside}</span>
          </div>))}
          {!hits.length && <p className="hint">Kein Treffer. Gesucht werden Name, Nummer und Land.</p>}
        </div>}
      </Section>
      <Section title="Gebietsbaum" aside={GEO[doc.geoSet].meta.label}>
        <p className="hint">Name anklicken = dorthin wechseln. Häkchen = Gebiete frei kombinieren, auch über Ländergrenzen.</p>
        <div className="tree">
          <div className={'tnode' + (f.kind === 'de' ? ' cur' : '')} onClick={() => setFokus({ kind: 'de' })}>
            <span /><input type="checkbox" readOnly checked={f.kind === 'de'} tabIndex={-1} aria-label="Deutschland" /><span className="tl"><b>Deutschland</b></span><span className="ta">{g.areas.length}</span>
          </div>
          {BL_ORDER.map(bl => {
            const idx = g.byBl[bl] || []; const ids = idx.map(i => g.areas[i].id);
            const n = ids.filter(id => S.has(id)).length, open = ui.expanded[bl];
            return (
              <React.Fragment key={bl}>
                <div className={'tnode lvl1' + (f.kind === 'land' && f.bl === bl ? ' cur' : '')}>
                  <button className={'tw' + (open ? ' open' : '')} onClick={() => expand(bl)} aria-label={(open ? 'zuklappen: ' : 'aufklappen: ') + LAENDER[bl][0]}><Icon.chev size={12} /></button>
                  <input type="checkbox" checked={f.kind !== 'de' && n === ids.length} ref={el => { if (el) el.indeterminate = f.kind !== 'de' && n > 0 && n < ids.length; }} onChange={() => toggleIds(ids)} aria-label={LAENDER[bl][0] + ' kombinieren'} />
                  <span className="tl" onClick={() => { expand(bl, true); setFokus({ kind: 'land', bl }); }}>{LAENDER[bl][0]}</span><span className="ta">{ids.length}</span>
                </div>
                {open && idx.map(i => { const a = g.areas[i]; return (
                  <div key={a.id} className={'tnode lvl2' + (f.kind === 'area' && f.id === a.id ? ' cur' : '')}>
                    <span /><input type="checkbox" checked={f.kind !== 'de' && S.has(a.id)} onChange={() => toggleIds([a.id])} aria-label={a.name + ' kombinieren'} />
                    <span className="tl" title={a.name} onClick={() => setFokus({ kind: 'area', id: a.id })}><span className="num" style={{ color: 'var(--muted)' }}>{a.nr}</span> {a.name}</span>
                    <span className="sw" style={{ background: fillOf(doc, cm, i) }} />
                  </div>); })}
              </React.Fragment>
            );
          })}
        </div>
      </Section>
      <Section title="Umfeld">
        <Seg full items={[['none', 'Keins'], ['neighbors', 'Nachbarn'], ['parent', 'Übergeordnet'], ['all', 'Alles']]} value={doc.umfeld} onChange={v => update(d => { d.umfeld = v; })} />
        <Seg full items={[['fill', 'Ausgegraut'], ['lines', 'Nur Grenzen']]} value={doc.umfeldStyle} onChange={v => update(d => { d.umfeldStyle = v; })} />
        <Check checked={doc.fokusOutline} onChange={v => update(d => { d.fokusOutline = v; })}>Umriss um den Fokus zeichnen</Check>
      </Section>
      <Section title="Ausschnitt">
        <div className="row-btns"><button className="btn" onClick={refitMain}><Icon.fit /> Auf Fokus einpassen</button><button className="btn" onClick={() => setUI({ mapMode: 'main', sel: { kind: 'frame', id: 'main' } })}><Icon.target /> Kartenmodus</button></div>
        <p className="hint"><b>Doppelklick auf die Karte</b> startet den Kartenmodus: Mausrad zoomt, Ziehen verschiebt, <span className="kbd">Esc</span> beendet. Im Kartenmodus geht ein Doppelklick auf ein Gebiet eine Ebene tiefer.</p>
      </Section>
    </>
  );
}
