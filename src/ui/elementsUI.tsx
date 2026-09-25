import React, { useEffect, useRef, useState } from 'react';
import type { Cut } from '../lib/fonts';
import { CUTS } from '../lib/fonts';
import { fmtInt } from '../lib/util';
import { gridToLonLat, lonLatToGrid } from '../geo/proj';
import { Ort, loadOrte, orteAttribution, orteReady, searchOrte, shortName } from '../geo/orte';
import { addMarker, addTextBox, applyMarkerStyleToAll, detachArrowEnd, duplicateEl, moveElOrder, removeEl, resetElOffset, reverseArrow, updateEl } from '../model/annotations';
import { GEO } from '../geo/geo';
import { getDoc, setUI, toast, update, useStore } from '../model/store';
import type { ArrowEl, ArrowEnd, Doc, MarkerEl, MarkerShape, TextBoxEl } from '../model/types';
import { SHAPE_LABEL, annItems, elName, markerD, parseSymbol } from '../render/annotations';
import { activeVariant } from '../render/elements';
import { Check, Field, Icon, Note, NumInput, Section, Seg } from './common';

const SHAPES: MarkerShape[] = ['kreis', 'quadrat', 'dreieck', 'raute', 'stern', 'pin', 'eigen'];
export function MarkerIcon({ m, s = 18 }: { m: Pick<MarkerEl, 'shape' | 'symbol' | 'fill' | 'stroke' | 'strokeW'>; s?: number }) {
  const pin = m.shape === 'pin';
  return <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true" className="mk-ico"><path d={markerD(m, s / 2, pin ? s - 1 : s / 2, pin ? s * 0.5 : s * 0.72)} fill={m.fill} stroke={m.stroke.toUpperCase() === '#FFFFFF' ? 'none' : m.stroke} strokeWidth={m.strokeW > 0 ? 1 : 0} /></svg>;
}

// ---------- Ortssuche ----------
export function PlaceSearch({ onPick, placeholder = 'Ort suchen, z. B. Leipzig' }: { onPick: (o: Ort) => void; placeholder?: string }) {
  const [q, setQ] = useState(''), [ready, setReady] = useState(orteReady()), [err, setErr] = useState('');
  const [hi, setHi] = useState(0);
  useEffect(() => { if (!ready && q.length >= 2) loadOrte().then(() => setReady(true)).catch(e => setErr(String(e?.message || e))); }, [q, ready]);
  const hits = ready ? searchOrte(q) : [];
  const pick = (o: Ort) => { onPick(o); setQ(''); };
  return (
    <div className="place-search">
      <div className="search"><Icon.search /><input type="text" value={q} onChange={e => { setQ(e.target.value); setHi(0); }} placeholder={placeholder} aria-label="Ort suchen" autoComplete="off"
        onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(hits.length - 1, h + 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(0, h - 1)); } if (e.key === 'Enter' && hits[hi]) pick(hits[hi]); }} /></div>
      {q.length >= 2 && <div className="place-hits" role="listbox">
        {!ready && !err && <p className="hint">Gemeindeverzeichnis wird geladen …</p>}
        {err && <p className="hint">Ortsliste konnte nicht geladen werden: {err}</p>}
        {ready && !hits.length && <p className="hint">Keine Gemeinde gefunden. Gesucht wird im Namen und im Gemeindeschlüssel.</p>}
        {hits.map((o, k) => (
          <button key={o.ags} role="option" aria-selected={k === hi} className={'place-hit' + (k === hi ? ' on' : '')} onMouseEnter={() => setHi(k)} onClick={() => pick(o)}>
            <b>{o.short}</b><span className="hint">{o.kreis && o.kreis !== o.name ? o.kreis.split(',')[0] + ' · ' : ''}{fmtInt(o.ew)} Einw.</span>
          </button>))}
      </div>}
    </div>
  );
}
const placeOf = (o: Ort): MarkerEl['place'] => ({ ags: o.ags, name: o.name, src: orteAttribution() });

