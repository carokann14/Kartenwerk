import React from 'react';
import { GEO_INDEX, GeoIndexEntry, isLtw, levelRank } from '../geo/geo';
import { hexToHsv, hsvToHex, normalizeHex } from '../lib/color';
import { TextMark, colorAtRange, isRangeBold, isRangeItalic, setMarkField, shiftMarksOnEdit } from '../lib/richtext';
import { clamp } from '../lib/util';

const S = (d: React.ReactNode) => (p: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={p.size || 15} height={p.size || 15} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
export const Icon = {
  gebiete: S(<><path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z" /><path d="M9 4v13.5M15 6.5V20" /></>),
  katalog: S(<><path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v13H6.5A1.5 1.5 0 0 0 5 18.5z" /><path d="M5 18.5A1.5 1.5 0 0 0 6.5 20H19" /><path d="M9 8h6M9 11h4" /></>),
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
  chart: S(<><path d="M4 20h16" /><rect x="5.5" y="11" width="3.2" height="9" rx=".5" /><rect x="10.4" y="6" width="3.2" height="14" rx=".5" /><rect x="15.3" y="13.5" width="3.2" height="6.5" rx=".5" /></>),
  saeulen: S(<><path d="M4 20h16" /><rect x="5.5" y="11" width="3.2" height="9" rx=".5" /><rect x="10.4" y="6" width="3.2" height="14" rx=".5" /><rect x="15.3" y="13.5" width="3.2" height="6.5" rx=".5" /></>),
  balken: S(<><path d="M4 4v16" /><rect x="4" y="5.5" width="14" height="3.2" rx=".5" /><rect x="4" y="10.4" width="10" height="3.2" rx=".5" /><rect x="4" y="15.3" width="6" height="3.2" rx=".5" /></>),
  gewinne: S(<><path d="M3.5 12h17" /><rect x="5" y="5" width="3.2" height="7" rx=".5" /><rect x="10.4" y="12" width="3.2" height="6" rx=".5" /><rect x="15.8" y="8" width="3.2" height="4" rx=".5" /></>),
  linie: S(<><path d="M4 20h16" /><path d="M4.5 16l4.5-5 4 3 6-7.5" /></>),
  sitze: S(<><path d="M3.5 18a8.5 8.5 0 0 1 17 0" /><path d="M7 18a5 5 0 0 1 10 0" /></>),
  spark: S(<><path d="M12 3.5l1.8 5 5 1.8-5 1.8-1.8 5-1.8-5-5-1.8 5-1.8z" /><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></>),
  diagramm: S(<><path d="M4 20h16" /><rect x="5.5" y="11" width="3.2" height="9" rx=".5" /><rect x="10.4" y="6" width="3.2" height="14" rx=".5" /><rect x="15.3" y="13.5" width="3.2" height="6.5" rx=".5" /></>),
  more: S(<><circle cx="6" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18" cy="12" r="1.2" /></>),
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
  pipette: S(<><path d="m14 6 4 4-8.5 8.5H5.5V14z" /><path d="m12.5 7.5 4 4" /><path d="m16.5 4 3.5 3.5-1.8 1.8-3.5-3.5z" /></>),
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
/** Zahlenfeld, das leer sein darf (leer = automatisch); übergibt undefined, sobald das Feld geleert wird. */
export function OptNum({ value, onChange, step, ariaLabel, placeholder = 'auto' }: { value: number | undefined; onChange: (v: number | undefined) => void; step?: number; ariaLabel?: string; placeholder?: string }) {
  const [txt, setTxt] = React.useState(value == null ? '' : String(value));
  React.useEffect(() => { setTxt(value == null ? '' : String(value)); }, [value]);
  const commit = (s: string) => { if (s.trim() === '') { onChange(undefined); return; } const v = parseFloat(s.replace(',', '.')); if (isFinite(v)) onChange(v); };
  return <input aria-label={ariaLabel} type="number" value={txt} step={step} placeholder={placeholder} onChange={e => { setTxt(e.target.value); commit(e.target.value); }} />;
}
export const ratioIcon = (w: number, h: number) => { const s = 14 / Math.max(w, h); return <span className="ratio-ico"><i style={{ width: (w * s).toFixed(1) + 'px', height: (h * s).toFixed(1) + 'px' }} /></span>; };

/** Farbwähler: Sättigung/Hellwert-Fläche, Farbton-Regler, Hex-Feld mit Pipette. Ersetzt <input type="color"> überall im Editor. */
function ColorPopover({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [hsv, setHsv] = React.useState(() => hexToHsv(value));
  const [hex, setHex] = React.useState(value);
  const lastOut = React.useRef(value);
  React.useEffect(() => { if (value !== lastOut.current) { setHsv(hexToHsv(value)); setHex(value); } }, [value]);
  const sq = React.useRef<HTMLDivElement>(null), hue = React.useRef<HTMLDivElement>(null);
  const set = (h: number, s: number, v: number) => { setHsv([h, s, v]); const hx = hsvToHex(h, s, v); setHex(hx); lastOut.current = hx; onChange(hx); };
  const dragSq = (down: React.PointerEvent) => {
    const el = sq.current!; el.setPointerCapture(down.pointerId);
    const move = (e: PointerEvent) => { const r = el.getBoundingClientRect(); set(hsv[0], clamp((e.clientX - r.left) / r.width, 0, 1) * 100, 100 - clamp((e.clientY - r.top) / r.height, 0, 1) * 100); };
    move(down.nativeEvent); el.addEventListener('pointermove', move); el.addEventListener('pointerup', () => el.removeEventListener('pointermove', move), { once: true });
  };
  const dragHue = (down: React.PointerEvent) => {
    const el = hue.current!; el.setPointerCapture(down.pointerId);
    const move = (e: PointerEvent) => { const r = el.getBoundingClientRect(); set(clamp((e.clientX - r.left) / r.width, 0, 1) * 360, hsv[1], hsv[2]); };
    move(down.nativeEvent); el.addEventListener('pointermove', move); el.addEventListener('pointerup', () => el.removeEventListener('pointermove', move), { once: true });
  };
  const commitHex = (s: string) => { const n = normalizeHex(s); if (n) { setHsv(hexToHsv(n)); setHex(n); lastOut.current = n; onChange(n); } };
  const canPick = typeof window !== 'undefined' && 'EyeDropper' in window;
  const pick = async () => { try { const r = await new (window as unknown as { EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper().open(); commitHex(r.sRGBHex); } catch { /* abgebrochen */ } };
  return (
    <div className="color-pop" role="dialog" aria-label="Farbe wählen" onPointerDown={e => e.stopPropagation()}>
      <div className="color-sq" ref={sq} onPointerDown={dragSq} style={{ backgroundImage: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, ${hsvToHex(hsv[0], 100, 100)})` }}>
        <span className="color-thumb" style={{ left: hsv[1] + '%', top: (100 - hsv[2]) + '%', background: hex }} />
      </div>
      <div className="color-hue" ref={hue} onPointerDown={dragHue}><span className="color-thumb" style={{ left: (hsv[0] / 360 * 100) + '%', background: hsvToHex(hsv[0], 100, 100) }} /></div>
      <div className="color-hex-row">
        <span className="color-preview" style={{ background: hex }} />
        <input className="color-hex" type="text" value={hex} spellCheck={false} onChange={e => { setHex(e.target.value); commitHex(e.target.value); }} onBlur={() => setHex(lastOut.current)} aria-label="Farbe als Hex-Code" />
        {canPick && <button type="button" className="btn icon ghost small" onClick={pick} aria-label="Farbe von Bildschirm übernehmen" title="Farbe von Bildschirm übernehmen"><Icon.pipette size={14} /></button>}
      </div>
    </div>
  );
}
/** `onCommit`: feuert einmal beim Schließen (nicht bei jeder Änderung während des Ziehens) mit der zuletzt gewählten Farbe –
 *  zum Merken einer eigenen Farbe, ohne bei jedem Zwischenschritt aufzurufen. `custom`: zeigt statt der aktuellen Farbe
 *  ein festes „eigene Farbe wählen“-Symbol (Farbrad + Pipette), damit dieses Feld nicht wie ein weiterer Farb-Vorschlag
 *  aussieht, wenn es zusammen mit festen Farbfeldern steht (z. B. „Manuell einfärben“). */
export function ColorField({ value, onChange, onCommit, ariaLabel, title, custom }: { value: string; onChange: (hex: string) => void; onCommit?: (hex: string) => void; ariaLabel?: string; title?: string; custom?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const valueRef = React.useRef(value);
  valueRef.current = value;
  const close = () => { setOpen(false); if (onCommit) onCommit(valueRef.current); };
  React.useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('pointerdown', h); document.removeEventListener('keydown', k); };
  }, [open]);
  return (
    <div className="color-anchor" ref={ref}>
      <button type="button" className={'color-swatch' + (custom ? ' color-swatch-custom' : '')} style={custom ? undefined : { background: value }}
        onClick={() => (open ? close() : setOpen(true))} aria-label={ariaLabel} title={title} aria-haspopup="dialog" aria-expanded={open}>
        {custom && <Icon.pipette size={13} />}
      </button>
      {open && <ColorPopover value={value} onChange={onChange} />}
    </div>
  );
}

/** Textfeld mit Canva-artiger Formatierung: eine Auswahl im Text lässt sich fett, kursiv oder farbig setzen,
 *  ohne den Rest des Texts zu ändern. `baseBold`: gilt der Grundschnitt des Felds schon als fett? */
export function RichTextArea({ id, rows, value, marks, baseBold, onChange, placeholder, ariaLabel }: {
  id?: string; rows: number; value: string; marks: TextMark[] | undefined; baseBold: boolean;
  onChange: (text: string, marks: TextMark[]) => void; placeholder?: string; ariaLabel?: string;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [sel, setSel] = React.useState<[number, number]>([0, 0]);
  const readSel = () => { const el = ref.current; if (el) setSel([el.selectionStart, el.selectionEnd]); };
  const [s0, s1] = sel, hasSel = s1 > s0;
  const restore = (a: number, b: number) => requestAnimationFrame(() => { const el = ref.current; if (el) { el.focus(); el.setSelectionRange(a, b); } });
  const apply = (field: 'b' | 'i', val: boolean) => { onChange(value, setMarkField(value, marks, s0, s1, field, val)); restore(s0, s1); };
  const bold = hasSel && isRangeBold(value, marks, s0, s1, baseBold);
  const italic = hasSel && isRangeItalic(value, marks, s0, s1);
  const color = colorAtRange(value, marks, s0, s1, '#16181B');
  return (
    <div className="rtext">
      <div className="rtext-tb">
        <button type="button" className={'btn icon small' + (bold ? ' on' : '')} disabled={!hasSel} aria-pressed={bold} onMouseDown={e => e.preventDefault()} onClick={() => apply('b', !bold)} title="Fett"><b>F</b></button>
        <button type="button" className={'btn icon small' + (italic ? ' on' : '')} disabled={!hasSel} aria-pressed={italic} onMouseDown={e => e.preventDefault()} onClick={() => apply('i', !italic)} title="Kursiv"><i>K</i></button>
        {/* preventDefault nur außerhalb des geöffneten Farbwählers, sonst verliert das Hex-Feld (und alles andere darin) den Fokus beim Klicken */}
        <span className={hasSel ? undefined : 'rtext-color-off'} onMouseDown={e => { if (!(e.target as HTMLElement).closest?.('.color-pop')) e.preventDefault(); }}>
          <ColorField value={color} onChange={hex => {
            onChange(value, setMarkField(value, marks, s0, s1, 'color', hex));
            // Während im Hex-Feld getippt wird, den Fokus dort lassen (nicht bei jedem gültigen Zwischenstand, z. B. einem
            // dreistelligen Kurz-Hex wie „E63“ mitten im Tippen von „E63946“, zur Auswahl zurückspringen – das riss bisher
            // den Rest der Eingabe in den Textblock statt ins Hex-Feld).
            if (!(document.activeElement as HTMLElement | null)?.closest?.('.color-pop')) restore(s0, s1);
          }} ariaLabel="Farbe der Auswahl" title="Farbe der Auswahl" />
        </span>
        {!hasSel && <p className="hint rtext-hint">Textstelle auswählen, um nur sie zu formatieren</p>}
      </div>
      <textarea id={id} ref={ref} rows={rows} value={value} placeholder={placeholder} aria-label={ariaLabel}
        onChange={e => { const val = e.target.value; onChange(val, shiftMarksOnEdit(value, val, marks)); }}
        onSelect={readSel} onKeyUp={readSel} onMouseUp={readSel} onFocus={readSel} />
    </div>
  );
}

/** Auswahl eines Gebietsstands in zwei Teilen: Ebene (Wahlkreise, Länder … Gemeinden) und Stand bzw. Wahljahr */
export interface CustomGeo { id: string; label: string; base: string; sub: string; kind?: 'region' | 'import' }
export function GeoPicker({ value, onChange, label = 'Gebietsstand', customs = [] }: { value: string; onChange: (id: string) => void; label?: string; customs?: CustomGeo[] }) {
  const custom = customs.find(c => c.id === value);
  const cur = GEO_INDEX.find(e => e.id === (custom ? custom.base : value)) || GEO_INDEX[0];
  const levels = [...new Set(GEO_INDEX.filter(e => !e.region).map(e => e.level))].sort((a, b) => levelRank(a) - levelRank(b));
  // Regionen mit eigenen Ebenen (Berlin, Bayern mit Stimm- und Wahlkreisen) als eigene Gruppe; Länder mit genau einer Ebene Landtagswahlkreise gemeinsam unter „Landtagswahlkreise“
  const regionLevels = (r: string) => [...new Set(GEO_INDEX.filter(e => e.region === r).map(e => e.level))].sort((a, b) => levelRank(a) - levelRank(b));
  const allRegions = [...new Set(GEO_INDEX.filter(e => e.region).map(e => e.region!))];
  const ltwOnly = allRegions.filter(r => regionLevels(r).length === 1 && isLtw(regionLevels(r)[0])).sort((a, b) => a.localeCompare(b, 'de'));
  const regions = allRegions.filter(r => !ltwOnly.includes(r));
  const stands = GEO_INDEX.filter(e => e.level === cur.level).sort((a, b) => b.year - a.year);
  // Ebenenwechsel: innerhalb der Verwaltungsgebiete den Stand behalten, sonst den neuesten nehmen
  const pickLevel = (l: string) => { const L = GEO_INDEX.filter(e => e.level === l).sort((a, b) => b.year - a.year); onChange(((cur.stand ? L.find(e => e.year === cur.year) : null) || L[0]).id); };
  const standLabel = (e: GeoIndexEntry) => e.stand ? e.stand.slice(-4) + (e.hint === 'aktuell' ? ' · aktuell' : '') : 'Wahl ' + e.year;
  return (
    <div className="geo-picker stack-8">
      <select value={custom ? custom.id : cur.level} onChange={e => { const x = e.target.value; if (customs.some(c => c.id === x)) onChange(x); else pickLevel(x); }} aria-label={label + ': Ebene'}>
        {levels.map(l => { const e = GEO_INDEX.find(x => x.level === l)!; return <option key={l} value={l}>{e.levelLabel}</option>; })}
        {ltwOnly.length > 0 && <optgroup label="Landtagswahlkreise">{ltwOnly.map(r => <option key={r} value={regionLevels(r)[0]}>{r}</option>)}</optgroup>}
        {regions.map(r => <optgroup key={r} label={r}>{regionLevels(r).map(l => { const e = GEO_INDEX.find(x => x.level === l)!; return <option key={l} value={l}>{r}: {e.levelLabel}</option>; })}</optgroup>)}
        {customs.some(c => c.kind === 'import') && <optgroup label="Importierte Geodaten">{customs.filter(c => c.kind === 'import').map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>}
        {customs.some(c => c.kind !== 'import') && <optgroup label="Eigene Gebiete">{customs.filter(c => c.kind !== 'import').map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>}
      </select>
      {!custom && stands.length > 1 && <Seg full items={stands.map(e => [e.id, standLabel(e)] as [string, string])} value={cur.id} onChange={onChange} />}
      <p className="hint geo-hint">{custom ? (custom.kind === 'import' ? <>Importiert · {custom.sub}</> : <>Eigene Einteilung aus {custom.sub}</>) : cur.stand
        ? <>Grenzen vom {cur.stand}{cur.hint && cur.hint !== 'aktuell' ? <> · <b>{cur.hint}</b></> : cur.hint === 'aktuell' ? <> · neuester Stand</> : null}</>
        : cur.region ? <>{cur.label} · {cur.count?.toLocaleString('de-DE')} Gebiete</> : <>Wahlkreise der {cur.election || 'Wahl ' + cur.year}</>}</p>
    </div>
  );
}
/** Kompakte Auswahl (eine Liste), gruppiert nach Ebene */
export function GeoSelect({ value, onChange, label = 'Gebietsstand', filter }: { value: string; onChange: (id: string) => void; label?: string; filter?: (e: GeoIndexEntry) => boolean }) {
  const list = GEO_INDEX.filter(e => !filter || filter(e));
  const levels = [...new Set(list.map(e => e.level))].sort((a, b) => levelRank(a) - levelRank(b));
  return (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label={label}>
      {levels.map(l => { const L = list.filter(e => e.level === l).sort((a, b) => b.year - a.year); return (
        <optgroup key={l} label={isLtw(l) ? `${L[0].levelLabel} ${L[0].region || ''}`.trim() : L[0].levelLabel}>{L.map(e => <option key={e.id} value={e.id}>{e.stand ? `${e.levelLabel} · ${e.stand}${e.hint ? ' (' + e.hint + ')' : ''}` : e.label}</option>)}</optgroup>); })}
    </select>
  );
}
