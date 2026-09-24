import React, { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { create } from 'zustand';
import { CONTEXT, GEO, bboxOfIds, linesD } from '../geo/geo';
import { CUTS, measureW } from '../lib/fonts';
import { clamp, esc, fmt1, fmtNum } from '../lib/util';
import { beginGesture, getDoc, getUI, setUI, toast, update, useStore } from '../model/store';
import type { Doc, Variant } from '../model/types';
import { colorModel, fillOf } from '../render/colorModel';
import { LabelItem, TextPrim, activeVariant, labelPrims, layoutLabels, legendPrims, textPrims } from '../render/elements';
import { FrameId, frameMeshes, frameSets, geoOf, insetIdx, insetLabel } from '../render/scene';
import { refitFrame, setFokus, setGeoSet } from '../model/actions';
import { groupMetrics, areaRowIndex } from '../data/derive';
import { LAENDER } from '../geo/geo';
import { Icon } from './common';

// Zeiger-Zustand außerhalb des Dokuments (kein Neuzeichnen der Panels)
const useHover = create<{ i: number | null; x: number; y: number }>(() => ({ i: null, x: 0, y: 0 }));

export function textEl(t: TextPrim, key?: React.Key) {
  const halo = t.halo ? { stroke: '#FFFFFF', strokeWidth: +(t.size * 0.24).toFixed(2), strokeLinejoin: 'round' as const, paintOrder: 'stroke' } : {};
  return <text key={key} x={+t.x.toFixed(1)} y={+t.y.toFixed(1)} fontFamily={CUTS[t.cut].family} fontSize={t.size} fill={t.color} textAnchor={t.anchor} {...halo} style={{ fontKerning: 'normal' }}>{t.text}</text>;
}

const AreaPaths = memo(function AreaPaths({ geoId, ids, fills, fill, u, pe }: { geoId: string; ids: number[]; fills?: string[]; fill?: string; u?: boolean; pe?: boolean }) {
  const g = GEO[geoId];
  return <g>{ids.map((i, k) => <path key={i} data-i={i} data-u={u ? 1 : undefined} d={g.areas[i].d} fillRule="evenodd" fill={fills ? fills[k] : fill} pointerEvents={pe === false ? 'none' : undefined} />)}</g>;
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
  const v = activeVariant(doc), F = v.L[id], vw = F.view, st = doc.style, g = geoOf(doc);
  const sets = useMemo(() => frameSets(doc, id), [doc.geoSet, doc.fokus, doc.umfeld, doc.inset.preset, id]); // eslint-disable-line
  const me = useMemo(() => frameMeshes(doc, id, sets), [sets, doc.umfeldStyle]); // eslint-disable-line
  const cm = colorModel(doc);
  const Flist = useMemo(() => [...sets.F], [sets]);
  const Ulist = useMemo(() => [...sets.U], [sets]);
  const fills = useMemo(() => Flist.map(i => doc.layers.wkFill ? fillOf(doc, cm, i) : st.umfeld), [Flist, cm, doc.overrides, doc.layers.wkFill, st.umfeld]); // eslint-disable-line
  const md = useMemo(() => ({ wk: linesD(me.wk), wkU: linesD(me.wkU), land: linesD(me.land), outline: linesD(me.outline), fokus: linesD(me.fokus) }), [me]);
  const labels = useMemo(() => layoutLabels(doc, id), [doc, id]);
  const linesMode = me.linesMode;
  const k = vw.k;
  const selIds = sel.kind === 'area' ? sel.ids.map(x => g.byId.get(x)).filter((x): x is number => x != null && sets.F.has(x)) : [];
  const selD = selIds.map(i => g.areas[i].d).join('');
  const lupe = id === 'main' && doc.inset.visible && doc.fokus.kind === 'de' ? (() => { const bb = bboxOfIds(g, insetIdx(doc)), p = 800; return { x: bb[0] - p, y: bb[1] - p, w: bb[2] - bb[0] + 2 * p, h: bb[3] - bb[1] + 2 * p }; })() : null;
  const capSize = Math.round(17 * v.ts);
  return (
    <g className="frame" data-frame={id} transform={`translate(${F.x} ${F.y})`}>
      <clipPath id={'clip-' + id}><rect width={F.w} height={F.h} /></clipPath>
      <rect className="frame-hit" data-frame-hit={id} width={F.w} height={F.h} fill="#FFFFFF" fillOpacity={id === 'inset' ? 1 : 0} />
      <g clipPath={`url(#clip-${id})`}>
        <g transform={`matrix(${k} 0 0 ${k} ${F.w / 2 - vw.cx * k} ${F.h / 2 - vw.cy * k})`}>
          <ContextLayer neighbors={doc.layers.neighbors} lakes={doc.layers.lakes} st={st} k={k} />
          <AreaPaths geoId={doc.geoSet} ids={Ulist} fill={linesMode ? 'none' : st.umfeld} u pe={!linesMode} />
          <AreaPaths geoId={doc.geoSet} ids={Flist} fills={fills} />
          {doc.layers.wkLines && <path d={md.wk} fill="none" stroke={st.wkLine} strokeWidth={st.wkLineW / k} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />}
          {linesMode && <><path d={md.wkU} fill="none" stroke="#C8C2B6" strokeWidth={0.6 / k} strokeLinejoin="round" pointerEvents="none" /><path d={md.outline} fill="none" stroke="#B9B2A5" strokeWidth={0.8 / k} strokeLinejoin="round" pointerEvents="none" /></>}
          {doc.layers.landLines && <path d={md.land} fill="none" stroke={st.landLine} strokeWidth={st.landLineW / k} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />}
          {id === 'main' && doc.fokusOutline && doc.fokus.kind !== 'de' && <path d={md.fokus} fill="none" stroke={st.fokusLine} strokeWidth={1.8 / k} strokeLinejoin="round" pointerEvents="none" />}
          {lupe && <rect x={lupe.x} y={lupe.y} width={lupe.w} height={lupe.h} fill="none" stroke={st.frameLine} strokeWidth={1.2 / k} pointerEvents="none" />}
          {hover != null && sets.F.has(hover) && <path d={g.areas[hover].d} fill="none" stroke={st.ink} strokeWidth={1.4 / k} pointerEvents="none" />}
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
  if (lp) items.push(<g key="legend" data-el="legend">{lp.rects.map((r, k) => <rect key={'r' + k} x={+r.x.toFixed(1)} y={+r.y.toFixed(1)} width={+r.w.toFixed(1)} height={+r.h.toFixed(1)} fill={r.fill} />)}{lp.texts.map((t, k) => textEl(t, 't' + k))}<rect x={lp.box.x} y={lp.box.y} width={lp.box.w} height={lp.box.h} fill="#FFFFFF" fillOpacity={0} /></g>);
  return <g>{items}</g>;
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
  return <div className="tooltip" style={{ left: h.x, top: h.y }}><div className="tt-h">{a.nr} · {a.name}</div><div className="tt-s">{LAENDER[a.bl]?.[0]}{cm.group ? ' · ' + cm.group.label : ''}{ov ? ' · manuell eingefärbt' : ''}</div>{rows}</div>;
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

export function Canvas() {
  const doc = useStore(s => s.doc!);
  const view = useStore(s => s.ui.view);
  const mapMode = useStore(s => s.ui.mapMode);
  const panelOpen = useStore(s => s.ui.panelOpen);
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
    if (!dg.moved) { try { wrap.current!.setPointerCapture(dg.pid); } catch { /* egal */ } if (dg.type !== 'view' && dg.type !== 'area' && dg.type !== 'none') beginGesture(); useHover.setState({ i: null }); }
    dg.moved = true;
    const z = getUI().view.z, dx = dxs / z, dy = dys / z;
    switch (dg.type) {
      case 'view': setUI({ view: { ...getUI().view, x: (dg.ox as number) + dxs, y: (dg.oy as number) + dys } }); break;
      case 'map': { const id = dg.id as FrameId; const d = getDoc(); if (activeVariant(d).locked[id]) break; update(dd => { const V = dd.variants[dd.active].L[id].view; V.cx = (dg.ocx as number) - dx / V.k; V.cy = (dg.ocy as number) - dy / V.k; }, { history: false }); break; }
      case 'el': update(dd => { const L = dd.variants[dd.active].L[dg.id as 'title']; L.x = Math.round((dg.ox as number) + dx); L.y = Math.round((dg.oy as number) + dy); }, { history: false }); break;
      case 'frame': update(dd => { const F = dd.variants[dd.active].L[dg.id as FrameId]; F.x = Math.round((dg.ox as number) + dx); F.y = Math.round((dg.oy as number) + dy); }, { history: false }); break;
      case 'resize': update(dd => { const F = dd.variants[dd.active].L[dg.id as FrameId]; F.w = Math.max(80, Math.round((dg.ow as number) + dx)); F.h = Math.max(80, Math.round((dg.oh as number) + dy)); }, { history: false }); break;
      case 'label': { const o = dg.o as number[]; update(dd => { dd.variants[dd.active].labelOffsets[dg.key as string] = [Math.round(o[0] + dx), Math.round(o[1] + dy)]; }, { history: false }); break; }
    }
  };
  const onPointerUp = () => {
    const dg = drag.current; drag.current = null;
    wrap.current?.classList.remove('dragging');
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
        else if (d.fokus.kind === 'land' || d.fokus.kind === 'custom') { setFokus({ kind: 'area', id: ar.id }); toast('Fokus: ' + ar.name); }
      }
      return;
    }
    for (const id of ['inset', 'main'] as FrameId[]) if (inFrame(d, id, a) && !t.closest('[data-el]')) { setUI({ mapMode: id, sel: { kind: 'frame', id } }); toast('Kartenmodus – Esc beendet'); return; }
  };

  return (
    <section className={'canvaswrap' + (mapMode ? ' mapmode' : '')} id="canvas" ref={wrap} aria-label="Arbeitsfläche"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onPointerLeave={() => { if (!drag.current) useHover.setState({ i: null }); }} onDoubleClick={onDoubleClick}>
      <div className="stage" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
        <div className={'artboard-shadow' + (doc.background === 'transparent' ? ' checker' : '')} style={{ width: v.w, height: v.h }} />
        <svg id="artboard" width={v.w} height={v.h} viewBox={`0 0 ${v.w} ${v.h}`} xmlns="http://www.w3.org/2000/svg">
          <rect id="bg" width={v.w} height={v.h} fill="#FFFFFF" fillOpacity={doc.background === 'transparent' ? 0 : 1} />
          <MapFrame id="main" />
          {doc.inset.visible && <MapFrame id="inset" />}
          <Elements />
        </svg>
        <Overlay />
      </div>
      <div className="canvas-tip"><span>Klick: auswählen</span><span>Doppelklick auf Karte: Kartenmodus</span><span>Leertaste + Ziehen: Ansicht verschieben</span></div>
      {cm.mismatch && <div className="canvas-banner" role="status"><Icon.warn /> Die Farbregel nutzt Daten für „{GEO[cm.mismatch]?.meta.label}“, die Karte zeigt „{GEO[doc.geoSet].meta.label}“. Zuordnung über Nummern wäre falsch.
        <button className="btn small" onClick={() => setGeoSet(cm.mismatch!)}>Karte auf {GEO[cm.mismatch]?.meta.year} umstellen</button></div>}
      {!cm.dataset && doc.color.mode === 'none' && <div className="canvas-banner soft"><Icon.info /> Noch keine Daten. Importiere eine CSV- oder Excel-Datei im Schritt „Daten“.
        <button className="btn small primary" onClick={() => setUI({ wizard: { mode: 'new' } })}><Icon.upload /> Daten importieren</button></div>}
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