// ---------- Elemente-Schritt ----------
export function ElementsSection({ doc }: { doc: Doc }) {
  const tool = useStore(s => s.ui.tool);
  const markers = doc.els.filter((e): e is MarkerEl => e.type === 'marker');
  const texts = doc.els.filter((e): e is TextBoxEl => e.type === 'text');
  const arrows = doc.els.filter((e): e is ArrowEl => e.type === 'arrow');
  return (
    <>
      <Section title="Ortsmarker" aside={markers.length ? `${markers.length} gesetzt` : undefined}>
        <PlaceSearch onPick={o => addMarker([o.x, o.y], placeOf(o), o.short)} />
        <div className="row-btns">
          <button className={'btn small' + (tool === 'marker' ? ' on' : '')} onClick={() => setUI({ tool: tool === 'marker' ? null : 'marker', mapMode: null })}><Icon.target /> In die Karte klicken</button>
        </div>
        <p className="hint">Ortssuche über das Gemeindeverzeichnis (10.749 Gemeinden, Mittelpunktkoordinaten). Marker hängen an der Karte und wandern beim Zoomen und in jeder Variante mit.</p>
        {markers.length > 0 && <ElList doc={doc} list={markers} />}
      </Section>
      <Section title="Pfeile" aside={arrows.length ? `${arrows.length}` : undefined}>
        <div className="row-btns">
          <button className={'btn small' + (tool === 'arrow' ? ' on' : '')} onClick={() => setUI({ tool: tool === 'arrow' ? null : 'arrow', mapMode: null })}><ArrowIcon /> Pfeil zeichnen</button>
        </div>
        <p className="hint">Vom Start zum Ziel ziehen. Über einem Marker, einem Textkasten oder nahe der Mitte eines Gebiets rastet das Ende ein und bleibt verbunden, auch wenn du das Element verschiebst.</p>
        {arrows.length > 0 && <ElList doc={doc} list={arrows} />}
      </Section>
      <Section title="Textkästen" aside={texts.length ? `${texts.length}` : undefined}>
        <div className="row-btns">
          <button className={'btn small' + (tool === 'text' ? ' on' : '')} onClick={() => setUI({ tool: tool === 'text' ? null : 'text', mapMode: null })}><Icon.target /> An einen Kartenpunkt</button>
          <button className="btn small" onClick={() => { const v = activeVariant(getDoc()), L = v.L; addTextBox('board', [L.m.left / v.w, Math.max(0.05, (L.source.y - 26 * v.ts * 2.2) / v.h)]); }}><Icon.text /> Frei auf der Fläche</button>
        </div>
        <p className="hint">An der Karte: Der Kasten hängt an einem Ort, mit Führungslinie. Auf der Fläche: Er bleibt an seiner Stelle der Grafik, unabhängig vom Kartenausschnitt.</p>
        {texts.length > 0 && <ElList doc={doc} list={texts} />}
      </Section>
    </>
  );
}
function ElList({ doc, list }: { doc: Doc; list: (MarkerEl | TextBoxEl | ArrowEl)[] }) {
  const sel = useStore(s => s.ui.sel);
  return <div className="el-list">{list.map(e => (
    <button key={e.id} className={'el-row' + (sel.kind === 'ann' && sel.id === e.id ? ' on' : '') + (e.hidden ? ' off' : '')} onClick={() => setUI({ sel: { kind: 'ann', id: e.id } })}>
      {e.type === 'marker' ? <MarkerIcon m={e} /> : e.type === 'arrow' ? <ArrowIcon /> : <Icon.text />}<span>{elName(e)}{e.type === 'arrow' ? ' · ' + arrowDesc(doc, e) : ''}</span>
    </button>))}{void doc}</div>;
}

