import { RegionAssign } from './panels/Regionen';
import React from 'react';
import { CUTS, Cut } from '../lib/fonts';
import { clamp, fmt1, fmtInt, fmtNum } from '../lib/util';
import { areaRowIndex, groupMetrics } from '../data/derive';
import { GEO, areaContext, areaTitle } from '../geo/geo';
import { removeOverlay, updateOverlay } from '../model/overlays';
import { LABEL_PRESETS, PRESETS } from '../model/defaults';
import { addCustomColor, addGuide, clearGuides, refitAfterInset, refitFrame, setFokus, relayoutActive, removeGuide, removeVariant, resizeVariant, resetSourceText, setGuide, setGuidesVisible, setOverride, setSourceText, setTextScale } from '../model/actions';
import { getUI, setUI, update, useStore } from '../model/store';
import type { ChartSpec, Doc, Sel } from '../model/types';
import { defaultChart } from '../render/chart';
import { ColorModel, colorModel, legendTitleAuto, partyColor } from '../render/colorModel';
import { activeVariant, autoSourceText, layoutLabels, missingMarks, sourceIsManual } from '../render/elements';
import { isChart } from '../model/graphicKeys';
import { INSET_DEFS, fokusLabel, geoOf, insetLabel, isRegional, krLinesLabel, laenderSetFor, overlayName } from '../render/scene';
import { Check, ColorField, Field, Icon, Note, NumInput, OptNum, RichTextArea, Section, Seg } from './common';
import { AreaHatch, HatchList, HatchProps, LegendProps } from './annotationsUI';
import { AnnProps, ArrowIcon, MarkerIcon } from './elementsUI';
import { BubbleSection } from './panels/Blasen';
import { elName } from '../render/annotations';
import { LogoProps } from './LogoUI';
import { MapZoom } from './MapZoom';
import { setLogoVisible } from '../model/logo';
import { ErrorBoundary } from './ErrorBoundary';
import type { Box, GNode, TextEl } from '../model/types';
import { findNode, freeNodes, isBuiltin, nodeName } from '../model/nodes';
import { align, canRotate, copyNodes, deleteNodes, duplicateNodes, layoutOf, reorder, resetScale, selFor, selIds, setRotation } from '../model/transform';

// ---------- Ebenen ----------
const CHART_LABEL = { saeulen: 'Säulen', gewinne: 'Gewinne und Verluste', balken: 'Balken', linie: 'Linie', sitze: 'Sitzverteilung' } as const;
function Layers() {
  const doc = useStore(s => s.doc!);
  const sel = useStore(s => s.ui.sel);
  const v = activeVariant(doc), L = doc.layers, T = doc.texts, g = geoOf(doc), chart = isChart(doc);
  const multi = selIds(sel);
  const is = (s: Sel) => JSON.stringify(s) === JSON.stringify(sel) || (s.kind === 'layer' && s.id === 'wk' && sel.kind === 'layer' && sel.id === 'labels') || (sel.kind === 'multi' && selIds(s).some(id => multi.includes(id)));
  // Umschalt + Klick auf ein Objekt (Titel, Karte, Textfeld …): zur Auswahl hinzufügen oder entfernen
  const pick = (s: Sel) => (e?: React.MouseEvent | React.KeyboardEvent) => {
    const id = selIds(s)[0];
    if (e?.shiftKey && id) { setUI({ sel: selFor(multi.includes(id) ? multi.filter(x => x !== id) : [...multi, id]), mapMode: null }); return; }
    setUI({ sel: s, mapMode: null });
  };
  const eye = (on: boolean, set: (v: boolean) => void, label: string) => (
    <button className="eye" onClick={e => { e.stopPropagation(); set(!on); }} aria-label={label + (on ? ' ausblenden' : ' einblenden')} aria-pressed={on}>{on ? <Icon.eye /> : <Icon.eyeOff />}</button>
  );
  const tog = (on: boolean, set: (v: boolean) => void, lab: string, title: string) => (
    <button className={'tog' + (on ? ' on' : '')} onClick={e => { e.stopPropagation(); set(!on); }} title={title} aria-label={title} aria-pressed={on}>{lab}</button>
  );
  // Als Funktion aufgerufen, nicht als <Row/>: eine innerhalb von Layers definierte Komponente wäre bei jedem Neuzeichnen ein
  // neuer Typ – React baute dann alle Zeilen neu auf (Tastaturfokus auf einer Zeile ging bei jeder Änderung verloren).
  const Row = ({ s, icon, name, extra, lvl = 0, hidden = false }: { s: Sel; icon: React.ReactNode; name: React.ReactNode; extra?: React.ReactNode; lvl?: number; hidden?: boolean }, key?: React.Key) => (
    <div key={key} className={`lrow${lvl ? ' l' + lvl : ''}${is(s) ? ' sel' : ''}${hidden ? ' hidden' : ''}`} onClick={pick(s)} role="button" tabIndex={0} aria-pressed={is(s)} onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); pick(s)(e); } }}>
      <span className="li" /><span className="li">{icon}</span><span className="ln">{name}</span><span className="lx">{extra}</span>
    </div>
  );
  return (
    <div className="layers">
      <div className="rp-head"><h2>Ebenen</h2><span className="aside">{v.w} × {v.h}</span></div>
      {Row({ s: { kind: 'graphic' }, icon: <Icon.graphic />, name: <>Grafik <small>{v.preset}</small></> })}
      {Row({ lvl: 1, s: { kind: 'el', id: 'title' }, icon: <Icon.text />, name: "Titel", hidden: !T.title.visible, extra: eye(T.title.visible, on => update(d => { d.texts.title.visible = on; }), 'Titel') })}
      {Row({ lvl: 1, s: { kind: 'el', id: 'subtitle' }, icon: <Icon.text />, name: "Unterzeile", hidden: !T.subtitle.visible, extra: eye(T.subtitle.visible, on => update(d => { d.texts.subtitle.visible = on; }), 'Unterzeile') })}
      {Row({ lvl: 1, s: { kind: 'el', id: 'source' }, icon: <Icon.text />, name: "Quellenzeile", hidden: !T.source.visible, extra: <>{T.source.text != null && <small className="dim" title="Quellenzeile von Hand bearbeitet">eigen</small>}{eye(T.source.visible, on => update(d => { d.texts.source.visible = on; }), 'Quellenzeile')}</> })}
      {chart ? Row({ lvl: 1, s: { kind: 'frame', id: 'main' }, icon: <Icon.chart />, name: <>Diagramm <small>{CHART_LABEL[doc.chart?.type || 'saeulen']}</small></> }) : <>
      {Row({ lvl: 1, s: { kind: 'frame', id: 'main' }, icon: <Icon.frame />, name: <>Hauptkarte <small>{fokusLabel(doc)}</small></>, extra: v.locked.main ? <span className="lock" title="Ausschnitt gesperrt"><Icon.lock /></span> : null })}
      {Row({ lvl: 2, s: { kind: 'layer', id: 'wk' }, icon: <Icon.layer />, name: g.meta.levelLabel || g.meta.label, extra: <>{tog(L.wkFill, on => update(d => { d.layers.wkFill = on; }), 'F', 'Fläche')}{tog(L.wkLines, on => update(d => { d.layers.wkLines = on; }), 'G', 'Grenze')}{tog(L.wkLabels, on => update(d => { d.layers.wkLabels = on; }), 'B', 'Beschriftung')}</> })}
      {Row({ lvl: 2, s: { kind: 'layer', id: 'hatches' }, icon: <Icon.layer />, name: <>Schraffuren <small>{doc.hatches.length}</small></>, hidden: !L.hatches, extra: eye(L.hatches, on => update(d => { d.layers.hatches = on; }), 'Schraffuren') })}
      {Object.keys(g.byKr).length > 0 && g.meta.level !== 'krs' && Row({ lvl: 2, s: { kind: 'layer', id: 'kr' }, icon: <Icon.layer />, name: krLinesLabel(g), hidden: !L.krLines, extra: eye(L.krLines, on => update(d => { d.layers.krLines = on; }), 'Kreisgrenzen') })}
      {Row({ lvl: 2, s: { kind: 'layer', id: 'land' }, icon: <Icon.layer />, name: "Ländergrenzen", hidden: !L.landLines, extra: eye(L.landLines, on => update(d => { d.layers.landLines = on; }), 'Ländergrenzen') })}
      {doc.overlays.map(o => Row({ lvl: 2, s: { kind: 'overlay', id: o.id }, icon: <span className="ov-swatch" style={{ borderTopColor: o.color, borderTopStyle: o.dash ? 'dashed' : 'solid' }} />, name: <>{overlayName(o.geoSet, true)} <small>{GEO[o.geoSet]?.meta.stand ? GEO[o.geoSet]?.meta.stand?.slice(-4) : ''}</small></>, hidden: !o.visible, extra: eye(o.visible, on => updateOverlay(o.id, { visible: on }), overlayName(o.geoSet, true)) }, o.id))}
      {doc.bubbles && Row({ lvl: 2, s: { kind: 'bubbles' }, icon: <span className="bub-icon" />, name: <>Blasen <small>{doc.datasets.find(d => d.id === doc.bubbles!.dataset)?.columns.find(c => c.id === doc.bubbles!.column)?.label || ''}</small></>, hidden: !doc.bubbles.visible, extra: eye(doc.bubbles.visible, on => update(d => { if (d.bubbles) d.bubbles.visible = on; }), 'Blasen') })}
      {isRegional(g) && Row({ lvl: 2, s: { kind: 'layer', id: 'laender' }, icon: <Icon.layer />, name: <>Nachbarländer <small>Kontext</small></>, hidden: !L.laender, extra: eye(L.laender, on => update(d => { d.layers.laender = on; }), 'Nachbarländer') })}
      {Row({ lvl: 2, s: { kind: 'layer', id: 'water' }, icon: <Icon.layer />, name: <>Gewässer <small>Kontext</small></>, hidden: !L.lakes, extra: eye(L.lakes, on => update(d => { d.layers.lakes = on; }), 'Gewässer') })}
      {Row({ lvl: 2, s: { kind: 'layer', id: 'neighbors' }, icon: <Icon.layer />, name: <>Nachbarstaaten <small>Kontext</small></>, hidden: !L.neighbors, extra: eye(L.neighbors, on => update(d => { d.layers.neighbors = on; }), 'Nachbarstaaten') })}
      {Row({ lvl: 1, s: { kind: 'frame', id: 'inset' }, icon: <Icon.frame />, name: <>Inset „{insetLabel(doc)}“</>, hidden: !doc.inset.visible, extra: eye(doc.inset.visible, on => { update(d => { d.inset.visible = on; d.inset.autoHidden = false; }); refitAfterInset(); }, 'Inset') })}
      </>}
      {(!chart || doc.chart?.type === 'sitze') && Row({ lvl: 1, s: { kind: 'el', id: 'legend' }, icon: <Icon.legend />, name: "Legende", hidden: !doc.legend.visible, extra: eye(doc.legend.visible, on => update(d => { d.legend.visible = on; }), 'Legende') })}
      {Row({ lvl: 1, s: { kind: 'el', id: 'logo' }, icon: <Icon.image />, name: <>Logo{!doc.logo.asset && <small>keines geladen</small>}</>, hidden: !doc.logo.visible || !doc.logo.asset, extra: doc.logo.asset ? eye(doc.logo.visible, setLogoVisible, 'Logo') : null })}
      {freeNodes(doc.nodes).map(n => Row({ lvl: 1, s: { kind: 'node', id: n.id }, icon: <Icon.text />, name: <>{textLabel(n)} <small>Textfeld</small></>, hidden: !n.text?.visible, extra: eye(!!n.text?.visible, on => setNodeText(n.id, t => { t.visible = on; }), 'Textfeld') }, n.id))}
      {doc.els.map(el => Row({ lvl: 1, s: { kind: 'ann', id: el.id }, icon: el.type === 'marker' ? <MarkerIcon m={el} s={14} /> : el.type === 'arrow' ? <ArrowIcon /> : <Icon.text />, name: elName(el), hidden: !!el.hidden, extra: eye(!el.hidden, on => update(d => { const x = d.els.find(q => q.id === el.id); if (x) x.hidden = !on; }), elName(el)) }, el.id))}
    </div>
  );
}

