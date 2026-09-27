// Eigene Tabelle (M7): kleines Raster für Diagramme – Zeilen = Kategorien (Parteien, Jahre …), Spalten = Reihen.
// Einfügen aus Excel mit Strg+V (tabulatorgetrennt), Zahlen im deutschen Format.
import React, { useMemo, useState } from 'react';
import { getDoc, getUI, setUI, update, useStore } from '../model/store';
import { addDataset } from '../model/actions';
import type { Cell, Column, Dataset } from '../data/types';
import { classify, detectGerman } from '../data/parse';
import { partyOf } from '../data/parties';
import { uid } from '../lib/util';
import { Field, Icon, Note } from './common';

const EMPTY_REPORT = { total: 0, exact: 0, byName: 0, ambiguous: 0, unknown: 0, duplicate: 0, summary: 0, ignored: 0, ruled: 0, missing: [], nameMismatch: [], issues: [], nullCells: 0, dashCells: 0 };
const toText = (v: Cell) => (v == null ? '' : typeof v === 'number' ? v.toLocaleString('de-DE', { maximumFractionDigits: 6, useGrouping: false }) : String(v));

/** Raster → Datensatz ohne Gebiet (Vorlage „eigene“) */
export function tableDataset(name: string, head: string[], grid: string[][], keepId?: string): Dataset {
  const rows = grid.filter(r => r.some(x => x.trim()));
  const german = detectGerman(rows.flatMap(r => r.slice(1)));
  const columns: Column[] = head.map((h, i) => ({ id: 'c' + i, label: h.trim() || (i ? `Reihe ${i}` : 'Kategorie'), kind: i === 0 ? 'text' : 'number', role: i === 0 ? 'name' : 'value', party: null, short: null }));
  const data: Cell[][] = rows.map(r => head.map((_, i) => { const s = (r[i] || '').trim(); if (i === 0) return s; const c = classify(s, german); return c.t === 'number' ? c.v : c.t === 'dash' ? 0 : null; }));
  return {
    id: keepId || uid('ds'), name: name.trim() || 'Eigene Tabelle', fileName: 'eigene Tabelle', importedAt: new Date().toISOString(), geoSet: '', preset: 'eigene',
    settings: { preset: 'eigene', sheet: 0, headerStart: 0, headerRows: 1, format: 'wide', long: null, roles: {}, groups: null, geoSet: '', dashIsZero: true, excludeSummary: false, rules: {}, sourceTitle: '', attribution: '' },
    columns, groups: [], rows: data, rowKey: data.map((r, i) => 'row:' + (r[0] || i)), rowArea: data.map(() => null), report: { ...EMPTY_REPORT, total: data.length },
  };
}

