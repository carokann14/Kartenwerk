import React from 'react';
import { GEO_INDEX, GeoIndexEntry, LEVEL_ORDER } from '../geo/geo';

const S = (d: React.ReactNode) => (p: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={p.size || 15} height={p.size || 15} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
export const Icon = {
  gebiete: S(<><path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z" /><path d="M9 4v13.5M15 6.5V20" /></>),
  daten: S(<><rect x="3.5" y="4.5" width="17" height="15" rx="1.5" /><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10" /></>),
  faerbung: S(<><path d="M12 3.5c3 4 6 7 6 10.5a6 6 0 0 1-12 0C6 10.5 9 7.5 12 3.5z" /><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" /></>),
  elemente: S(<><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1" /><circle cx="17" cy="7.2" r="3.7" /><path d="M4 20.5 7.5 14l3.5 6.5z" /><path d="M14 17.5h7M17.5 14v7" /></>),
  export: S(<><path d="M12 3.5v11M7.5 10 12 14.5 16.5 10" /><path d="M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" /></>),
  eye: S(<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>),
  eyeOff: S(<><path d="M3.5 3.5l17 17" /><path d="M10.2 5.7A9.9 9.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.7M6.6 6.9A16.4 16.4 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.3-1.1" /><path d="M9.9 10a2.8 2.8 0 0 0 4 4" /></>),
  chev: S(<path d="m9 6 6 6-6 6" />),
  chevDown: S(<path d="m6 9 6 6 6-6" />),
  search: S(<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4" /></>),
  lock: S(<><rect x="5" y="10.5" width="14" height="10" rx="1.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>),
  undo: S(<><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>),
  redo: S(<><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></>),
  plus: S(<path d="M12 5v14M5 12h14" />),
  minus: S(<path d="M5 12h14" />),
  fit: S(<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />),
  info: S(<><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8v.2" /></>),
  check: S(<path d="m5 12.5 4.5 4.5L19 7.5" />),
  warn: S(<><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4.5M12 17.2v.2" /></>),
  x: S(<path d="M6 6l12 12M18 6 6 18" />),
  copy: S(<><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="1.5" /><path d="M15.5 8.5V5.5A1.5 1.5 0 0 0 14 4H5.5A1.5 1.5 0 0 0 4 5.5V14a1.5 1.5 0 0 0 1.5 1.5h3" /></>),
  frame: S(<><rect x="3.5" y="5.5" width="17" height="13" rx="1" /><path d="m3.5 15 5-4.5 4 3.5 3-2.5 5 4" /></>),
  layer: S(<><path d="m12 4 8.5 4.5L12 13 3.5 8.5z" /><path d="m3.5 12.5 8.5 4.5 8.5-4.5" /></>),
  text: S(<path d="M5 6.5V5h14v1.5M12 5v14M9 19h6" />),
  legend: S(<><rect x="4" y="5" width="4" height="4" rx=".6" /><rect x="4" y="10.5" width="4" height="4" rx=".6" /><rect x="4" y="16" width="4" height="4" rx=".6" /><path d="M11 7h9M11 12.5h9M11 18h6" /></>),
  graphic: S(<><rect x="4.5" y="3.5" width="15" height="17" rx="1.2" /><path d="M8 8h8M8 12h5" /></>),
  panel: S(<><rect x="3.5" y="4.5" width="17" height="15" rx="1.5" /><path d="M9 4.5v15" /></>),
  target: S(<><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="2.5" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" /></>),
  download: S(<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />),
  upload: S(<path d="M12 20V9M7.5 13.5 12 9l4.5 4.5M5 4.5h14" />),
  image: S(<><rect x="3.5" y="4.5" width="17" height="15" rx="1.5" /><circle cx="9" cy="10" r="1.8" /><path d="m20.5 16-5-5-8.5 8.5" /></>),
  file: S(<><path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z" /><path d="M14 3.5V8h4.5" /></>),
  folder: S(<path d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />),
  trash: S(<path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7" />),
  refresh: S(<><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 4.5v4h-4" /></>),
};

export function Seg<T extends string>({ items, value, onChange, full }: { items: [T, string][]; value: T; onChange: (v: T) => void; full?: boolean }) {
  return (
    <div className={'seg' + (full ? ' full' : '')} role="group">
      {items.map(([v, l]) => <button type="button" key={v} className={v === value ? 'on' : ''} aria-pressed={v === value} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}
export const Field = ({ label, children, stack, htmlFor }: { label: React.ReactNode; children: React.ReactNode; stack?: boolean; htmlFor?: string }) => (
  <div className={'field' + (stack ? ' stack' : '')}><label htmlFor={htmlFor}>{label}</label>{children}</div>
);
export const Section = ({ title, aside, children }: { title: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode }) => (
  <div className="section"><h3>{title}{aside ? <span className="h-aside">{aside}</span> : null}</h3>{children}</div>
);
export const Check = ({ checked, onChange, children, id }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; id?: string }) => (
  <label className="check"><input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />{children}</label>
);
export const Note = ({ kind, children, icon }: { kind?: 'warn' | 'ok' | 'err'; children: React.ReactNode; icon?: React.ReactNode }) => (
  <div className={'note' + (kind ? ' ' + kind : '')}>{icon ?? (kind === 'warn' || kind === 'err' ? <Icon.warn /> : <Icon.info />)}<span>{children}</span></div>
);
export function NumInput({ value, onChange, min, max, step, id, ariaLabel }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; id?: string; ariaLabel?: string }) {
  const [txt, setTxt] = React.useState(String(value));
  React.useEffect(() => { setTxt(String(value)); }, [value]);
  const commit = (s: string) => { const v = parseFloat(s.replace(',', '.')); if (isFinite(v)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v))); };
  return <input id={id} aria-label={ariaLabel} type="number" value={txt} min={min} max={max} step={step} onChange={e => { setTxt(e.target.value); commit(e.target.value); }} />;
}
export const ratioIcon = (w: number, h: number) => { const s = 14 / Math.max(w, h); return <span className="ratio-ico"><i style={{ width: (w * s).toFixed(1) + 'px', height: (h * s).toFixed(1) + 'px' }} /></span>; };

/** Auswahl eines Gebietsstands, gruppiert nach Ebene (Wahlkreise, Länder, Kreise, Gemeinden …) */
export function GeoSelect({ value, onChange, label = 'Gebietsstand', filter }: { value: string; onChange: (id: string) => void; label?: string; filter?: (e: GeoIndexEntry) => boolean }) {
  const list = GEO_INDEX.filter(e => !filter || filter(e));
  const levels = [...new Set(list.map(e => e.level))].sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b));
  return (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label={label}>
      {levels.map(l => { const L = list.filter(e => e.level === l).sort((a, b) => b.year - a.year); return (
        <optgroup key={l} label={L[0].levelLabel}>{L.map(e => <option key={e.id} value={e.id}>{e.stand ? `${e.levelLabel} · ${e.stand}` : e.label}</option>)}</optgroup>); })}
    </select>
  );
}