/** Name eines Textfelds in Listen: Anfang des Texts */
export const textLabel = (n: GNode) => { const t = (n.text?.text || '').replace(/\s+/g, ' ').trim(); return t ? (t.length > 28 ? t.slice(0, 27) + '…' : t) : nodeName(n); };
/** Text eines freien Textfelds ändern */
export function setNodeText(id: string, fn: (t: TextEl) => void, key?: string) {
  update(d => { const n = findNode(d.nodes as unknown as GNode[], id); if (n?.text) fn(n.text); }, key ? { key } : {});
}

// ---------- Eigenschaften ----------
const Head = ({ t, sub }: { t: React.ReactNode; sub?: React.ReactNode }) => <><div className="rp-head"><h2>Eigenschaften</h2></div><h3 className="props-title">{t}</h3>{sub ? <p className="props-sub">{sub}</p> : null}</>;

function OverrideUI({ doc, ids }: { doc: Doc; ids: string[] }) {
  const keys = ids.map(id => doc.geoSet + ':' + id);
  const ov = keys.map(k => doc.overrides[k]).filter(Boolean);
  const cur = ov.length === ids.length && new Set(ov).size === 1 ? ov[0] : null;
  const pal = [...new Set(['Union', 'SPD', 'AfD', 'GRÜNE', 'FDP', 'LINKE', 'BSW', 'FW'].map(p => partyColor(doc, p)).concat(['#16181B', '#6B7078', '#B8B3A7', '#FFFFFF']))];
  // eigene, zuletzt über den Farbwähler gewählte Farben (siehe addCustomColor) – ohne Dopplungen zu den festen Farben oben
  const custom = (doc.customColors || []).filter(c => !pal.includes(c));
  return (
    <Section title="Manuell einfärben" aside="überschreibt die Datenregel">
      <div className="swatch-grid">
        {pal.map(c => <button key={c} className={'swatch-btn' + (cur === c ? ' on' : '')} style={{ background: c }} onClick={() => setOverride(ids, c)} aria-label={'Farbe ' + c} />)}
        {custom.map(c => <button key={c} className={'swatch-btn' + (cur === c ? ' on' : '')} style={{ background: c }} onClick={() => setOverride(ids, c)} aria-label={'Eigene Farbe ' + c} />)}
        <ColorField custom value={cur || '#888888'} onChange={c => setOverride(ids, c)} onCommit={addCustomColor} ariaLabel="Eigene Farbe wählen" title="Eigene Farbe wählen" />
      </div>
      {ov.length ? <div className="override-note"><span className="chip warn">{ov.length} überschrieben</span><button className="btn small" onClick={() => setOverride(ids, null)}>Zurücksetzen</button></div>
        : <p className="hint">Bleibt beim Ersetzen der Daten erhalten, weil sie an Kennung und Gebietsstand hängt.</p>}
    </Section>
  );
}

