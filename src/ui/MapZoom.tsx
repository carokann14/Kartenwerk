// Zoom des Kartenausschnitts: Prozentfeld mit Schieberegler (100 % = eingepasst)
import React from 'react';
import { MAP_ZOOM_MAX, MAP_ZOOM_MIN, mapZoomPct, setMapZoom } from '../model/actions';
import type { Doc } from '../model/types';
import { Icon } from './common';

const L0 = Math.log(MAP_ZOOM_MIN), L1 = Math.log(MAP_ZOOM_MAX);
/** Feste Stufen für −/+ (wie in Grafikprogrammen), damit man auf runden Werten landet */
const STOPS = [10, 15, 20, 25, 33, 50, 67, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000];

/** Schieberegler logarithmisch (gleiche Wege für 50 → 100 % wie für 100 → 200 %), Feld für den genauen Wert, −/+ springen zur nächsten runden Stufe. */
export function MapZoom({ doc, id, compact }: { doc: Doc; id: 'main' | 'inset'; compact?: boolean }) {
  const pct = mapZoomPct(doc, id), shown = Math.round(pct);
  const locked = doc.variants[doc.active].locked[id];
  const step = (dir: 1 | -1) => setMapZoom(id, dir > 0 ? (STOPS.find(x => x > pct + 0.5) ?? MAP_ZOOM_MAX) : ([...STOPS].reverse().find(x => x < pct - 0.5) ?? MAP_ZOOM_MIN));
  return (
    <div className={'mapzoom' + (compact ? ' compact' : '')}>
      <button className="btn icon ghost small" onClick={() => step(-1)} disabled={locked} aria-label="Karte verkleinern" title="Verkleinern"><Icon.minus /></button>
      <input type="range" min={L0} max={L1} step={0.001} value={Math.log(Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, pct)))} disabled={locked}
        onChange={e => setMapZoom(id, Math.exp(+e.target.value))} aria-label="Zoom der Karte" />
      <button className="btn icon ghost small" onClick={() => step(1)} disabled={locked} aria-label="Karte vergrößern" title="Vergrößern"><Icon.plus /></button>
      <span className="mapzoom-val">{locked ? <span className="num">{shown}</span> : <PctInput value={shown} onCommit={n => setMapZoom(id, n)} />}<span> %</span></span>
    </div>
  );
}

/** Zahlenfeld, das erst bei Enter oder beim Verlassen übernimmt (sonst würde schon „1“ beim Tippen von „150“ auf 10 % springen); Pfeiltasten ±1 %, mit Umschalt ±10 %. */
function PctInput({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [txt, setTxt] = React.useState(String(value));
  const [focus, setFocus] = React.useState(false);
  const skip = React.useRef(false);   // Escape: beim anschließenden Verlassen nicht übernehmen
  React.useEffect(() => { if (!focus) setTxt(String(value)); }, [value, focus]);
  const commit = () => { const n = parseFloat(txt.replace(',', '.')); if (isFinite(n) && n > 0) onCommit(n); else setTxt(String(value)); };
  return <input type="text" inputMode="decimal" className="num" value={txt} aria-label="Zoom der Karte in Prozent"
    onFocus={e => { setFocus(true); e.target.select(); }} onBlur={() => { setFocus(false); if (skip.current) skip.current = false; else commit(); }}
    onChange={e => setTxt(e.target.value)}
    onKeyDown={e => {
      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      else if (e.key === 'Escape') { skip.current = true; setTxt(String(value)); (e.target as HTMLInputElement).blur(); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const n = Math.max(MAP_ZOOM_MIN, Math.min(MAP_ZOOM_MAX, value + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1))); setTxt(String(n)); onCommit(n); }
      e.stopPropagation();
    }} />;
}