export function TableEditor() {
  const which = useStore(s => s.ui.tableEdit)!;
  const base = which === 'new' ? null : getDoc().datasets.find(d => d.id === which) || null;
  const [name, setName] = useState(base?.name || 'Eigene Tabelle');
  const [source, setSource] = useState(base?.settings.attribution || '');
  const [head, setHead] = useState<string[]>(base ? base.columns.map(c => c.label) : ['Partei', '2025', '2021']);
  const [grid, setGrid] = useState<string[][]>(base ? base.rows.map(r => r.map(toText)) : [['CDU/CSU', '', ''], ['AfD', '', ''], ['SPD', '', ''], ['Grüne', '', ''], ['Linke', '', ''], ['Sonstige', '', '']]);
  const close = () => setUI({ tableEdit: null, afterImport: null });
  const W = head.length;
  const setCell = (r: number, c: number, v: string) => setGrid(g => g.map((row, i) => (i === r ? row.map((x, k) => (k === c ? v : x)) : row)));
  /** Strg+V: tabulatorgetrennten Bereich ab dieser Zelle einfügen (Raster wächst mit) */
  const onPaste = (r0: number, c0: number, e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain'); if (!/[\t\n]/.test(text)) return;
    e.preventDefault();
    const rows = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(l => l.split('\t'));
    const needW = Math.max(W, c0 + Math.max(...rows.map(r => r.length)));
    let h = [...head]; while (h.length < needW) h.push(`Reihe ${h.length}`);
    let g = grid.map(r => [...r, ...Array(needW - r.length).fill('')]);
    // erste eingefügte Zeile als Überschrift, wenn sie in der ersten Rasterzeile landet und keine Zahlen enthält
    let data = rows;
    if (r0 === 0 && rows.length > 1 && rows[0].slice(1).every(x => classify(x, true).t !== 'number')) { rows[0].forEach((x, k) => { if (x.trim()) h[c0 + k] = x.trim(); }); data = rows.slice(1); }
    data.forEach((row, i) => { const r = r0 + i; while (g.length <= r) g.push(Array(needW).fill('')); row.forEach((x, k) => { g[r][c0 + k] = x.trim(); }); });
    setHead(h); setGrid(g);
  };
  const parties = useMemo(() => grid.filter(r => { const p = partyOf(r[0] || ''); return p && p.key !== 'Sonstige'; }).length, [grid]);
  const valid = grid.some(r => r[0]?.trim() && r.slice(1).some(x => x.trim()));
  const save = () => {
    const ds = tableDataset(name, head, grid, base?.id);
    ds.settings.attribution = source.trim();
    if (base) update(d => { const k = d.datasets.findIndex(x => x.id === base.id); if (k >= 0) d.datasets[k] = ds as never; });
    else addDataset(ds);
    const fresh = !base && getUI().afterImport === 'suggest';
    setUI({ tableEdit: null, afterImport: null, ...(fresh ? { suggest: ds.id, suggestFresh: true } : {}) });
  };
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="te-title" onKeyDown={e => { if (e.key === 'Escape') close(); }}>
      <div className="modal wizard te-modal">
        <header className="modal-head"><h2 id="te-title">{base ? 'Tabelle bearbeiten' : 'Neue Tabelle'}</h2><span className="spacer" /><button className="btn icon ghost" onClick={close} aria-label="Schließen"><Icon.x /></button></header>
        <div className="modal-body stack-12">
          <div className="wiz-grid">
            <Field label="Name"><input type="text" value={name} onChange={e => setName(e.target.value)} /></Field>
            <Field label="Quelle"><input type="text" value={source} onChange={e => setSource(e.target.value)} placeholder="z. B. Infratest dimap für ARD, 12.09.2026" /></Field>
          </div>
          <p className="hint">Erste Spalte: Kategorien (Parteien, Jahre, Institute …), weitere Spalten: Werte. Aus Excel markieren, kopieren und in eine Zelle einfügen (Strg+V) – mehrere Zeilen und Spalten auf einmal. Parteinamen bekommen automatisch ihre Farbe.</p>
          <div className="te-wrap"><table className="te">
            <thead><tr>{head.map((h, c) => <th key={c}><input value={h} onChange={e => setHead(hh => hh.map((x, k) => (k === c ? e.target.value : x)))} aria-label={`Überschrift Spalte ${c + 1}`} />
              {c > 0 && W > 2 && <button className="btn icon ghost small" title="Spalte löschen" aria-label="Spalte löschen" onClick={() => { setHead(hh => hh.filter((_, k) => k !== c)); setGrid(g => g.map(r => r.filter((_, k) => k !== c))); }}><Icon.x size={11} /></button>}</th>)}
              <th><button className="btn small ghost" onClick={() => { setHead(h => [...h, `Reihe ${h.length}`]); setGrid(g => g.map(r => [...r, ''])); }}><Icon.plus size={12} /> Spalte</button></th></tr></thead>
            <tbody>{grid.map((row, r) => <tr key={r}>
              {head.map((_, c) => <td key={c} className={c ? 'r' : ''}><input value={row[c] || ''} onChange={e => setCell(r, c, e.target.value)} onPaste={e => onPaste(r, c, e)} inputMode={c ? 'decimal' : 'text'} aria-label={`Zeile ${r + 1}, Spalte ${c + 1}`} /></td>)}
              <td><button className="btn icon ghost small" title="Zeile löschen" aria-label="Zeile löschen" onClick={() => setGrid(g => g.filter((_, i) => i !== r))}><Icon.x size={11} /></button></td>
            </tr>)}</tbody>
          </table></div>
          <div className="row-btns"><button className="btn small" onClick={() => setGrid(g => [...g, Array(W).fill('')])}><Icon.plus size={12} /> Zeile</button>
            {parties > 0 && <span className="hint">{parties} Parteien erkannt</span>}</div>
          {!valid && <Note>Mindestens eine Zeile mit Namen und Wert eintragen.</Note>}
        </div>
        <footer className="modal-foot"><button className="btn" onClick={close}>Abbrechen</button><span className="spacer" /><button className="btn primary" disabled={!valid} onClick={save}>{base ? 'Übernehmen' : 'Tabelle anlegen'}</button></footer>
      </div>
    </div>
  );
}