function AreaProps({ doc, ids, cm }: { doc: Doc; ids: string[]; cm: ColorModel }) {
  const g = geoOf(doc);
  if (ids.length > 1) return <>
    <Head t={`${ids.length} Gebiete ausgewählt`} sub={ids.slice(0, 6).map(id => { const a = g.areas[g.byId.get(id)!]; return a ? (g.meta.showNr ? a.nr : a.name) : id; }).join(', ') + (ids.length > 6 ? ' …' : '')} />
    <p className="hint">Umschalt + Klick fügt hinzu oder entfernt.</p>
    <button className="btn small" onClick={() => setFokus((ids.length === 1 ? { kind: 'area', id: ids[0] } : { kind: 'custom', ids: [...ids].sort((a, b) => +a - +b || a.localeCompare(b)) }))}><Icon.target /> Auswahl als Fokus</button>
    <RegionAssign doc={doc} ids={ids} />
    <OverrideUI doc={doc} ids={ids} />
    <AreaHatch doc={doc} ids={ids} />
  </>;
  const i = g.byId.get(ids[0]); if (i == null) return <Head t="Gebiet nicht im Gebietsstand" />;
  const a = g.areas[i], ds = cm.dataset, grp = cm.group;
  const r = ds && !cm.mismatch ? areaRowIndex(ds).get(a.id) : undefined;
  let body: React.ReactNode = <p className="hint">Keine Daten für dieses Gebiet.</p>;
  if (ds && r != null && grp) {
    const m = groupMetrics(ds, grp)[r];
    const col = (k: number) => ds.columns.find(c => c.id === grp.columns[k])!;
    const nm = (k: number) => { const c = col(k); return c.short || c.label.split(' · ')[0]; };
    const order = m.share.map((s, k) => ({ s, k })).filter(x => x.s != null).sort((x, y) => y.s! - x.s!).slice(0, 8);
    const mx = order[0]?.s || 1;
    body = <>
      <dl className="kv">
        {m.win >= 0 && <><dt>Stärkste</dt><dd>{nm(m.win)}</dd><dt>Anteil</dt><dd>{fmt1(m.winShare)} %</dd></>}
        {m.second >= 0 && <><dt>Vorsprung auf {nm(m.second)}</dt><dd>{fmt1(m.margin)} Pkt.</dd></>}
        {m.total != null && <><dt>Bezugsgröße</dt><dd>{fmtInt(m.total)}</dd></>}
      </dl>
      <div className="bars">{order.map(({ s, k }) => { const c = col(k); return <div key={k} className="bar"><span className="bn" title={c.label}>{nm(k)}</span><span className="bt"><i style={{ width: (100 * s! / mx).toFixed(1) + '%', background: c.party ? partyColor(doc, c.party) : '#8D939B' }} /></span><span className="bv">{fmt1(s)}</span></div>; })}</div>
    </>;
  } else if (ds && r != null) {
    const cols = ds.columns.filter(c => c.role === 'value' || c.role === 'category' || c.role === 'label').slice(0, 14);
    body = <dl className="kv">{cols.map(c => { const val = ds.rows[r][ds.columns.indexOf(c)]; return <React.Fragment key={c.id}><dt title={c.label}>{c.label}</dt><dd>{typeof val === 'number' ? fmtNum(val, 2) : val ?? '–'}</dd></React.Fragment>; })}</dl>;
  }
  return <>
    <Head t={areaTitle(g, i)} sub={`${a.bez ? a.bez + ' · ' : ''}${areaContext(g, i)} · ${fmtInt(a.area)} km²${a.free && !g.memberOf ? ' · gemeindefrei' : ''}${grp ? ' · ' + grp.label : ''}`} />
    {body}
    <RegionAssign doc={doc} ids={ids} />
    <OverrideUI doc={doc} ids={ids} />
    <AreaHatch doc={doc} ids={ids} />
  </>;
}

function TextProps({ doc, id }: { doc: Doc; id: 'title' | 'subtitle' }) {
  const t = doc.texts[id], v = activeVariant(doc);
  return <>
    <Head t={id === 'title' ? 'Titel' : 'Unterzeile'} sub="Zeilenumbruch mit Eingabetaste" />
    <Field stack label="Text" htmlFor="p-text"><RichTextArea id="p-text" rows={id === 'title' ? 2 : 4} value={t.text} marks={t.marks} baseBold={t.cut === 'bold'} onChange={(val, mk) => update(d => { d.texts[id].text = val; d.texts[id].marks = mk; }, { key: 'txt-' + id })} /></Field>
    <Field label="Größe (px)"><NumInput min={8} max={200} value={t.size} onChange={n => update(d => { d.texts[id].size = n; }, { key: 'size-' + id })} ariaLabel="Schriftgröße" /></Field>
    <Field label="Schnitt"><select value={t.cut} onChange={e => { const c = e.target.value as Cut; update(d => { d.texts[id].cut = c; }); }} aria-label="Schriftschnitt">{(['display', 'bold', 'text'] as Cut[]).map(c => <option key={c} value={c}>Merriweather · {CUTS[c].label}</option>)}</select></Field>
    <Field label="Farbe"><Seg items={[['ink', 'Dunkel'], ['inkSoft', 'Grau']]} value={t.color} onChange={c => update(d => { d.texts[id].color = c; })} /></Field>
    <Field label="Ausrichtung"><Seg items={[['start', 'Links'], ['middle', 'Mitte'], ['end', 'Rechts']]} value={t.align} onChange={a => update(d => { d.texts[id].align = a; })} /></Field>
    <Field label="Breite (px)"><NumInput min={100} max={v.w} value={Math.round(v.L[id].w)} onChange={n => update(d => { d.variants[d.active].L[id].w = n; }, { key: 'w-' + id })} ariaLabel="Breite des Textblocks" /></Field>
    <Field label="Position (px)"><span className="mono">{Math.round(v.L[id].x)}, {Math.round(v.L[id].y)}</span></Field>
    <p className="hint">Doppelklick auf den Text in der Grafik springt hierher. Ziehen auf der Arbeitsfläche verschiebt den Block, an den seitlichen Griffen ändert sich die Breite, die Eckgriffe skalieren ihn samt Schrift. Pfeiltasten verschieben um 1 px, mit Umschalt um 10 px.</p>
  </>;
}