// ---------- Eigenschaften ----------
export function AnnProps({ doc, id }: { doc: Doc; id: string }) {
  const el = doc.els.find(e => e.id === id);
  if (!el) return <p className="hint">Dieses Element gibt es nicht mehr.</p>;
  const v = activeVariant(doc), moved = !!v.ann[id];
  const k = doc.els.indexOf(el);
  const common = <>
    <Check checked={!el.hidden} onChange={on => updateEl(id, { hidden: !on })}>Sichtbar</Check>
    <div className="row-btns">
      <button className="btn small" onClick={() => duplicateEl(id)} title="Strg+D"><Icon.copy /> Duplizieren</button>
      <button className="btn small" disabled={k >= doc.els.length - 1} onClick={() => moveElOrder(id, 1)}>Nach vorn</button>
      <button className="btn small" disabled={k <= 0} onClick={() => moveElOrder(id, -1)}>Nach hinten</button>
      <button className="btn small ghost danger" onClick={() => removeEl(id)} title="Entf"><Icon.trash /> Löschen</button>
    </div>
  </>;
  return el.type === 'marker' ? <MarkerProps doc={doc} m={el} moved={moved} common={common} /> : el.type === 'text' ? <TextBoxProps doc={doc} t={el} moved={moved} common={common} /> : <ArrowProps doc={doc} a={el} common={common} />;
}
function MarkerProps({ doc, m, moved, common }: { doc: Doc; m: MarkerEl; moved: boolean; common: React.ReactNode }) {
  const [lon, lat] = gridToLonLat(m.at);
  const [coord, setCoord] = useState(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
  useEffect(() => { setCoord(`${lat.toFixed(5)}, ${lon.toFixed(5)}`); }, [m.at[0], m.at[1]]); // eslint-disable-line
  const fileRef = useRef<HTMLInputElement>(null);
  const setCoords = () => {
    const nums = coord.replace(/[°NnEeOo]/g, ' ').split(/[;,\s]+/).map(x => parseFloat(x)).filter(x => isFinite(x));
    if (nums.length < 2) { toast('Koordinaten als „Breite, Länge“ eingeben, z. B. 52.51628, 13.37770'); return; }
    let [la, lo] = nums; if (la < 20 && lo > 40) [la, lo] = [lo, la];
    if (la < 44 || la > 58 || lo < 2 || lo > 18) { toast('Die Koordinaten liegen nicht in Deutschland.'); return; }
    const g = lonLatToGrid(lo, la); updateEl(m.id, { at: [Math.round(g[0]), Math.round(g[1])], place: null });
  };
  const nMarkers = doc.els.filter(e => e.type === 'marker').length;
  return <>
    <div className="rp-head"><h2>Eigenschaften</h2></div>
    <h3 className="props-title">Marker</h3>
    <p className="props-sub">{m.place ? `${m.place.name} · AGS ${m.place.ags}` : 'frei gesetzt'}</p>
    <Section title="Ort">
      <PlaceSearch onPick={o => updateEl(m.id, { at: [o.x, o.y], place: placeOf(o), label: m.label && m.label !== (m.place ? shortName(m.place.name) : '') ? m.label : o.short })} placeholder="Anderen Ort suchen" />
      <Field label="Breite, Länge"><div className="row-btns nowrap"><input type="text" value={coord} onChange={e => setCoord(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') setCoords(); }} aria-label="Koordinaten (Breite, Länge)" className="num" /><button className="btn small" onClick={setCoords}>Setzen</button></div></Field>
      <p className="hint">Ziehen auf der Karte verschiebt den Marker. Koordinaten in Dezimalgrad (WGS84), z. B. aus einer Kartenanwendung.</p>
    </Section>
    <Section title="Form">
      <div className="shape-grid">{SHAPES.map(sh => (
        <button key={sh} className={'shape-btn' + (m.shape === sh ? ' on' : '')} onClick={() => sh === 'eigen' && !m.symbol ? fileRef.current?.click() : updateEl(m.id, { shape: sh })} aria-pressed={m.shape === sh} title={SHAPE_LABEL[sh]}>
          {sh === 'eigen' && !m.symbol ? <Icon.upload /> : <MarkerIcon m={{ ...m, shape: sh }} s={20} />}<span>{SHAPE_LABEL[sh]}</span>
        </button>))}</div>
      <input ref={fileRef} type="file" accept=".svg,image/svg+xml" hidden onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { const sym = parseSymbol(await f.text(), f.name.replace(/\.svg$/i, '')); updateEl(m.id, { shape: 'eigen', symbol: sym }); } catch (err) { toast((err as Error).message); } }} />
      {m.shape === 'eigen' && <div className="row-btns"><span className="hint">{m.symbol?.name}</span><button className="btn small ghost" onClick={() => fileRef.current?.click()}>Anderes Symbol …</button></div>}
      <Field label="Größe (px)"><NumInput min={3} max={120} value={m.size} onChange={x => updateEl(m.id, { size: x }, 'size')} ariaLabel="Größe des Markers" /></Field>
      <Field label="Füllung"><input type="color" value={m.fill} onChange={e => updateEl(m.id, { fill: e.target.value.toUpperCase() }, 'fill')} aria-label="Füllfarbe" /></Field>
      <Field label="Rand · Stärke"><div className="row-btns nowrap"><input type="color" value={m.stroke} onChange={e => updateEl(m.id, { stroke: e.target.value.toUpperCase() }, 'stroke')} aria-label="Randfarbe" /><NumInput min={0} max={8} step={0.5} value={m.strokeW} onChange={x => updateEl(m.id, { strokeW: x }, 'sw')} ariaLabel="Randstärke" /></div></Field>
    </Section>
    <Section title="Beschriftung">
      <textarea rows={2} value={m.label} onChange={e => updateEl(m.id, { label: e.target.value }, 'label')} placeholder="leer = keine Beschriftung" aria-label="Beschriftung" />
      <Field label="Position"><Seg items={[['r', 'Rechts'], ['l', 'Links'], ['o', 'Oben'], ['u', 'Unten']]} value={m.labelPos} onChange={p => { updateEl(m.id, { labelPos: p }); if (moved) resetElOffset(m.id); }} /></Field>
      <Field label="Größe · Schnitt"><div className="row-btns nowrap"><NumInput min={6} max={60} value={m.labelSize} onChange={x => updateEl(m.id, { labelSize: x }, 'ls')} ariaLabel="Schriftgröße" />
        <select value={m.labelCut} onChange={e => updateEl(m.id, { labelCut: e.target.value as Cut })} aria-label="Schriftschnitt">{(['bold', 'text', 'label', 'display'] as Cut[]).map(c => <option key={c} value={c}>{CUTS[c].label}</option>)}</select></div></Field>
      <Check checked={m.labelHalo} onChange={on => updateEl(m.id, { labelHalo: on })}>Weiße Kontur</Check>
      {moved && <button className="btn small" onClick={() => resetElOffset(m.id)}>Beschriftung zurück an den Marker</button>}
      <p className="hint">Beschriftung ziehen verschiebt sie in dieser Variante; ab etwas Abstand erscheint eine Führungslinie.</p>
    </Section>
    <Section title="Legende und Lupe">
      <Field label="In der Legende"><input type="text" value={m.legend} onChange={e => updateEl(m.id, { legend: e.target.value }, 'legend')} placeholder="leer = nicht in der Legende" aria-label="Legendentext" /></Field>
      <p className="hint">Marker mit gleichem Legendentext bilden einen Eintrag, z. B. „Landeshauptstadt“.</p>
      <Check checked={m.inset} onChange={on => updateEl(m.id, { inset: on })}>Auch in der Detail-Lupe zeigen</Check>
      {nMarkers > 1 && <button className="btn small" onClick={() => applyMarkerStyleToAll(m.id)}>Aussehen auf alle Marker übertragen</button>}
    </Section>
    {common}
  </>;
}
function TextBoxProps({ doc, t, moved, common }: { doc: Doc; t: TextBoxEl; moved: boolean; common: React.ReactNode }) {
  const custom = t.color !== 'ink' && t.color !== 'inkSoft';
  const pos = annItems(doc, activeVariant(doc)).find(it => it.id === t.id);
  return <>
    <div className="rp-head"><h2>Eigenschaften</h2></div>
    <h3 className="props-title">Textkasten</h3>
    <p className="props-sub">{t.anchor === 'map' ? 'hängt an einem Kartenpunkt' : 'frei auf der Fläche'}</p>
    <Field stack label="Text" htmlFor="p-tb"><textarea id="p-tb" rows={3} value={t.text} onChange={e => updateEl(t.id, { text: e.target.value }, 'text')} /></Field>
    <Field label="Größe · Schnitt"><div className="row-btns nowrap"><NumInput min={6} max={120} value={t.size} onChange={x => updateEl(t.id, { size: x }, 'size')} ariaLabel="Schriftgröße" />
      <select value={t.cut} onChange={e => updateEl(t.id, { cut: e.target.value as Cut })} aria-label="Schriftschnitt">{(['text', 'bold', 'display', 'label'] as Cut[]).map(c => <option key={c} value={c}>{CUTS[c].label}</option>)}</select></div></Field>
    <Field label="Farbe"><div className="row-btns nowrap"><Seg items={[['ink', 'Dunkel'], ['inkSoft', 'Grau'], ['x', 'Eigene']]} value={custom ? 'x' : t.color as 'ink'} onChange={c => updateEl(t.id, { color: c === 'x' ? '#9E5B0B' : c })} />{custom && <input type="color" value={t.color} onChange={e => updateEl(t.id, { color: e.target.value.toUpperCase() }, 'color')} aria-label="Textfarbe" />}</div></Field>
    <Field label="Ausrichtung"><Seg items={[['start', 'Links'], ['middle', 'Mitte'], ['end', 'Rechts']]} value={t.align} onChange={a => updateEl(t.id, { align: a })} /></Field>
    <Field label="Breite (px)"><NumInput min={0} max={2000} value={t.width} onChange={x => updateEl(t.id, { width: x }, 'w')} ariaLabel="Umbruchbreite, 0 = automatisch" /></Field>
    {pos && <Field label="Position (px)"><span className="mono">{Math.round(pos.body[0])}, {Math.round(pos.body[1])}</span></Field>}
    <p className="hint">Breite 0: nur Zeilenumbrüche aus dem Text. Mit Breite bricht der Text automatisch um.</p>
    <Field label="Hintergrund"><div className="row-btns nowrap"><Check checked={!!t.bg} onChange={on => updateEl(t.id, { bg: on ? '#FFFFFF' : null, pad: on && !t.pad ? 6 : t.pad })}>Fläche</Check>{t.bg && <input type="color" value={t.bg} onChange={e => updateEl(t.id, { bg: e.target.value.toUpperCase() }, 'bg')} aria-label="Hintergrundfarbe" />}</div></Field>
    <Field label="Rahmen"><div className="row-btns nowrap"><Check checked={!!t.border} onChange={on => updateEl(t.id, { border: on ? '#16181B' : null, pad: on && !t.pad ? 6 : t.pad })}>Linie</Check>{t.border && <input type="color" value={t.border} onChange={e => updateEl(t.id, { border: e.target.value.toUpperCase() }, 'border')} aria-label="Rahmenfarbe" />}</div></Field>
    {(t.bg || t.border) && <Field label="Innenabstand"><NumInput min={0} max={60} value={t.pad} onChange={x => updateEl(t.id, { pad: x }, 'pad')} ariaLabel="Innenabstand" /></Field>}
    <Field label="Verankerung"><Seg items={[['map', 'An der Karte'], ['board', 'Auf der Fläche']]} value={t.anchor} onChange={a => convertAnchor(t, a)} /></Field>
    {t.anchor === 'map' && <Check checked={t.leader} onChange={on => updateEl(t.id, { leader: on })}>Führungslinie zum Punkt</Check>}
    {moved && <button className="btn small" onClick={() => resetElOffset(t.id)}>Position zurücksetzen</button>}
    <p className="hint">Ziehen verschiebt den Kasten in dieser Variante. {t.anchor === 'map' ? 'Der Ankerpunkt bleibt am Ort.' : ''}</p>
    {common}
    {void doc}
  </>;
}
/** Verankerung wechseln, ohne dass der Kasten springt */
function convertAnchor(t: TextBoxEl, a: TextBoxEl['anchor']) {
  if (a === t.anchor) return;
  const d = getDoc(), v = activeVariant(d), F = v.L.main, w = F.view, off = v.ann[t.id] || [0, 0];
  if (a === 'board') {
    const bx = F.x + (t.at[0] - w.cx) * w.k + F.w / 2 + off[0], by = F.y + (t.at[1] - w.cy) * w.k + F.h / 2 + off[1];
    update(dd => { const e = dd.els.find(x => x.id === t.id); if (e && e.type === 'text') { e.anchor = 'board'; e.at = [bx / v.w, by / v.h]; e.leader = false; } delete dd.variants[dd.active].ann[t.id]; });
  } else {
    const bx = t.at[0] * v.w + off[0], by = t.at[1] * v.h + off[1];
    const gx = w.cx + (bx - F.x - F.w / 2) / w.k, gy = w.cy + (by - F.y - F.h / 2) / w.k;
    update(dd => { const e = dd.els.find(x => x.id === t.id); if (e && e.type === 'text') { e.anchor = 'map'; e.at = [gx, gy]; } dd.variants[dd.active].ann[t.id] = [0, 0]; });
  }
}
export function ArrowIcon() { return <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 18C8 9 13 7 19 6" /><path d="m14.5 3.8 4.8 2.1-2.4 4.6" /></svg>; }
function endDesc(doc: Doc, e: ArrowEnd): string {
  if (e.kind === 'el') { const x = doc.els.find(q => q.id === e.id); return x ? elName(x) : 'fehlt'; }
  if (e.kind === 'area') { const i = e.key.indexOf(':'), g = GEO[e.key.slice(0, i)], k = g?.byId.get(e.key.slice(i + 1)); return k != null ? g.areas[k].name : 'Gebiet'; }
  return e.kind === 'map' ? 'Kartenpunkt' : 'Punkt der Fläche';
}
export const arrowDesc = (doc: Doc, a: ArrowEl) => `${endDesc(doc, a.from)} → ${endDesc(doc, a.to)}`;
function ArrowProps({ doc, a, common }: { doc: Doc; a: ArrowEl; common: React.ReactNode }) {
  const linked = (e: ArrowEnd) => e.kind === 'el' || e.kind === 'area';
  const endRow = (which: 'from' | 'to', label: string) => (
    <Field label={label}><div className="row-btns nowrap"><span className={'chip' + (linked(a[which]) ? ' accent' : '')}>{endDesc(doc, a[which])}</span>{linked(a[which]) && <button className="btn small ghost" onClick={() => detachArrowEnd(a.id, which)}>lösen</button>}</div></Field>
  );
  return <>
    <div className="rp-head"><h2>Eigenschaften</h2></div>
    <h3 className="props-title">Pfeil</h3>
    <p className="props-sub">{arrowDesc(doc, a)}</p>
    <Section title="Verbindung">
      {endRow('from', 'Start')}
      {endRow('to', 'Ziel')}
      <button className="btn small" onClick={() => reverseArrow(a.id)}>Richtung umkehren</button>
      <p className="hint">Die Kreise an den Enden ziehen: Über einem Marker, Textkasten oder einer Gebietsmitte rastet das Ende ein. Der Kreis in der Mitte biegt den Pfeil.</p>
    </Section>
    <Section title="Form">
      <Field label="Verlauf"><Seg items={[['gerade', 'Gerade'], ['gebogen', 'Gebogen']]} value={a.bend ? 'gebogen' : 'gerade'} onChange={v => updateEl(a.id, { bend: v === 'gerade' ? 0 : 0.22 })} /></Field>
      {a.bend !== 0 && <Field label="Biegung"><input type="range" min={-100} max={100} value={Math.round(a.bend * 100)} onChange={e => updateEl(a.id, { bend: +e.target.value / 100 || 0.01 }, 'bend')} aria-label="Biegung" /></Field>}
      <Field label="Spitze"><Seg items={[['end', 'Ziel'], ['start', 'Start'], ['both', 'Beide'], ['none', 'Keine']]} value={a.head} onChange={h => updateEl(a.id, { head: h })} /></Field>
      {a.head !== 'none' && <Field label="Spitzengröße"><NumInput min={0.4} max={4} step={0.1} value={a.headSize} onChange={x => updateEl(a.id, { headSize: x }, 'hs')} ariaLabel="Größe der Spitze (Faktor)" /></Field>}
      <Field label="Farbe · Stärke"><div className="row-btns nowrap"><input type="color" value={a.color} onChange={e => updateEl(a.id, { color: e.target.value.toUpperCase() }, 'color')} aria-label="Farbe" /><NumInput min={0.5} max={20} step={0.5} value={a.width} onChange={x => updateEl(a.id, { width: x }, 'w')} ariaLabel="Strichstärke" /></div></Field>
      <Check checked={a.dash} onChange={on => updateEl(a.id, { dash: on })}>Gestrichelt</Check>
      <Field label="Abstand (px)"><NumInput min={0} max={40} value={a.gap} onChange={x => updateEl(a.id, { gap: x }, 'gap')} ariaLabel="Abstand zu verbundenen Elementen" /></Field>
    </Section>
    {common}
  </>;
}
export { Note };
