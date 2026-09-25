import React, { useEffect } from 'react';
import { BL_ORDER, GEO, GEO_INDEX, GeoSet, LAENDER, areaContext, areaLabel } from '../../geo/geo';
import { toggleOverlay } from '../../model/overlays';
import { setFokus, setGeoSet, refitMain } from '../../model/actions';
import { setUI, update, useStore } from '../../model/store';
import type { Fokus } from '../../model/types';
import { colorModel, fillOf } from '../../render/colorModel';
import { fokusIdx, geoOf, allLabel } from '../../render/scene';
import { ImportGeoButton, UserGeoSection } from './Geodaten';
import { sisterSets, translateFokus } from '../../geo/relate';
import { Check, GeoPicker, Icon, Section, Seg } from '../common';
import { RegionsSection } from './Regionen';
import { customOptions } from '../../model/regionActions';

function normFokus(ids: string[], geoId: string): Fokus {
  const g = GEO[geoId];
  const u = [...new Set(ids)];
  if (!u.length || u.length === g.areas.length) return { kind: 'de' };
  if (u.length === 1) return { kind: 'area', id: u[0] };
  const set = new Set(u);
  if (!g.memberOf) for (const bl of BL_ORDER) { const L = g.byBl[bl] || []; if (L.length === set.size && L.every(i => set.has(g.areas[i].id))) return { kind: 'land', bl }; }
  const kr = g.areas[g.byId.get(u[0])!]?.kr;
  if (kr) { const L = g.byKr[kr] || []; if (L.length === set.size && L.every(i => set.has(g.areas[i].id))) return { kind: 'kreis', kr }; }
  return { kind: 'custom', ids: u.sort((a, b) => +a - +b || a.localeCompare(b)) };
}
/** Kreise eines Landes, wenn die Ebene darunter liegt (Gemeinden, Gemeindeverbände) */
const kreiseOf = (g: GeoSet, bl: string) => g.meta.level === 'krs' || !Object.keys(g.byKr).length ? null
  : Object.keys(g.byKr).filter(k => g.areas[g.byKr[k][0]]?.bl === bl).sort((a, b) => (g.krName[a] || a).localeCompare(g.krName[b] || b, 'de'));

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
  // Auswahl in der Karte → Baum aufklappen und hinscrollen
  const selIds = new Set(ui.sel.kind === 'area' ? ui.sel.ids : []);
  const selOne = ui.sel.kind === 'area' && ui.sel.ids.length === 1 ? ui.sel.ids[0] : null;
  useEffect(() => {
    if (!selOne) return;
    const i = g.byId.get(selOne); if (i == null) return;
    const a = g.areas[i], ex = { ...ui.expanded, [a.bl]: true, ...(a.kr && g.meta.level !== 'krs' ? { ['kr:' + a.kr]: true } : {}) };
    if (Object.keys(ex).some(k => !ui.expanded[k])) setUI({ expanded: ex });
    requestAnimationFrame(() => document.querySelector(`[data-tree-id="${selOne}"]`)?.scrollIntoView({ block: 'nearest' }));
  }, [selOne, doc.geoSet]); // eslint-disable-line
  const q = ui.search.trim().toLowerCase();
  const hits: { t: 'land' | 'kreis' | 'area' | 'other'; key: string; label: string; aside: string; pre: number; set?: string }[] = [];
  if (q) {
    for (const bl of BL_ORDER) { const ln = LAENDER[bl][0].toLowerCase(); if (ln.includes(q) || LAENDER[bl][1].toLowerCase() === q) hits.push({ t: 'land', key: bl, label: LAENDER[bl][0], aside: 'Land', pre: ln === q || LAENDER[bl][1].toLowerCase() === q ? 0 : ln.startsWith(q) ? 1 : 2 }); }
    if (g.meta.level !== 'krs') for (const [kr, nm] of Object.entries(g.krName)) if ((g.byKr[kr]?.length || 0) > 1 && nm.toLowerCase().includes(q)) hits.push({ t: 'kreis', key: kr, label: nm, aside: 'Kreis · ' + LAENDER[kr.slice(0, 2)]?.[1], pre: nm.toLowerCase() === q ? 0 : nm.toLowerCase().startsWith(q) ? 1 : 2 });
    for (const i of g.all) { const a = g.areas[i], nm = a.name.toLowerCase(); if (a.id === q || nm.includes(q) || 'wk ' + a.id === q) hits.push({ t: 'area', key: a.id, label: a.name, aside: g.meta.showNr ? 'Nr. ' + a.nr : areaContext(g, i), pre: a.id === q || nm === q ? 0 : nm.startsWith(q) ? 1 : 2 }); }
    // andere Ebenen (geladene): „Wahlkreis 156“ in einer Gemeindekarte → Gemeinden in diesem Wahlkreis
    for (const x of sisterSets(g)) {   // (eigene Einteilungen nicht: deren Regionen stehen in der Liste darunter)
      const o = GEO[x.id]; if (!o || o === g || o.meta.level === 'lan') continue;
      if (o.meta.level !== 'btw-wk' && (Object.keys(g.byKr).length || o.meta.level === 'vwg')) continue;   // Kreise stehen schon oben
      let n = 0;
      for (const i of o.all) {
        const a = o.areas[i], nm = a.name.toLowerCase();
        if (!(nm.includes(q) || (o.meta.showNr && (String(a.nr) === q || 'wk ' + a.nr === q)))) continue;
        hits.push({ t: 'other', key: a.id, set: x.id, label: areaLabel(o, i), aside: o.meta.label, pre: 3 + (nm === q || String(a.nr) === q ? 0 : 1) });
        if (++n >= 4) break;
      }
    }
    hits.sort((x, y) => x.pre - y.pre);
  }
  const crumbs: React.ReactNode[] = [];
  crumbs.push(f.kind === 'de' ? <span key="de" className="cur">{allLabel(g)}</span> : <button key="de" onClick={() => setFokus({ kind: 'de' })}>{allLabel(g)}</button>);
  if (f.kind === 'land') crumbs.push(<span key="l" className="cur">{LAENDER[f.bl][0]}</span>);
  if (f.kind === 'kreis') crumbs.push(<button key="l" onClick={() => setFokus({ kind: 'land', bl: f.kr.slice(0, 2) })}>{LAENDER[f.kr.slice(0, 2)]?.[0]}</button>, <span key="k" className="cur">{g.krName[f.kr] || f.kr}</span>);
  if (f.kind === 'area') { const i = g.byId.get(f.id); if (i != null) { const a = g.areas[i]; if (g.meta.level !== 'lan' && !g.memberOf) crumbs.push(<button key="l" onClick={() => setFokus({ kind: 'land', bl: a.bl })}>{LAENDER[a.bl][0]}</button>);
    if (a.kr && (g.byKr[a.kr]?.length || 0) > 1 && g.meta.level !== 'krs') crumbs.push(<button key="k" onClick={() => setFokus({ kind: 'kreis', kr: a.kr! })}>{g.krName[a.kr] || a.kr}</button>);
    crumbs.push(<span key="a" className="cur">{areaLabel(g, i)}</span>); } }
  if (f.kind === 'custom') crumbs.push(<span key="c" className="cur">{f.label ? `${f.label} · ${f.ids.length} ${g.meta.levelLabel}` : `Freie Auswahl (${f.ids.length})`}</span>);
  return (
    <>
      <Section title="Gebietsebene" aside="Stand">
        <GeoPicker value={doc.geoSet} onChange={id => { void setGeoSet(id); }} customs={customOptions(doc)} />
        <div className="row-btns"><ImportGeoButton /></div>
        <details className="hint-more"><summary>Warum mehrere Stände?</summary><p className="hint">Gemeinde- und Kreisgrenzen ändern sich zum Jahreswechsel (Fusionen, neue kreisfreie Städte). Daten passen zu den Grenzen ihres Stichtags: die Bundestagswahl 2025 zum Stand 2025, Landtagswahlen 2026 und aktuelle Statistiken zu 2026. Beim Import schlägt Kartenwerk den passenden Stand vor.</p></details>
      </Section>
      <Section title="Fokus" aside="was die Karte zeigt">
        <div className="crumbs">{crumbs.map((c, k) => <React.Fragment key={k}>{k > 0 && <span className="sep">›</span>}{c}</React.Fragment>)}</div>
        <div className="level-chips" role="group" aria-label="Fokus als andere Ebene zeigen"><span className="hint">zeigen als</span>
          {sisterSets(g, doc).map((x, k, all) => <React.Fragment key={x.id}>{x.region && all[k - 1]?.region !== x.region && <span className="hint chip-group">{x.region}:</span>}<button className={'chip-btn' + (x.id === doc.geoSet ? ' on' : '') + (x.custom ? ' custom' : '')} aria-pressed={x.id === doc.geoSet} aria-label={(x.region ? x.region + ': ' : '') + x.label} onClick={() => { if (x.id !== doc.geoSet) void setGeoSet(x.id); }}>{x.label}</button></React.Fragment>)}</div>
        <div className="search"><Icon.search /><input type="text" id="fokus-search" value={ui.search} onChange={e => setUI({ search: e.target.value })}  placeholder={g.meta.showNr ? 'Name, Nummer oder Land' : 'Name, Kreis, Schlüssel oder Land'} autoComplete="off" aria-label="Gebiet suchen" /></div>
        {q && <div className="tree">{hits.slice(0, 12).map(h => (
          <div key={h.t + h.key} className="tnode" onClick={() => { if (h.t === 'land') { expand(h.key, true); setFokus({ kind: 'land', bl: h.key }); } else if (h.t === 'kreis') { setUI({ expanded: { ...ui.expanded, [h.key.slice(0, 2)]: true, ['kr:' + h.key]: true } }); setFokus({ kind: 'kreis', kr: h.key }); } else if (h.t === 'other') { const o = GEO[h.set!]; setFokus(translateFokus({ kind: 'area', id: h.key }, o, g)); } else setFokus({ kind: 'area', id: h.key }); }}>
            <span /><span /><span className="tl">{h.label}</span><span className="ta">{h.aside}</span>
          </div>))}
          {hits.length > 12 && <p className="hint">{hits.length - 12} weitere Treffer, Suche genauer fassen.</p>}
          {!hits.length && <p className="hint">Kein Treffer. Gesucht werden Name, {g.meta.showNr ? 'Nummer' : 'Kreis, Schlüssel'} und Land.</p>}
        </div>}
      </Section>
      <UserGeoSection />
      <RegionsSection />
      <Section title="Gebietsbaum" aside={GEO[doc.geoSet].meta.label}>
        <p className="hint">Name anklicken = dorthin wechseln. Häkchen = Gebiete frei kombinieren, auch über Ländergrenzen.</p>
        <div className="tree">
          <div className={'tnode' + (f.kind === 'de' ? ' cur' : '')} onClick={() => setFokus({ kind: 'de' })}>
            <span /><input type="checkbox" readOnly checked={f.kind === 'de'} tabIndex={-1} aria-label={allLabel(g)} /><span className="tl"><b>{allLabel(g)}</b></span><span className="ta">{g.areas.length}</span>
          </div>
          {g.memberOf ? g.all.map(i => { const a = g.areas[i]; return (
            <div key={a.id} data-tree-id={a.id} className={'tnode lvl1' + (f.kind === 'area' && f.id === a.id ? ' cur' : '') + (selIds.has(a.id) ? ' picked' : '')}>
              <span /><input type="checkbox" checked={f.kind !== 'de' && S.has(a.id)} onChange={() => toggleIds([a.id])} aria-label={a.name + ' kombinieren'} />
              <span className="tl" title={a.name} onClick={() => setFokus({ kind: 'area', id: a.id })}>{a.name}{a.free ? <small> · {LAENDER[a.bl]?.[1]}</small> : null}</span>
              <span className="sw" style={{ background: fillOf(doc, cm, i) }} />
            </div>); }) : BL_ORDER.map(bl => {
            const idx = g.byBl[bl] || []; if (!idx.length) return null;   // Karten nur einer Region (Berlin, Importe)
            const ids = idx.map(i => g.areas[i].id);
            const n = ids.filter(id => S.has(id)).length, open = ui.expanded[bl];
            return (
              <React.Fragment key={bl}>
                <div className={'tnode lvl1' + (f.kind === 'land' && f.bl === bl ? ' cur' : '')}>
                  <button className={'tw' + (open ? ' open' : '')} onClick={() => expand(bl)} aria-label={(open ? 'zuklappen: ' : 'aufklappen: ') + LAENDER[bl][0]}><Icon.chev size={12} /></button>
                  <input type="checkbox" checked={f.kind !== 'de' && n === ids.length} ref={el => { if (el) el.indeterminate = f.kind !== 'de' && n > 0 && n < ids.length; }} onChange={() => toggleIds(ids)} aria-label={LAENDER[bl][0] + ' kombinieren'} />
                  <span className="tl" onClick={() => { expand(bl, true); setFokus({ kind: 'land', bl }); }}>{LAENDER[bl][0]}</span><span className="ta">{ids.length}</span>
                </div>
                {open && (() => {
                  const areaRow = (i: number, lvl: number) => { const a = g.areas[i]; return (
                    <div key={a.id} data-tree-id={a.id} className={`tnode lvl${lvl}` + (f.kind === 'area' && f.id === a.id ? ' cur' : '') + (selIds.has(a.id) ? ' picked' : '')}>
                      <span /><input type="checkbox" checked={f.kind !== 'de' && S.has(a.id)} onChange={() => toggleIds([a.id])} aria-label={a.name + ' kombinieren'} />
                      <span className="tl" title={a.name} onClick={() => setFokus({ kind: 'area', id: a.id })}>{g.meta.showNr && <span className="num" style={{ color: 'var(--muted)' }}>{a.nr}</span>} {a.name}</span>
                      <span className="sw" style={{ background: fillOf(doc, cm, i) }} />
                    </div>); };
                  const K = kreiseOf(g, bl);
                  if (!K) return idx.map(i => areaRow(i, 2));
                  return K.map(kr => {
                    const kx = g.byKr[kr] || [], kids = kx.map(i => g.areas[i].id), kn = kids.filter(id => S.has(id)).length, ko = ui.expanded['kr:' + kr];
                    if (kx.length === 1) return areaRow(kx[0], 2);
                    return <React.Fragment key={kr}>
                      <div className={'tnode lvl2' + (f.kind === 'kreis' && f.kr === kr ? ' cur' : '')}>
                        <button className={'tw' + (ko ? ' open' : '')} onClick={() => setUI({ expanded: { ...ui.expanded, ['kr:' + kr]: !ko } })} aria-label={(ko ? 'zuklappen: ' : 'aufklappen: ') + (g.krName[kr] || kr)}><Icon.chev size={12} /></button>
                        <input type="checkbox" checked={f.kind !== 'de' && kn === kids.length} ref={el => { if (el) el.indeterminate = f.kind !== 'de' && kn > 0 && kn < kids.length; }} onChange={() => toggleIds(kids)} aria-label={(g.krName[kr] || kr) + ' kombinieren'} />
                        <span className="tl" onClick={() => { setUI({ expanded: { ...ui.expanded, ['kr:' + kr]: true } }); setFokus({ kind: 'kreis', kr }); }}>{g.krName[kr] || kr}</span><span className="ta">{kids.length}</span>
                      </div>
                      {ko && kx.map(i => areaRow(i, 3))}
                    </React.Fragment>;
                  });
                })()}
              </React.Fragment>
            );
          })}
        </div>
      </Section>
      <Section title="Grenzen einblenden" aside="andere Ebenen">
        {sisterSets(g, doc).filter(x => x.id !== doc.geoSet && GEO_INDEX.find(e => e.id === x.id)?.level !== 'lan').map(x => {
          const on = doc.overlays.some(o => o.geoSet === x.id);
          return <Check key={x.id} checked={on} onChange={() => { void toggleOverlay(x.id); }}>{x.label}{GEO_INDEX.find(e => e.id === x.id)?.level === 'btw-wk' ? ' ' + (GEO_INDEX.find(e => e.id === x.id)?.year || '') : ''}</Check>;
        })}
        <p className="hint">Zeichnet die Grenzen einer anderen Ebene über die Karte, z. B. Wahlkreise über Gemeinden. Farbe und Linie in der Ebenen-Liste rechts.</p>
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