function SourceProps({ doc }: { doc: Doc }) {
  const t = doc.texts.source, v = activeVariant(doc), manual = sourceIsManual(doc), auto = autoSourceText(doc);
  const text = manual ? t.text! : auto, missing = missingMarks(doc, text), changed = manual && t.autoBase != null && t.autoBase !== auto;
  return <>
    <Head t="Quellenzeile" sub={manual ? 'eigene Fassung' : 'automatisch aus Daten und Geometrien'} />
    <Field stack label="Text" htmlFor="p-text"><RichTextArea id="p-text" rows={5} value={text} marks={manual ? t.marks : undefined} baseBold={t.cut === 'bold'} onChange={(val, mk) => setSourceText(val, mk)} /></Field>
    {manual
      ? <div className="row-btns"><button className="btn small" onClick={resetSourceText} title="Eigene Fassung verwerfen, Text wieder aus Daten und Geometrien erzeugen"><Icon.refresh /> Automatisch erzeugen</button></div>
      : <p className="hint">Wenn du den Text änderst, gilt deine Fassung. Sie wird dann bei neuen Daten nicht mehr angepasst; „Automatisch erzeugen“ holt den Vermerk zurück.</p>}
    {changed && <Note kind="warn">Seit deiner Bearbeitung haben sich Daten oder Ebene geändert. Automatisch stünde jetzt da: „{auto}“</Note>}
    {missing.length > 0 && <Note kind="warn">Im Text fehlt der Lizenzvermerk für {missing.map((m, k) => <React.Fragment key={m}>{k ? ' und ' : ''}„{m}“</React.Fragment>)}. Offene Daten (CC BY, dl-de/by) verlangen die Nennung der Quelle.</Note>}
    <Field label="Größe (px)"><NumInput min={8} max={40} value={t.size} onChange={n => update(d => { d.texts.source.size = n; }, { key: 'src-size' })} ariaLabel="Schriftgröße der Quellenzeile" /></Field>
    <Field label="Schnitt"><select value={t.cut} onChange={e => { const c = e.target.value as Cut; update(d => { d.texts.source.cut = c; }); }} aria-label="Schriftschnitt der Quellenzeile">{(['display', 'bold', 'text'] as Cut[]).map(c => <option key={c} value={c}>Merriweather · {CUTS[c].label}</option>)}</select></Field>
    <Field label="Farbe"><Seg items={[['ink', 'Dunkel'], ['inkSoft', 'Grau']]} value={t.color} onChange={c => update(d => { d.texts.source.color = c; })} /></Field>
    <Field label="Ausrichtung"><Seg items={[['start', 'Links'], ['middle', 'Mitte'], ['end', 'Rechts']]} value={t.align} onChange={a => update(d => { d.texts.source.align = a; })} /></Field>
    <Field label="Breite (px)"><NumInput min={100} max={v.w} value={Math.round(v.L.source.w)} onChange={n => update(d => { d.variants[d.active].L.source.w = n; }, { key: 'w-source' })} ariaLabel="Breite der Quellenzeile" /></Field>
    <Field label="Position (px)"><span className="mono">{Math.round(v.L.source.x)}, {Math.round(v.L.source.y)}</span></Field>
    <p className="hint">Doppelklick auf die Quellenzeile in der Grafik springt hierher. Ziehen verschiebt sie, an den seitlichen Griffen ändert sich die Breite, die Eckgriffe skalieren sie samt Schrift. Pfeiltasten um 1 px, mit Umschalt um 10 px.</p>
  </>;
}

function FrameProps({ doc, id }: { doc: Doc; id: 'main' | 'inset' }) {
  const ui = useStore(s => s.ui);
  const v = activeVariant(doc), F = v.L[id], g = geoOf(doc);
  const mpp = g.meta.grid / F.view.k;
  return <>
    <Head t={id === 'main' ? 'Hauptkarte' : `Inset „${insetLabel(doc)}“`} sub={id === 'main' ? 'Fokus: ' + fokusLabel(doc) : 'Detail-Lupe'} />
    <div className="row-btns">
      <button className={'btn' + (ui.mapMode === id ? ' primary' : '')} onClick={() => setUI({ mapMode: ui.mapMode === id ? null : id })}><Icon.target /> {ui.mapMode === id ? 'Kartenmodus beenden' : 'Kartenmodus'}</button>
      <button className="btn" onClick={() => refitFrame(id)}><Icon.fit /> Einpassen</button>
    </div>
    <Field stack label="Zoom der Karte"><MapZoom doc={doc} id={id} /></Field>
    <Check checked={v.locked[id]} onChange={on => update(d => { d.variants[d.active].locked[id] = on; })}>Ausschnitt sperren</Check>
    <dl className="kv"><dt>Position</dt><dd>{Math.round(F.x)}, {Math.round(F.y)}</dd><dt>Größe</dt><dd>{Math.round(F.w)} × {Math.round(F.h)}</dd><dt>1 px entspricht</dt><dd>{mpp >= 1000 ? fmt1(mpp / 1000) + ' km' : Math.round(mpp) + ' m'}</dd><dt>Projektion</dt><dd>ETRS89 / UTM 32</dd></dl>
    {id === 'inset' && <Field label="Gebiet"><select value={doc.inset.preset} onChange={e => { const p = e.target.value; update(d => { d.inset.preset = p; }); refitAfterInset(); }} aria-label="Gebiet der Detail-Lupe">{Object.entries(INSET_DEFS).map(([k, x]) => <option key={k} value={k} disabled={!x.pick(g).length}>{x.label}</option>)}</select></Field>}
    <p className="hint">Zoom: 100 % entspricht „Einpassen“; die Mitte des Rahmens bleibt beim Zoomen stehen. Rahmen ziehen verschiebt ihn. Eckgriffe vergrößern die Karte samt Linien und Beschriftungen (Umschalt: nur den Rahmen), Seitengriffe ändern den Rahmen, der Ausschnitt passt sich an (außer gesperrt). Klick in die gewählte Karte wählt ein Gebiet. Ein gesperrter Ausschnitt bleibt beim Wechsel des Fokus stehen.</p>
  </>;
}

