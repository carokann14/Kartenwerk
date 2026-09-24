import React, { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { create } from 'zustand';
import { CONTEXT, GEO, areaContext, areaD, areaTitle, arcLines, bboxOfIds, linesD, lodTol } from '../geo/geo';
import { CUTS, measureW } from '../lib/fonts';
import { clamp, esc, fmt1, fmtNum } from '../lib/util';
import { beginGesture, getDoc, getUI, setUI, toast, update, useStore } from '../model/store';
import type { ArrowEl, ArrowEnd, Doc, Variant } from '../model/types';
import { colorModel, fillOf } from '../render/colorModel';
import { areaFill, hatchMap, patternSpec } from '../render/hatch';
import { LabelItem, TextPrim, activeVariant, labelPrims, layoutLabels, legendPrims, textPrims } from '../render/elements';
import { FrameId, frameMeshes, frameSets, geoOf, insetIdx, insetLabel } from '../render/scene';
import { refitFrame, setFokus, setGeoSet } from '../model/actions';
import { addArrow, addMarker, addTextBox } from '../model/annotations';
import { annItems, arrowRawEnds } from '../render/annotations';
import { groupMetrics, areaRowIndex } from '../data/derive';
import { LAENDER } from '../geo/geo';
import { Icon } from './common';

// Zeiger-Zustand außerhalb des Dokuments (kein Neuzeichnen der Panels)
const useHover = create<{ i: number | null; x: number; y: number }>(() => ({ i: null, x: 0, y: 0 }));

export function textEl(t: TextPrim, key?: React.Key) {
  const halo = t.halo ? { stroke: '#FFFFFF', strokeWidth: +(t.size * 0.24).toFixed(2), strokeLinejoin: 'round' as const, paintOrder: 'stroke' } : {};
  return <text key={key} x={+t.x.toFixed(1)} y={+t.y.toFixed(1)} fontFamily={CUTS[t.cut].family} fontSize={t.size} fill={t.color} textAnchor={t.anchor} {...halo} style={{ fontKerning: 'normal' }}>{t.text}</text>;
}

const AreaPaths = memo(function AreaPaths({ geoId, ids, fills, fill, u, pe, tol }: { geoId: string; ids: number[]; fills?: string[]; fill?: string; u?: boolean; pe?: boolean; tol: number }) {
  const g = GEO[geoId];
  return <g>{ids.map((i, k) => <path key={i} data-i={i} data-u={u ? 1 : undefined} d={areaD(g, i, tol)} fillRule="evenodd" fill={fills ? fills[k] : fill} pointerEvents={pe === false ? 'none' : undefined} />)}</g>;
});
const ContextLayer = memo(function ContextLayer({ neighbors, lakes, st, k }: { neighbors: boolean; lakes: boolean; st: Doc['style']; k: number }) {
  const nd = useMemo(() => CONTEXT.countries.map(c => c.d).join(''), []);
  const ld = useMemo(() => CONTEXT.lakes.map(c => c.d).join(''), []);
  return <>{neighbors && <path d={nd} fill={st.neighbor} stroke={st.neighborLine} strokeWidth={0.7 / k} strokeLinejoin="round" data-ctx="1" />}{lakes && <path d={ld} fill={st.water} data-ctx="1" />}</>;
});

function MapFrame({ id }: { id: FrameId }) {
  const doc = useStore(s => s.doc!);
  const sel = useStore(s => s.ui.sel);
  const hover = useHover(s => s.i);
  const zoom = useStore(s => s.ui.view.z);
  const v = activeVariant(doc), F = v.L[id], vw = F.view, st = doc.style, g = geoOf(doc);
  const tol = lodTol(g, vw.k, zoom);
  const sets = useMemo(() => frameSets(doc, id), [doc.geoSet, doc.fokus, doc.umfeld, doc.inset.preset, id]); // eslint-disable-line
  const me = useMemo(() => frameMeshes(doc, id, sets), [sets, doc.umfeldStyle]); // eslint-disable-line
  const cm = colorModel(doc);
  const Flist = useMemo(() => [...sets.F], [sets]);
  const Ulist = useMemo(() => [...sets.U], [sets]);
  const hm = hatchMap(doc);
  const fills = useMemo(() => Flist.map(i => doc.layers.wkFill ? areaFill(doc, cm, i) : st.umfeld), [Flist, cm, doc.overrides, doc.layers.wkFill, st.umfeld, hm]); // eslint-disable-line
  const hatchLayers = useMemo(() => {
    if (!doc.layers.hatches) return [];
    const by = new Map<string, string[]>();
    for (const i of Flist) { const h = hm.byArea[i]; if (h) { const L = by.get(h) || []; L.push(areaD(g, i, tol)); by.set(h, L); } }
    return [...by.entries()].map(([h, ds]) => ({ st: hm.styles.get(h)!, d: ds.join('') }));
  }, [Flist, hm, doc.layers.hatches, tol]); // eslint-disable-line
  const krOn = doc.layers.krLines && me.kr.length > 0;
  const md = useMemo(() => { const L = (x: number[]) => linesD(arcLines(g, x, tol)); return { wk: L(krOn ? me.wk : [...me.wk, ...me.kr]), wkU: L(me.wkU), kr: krOn ? L(me.kr) : '', land: L(me.land), outline: L(me.outline), fokus: L(me.fokus) }; }, [me, tol, krOn]); // eslint-disable-line
  const labels = useMemo(() => layoutLabels(doc, id), [doc, id]);
  const linesMode = me.linesMode;
  const k = vw.k;
  const selIds = sel.kind === 'area' ? sel.ids.map(x => g.byId.get(x)).filter((x): x is number => x != null && sets.F.has(x)) : [];
  const selD = selIds.map(i => areaD(g, i, tol)).join('');
  const lupe = id === 'main' && doc.inset.visible && doc.fokus.kind === 'de' ? (() => { const bb = bboxOfIds(g, insetIdx(doc)), p = 800; return { x: bb[0] - p, y: bb[1] - p, w: bb[2] - bb[0] + 2 * p, h: bb[3] - bb[1] + 2 * p }; })() : null;
  const capSize = Math.round(17 * v.ts);
  return (
    <g className="frame" data-frame={id} transform={`translate(${F.x} ${F.y})`}>
      <clipPath id={'clip-' + id}><rect width={F.w} height={F.h} /></clipPath>
      <rect className="frame-hit" data-frame-hit={id} width={F.w} height={F.h} fill="#FFFFFF" fillOpacity={id === 'inset' ? 1 : 0} />
      <g clipPath={`url(#clip-${id})`}>
        <g transform={`matrix(${k} 0 0 ${k} ${F.w / 2 - vw.cx * k} ${F.h / 2 - vw.cy * k})`}>
          <ContextLayer neighbors={doc.layers.neighbors} lakes={doc.layers.lakes} st={st} k={k} />
          <AreaPaths geoId={doc.geoSet} ids={Ulist} fill={linesMode ? 'none' : st.umfeld} u pe={!linesMode} tol={tol} />
          <AreaPaths geoId={doc.geoSet} ids={Flist} fills={fills} tol={tol} />
          {hatchLayers.length > 0 && <g pointerEvents="none">
            <defs>{hatchLayers.map(({ st: h }) => { const P = patternSpec(h, k); return (
              <pattern key={h.id} id={`hp-${id}-${h.id}`} patternUnits="userSpaceOnUse" width={P.s} height={P.s} patternTransform={`rotate(${P.ang})`}>
                {P.dot ? <circle cx={P.s / 2} cy={P.s / 2} r={P.dot} fill={h.color} /> : P.lines.map((d, j) => <path key={j} d={d} stroke={h.color} strokeWidth={P.w} fill="none" />)}
              </pattern>); })}</defs>
            {hatchLayers.map(({ st: h, d }) => <path key={h.id} d={d} fill={`url(#hp-${id}-${h.id})`} fillRule="evenodd" />)}
          </g>}
          {doc.layers.wkLines && <path d={md.wk} fill="none" stroke={st.wkLine} strokeWidth={st.wkLineW / k} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />}
          {krOn && <path d={md.kr} fill="none" stroke={st.krLine} strokeWidth={st.krLineW / k} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />}
          {linesMode && <><path d={md.wkU} fill="none" stroke="#C8C2B6" strokeWidth={0.6 / k} strokeLinejoin="round" pointerEvents="none" /><path d={md.outline} fill="none" stroke="#B9B2A5" strokeWidth={0.8 / k} strokeLinejoin="round" pointerEvents="none" /></>}
          {doc.layers.landLines && <path d={md.land} fill="none" stroke={st.landLine} strokeWidth={st.landLineW / k} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />}
          {id === 'main' && doc.fokusOutline && doc.fokus.kind !== 'de' && <path d={md.fokus} fill="none" stroke={st.fokusLine} strokeWidth={1.8 / k} strokeLinejoin="round" pointerEvents="none" />}
          {lupe && <rect x={lupe.x} y={lupe.y} width={lupe.w} height={lupe.h} fill="none" stroke={st.frameLine} strokeWidth={1.2 / k} pointerEvents="none" />}
          {hover != null && sets.F.has(hover) && <path d={areaD(g, hover, tol)} fill="none" stroke={st.ink} strokeWidth={1.4 / k} pointerEvents="none" />}
          {selD && <><path d={selD} fill="none" stroke="#FFFFFF" strokeWidth={4.2 / k} strokeLinejoin="round" pointerEvents="none" /><path d={selD} fill="none" stroke="#16181B" strokeWidth={1.8 / k} strokeLinejoin="round" pointerEvents="none" /></>}
        </g>
        <g className="lbls">{labels.items.map(it => <LabelG key={it.key} it={it} doc={doc} />)}</g>
      </g>
      {id === 'inset' && <>
        <rect width={F.w} height={F.h} fill="none" stroke={st.frameLine} strokeWidth={1.5} pointerEvents="none" />
        <rect x={0} y={0} width={Math.round(measureW(insetLabel(doc), 'bold', capSize) + 14)} height={capSize + 10} fill={st.frameLine} pointerEvents="none" />
        {textEl({ x: 7, y: 5 + capSize * 0.8, text: insetLabel(doc), cut: 'bold', size: capSize, color: '#FFFFFF', anchor: 'start' })}
      </>}
    </g>
  );
}
function LabelG({ it, doc }: { it: LabelItem; doc: Doc }) {
  const st = doc.style;
  return (
    <g className="lbl" data-lbl={it.key}>
      {it.leader && <><line x1={it.leader[0]} y1={it.leader[1]} x2={it.leader[2]} y2={it.leader[3]} stroke={st.ink} strokeWidth={1} /><circle cx={it.leader[0]} cy={it.leader[1]} r={2} fill={st.ink} /></>}
      <rect x={it.box[0]} y={it.box[1]} width={it.box[2] - it.box[0]} height={it.box[3] - it.box[1]} fill="#FFFFFF" fillOpacity={0} />
      {labelPrims(doc, it).map((t, k) => textEl(t, k))}
    </g>
  );
}
function Elements() {
  const doc = useStore(s => s.doc!);
  const items: React.ReactNode[] = [];
  for (const kind of ['title', 'subtitle', 'source'] as const) {
    const p = textPrims(doc, kind);
    if (p) items.push(<g key={kind} data-el={kind}>{p.texts.map((t, k) => textEl(t, k))}<rect x={p.box.x} y={p.box.y} width={p.box.w} height={p.box.h} fill="#FFFFFF" fillOpacity={0} /></g>);
  }
  const lp = legendPrims(doc);
  if (lp) items.push(<g key="legend" data-el="legend">{lp.rects.map((r, k) => <rect key={'r' + k} x={+r.x.toFixed(1)} y={+r.y.toFixed(1)} width={+r.w.toFixed(1)} height={+r.h.toFixed(1)} fill={r.fill} />)}{(lp.paths || []).map((q, k) => <path key={'p' + k} d={q.d} fill={q.fill} stroke={q.stroke} strokeWidth={q.width} />)}{lp.texts.map((t, k) => textEl(t, 't' + k))}<rect x={lp.box.x} y={lp.box.y} width={lp.box.w} height={lp.box.h} fill="#FFFFFF" fillOpacity={0} /></g>);
  return <g>{items}</g>;
}
function Annotations() {
  const doc = useStore(s => s.doc!);
  const items = annItems(doc, activeVariant(doc));
  return <g>{items.map(it => (
    <g key={it.id + it.frame} data-ann={it.id} data-frame={it.frame}>
      {it.el.type === 'text' && <rect data-part="body" x={it.body[0]} y={it.body[1]} width={it.body[2] - it.body[0]} height={it.body[3] - it.body[1]} fill="#FFFFFF" fillOpacity={0} />}
      {it.arrow && <path data-part="body" d={it.arrow.d} fill="none" stroke="#FFFFFF" strokeOpacity={0} strokeWidth={14} />}
      {it.paths.map((q, k) => <path key={k} data-part="body" d={q.d} fill={q.fill} stroke={q.stroke} strokeWidth={q.width} strokeLinejoin="round" strokeLinecap={q.cap} strokeDasharray={q.dash} />)}
      {it.el.type === 'marker' && <rect data-part="body" x={it.body[0]} y={it.body[1]} width={it.body[2] - it.body[0]} height={it.body[3] - it.body[1]} fill="#FFFFFF" fillOpacity={0} />}
      {it.texts.length > 0 && <g data-part={it.el.type === 'marker' ? 'label' : 'body'}>
        {it.label && <rect x={it.label[0]} y={it.label[1]} width={it.label[2] - it.label[0]} height={it.label[3] - it.label[1]} fill="#FFFFFF" fillOpacity={0} />}
        {it.texts.map((t, k) => textEl(t, k))}
      </g>}
    </g>))}</g>;
}
function elementBox(doc: Doc, id: string) {
  const v = activeVariant(doc);
  if (id === 'legend') return legendPrims(doc)?.box || null;
  if (id === 'main' || id === 'inset') { const F = v.L[id]; return { x: F.x, y: F.y, w: F.w, h: F.h }; }
  return textPrims(doc, id as 'title')?.box || null;
}
function Overlay() {
  const doc = useStore(s => s.doc!);
  const ui = useStore(s => s.ui);
  const v = activeVariant(doc), z = ui.view.z, a = 'var(--accent)';
  const out: React.ReactNode[] = [];
  const box = (b: { x: number; y: number; w: number; h: number }, key: string, dash: boolean, w = 1.5) => <rect key={key} x={b.x - 3 / z} y={b.y - 3 / z} width={b.w + 6 / z} height={b.h + 6 / z} fill="none" stroke={a} strokeWidth={w / z} strokeDasharray={dash ? `${5 / z} ${4 / z}` : undefined} />;
  if (ui.sel.kind === 'el') { const b = elementBox(doc, ui.sel.id); if (b) out.push(box(b, 'el', false)); }
  const draft = useArrowDraft();
  if (draft.a && draft.b) out.push(<line key="draft" x1={draft.a[0]} y1={draft.a[1]} x2={draft.b[0]} y2={draft.b[1]} stroke={a} strokeWidth={2 / z} strokeDasharray={`${6 / z} ${4 / z}`} />);
  if (ui.sel.kind === 'ann') {
    const sid = ui.sel.id;
    const ar = annItems(doc, v).find(it => it.id === sid && it.arrow);
    if (ar?.arrow) {
      const g = ar.arrow, r = 5.5 / z, el = ar.el as ArrowEl;
      const hd = (key: 'from' | 'to' | 'mid', p: [number, number], linked: boolean) => <circle key={key} data-arrow-handle={key} data-id={sid} cx={p[0]} cy={p[1]} r={key === 'mid' ? r * 0.85 : r} fill={linked ? a : 'var(--panel)'} stroke={a} strokeWidth={1.5 / z} style={{ pointerEvents: 'all', cursor: key === 'mid' ? 'grab' : 'crosshair' }} />;
      out.push(<path key="ahl" d={g.d} fill="none" stroke={a} strokeWidth={1 / z} strokeDasharray={`${4 / z} ${3 / z}`} />);
      out.push(hd('mid', g.mid, false), hd('from', g.p0, el.from.kind === 'el' || el.from.kind === 'area'), hd('to', g.p1, el.to.kind === 'el' || el.to.kind === 'area'));
      return <svg id="overlay" width={v.w} height={v.h} viewBox={`0 0 ${v.w} ${v.h}`}>{out}</svg>;
    }
    annItems(doc, v).filter(it => it.id === sid).forEach((it, k) => {
      out.push(box({ x: it.body[0], y: it.body[1], w: it.body[2] - it.body[0], h: it.body[3] - it.body[1] }, 'ab' + k, false));
      if (it.label) out.push(box({ x: it.label[0], y: it.label[1], w: it.label[2] - it.label[0], h: it.label[3] - it.label[1] }, 'al' + k, true, 1));
    });
  }
  if (ui.sel.kind === 'frame' || ui.mapMode) {
    const id = ui.mapMode || (ui.sel.kind === 'frame' ? ui.sel.id : 'main');
    const b = elementBox(doc, id);
    if (b) {
      out.push(box(b, 'fr', !ui.mapMode, ui.mapMode ? 3 : 1.5));
      if (!ui.mapMode) { const hs = 10 / z; out.push(<rect key="h" data-handle={id} x={b.x + b.w - hs / 2} y={b.y + b.h - hs / 2} width={hs} height={hs} fill="var(--panel)" stroke={a} strokeWidth={1.5 / z} style={{ pointerEvents: 'all', cursor: 'nwse-resize' }} />); }
    }
  }
  return <svg id="overlay" width={v.w} height={v.h} viewBox={`0 0 ${v.w} ${v.h}`}>{out}</svg>;
}

function Tooltip() {
  const h = useHover();
  const doc = useStore(s => s.doc!);
  if (h.i == null) return null;
  const g = geoOf(doc), a = g.areas[h.i], cm = colorModel(doc);
  let rows: React.ReactNode = null;
  if (cm.dataset && cm.group) {
    const r = areaRowIndex(cm.dataset).get(a.id);
    if (r != null) {
      const gm = groupMetrics(cm.dataset, cm.group)[r];
      const top = gm.share.map((s, k) => ({ s, k })).filter(x => x.s != null).sort((x, y) => y.s! - x.s!).slice(0, 3);
      rows = top.map(({ s, k }) => { const c = cm.dataset!.columns.find(x => x.id === cm.group!.columns[k])!; return <div className="tt-r" key={k}><i style={{ background: c.party ? (doc.partyColors[c.party] || '#999') : '#999' }} /><span>{c.short || c.label.split(' · ')[0]}</span><span className="num">{fmt1(s)} %</span></div>; });
    } else rows = <div className="tt-s">keine Daten</div>;
  } else if (cm.dataset) {
    const v = cm.valueOf(h.i);
    rows = <div className="tt-s">{cm.mode === 'kategorie' ? (cm.keys[h.i] || 'keine Daten') : v == null ? 'keine Daten' : fmtNum(v, 2)}</div>;
  }
  const ov = doc.overrides[doc.geoSet + ':' + a.id];
  return <div className="tooltip" style={{ left: h.x, top: h.y }}><div className="tt-h">{areaTitle(g, h.i)}</div><div className="tt-s">{areaContext(g, h.i)}{a.free ? ' · gemeindefrei' : ''}{cm.group ? ' · ' + cm.group.label : ''}{(() => { const hm = hatchMap(doc), hh = doc.layers.hatches ? hm.byArea[h.i] : null; return hh ? ' · ' + (hm.styles.get(hh)?.name || '') : ''; })()}{ov ? ' · manuell eingefärbt' : ''}</div>{rows}</div>;
}

function MapModeBar({ wrap }: { wrap: React.RefObject<HTMLDivElement> }) {
  const doc = useStore(s => s.doc!);
  const ui = useStore(s => s.ui);
  if (!ui.mapMode) return null;
  const locked = activeVariant(doc).locked[ui.mapMode];
  const id = ui.mapMode;
  return (
    <div className="mapmode-bar">
      <b>Kartenmodus</b><span style={{ opacity: .7 }}>{locked ? 'Ausschnitt gesperrt' : 'Mausrad zoomt · Ziehen verschiebt · Doppelklick: tiefer'}</span>
      <button className="btn small" onClick={() => refitFrame(id)}><Icon.fit /> Einpassen</button>
      <button className={'btn small' + (locked ? ' on' : '')} onClick={() => update(d => { d.variants[d.active].locked[id] = !d.variants[d.active].locked[id]; })}><Icon.lock /> {locked ? 'Gesperrt' : 'Sperren'}</button>
      <button className="btn small" onClick={() => setUI({ mapMode: null })}>Fertig <span className="kbd kbd-inv">Esc</span></button>
    </div>
  );
}

// ---------- Arbeitsfläche ----------
type Drag = { type: string; sx: number; sy: number; moved: boolean; shift: boolean; pid: number; [k: string]: unknown };
export function fitViewToCanvas() {
  const el = document.getElementById('canvas'); const doc = getDoc(); if (!el || !doc) return;
  const v = activeVariant(doc), cw = el.clientWidth, ch = el.clientHeight;
  const z = clamp(Math.min((cw - 64) / v.w, (ch - 110) / v.h), 0.08, 4);
  setUI({ view: { z, x: (cw - v.w * z) / 2, y: Math.max(44, (ch - v.h * z) / 2 - 12) } });
}
export function zoomViewBy(f: number) {
  const el = document.getElementById('canvas'); if (!el) return;
  const { view } = getUI(); const cx = el.clientWidth / 2, cy = el.clientHeight / 2;
  const z1 = clamp(view.z * f, 0.08, 6);
  setUI({ view: { z: z1, x: cx - (cx - view.x) * z1 / view.z, y: cy - (cy - view.y) * z1 / view.z } });
}

// Vorschau beim Zeichnen eines Pfeils
const useArrowDraft = create<{ a: [number, number] | null; b: [number, number] | null }>(() => ({ a: null, b: null }));
/** Pfeil-Ende an der Zeigerposition: Marker oder Textkasten unter dem Zeiger, Gebietsmittelpunkt in der Nähe, sonst freier Punkt. */
function snapEnd(d: Doc, clientX: number, clientY: number, a: number[], exclude: string | null): ArrowEnd {
  const v = activeVariant(d);
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    const ann = (el as Element).closest?.('[data-ann]') as SVGElement | null;
    if (ann && ann.dataset.ann !== exclude && ann.dataset.frame !== 'inset') { const e = d.els.find(x => x.id === ann.dataset.ann); if (e && e.type !== 'arrow') return { kind: 'el', id: e.id }; }
    const area = (el as Element).closest?.('path[data-i]') as SVGPathElement | null;
    if (area && !area.dataset.u && area.closest('g.frame')?.getAttribute('data-frame') === 'main') {
      const g = geoOf(d), ar = g.areas[+area.dataset.i!], F = v.L.main, w = F.view;
      const px = F.x + (ar.label[0] - w.cx) * w.k + F.w / 2, py = F.y + (ar.label[1] - w.cy) * w.k + F.h / 2;
      if (Math.hypot(px - a[0], py - a[1]) < 14 / Math.max(0.2, getUI().view.z)) return { kind: 'area', key: d.geoSet + ':' + ar.id };
      break;
    }
  }
  if (inFrameAt(v, 'main', a)) { const F = v.L.main, w = F.view; return { kind: 'map', at: [Math.round(w.cx + (a[0] - F.x - F.w / 2) / w.k), Math.round(w.cy + (a[1] - F.y - F.h / 2) / w.k)] }; }
  return { kind: 'board', at: [clamp(a[0] / v.w, 0, 1), clamp(a[1] / v.h, 0, 1)] };
}
/** Werkzeug anwenden: Marker oder Textkasten an der Klickstelle anlegen */
function placeTool(d: Doc, tool: 'marker' | 'text' | 'arrow', a: number[]) {
  if (tool === 'arrow') return;
  const v = activeVariant(d);
  const fid: FrameId | null = d.inset.visible && inFrameAt(v, 'inset', a) ? 'inset' : inFrameAt(v, 'main', a) ? 'main' : null;
  const geo = fid ? (() => { const F = v.L[fid], w = F.view; return [w.cx + (a[0] - F.x - F.w / 2) / w.k, w.cy + (a[1] - F.y - F.h / 2) / w.k] as [number, number]; })() : null;
  if (tool === 'marker') { if (!geo) { toast('Marker bitte in die Karte setzen'); return; } addMarker(geo); return; }
  if (geo && fid === 'main') addTextBox('map', geo); else addTextBox('board', [clamp(a[0] / v.w, 0, 1), clamp(a[1] / v.h, 0, 1)]);
}
const inFrameAt = (v: Variant, id: FrameId, [ax, ay]: number[]) => { const F = v.L[id]; return ax >= F.x && ay >= F.y && ax <= F.x + F.w && ay <= F.y + F.h; };
export function Canvas() {
  const doc = useStore(s => s.doc!);
  const view = useStore(s => s.ui.view);
  const mapMode = useStore(s => s.ui.mapMode);
  const panelOpen = useStore(s => s.ui.panelOpen);
  const tool = useStore(s => s.ui.tool);
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const space = useRef(false);
  const v = activeVariant(doc);
  const cm = colorModel(doc);

  useLayoutEffect(() => { fitViewToCanvas(); }, [doc.active, v.w, v.h, panelOpen]);
  useEffect(() => { const r = () => fitViewToCanvas(); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  useEffect(() => {
    const kd = (e: KeyboardEvent) => { const t = e.target as HTMLElement; if (e.key === ' ' && !/INPUT|TEXTAREA|SELECT/.test(t.tagName)) { space.current = true; wrap.current?.classList.add('panning'); e.preventDefault(); } };
    const ku = (e: KeyboardEvent) => { if (e.key === ' ') { space.current = false; wrap.current?.classList.remove('panning'); } };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);

  const toArt = (e: { clientX: number; clientY: number }) => { const r = wrap.current!.getBoundingClientRect(); const vw = getUI().view; return [(e.clientX - r.left - vw.x) / vw.z, (e.clientY - r.top - vw.y) / vw.z]; };
  const inFrame = (d: Doc, id: FrameId, [ax, ay]: number[]) => { if (id === 'inset' && !d.inset.visible) return false; const F = activeVariant(d).L[id]; return ax >= F.x && ay >= F.y && ax <= F.x + F.w && ay <= F.y + F.h; };

  // Mausrad: Ansicht oder (im Kartenmodus) Kartenausschnitt
  useEffect(() => {
    const el = wrap.current!;
    let wheelGesture = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const d = getDoc(), u = getUI(); const a = toArt(e);
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016));
      if (u.mapMode && inFrame(d, u.mapMode, a)) {
        const id = u.mapMode, vv = activeVariant(d);
        if (vv.locked[id]) { toast('Ausschnitt gesperrt'); return; }
        const F = vv.L[id], fv = F.view, px = a[0] - F.x, py = a[1] - F.y;
        const gx = fv.cx + (px - F.w / 2) / fv.k, gy = fv.cy + (py - F.h / 2) / fv.k;
        const k1 = clamp(fv.k * f, 0.002, 3);
        if (Date.now() - wheelGesture > 600) beginGesture();
        wheelGesture = Date.now();
        update(dd => { const V = dd.variants[dd.active].L[id].view; V.k = k1; V.cx = gx - (px - F.w / 2) / k1; V.cy = gy - (py - F.h / 2) / k1; }, { history: false });
        return;
      }
      const r = el.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top, vw = u.view;
      const z1 = clamp(vw.z * f, 0.08, 6);
      setUI({ view: { z: z1, x: cx - (cx - vw.x) * z1 / vw.z, y: cy - (cy - vw.y) * z1 / vw.z } });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    const t = e.target as Element;
    if (t.closest('.canvas-hud, .mapmode-bar, .canvas-banner')) return;
    const d = getDoc(), u = getUI(), a = toArt(e);
    const base = { sx: e.clientX, sy: e.clientY, moved: false, shift: e.shiftKey, pid: e.pointerId };
    if (e.button === 1 || space.current) { e.preventDefault(); drag.current = { ...base, type: 'view', ox: u.view.x, oy: u.view.y }; wrap.current!.classList.add('dragging'); return; }
    if (e.button !== 0) return;
    if (u.tool === 'arrow') { const from = snapEnd(d, e.clientX, e.clientY, a, null); useArrowDraft.setState({ a: [a[0], a[1]], b: [a[0], a[1]] }); drag.current = { ...base, type: 'arrowNew', from }; return; }
    if (u.tool) { placeTool(d, u.tool, a); return; }
    const ah = t.closest('[data-arrow-handle]') as SVGElement | null;
    if (ah) {
      const id = ah.dataset.id!, which = ah.dataset.arrowHandle as 'from' | 'to' | 'mid', el = d.els.find(x => x.id === id);
      if (el && el.type === 'arrow') {
        if (which === 'mid') { const [A, B] = arrowRawEnds(d, activeVariant(d), el); drag.current = { ...base, type: 'arrowBend', id, A, B }; }
        else drag.current = { ...base, type: 'arrowEnd', id, which };
        return;
      }
    }
    const annEl = t.closest('[data-ann]') as SVGElement | null;
    if (annEl && !u.mapMode) {
      const id = annEl.dataset.ann!, part = (t.closest('[data-part]') as SVGElement | null)?.dataset.part || 'body', fr = annEl.dataset.frame as 'main' | 'inset' | 'board';
      const el = d.els.find(x => x.id === id);
      if (el) {
        setUI({ sel: { kind: 'ann', id } });
        const vv = activeVariant(d);
        if (el.type === 'arrow') { drag.current = { ...base, type: 'none' }; return; }
        if (el.type === 'marker' && part === 'body') drag.current = { ...base, type: 'annAt', id, oat: [...el.at], k: vv.L[fr === 'inset' ? 'inset' : 'main'].view.k };
        else if (el.type === 'text' && el.anchor === 'board' && part === 'body' && e.altKey) drag.current = { ...base, type: 'annAt', id, oat: [...el.at], board: true };
        else { const dflt = el.type === 'text' && el.anchor === 'map' && el.leader ? annItems(d, vv).find(it => it.id === id) : null; const off = vv.ann[id] || (dflt ? [dflt.body[0] - dflt.anchor[0], dflt.body[1] - dflt.anchor[1]] : [0, 0]); drag.current = { ...base, type: 'annOff', id, o: [...off] }; }
        return;
      }
    }
    const areaEl = t.closest('path[data-i]') as SVGPathElement | null;
    const areaI = areaEl && !areaEl.dataset.u ? +areaEl.dataset.i! : null;
    if (u.mapMode && inFrame(d, u.mapMode, a) && !t.closest('g.lbl')) {
      const fv = activeVariant(d).L[u.mapMode].view;
      drag.current = { ...base, type: 'map', id: u.mapMode, ocx: fv.cx, ocy: fv.cy, i: areaI };
    } else if (u.mapMode && !inFrame(d, u.mapMode, a)) {
      setUI({ mapMode: null }); return onPointerDown(e);
    } else if (t.closest('[data-handle]')) {
      const id = (t.closest('[data-handle]') as SVGElement).dataset.handle as FrameId, F = activeVariant(d).L[id];
      drag.current = { ...base, type: 'resize', id, ow: F.w, oh: F.h };
    } else if (t.closest('g.lbl')) {
      const key = (t.closest('g.lbl') as SVGElement).dataset.lbl!, fid = key.split(':')[0] as FrameId;
      const it = layoutLabels(d, fid).items.find(x => x.key === key);
      if (!it) return;
      const F = activeVariant(d).L[fid], g = geoOf(d), [lx, ly] = g.areas[it.i].label;
      const ax = (lx - F.view.cx) * F.view.k + F.w / 2, ay = (ly - F.view.cy) * F.view.k + F.h / 2;
      drag.current = { ...base, type: 'label', key, o: [it.cx - ax, it.cy - ay] };
      setUI({ sel: { kind: 'layer', id: 'labels' } });
    } else if (t.closest('[data-el]')) {
      const id = (t.closest('[data-el]') as SVGElement).dataset.el as 'title', L = activeVariant(d).L[id];
      setUI({ sel: { kind: 'el', id } });
      drag.current = { ...base, type: 'el', id, ox: L.x, oy: L.y };
    } else if (areaI != null) {
      drag.current = { ...base, type: 'area', i: areaI };
    } else if (t.closest('g.frame')) {
      const id = (t.closest('g.frame') as SVGElement).dataset.frame as FrameId, F = activeVariant(d).L[id];
      setUI({ sel: { kind: 'frame', id } });
      drag.current = { ...base, type: 'frame', id, ox: F.x, oy: F.y };
    } else { setUI({ sel: { kind: 'graphic' } }); drag.current = { ...base, type: 'none' }; }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const dg = drag.current;
    if (!dg) {
      const t = e.target as Element; const p = t.closest?.('path[data-i]') as SVGPathElement | null;
      const i = p && !p.dataset.u ? +p.dataset.i! : null;
      const r = wrap.current!.getBoundingClientRect();
      let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14; if (x + 250 > r.width) x -= 270; if (y + 110 > r.height) y -= 124;
      if (i !== useHover.getState().i || i != null) useHover.setState({ i, x, y });
      return;
    }
    const dxs = e.clientX - dg.sx, dys = e.clientY - dg.sy;
    if (!dg.moved && Math.hypot(dxs, dys) < 3) return;
    if (!dg.moved) { try { wrap.current!.setPointerCapture(dg.pid); } catch { /* egal */ } if (dg.type !== 'view' && dg.type !== 'area' && dg.type !== 'none' && dg.type !== 'arrowNew') beginGesture(); useHover.setState({ i: null }); }
    dg.moved = true;
    const z = getUI().view.z, dx = dxs / z, dy = dys / z;
    switch (dg.type) {
      case 'view': setUI({ view: { ...getUI().view, x: (dg.ox as number) + dxs, y: (dg.oy as number) + dys } }); break;
      case 'map': { const id = dg.id as FrameId; const d = getDoc(); if (activeVariant(d).locked[id]) break; update(dd => { const V = dd.variants[dd.active].L[id].view; V.cx = (dg.ocx as number) - dx / V.k; V.cy = (dg.ocy as number) - dy / V.k; }, { history: false }); break; }
      case 'el': update(dd => { const L = dd.variants[dd.active].L[dg.id as 'title']; L.x = Math.round((dg.ox as number) + dx); L.y = Math.round((dg.oy as number) + dy); }, { history: false }); break;
      case 'frame': update(dd => { const F = dd.variants[dd.active].L[dg.id as FrameId]; F.x = Math.round((dg.ox as number) + dx); F.y = Math.round((dg.oy as number) + dy); }, { history: false }); break;
      case 'resize': update(dd => { const F = dd.variants[dd.active].L[dg.id as FrameId]; F.w = Math.max(80, Math.round((dg.ow as number) + dx)); F.h = Math.max(80, Math.round((dg.oh as number) + dy)); }, { history: false }); break;
      case 'annAt': {
        if (dg.board) { const vv = activeVariant(getDoc()); const o = dg.oat as number[]; update(dd => { const el = dd.els.find(x => x.id === dg.id); if (el && el.type === 'text') el.at = [clamp(o[0] + dx / vv.w, 0, 1), clamp(o[1] + dy / vv.h, 0, 1)]; }, { history: false }); break; }
        const o = dg.oat as number[], k = dg.k as number;
        update(dd => { const el = dd.els.find(x => x.id === dg.id); if (el && el.type === 'marker') { el.at = [Math.round(o[0] + dx / k), Math.round(o[1] + dy / k)]; el.place = null; } }, { history: false }); break;
      }
      case 'arrowNew': { const p = toArt(e); useArrowDraft.setState({ b: [p[0], p[1]] }); break; }
      case 'arrowEnd': { const p = toArt(e); const d = getDoc(); const end = snapEnd(d, e.clientX, e.clientY, p, dg.id as string); update(dd => { const x = dd.els.find(q => q.id === dg.id); if (x && x.type === 'arrow') x[dg.which as 'from'] = end.kind === 'el' || end.kind === 'area' ? end : end; }, { history: false }); break; }
      case 'arrowBend': {
        const p = toArt(e), A = dg.A as number[], B = dg.B as number[], ddx = B[0] - A[0], ddy = B[1] - A[1], L = Math.hypot(ddx, ddy) || 1;
        const cx = 2 * p[0] - (A[0] + B[0]) / 2, cy = 2 * p[1] - (A[1] + B[1]) / 2, mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
        let bend = ((cx - mx) * (-ddy / L) + (cy - my) * (ddx / L)) / L; if (Math.abs(bend) < 0.03) bend = 0;
        update(dd => { const x = dd.els.find(q => q.id === dg.id); if (x && x.type === 'arrow') x.bend = Math.round(clamp(bend, -1.5, 1.5) * 100) / 100; }, { history: false }); break;
      }
      case 'annOff': { const o = dg.o as number[]; update(dd => { dd.variants[dd.active].ann[dg.id as string] = [Math.round(o[0] + dx), Math.round(o[1] + dy)]; }, { history: false }); break; }
      case 'label': { const o = dg.o as number[]; update(dd => { dd.variants[dd.active].labelOffsets[dg.key as string] = [Math.round(o[0] + dx), Math.round(o[1] + dy)]; }, { history: false }); break; }
    }
  };
  const onPointerUp = (e?: React.PointerEvent) => {
    const dg = drag.current; drag.current = null;
    wrap.current?.classList.remove('dragging');
    if (dg?.type === 'arrowNew') {
      useArrowDraft.setState({ a: null, b: null });
      const d = getDoc(), v = activeVariant(d);
      if (!dg.moved || !e) { toast('Pfeil: vom Start zum Ziel ziehen'); return; }
      const p = toArt(e), from = dg.from as ArrowEnd;
      const to = snapEnd(d, e.clientX, e.clientY, p, from.kind === 'el' ? from.id : null);
      if (JSON.stringify(to) === JSON.stringify(from)) { toast('Start und Ziel sind gleich'); return; }
      void v; addArrow(from, to); return;
    }
    if (!dg || dg.moved) return;
    const i = dg.type === 'area' ? dg.i as number : dg.type === 'map' ? dg.i as number | null : null;
    if (i != null) {
      const d = getDoc(), g = geoOf(d), id = g.areas[i].id, u = getUI();
      if (dg.shift && u.sel.kind === 'area') { const s = new Set(u.sel.ids); s.has(id) ? s.delete(id) : s.add(id); setUI({ sel: s.size ? { kind: 'area', ids: [...s] } : { kind: 'graphic' } }); }
      else setUI({ sel: { kind: 'area', ids: [id] } });
    }
  };
  const onDoubleClick = (e: React.MouseEvent) => {
    const d = getDoc(), u = getUI(), a = toArt(e), t = e.target as Element;
    if (u.mapMode) {
      const p = t.closest('path[data-i]') as SVGPathElement | null;
      if (p && !p.dataset.u && u.mapMode === 'main') {
        const g = geoOf(d), ar = g.areas[+p.dataset.i!];
        if (d.fokus.kind === 'de') { setUI({ expanded: { ...u.expanded, [ar.bl]: true } }); setFokus({ kind: 'land', bl: ar.bl }); toast('Fokus: ' + LAENDER[ar.bl][0]); }
        else if (d.fokus.kind === 'land' && ar.kr && (g.byKr[ar.kr]?.length || 0) > 1) { setFokus({ kind: 'kreis', kr: ar.kr }); toast('Fokus: ' + (g.krName[ar.kr] || ar.kr)); }
        else if (d.fokus.kind === 'land' || d.fokus.kind === 'kreis' || d.fokus.kind === 'custom') { setFokus({ kind: 'area', id: ar.id }); toast('Fokus: ' + ar.name); }
      }
      return;
    }
    for (const id of ['inset', 'main'] as FrameId[]) if (inFrame(d, id, a) && !t.closest('[data-el]')) { setUI({ mapMode: id, sel: { kind: 'frame', id } }); toast('Kartenmodus – Esc beendet'); return; }
  };

  return (
    <section className={'canvaswrap' + (mapMode ? ' mapmode' : '') + (tool ? ' placing' : '')} id="canvas" ref={wrap} aria-label="Arbeitsfläche"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => onPointerUp()}
      onPointerLeave={() => { if (!drag.current) useHover.setState({ i: null }); }} onDoubleClick={onDoubleClick}>
      <div className="stage" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
        <div className={'artboard-shadow' + (doc.background === 'transparent' ? ' checker' : '')} style={{ width: v.w, height: v.h }} />
        <svg id="artboard" width={v.w} height={v.h} viewBox={`0 0 ${v.w} ${v.h}`} xmlns="http://www.w3.org/2000/svg">
          <rect id="bg" width={v.w} height={v.h} fill="#FFFFFF" fillOpacity={doc.background === 'transparent' ? 0 : 1} />
          <MapFrame id="main" />
          {doc.inset.visible && <MapFrame id="inset" />}
          <Elements />
          <Annotations />
        </svg>
        <Overlay />
      </div>
      <div className="canvas-tip"><span>Klick: auswählen</span><span>Doppelklick auf Karte: Kartenmodus</span><span>Leertaste + Ziehen: Ansicht verschieben</span></div>
      {cm.mismatch && <div className="canvas-banner" role="status"><Icon.warn /> Die Farbregel nutzt Daten für „{GEO[cm.mismatch]?.meta.label}“, die Karte zeigt „{GEO[doc.geoSet].meta.label}“. Daten passen nur zu ihrem Gebietsstand.
        <button className="btn small" onClick={() => setGeoSet(cm.mismatch!)}>Karte auf „{GEO[cm.mismatch]?.meta.label}“ umstellen</button></div>}
      {!cm.dataset && doc.color.mode === 'none' && <div className="canvas-banner soft"><Icon.info /> Noch keine Daten. Importiere eine CSV- oder Excel-Datei im Schritt „Daten“.
        <button className="btn small primary" onClick={() => setUI({ wizard: { mode: 'new' } })}><Icon.upload /> Daten importieren</button></div>}
      {tool && <div className="mapmode-bar tool-bar"><b>{tool === 'marker' ? 'Marker setzen' : tool === 'arrow' ? 'Pfeil zeichnen' : 'Textkasten setzen'}</b><span style={{ opacity: .75 }}>{tool === 'marker' ? 'Klick in die Karte setzt den Marker' : tool === 'arrow' ? 'Vom Start zum Ziel ziehen; über Markern, Textkästen und Gebietsmitten rastet das Ende ein' : 'Klick in die Karte hängt ihn an diesen Punkt, Klick daneben an die Fläche'}</span><button className="btn small" onClick={() => setUI({ tool: null })}>Abbrechen <span className="kbd kbd-inv">Esc</span></button></div>}
      <MapModeBar wrap={wrap} />
      <Tooltip />
      <div className="canvas-hud">
        <button className="btn icon ghost" onClick={() => zoomViewBy(0.8)} aria-label="Verkleinern"><Icon.minus /></button>
        <span className="zoomval">{Math.round(view.z * 100)} %</span>
        <button className="btn icon ghost" onClick={() => zoomViewBy(1.25)} aria-label="Vergrößern"><Icon.plus /></button>
        <button className="btn small ghost" onClick={fitViewToCanvas}>Einpassen</button>
      </div>
      <div className="narrow-note">Der Editor ist für Desktop-Bildschirme ab 1280 px ausgelegt. Hier siehst du nur die Grafik.</div>
    </section>
  );
}
export { esc };