function LayerProps({ doc, id }: { doc: Doc; id: 'wk' | 'labels' | 'kr' | 'land' | 'water' | 'neighbors' | 'hatches' | 'laender' }) {
  const v = activeVariant(doc), st = doc.style, g = geoOf(doc);
  const colW = (c: string, w: number, ck: 'wkLine' | 'krLine' | 'landLine' | 'laenderLine', wk: 'wkLineW' | 'krLineW' | 'landLineW' | 'laenderLineW', max: number, min = 0.1) => (
    <div className="row-btns"><ColorField value={c} onChange={val => update(d => { d.style[ck] = val; }, { key: ck })} ariaLabel="Linienfarbe" /><NumInput min={min} max={max} step={0.1} value={w} onChange={n => update(d => { d.style[wk] = n; }, { key: wk })} ariaLabel="Linienstärke in Pixeln" /></div>
  );
  if (id === 'wk' || id === 'labels') {
    const lb = doc.labels;
    const hidden = doc.layers.wkLabels ? layoutLabels(doc, 'main').hidden + (doc.inset.visible ? layoutLabels(doc, 'inset').hidden : 0) : 0;
    const moved = Object.keys(v.labelOffsets).length;
    return <>
      <Head t={g.meta.label} sub={`${g.meta.count.toLocaleString('de-DE')} Gebiete · ${g.meta.attribution.split(';')[0]}`} />
      <Section title="Fläche"><Check checked={doc.layers.wkFill} onChange={on => update(d => { d.layers.wkFill = on; })}>Nach Daten einfärben</Check>
        <Field label="Keine Daten"><ColorField value={st.noData} onChange={val => update(d => { d.style.noData = val; }, { key: 'nd' })} ariaLabel="Farbe für Gebiete ohne Daten" /></Field></Section>
      <Section title="Grenze"><Check checked={doc.layers.wkLines} onChange={on => update(d => { d.layers.wkLines = on; })}>Gebietsgrenzen</Check>
        <Field label="Farbe · Stärke">{colW(st.wkLine, st.wkLineW, 'wkLine', 'wkLineW', 6)}</Field></Section>
      <Section title="Beschriftung"><Check checked={doc.layers.wkLabels} onChange={on => update(d => { d.layers.wkLabels = on; })}>Beschriften</Check>
        <Field label="Inhalt"><select value={lb.preset} onChange={e => { const k = e.target.value; update(d => { d.labels.preset = k; const tpl = LABEL_PRESETS[k].template; if (tpl != null) d.labels.template = tpl; }); }} aria-label="Inhalt der Beschriftung">{Object.entries(LABEL_PRESETS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}</select></Field>
        <Field stack htmlFor="p-tpl" label={<>Vorlage <span className="dim">· {'{nr} {name} {land} {partei} {anteil} {vorsprung} {wert}'}</span></>}><textarea id="p-tpl" rows={2} className="num" value={lb.template} onChange={e => { const val = e.target.value; update(d => { d.labels.template = val; d.labels.preset = 'eigene'; }, { key: 'tpl' }); }} /></Field>
        <Field label="Größe (px)"><NumInput min={7} max={48} value={lb.size} onChange={n => update(d => { d.labels.size = n; }, { key: 'lsize' })} ariaLabel="Schriftgröße der Beschriftung" /></Field>
        <Check checked={lb.halo} onChange={on => update(d => { d.labels.halo = on; })}>Weiße Kontur für Lesbarkeit</Check>
        {doc.layers.wkLabels && <div className="meta-row"><span className={'chip ' + (hidden ? 'warn' : 'ok')}>{hidden} wegen Überlappung ausgeblendet</span>{moved > 0 && <span className="chip">{moved} verschoben</span>}</div>}
        {moved > 0 && <button className="btn small" onClick={() => update(d => { d.variants[d.active].labelOffsets = {}; })}>Verschobene Beschriftungen zurücksetzen</button>}
      </Section>
    </>;
  }
  if (id === 'hatches') return <>
    <Head t="Schraffuren" sub="über den Flächen, im Export als echte Linien" />
    <HatchList doc={doc} />
  </>;
  if (id === 'kr') return <>
    <Head t={krLinesLabel(g)} sub={g.meta.level.startsWith('be-') ? 'aus den Wahlbezirken abgeleitet' : 'aus den Gemeinden abgeleitet, gleicher Gebietsstand'} />
    <Check checked={doc.layers.krLines} onChange={on => update(d => { d.layers.krLines = on; })}>Kräftiger zeichnen</Check>
    <Field label="Farbe · Stärke">{colW(st.krLine, st.krLineW, 'krLine', 'krLineW', 6)}</Field>
    <p className="hint">Ausgeschaltet erscheinen die {krLinesLabel(g)} wie die übrigen Gebietsgrenzen.</p>
  </>;
  if (id === 'land') return <>
    <Head t="Ländergrenzen" sub="aus den Gebieten abgeleitet" />
    <Check checked={doc.layers.landLines} onChange={on => update(d => { d.layers.landLines = on; })}>Anzeigen</Check>
    <Field label="Farbe · Stärke">{colW(st.landLine, st.landLineW, 'landLine', 'landLineW', 8)}</Field>
  </>;
  if (id === 'laender') {
    const lid = laenderSetFor(g), lg = lid ? GEO[lid] : null;
    return <>
      <Head t="Nachbarländer" sub={`Kontextebene · ${lg ? `Länder aus den Verwaltungsgrenzen, Stand ${lg.meta.stand || lg.meta.year}` : 'Länder aus den Verwaltungsgrenzen'}`} />
      <Check checked={doc.layers.laender} onChange={on => update(d => { d.layers.laender = on; })}>Anzeigen</Check>
      <Field label="Fläche"><div className="row-btns"><ColorField value={st.laender} onChange={val => update(d => { d.style.laender = val; }, { key: 'lae' })} ariaLabel="Flächenfarbe der Nachbarländer" />
        {st.laender !== st.umfeld && <button className="btn small" onClick={() => update(d => { d.style.laender = d.style.umfeld; })}>wie Umfeld</button>}</div></Field>
      <Field label="Grenze · Stärke">{colW(st.laenderLine, st.laenderLineW, 'laenderLine', 'laenderLineW', 8, 0)}</Field>
      <p className="hint">Die Karte deckt nur einen Teil Deutschlands ab. Die übrigen Länder erscheinen dahinter als Umfeld, ohne Daten und ohne Legendeneintrag. Stärke 0 zeichnet keine Grenzen. Die Quellenzeile nennt dann auch das BKG.</p>
    </>;
  }
  const w = id === 'water';
  return <>
    <Head t={w ? 'Gewässer' : 'Nachbarstaaten'} sub="Kontextebene · Natural Earth, gemeinfrei" />
    <Check checked={doc.layers[w ? 'lakes' : 'neighbors']} onChange={on => update(d => { d.layers[w ? 'lakes' : 'neighbors'] = on; })}>Anzeigen</Check>
    <Field label="Fläche"><ColorField value={w ? st.water : st.neighbor} onChange={val => update(d => { if (w) d.style.water = val; else d.style.neighbor = val; }, { key: 'ctx-' + id })} ariaLabel="Flächenfarbe" /></Field>
    {!w && <Field label="Grenze"><ColorField value={st.neighborLine} onChange={val => update(d => { d.style.neighborLine = val; }, { key: 'nbl' })} ariaLabel="Grenzfarbe" /></Field>}
  </>;
}

function OverlayProps({ doc, id }: { doc: Doc; id: string }) {
  const o = doc.overlays.find(x => x.id === id); if (!o) return <Head t="Grenzen" />;
  const og = GEO[o.geoSet];
  return <>
    <Head t={overlayName(o.geoSet, true)} sub={`${og?.meta.label || o.geoSet} · über der Karte`} />
    <Check checked={o.visible} onChange={on => updateOverlay(o.id, { visible: on })}>Anzeigen</Check>
    <Field label="Farbe · Stärke"><div className="row-btns"><ColorField value={o.color} onChange={c => updateOverlay(o.id, { color: c }, 'ovc-' + o.id)} ariaLabel="Linienfarbe" /><NumInput min={0.2} max={8} step={0.1} value={o.width} onChange={n => updateOverlay(o.id, { width: n }, 'ovw-' + o.id)} ariaLabel="Linienstärke in Pixeln" /></div></Field>
    <Field label="Linie"><Seg items={[['solid', 'Durchgezogen'], ['dash', 'Gestrichelt']]} value={o.dash ? 'dash' : 'solid'} onChange={v => updateOverlay(o.id, { dash: v === 'dash' })} /></Field>
    <Check checked={o.legend} onChange={on => updateOverlay(o.id, { legend: on })}>In der Legende zeigen</Check>
    {og && og.meta.level === 'btw-wk' && geoOf(doc).meta.level === 'gem' ? <p className="hint">Die Wahlkreisgrenzen folgen den Gemeindegrenzen (Wahlkreise bestehen aus Gemeinden). Nur in Städten mit mehreren Wahlkreisen stammen sie aus der Wahlkreiskarte.</p>
      : og && og.meta.file !== geoOf(doc).meta.file && <p className="hint">Andere Kartengrundlage als die Gebiete: Die Linien können etwas von den Gebietsgrenzen abweichen. Im Maßstab eines Landes ist das kaum zu sehen.</p>}
    <button className="btn small ghost danger" onClick={() => removeOverlay(o.id)}><Icon.trash /> Entfernen</button>
  </>;
}
function GraphicProps({ doc }: { doc: Doc }) {
  const v = activeVariant(doc), free = v.preset === 'Frei';
  return <>
    <Head t="Grafik" sub={`${PRESETS[v.preset]?.label || v.preset} · ${v.w} × ${v.h} px`} />
    <Field label="Breite · Höhe"><div className="row-btns nowrap">
      <NumInput min={200} max={6000} value={v.w} onChange={n => free && resizeVariant(clamp(n, 200, 6000), v.h)} ariaLabel="Breite" />
      <NumInput min={200} max={6000} value={v.h} onChange={n => free && resizeVariant(v.w, clamp(n, 200, 6000))} ariaLabel="Höhe" />
    </div></Field>
    {!free && <p className="hint">Feste Maße der Voreinstellung. Für eigene Maße oben eine Variante „Freies Format“ anlegen.</p>}
    <Field label="Hintergrund"><Seg items={[['white', 'Weiß'], ['transparent', 'Transparent']]} value={doc.background} onChange={b => update(d => { d.background = b; })} /></Field>
    <Field label="Schriftgrößen"><div className="row-btns nowrap"><NumInput min={50} max={200} step={5} value={Math.round(v.ts * 100)} onChange={n => setTextScale(clamp(n, 50, 200) / 100)} ariaLabel="Schriftgrößen dieser Variante in Prozent" /><span className="hint">% in dieser Variante</span></div></Field>
    <div className="row-btns">
      <button className="btn small" onClick={relayoutActive}>Layout neu anordnen</button>
      {doc.variants.length > 1 && <button className="btn small ghost danger" onClick={() => removeVariant(doc.active)}><Icon.trash /> Variante entfernen</button>}
    </div>
    <Section title="Hilfslinien" aside={<span className="hint">nicht im Export</span>}>
      <p className="hint">Zum Ausrichten beim Gestalten. Erscheinen nicht in PNG- oder SVG-Exporten. Elemente rasten beim Ziehen daran ein.</p>
      <Check checked={v.guides.visible} onChange={setGuidesVisible}>Hilfslinien anzeigen <span className="kbd">Umschalt</span>+<span className="kbd">R</span></Check>
      <Field label="Senkrecht (X)" stack>
        <div className="stack-8">
          {v.guides.x.map((gx, k) => (
            <div className="row-btns nowrap" key={'gx' + k}>
              <NumInput min={0} max={v.w} value={gx} onChange={n => setGuide('x', k, Math.round(clamp(n, 0, v.w)))} ariaLabel={`Senkrechte Hilfslinie ${k + 1}, Abstand vom linken Rand in Pixeln`} />
              <span className="hint">px vom linken Rand</span>
              <button className="btn icon ghost small" onClick={() => removeGuide('x', k)} aria-label="Hilfslinie entfernen" title="Hilfslinie entfernen"><Icon.x size={13} /></button>
            </div>
          ))}
          <button className="btn small ghost" onClick={() => addGuide('x', Math.round(v.w / 2))}><Icon.plus /> Senkrechte Hilfslinie</button>
        </div>
      </Field>
      <Field label="Waagerecht (Y)" stack>
        <div className="stack-8">
          {v.guides.y.map((gy, k) => (
            <div className="row-btns nowrap" key={'gy' + k}>
              <NumInput min={0} max={v.h} value={gy} onChange={n => setGuide('y', k, Math.round(clamp(n, 0, v.h)))} ariaLabel={`Waagerechte Hilfslinie ${k + 1}, Abstand vom oberen Rand in Pixeln`} />
              <span className="hint">px vom oberen Rand</span>
              <button className="btn icon ghost small" onClick={() => removeGuide('y', k)} aria-label="Hilfslinie entfernen" title="Hilfslinie entfernen"><Icon.x size={13} /></button>
            </div>
          ))}
          <button className="btn small ghost" onClick={() => addGuide('y', Math.round(v.h / 2))}><Icon.plus /> Waagerechte Hilfslinie</button>
        </div>
      </Field>
      {(v.guides.x.length + v.guides.y.length) > 0 && <button className="btn small ghost danger" onClick={clearGuides}><Icon.trash /> Alle Hilfslinien entfernen</button>}
    </Section>
    <Section title="Bedienung">
      <p className="hint">Klick wählt ein Objekt (Titel, Karte, Legende …), <span className="kbd">Umschalt</span> + Klick ergänzt, Ziehen auf freier Fläche zieht einen Auswahlrahmen auf. Ein weiterer Klick in die gewählte Karte wählt ein Gebiet (<span className="kbd">Umschalt</span> + Klick ergänzt, <span className="kbd">Esc</span> zurück zur Karte). <b>Doppelklick auf die Karte</b> startet den Kartenmodus. Eckgriffe skalieren, der runde Griff dreht, <span className="kbd">Strg</span>+<span className="kbd">D</span> dupliziert, <span className="kbd">T</span> fügt ein Textfeld ein. <span className="kbd">Strg</span>+<span className="kbd">Z</span> macht rückgängig, <span className="kbd">Leertaste</span> + Ziehen verschiebt die Ansicht, <span className="kbd">Strg</span>+<span className="kbd">0</span> passt sie ein, <span className="kbd">Umschalt</span>+<span className="kbd">R</span> blendet die Hilfslinien ein oder aus.</p>
    </Section>
  </>;
}

/** Eigenschaften des Diagramm-Rahmens: Feinschliff der Darstellung (m7-5), unabhängig vom Schritt „Diagramm“
 *  (Art, Daten, Farben je Balken). Alle Felder bleiben ungesetzt, bis sie von Hand geändert werden – bestehende
 *  wie neue Diagramme sehen dadurch unverändert aus, solange niemand daran dreht. */
/** Texte im Halbkreis der Sitzverteilung einzeln: Schriftgröße und Versatz; Ziehen auf der Fläche setzt den Versatz ebenfalls */
function SeatTexts({ spec }: { spec: ChartSpec }) {
  const base = spec.valueSize ?? 24, tw = spec.seatText || {};
  const parts = [
    { id: 'majority', label: 'Mehrheit', def: Math.round(base * 0.8), off: spec.majorityOn === false },
    { id: 'total', label: 'Zahl in der Mitte', def: Math.round(base * 2.6), off: false },
    { id: 'sub', label: 'Zeile darunter', def: Math.round(base * 0.85), off: false },
  ] as const;
  const set = (id: 'majority' | 'total' | 'sub', patch: Partial<NonNullable<ChartSpec['seatText']>['majority']>, key: string) => update(d => {
    if (!d.chart) return; const st = (d.chart.seatText ||= {}); st[id] = { ...(st[id] || {}), ...patch };
  }, { key });
  const reset = (id: 'majority' | 'total' | 'sub') => update(d => { if (!d.chart?.seatText) return; delete d.chart.seatText[id]; if (!Object.keys(d.chart.seatText).length) delete d.chart.seatText; });
  return <Section title="Texte im Halbkreis">
    {parts.map(p => {
      const t = tw[p.id], changed = !!t && (t.size != null || !!t.dx || !!t.dy);
      return <Field key={p.id} label={p.label} stack>
        <div className="seat-text-row">
          <label>Größe<NumInput min={8} max={200} value={t?.size ?? p.def} onChange={n => set(p.id, { size: n }, 'seat-' + p.id + '-s')} ariaLabel={`Schriftgröße ${p.label}`} /></label>
          <label>X<NumInput min={-2000} max={2000} value={t?.dx ?? 0} onChange={n => set(p.id, { dx: n }, 'seat-' + p.id + '-x')} ariaLabel={`Versatz nach rechts ${p.label}`} /></label>
          <label>Y<NumInput min={-2000} max={2000} value={t?.dy ?? 0} onChange={n => set(p.id, { dy: n }, 'seat-' + p.id + '-y')} ariaLabel={`Versatz nach unten ${p.label}`} /></label>
          <button className="btn icon ghost small" disabled={!changed} onClick={() => reset(p.id)} aria-label={`${p.label} zurücksetzen`} title="Zurück auf Vorgabe">↺</button>
        </div>
        {p.off && <p className="hint">Die Mehrheitsmarke ist ausgeschaltet.</p>}
      </Field>;
    })}
    <p className="hint">Größe in px, X und Y verschieben den Text (nach rechts bzw. unten). Die Texte lassen sich auch auf der Fläche anfassen und ziehen.</p>
  </Section>;
}
function ChartFrameProps({ doc }: { doc: Doc }) {
  const spec = doc.chart || defaultChart();
  const isBalken = spec.type === 'balken', isLinie = spec.type === 'linie', isSitze = spec.type === 'sitze';
  const setC = (patch: Partial<ChartSpec>, key?: string) => update(d => { if (!d.chart) d.chart = defaultChart() as never; Object.assign(d.chart, patch); }, key ? { key } : undefined);
  return <>
    <Head t="Diagramm" sub={CHART_LABEL[spec.type]} />
    <Section title="Darstellung">
      {!isSitze && <Field label={isLinie ? 'Schriftgröße Werte/Endbeschriftung (px)' : 'Schriftgröße Werte (px)'}><NumInput min={10} max={60} value={spec.valueSize ?? (isLinie ? 24 : 28)} onChange={n => setC({ valueSize: n }, 'chart-valsize')} ariaLabel="Schriftgröße der Wertbeschriftung" /></Field>}
      {isSitze && <Field label="Form"><Seg items={[['punkte', 'Punkte'], ['ring', 'Halbring']] as ['punkte' | 'ring', string][]} value={spec.seatStyle || 'punkte'} onChange={v => setC({ seatStyle: v })} /></Field>}
      {isSitze && <Check checked={spec.majorityOn ?? true} onChange={on => setC({ majorityOn: on })}>Mehrheitsmarke</Check>}
      {!isLinie && !isSitze && <Field label="Abstand zwischen Balken (%)"><NumInput min={-30} max={80} step={5} value={Math.round((spec.gap ?? 0) * 100)} onChange={n => setC({ gap: n / 100 }, 'chart-gap')} ariaLabel="Abstand zwischen den Balken bzw. Säulen, negativ für enger als bisher" /></Field>}
      {(isBalken || isLinie) && <Check checked={spec.gridOn ?? true} onChange={on => setC({ gridOn: on })}>Rasterlinien anzeigen</Check>}
      {isLinie && <Check checked={spec.pointsOn ?? true} onChange={on => setC({ pointsOn: on })}>Punkte an den Werten zeigen</Check>}
      {isLinie && <Check checked={spec.axisZero ?? true} onChange={on => setC({ axisZero: on })}>Achse bei 0 beginnen</Check>}
      {isLinie && <Field label="Achse unten (Wert)"><OptNum value={spec.axisMin} onChange={n => setC({ axisMin: n }, 'chart-axmin')} ariaLabel="Eigener unterer Achsenwert, leer für automatisch" placeholder="automatisch" /></Field>}
      {isLinie && <Field label="Achse oben (Wert)"><OptNum value={spec.axisMax} onChange={n => setC({ axisMax: n }, 'chart-axmax')} ariaLabel="Eigener oberer Achsenwert, leer für automatisch" placeholder="automatisch" /></Field>}
      {(isBalken || isLinie) && <Field label="Schriftgröße Achse (px)"><NumInput min={8} max={40} value={spec.axisSize ?? 16} onChange={n => setC({ axisSize: n }, 'chart-axsize')} ariaLabel="Schriftgröße der Achsenbeschriftung" /></Field>}
      {isBalken && <Field label="Abstand Achse (px)"><NumInput min={0} max={60} value={spec.axisGap ?? 20} onChange={n => setC({ axisGap: n }, 'chart-axgap')} ariaLabel="Abstand der Achsenbeschriftung zu den Balken" /></Field>}
    </Section>
    {isSitze && <SeatTexts spec={spec} />}
    <p className="hint">{isSitze ? 'Daten, Sitze, Koalition und Reihenfolge der Parteien stehen im Schritt „Diagramm“; die Parteien mit Sitzen stehen in der Legende.' : `Art, Daten und Farben je ${isLinie ? 'Linie' : 'Balken'} stehen im Schritt „Diagramm“.`}</p>
  </>;
}

/** Freies Textfeld (M11 · Etappe 2) */
function FreeTextProps({ doc, id }: { doc: Doc; id: string }) {
  const n = findNode(doc.nodes, id), v = activeVariant(doc), L = v.L.nodes?.[id];
  if (!n?.text || !L) return <Head t="Textfeld nicht gefunden" />;
  const t = n.text;
  return <>
    <Head t="Textfeld" sub="Zeilenumbruch mit Eingabetaste" />
    <Field stack label="Text" htmlFor="p-text"><RichTextArea id="p-text" rows={3} value={t.text} marks={t.marks} baseBold={t.cut === 'bold'} onChange={(val, mk) => setNodeText(id, x => { x.text = val; x.marks = mk; }, 'txt-' + id)} /></Field>
    <Field label="Größe (px)"><NumInput min={6} max={300} value={t.size} onChange={k => setNodeText(id, x => { x.size = k; }, 'size-' + id)} ariaLabel="Schriftgröße" /></Field>
    <Field label="Schnitt"><select value={t.cut} onChange={e => { const c = e.target.value as Cut; setNodeText(id, x => { x.cut = c; }); }} aria-label="Schriftschnitt">{(['display', 'bold', 'text'] as Cut[]).map(c => <option key={c} value={c}>Merriweather · {CUTS[c].label}</option>)}</select></Field>
    <Field label="Farbe"><Seg items={[['ink', 'Dunkel'], ['inkSoft', 'Grau']]} value={t.color === 'inkSoft' ? 'inkSoft' : 'ink'} onChange={c => setNodeText(id, x => { x.color = c; })} /></Field>
    <Field label="Ausrichtung"><Seg items={[['start', 'Links'], ['middle', 'Mitte'], ['end', 'Rechts']]} value={t.align || 'start'} onChange={a => setNodeText(id, x => { x.align = a; })} /></Field>
    <Field label="Breite (px)"><NumInput min={40} max={v.w * 2} value={Math.round(L.w)} onChange={w => update(d => { const b = d.variants[d.active].L.nodes?.[id]; if (b) b.w = w; }, { key: 'w-' + id })} ariaLabel="Breite des Textfelds" /></Field>
    <Field label="Position (px)"><span className="mono">{Math.round(L.x)}, {Math.round(L.y)}</span></Field>
    <p className="hint">Doppelklick auf das Textfeld springt hierher. Text und Schrift gelten in allen Formaten, Lage, Breite, Drehung und Skalierung je Format.</p>
  </>;
}
/** Mehrere Objekte ausgewählt */
function MultiProps({ doc, ids }: { doc: Doc; ids: string[] }) {
  const kind = doc.graphics[doc.page]?.kind || 'map';
  const names = ids.map(id => { const n = findNode(doc.nodes, id); return n ? (n.type === 'text' && n.text ? textLabel(n) : nodeName(n, kind)) : id; });
  return <>
    <Head t={`${ids.length} Objekte ausgewählt`} sub={names.join(', ')} />
    <ArrangeSection doc={doc} ids={ids} />
    <p className="hint">Umschalt + Klick fügt hinzu oder entfernt. Ziehen verschiebt alle, die Eckgriffe skalieren alle gemeinsam (Alt: von der Mitte aus).</p>
  </>;
}
/** Anordnen: Drehung, Skalierung, Ebene, Ausrichten, Duplizieren/Kopieren/Löschen (für ein oder mehrere Objekte) */
function ArrangeSection({ doc, ids }: { doc: Doc; ids: string[] }) {
  const v = activeVariant(doc), one = ids.length === 1 ? ids[0] : null, L = one ? layoutOf(v, one) as Box | null : null;
  const k = L?.k ?? 1;
  const b = (title: string, icon: React.ReactNode, on: () => void) => <button className="btn icon small" title={title} aria-label={title} onClick={on}>{icon}</button>;
  return <Section title="Anordnen" aside={ids.length > 1 ? 'zueinander' : undefined}>
    {one && canRotate(one) && L && <Field label="Drehung (°)"><NumInput min={-180} max={180} value={Math.round(L.r ?? 0)} onChange={n => setRotation(one, n)} ariaLabel="Drehung in Grad" /></Field>}
    {one && L && Math.abs(k - 1) > 0.001 && <Field label="Skalierung"><span className="mono">{Math.round(k * 100)} %</span><button className="btn small ghost" onClick={() => resetScale(one)} title="Größe aus den Eckgriffen zurücknehmen">100 %</button></Field>}
    <Field label="Ebene"><div className="row-btns tight">{b('Ganz nach hinten (Strg+Umschalt+[)', <Icon.back />, () => reorder(ids, 'bottom'))}{b('Eine Ebene nach hinten (Strg+[)', <Icon.bwd />, () => reorder(ids, 'down'))}{b('Eine Ebene nach vorn (Strg+])', <Icon.fwd />, () => reorder(ids, 'up'))}{b('Ganz nach vorn (Strg+Umschalt+])', <Icon.front />, () => reorder(ids, 'top'))}</div></Field>
    <Field label={ids.length > 1 ? 'Ausrichten' : 'An der Fläche'}><div className="row-btns tight">{b('Links', <Icon.alignL />, () => align(ids, 'l'))}{b('Mittig (waagerecht)', <Icon.alignC />, () => align(ids, 'c'))}{b('Rechts', <Icon.alignR />, () => align(ids, 'r'))}{b('Oben', <Icon.alignT />, () => align(ids, 't'))}{b('Mittig (senkrecht)', <Icon.alignM />, () => align(ids, 'm'))}{b('Unten', <Icon.alignB />, () => align(ids, 'b'))}</div></Field>
    <div className="row-btns">
      <button className="btn small" onClick={() => duplicateNodes(ids)} title="Strg+D"><Icon.copy /> Duplizieren</button>
      <button className="btn small" onClick={() => copyNodes(ids)} title="Strg+C, einfügen mit Strg+V">Kopieren</button>
      {one !== 'main' && <button className="btn small" onClick={() => deleteNodes(ids)} title="Entf: Textfelder werden gelöscht, Titel, Legende, Logo usw. ausgeblendet"><Icon.trash /> {ids.every(isBuiltin) ? 'Ausblenden' : 'Löschen'}</button>}
    </div>
  </Section>;
}

function Props() {
  const doc = useStore(s => s.doc!);
  const s = useStore(s => s.ui.sel);
  const cm = colorModel(doc);
  let body: React.ReactNode;
  if (s.kind === 'area' && s.ids.length) body = <AreaProps doc={doc} ids={s.ids} cm={cm} />;
  else if (s.kind === 'el' && (s.id === 'title' || s.id === 'subtitle')) body = <TextProps doc={doc} id={s.id} />;
  else if (s.kind === 'el' && s.id === 'source') body = <SourceProps doc={doc} />;
  else if (s.kind === 'el' && s.id === 'legend') body = <LegendProps doc={doc} />;
  else if (s.kind === 'el' && s.id === 'logo') body = <LogoProps doc={doc} />;
  else if (s.kind === 'node') body = <FreeTextProps doc={doc} id={s.id} />;
  else if (s.kind === 'multi') body = <MultiProps doc={doc} ids={s.ids} />;
  else if (s.kind === 'hatch') body = <HatchProps doc={doc} id={s.id} />;
  else if (s.kind === 'ann') body = <AnnProps doc={doc} id={s.id} />;
  else if (s.kind === 'frame' && isChart(doc)) body = <ChartFrameProps doc={doc} />;
  else if (s.kind === 'frame') body = <FrameProps doc={doc} id={s.id} />;
  else if (s.kind === 'layer') body = <LayerProps doc={doc} id={s.id} />;
  else if (s.kind === 'overlay') body = <OverlayProps doc={doc} id={s.id} />;
  else if (s.kind === 'bubbles') body = <><Head t="Blasen" sub="Kreisfläche ∝ Wert" /><BubbleSection inPanel /></>;
  else body = <GraphicProps doc={doc} />;
  // Neuer Gegenstand = Eigenschaften von oben zeigen
  const selKey = s.kind === 'area' ? 'area:' + (s.ids.length > 1 ? 'multi' : s.ids[0]) : s.kind === 'multi' ? 'multi' : s.kind + ':' + ('id' in s ? s.id : '');
  const one = s.kind === 'el' || s.kind === 'frame' || s.kind === 'node' ? s.id : null;
  return <div className="props" key={selKey}><ErrorBoundary area="Eigenschaften" resetKey={doc}>{body}{one && <ArrangeSection doc={doc} ids={[one]} />}</ErrorBoundary></div>;
}

/** Ziehgriff am linken Rand: Panel breiter/schmaler ziehen (z. B. damit ein Farbwähler nicht am Fensterrand abgeschnitten wird). */
function PanelResize() {
  const onDown = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement; el.setPointerCapture(e.pointerId); el.classList.add('active');
    const startX = e.clientX, startW = getUI().panelW;
    const move = (ev: PointerEvent) => setUI({ panelW: clamp(startW - (ev.clientX - startX), 312, 640) });
    const up = () => { el.classList.remove('active'); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  return <div className="rp-resize" onPointerDown={onDown} role="separator" aria-orientation="vertical" aria-label="Panel-Breite ziehen" />;
}
export function RightPanel() {
  const doc = useStore(s => s.doc);
  return <aside className="rightpanel" aria-label="Ebenen und Eigenschaften"><PanelResize /><ErrorBoundary area="Ebenen" resetKey={doc}><Layers /></ErrorBoundary><Props /></aside>;
}
