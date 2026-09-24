import React, { useMemo, useRef, useState } from 'react';
import { loadBinary } from '../lib/assets';
import { fmtInt, norm } from '../lib/util';
import { readFile } from '../data/parse';
import { EXAMPLES } from '../data/examples';
import { PRESET_LABELS, wbzTitle, buildDataset, buildTable, defaultSettings, issueLabel, shortTitle, suggestGeoSetAsync } from '../data/pipeline';
import type { Cell, Dataset, ImportSettings, PresetId, RawInput, Role } from '../data/types';
import { GEO, areaContext, areaTitle } from '../geo/geo';
import { addDataset, loadGeoSets, replaceDataset } from '../model/actions';
import { getDoc, setUI, useStore } from '../model/store';
import { Check, Field, GeoSelect, Icon, Note, NumInput, Seg } from './common';

const STEPS = ['Datei', 'Aufbau', 'Spalten', 'Gebiete', 'Zuordnung'];
const ROLE_LABEL: Record<Role, string> = { id: 'Kennung', name: 'Name', value: 'Wert', category: 'Kategorie', label: 'Beschriftung', ignore: 'ignorieren' };
const txt = (v: Cell) => (v == null ? '' : String(v));

export function ImportWizard() {
  const wiz = useStore(s => s.ui.wizard)!;
  const base = wiz.mode === 'replace' ? getDoc().datasets.find(d => d.id === wiz.datasetId) || null : null;
  const [step, setStep] = useState(1);
  const [raw, setRaw] = useState<RawInput | null>(null);
  const [st, setSt] = useState<ImportSettings | null>(null);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [geoReason, setGeoReason] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const close = () => setUI({ wizard: null });

  const table = useMemo(() => (raw && st ? buildTable(raw, st) : null), [raw, st]);
  const ds = useMemo(() => (raw && st && table && st.geoSet && GEO[st.geoSet] ? buildDataset(raw, st, table, name || raw.fileName, base?.id) : null), [raw, st, table, name, base]);

  async function load(fileName: string, buf: ArrayBuffer) {
    setErr('');
    try {
      const r = await readFile(fileName, buf);
      if (!r.sheets.length || !r.sheets[0].cells.length) throw new Error('Die Datei enthält keine Tabelle.');
      let s: ImportSettings;
      if (base) {
        const b = base.settings;
        const fresh = defaultSettings(r, b.preset, b.sheet < r.sheets.length ? b.sheet : 0);
        const keep = { roles: b.roles, groups: b.groups, geoSet: b.geoSet, rules: b.rules, dashIsZero: b.dashIsZero, excludeSummary: b.excludeSummary, sourceTitle: b.sourceTitle || fresh.sourceTitle, attribution: b.attribution || fresh.attribution };
        s = b.preset === 'allgemein' ? { ...fresh, ...b, sheet: fresh.sheet } : { ...fresh, ...keep };
      } else s = defaultSettings(r);
      const t = buildTable(r, s);
      if (!s.geoSet) { const sug = await suggestGeoSetAsync(t, s, fileName); s.geoSet = sug.id; setGeoReason(sug.reason); }
      if (!(await loadGeoSets([s.geoSet]))) return;
      setRaw(r); setSt(s); setName(base ? base.name : shortTitle(s.sourceTitle, fileName.replace(/\.[^.]+$/, '')));
      setStep(base ? 5 : 2);
    } catch (e) { setErr((e as Error).message || 'Die Datei konnte nicht gelesen werden.'); }
  }
  const onFile = async (f: File | undefined) => { if (f) await load(f.name, await f.arrayBuffer()); };
  const set = (patch: Partial<ImportSettings>) => setSt(s => (s ? { ...s, ...patch } : s));
  const setPreset = async (p: PresetId) => { if (!raw) return; const s = defaultSettings(raw, p, st?.sheet || 0); const t = buildTable(raw, s); const sug = await suggestGeoSetAsync(t, s, raw.fileName); s.geoSet = sug.id; setGeoReason(sug.reason); if (await loadGeoSets([s.geoSet])) setSt(s); };
  const setGeo = async (id: string) => { if (await loadGeoSets([id])) set({ geoSet: id }); };

  const finish = () => {
    if (!ds) return;
    if (base) {
      // Farbregel an neue Spalten-IDs anpassen (Zuordnung über die Bezeichnung)
      replaceDataset(ds);
    } else addDataset(ds);
    close();
  };

  const canNext = step === 1 ? !!raw : step === 4 ? !!st?.geoSet : true;
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="wiz-title" onKeyDown={e => { if (e.key === 'Escape') close(); }}>
      <div className="modal wizard">
        <header className="modal-head">
          <h2 id="wiz-title">{base ? `Daten ersetzen: ${base.name}` : 'Daten importieren'}</h2>
          <ol className="wiz-steps">{STEPS.map((s, k) => <li key={s} className={k + 1 === step ? 'on' : k + 1 < step ? 'done' : ''}><span className="num">{k + 1}</span>{s}</li>)}</ol>
          <button className="btn icon ghost" onClick={close} aria-label="Schließen"><Icon.x /></button>
        </header>
        <div className="modal-body">
          {step === 1 && <StepFile onFile={onFile} fileRef={fileRef} load={load} err={err} raw={raw} base={base} />}
          {step >= 2 && raw && st && table && <>
            <div className="wiz-file"><Icon.file /> <b>{raw.fileName}</b><span className="chip">{raw.kind === 'xlsx' ? 'Excel' : `CSV · ${raw.encoding} · Trennzeichen „${raw.delimiter === '\t' ? 'Tab' : raw.delimiter}“`}</span><span className="chip accent">{PRESET_LABELS[st.preset]}</span>{table.german && <span className="chip">Zahlen im deutschen Format</span>}</div>
            {step === 2 && <StepStructure raw={raw} st={st} set={set} setPreset={setPreset} table={table} />}
            {step === 3 && <StepColumns st={st} set={set} table={table} />}
            {step === 4 && <StepGeo st={st} set={set} setGeo={setGeo} reason={geoReason} name={name} setName={setName} table={table} />}
            {step === 5 && ds && <StepMatch st={st} set={set} ds={ds} base={base} />}
          </>}
        </div>
        <footer className="modal-foot">
          {step > 1 && <button className="btn" onClick={() => setStep(step - 1)}>Zurück</button>}
          <span className="spacer" />
          {step < 5 && <button className="btn primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Weiter</button>}
          {step === 5 && <button className="btn primary" disabled={!ds || ds.report.exact + ds.report.byName + ds.report.ruled === 0} onClick={finish}>{base ? 'Daten ersetzen' : 'Übernehmen'}</button>}
        </footer>
      </div>
    </div>
  );
}

function StepFile({ onFile, fileRef, load, err, raw, base }: { onFile: (f: File | undefined) => void; fileRef: React.RefObject<HTMLInputElement>; load: (n: string, b: ArrayBuffer) => void; err: string; raw: RawInput | null; base: Dataset | null }) {
  const [over, setOver] = useState(false);
  return (
    <div className="wiz-grid">
      <div>
        <div className={'dropzone' + (over ? ' over' : '')} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0]); }}>
          <Icon.upload size={28} />
          <p><b>CSV- oder Excel-Datei hierher ziehen</b></p>
          <p className="hint">.csv, .txt, .tsv, .xlsx, .xls, .ods, auch in einer .zip · Kodierung und Trennzeichen werden erkannt</p>
          <button className="btn primary" onClick={() => fileRef.current?.click()}>Datei auswählen …</button>
          <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,.xlsx,.xlsm,.xls,.ods,.zip" hidden onChange={e => onFile(e.target.files?.[0])} />
        </div>
        {err && <Note kind="err">{err}</Note>}
        {base && <Note>Die gespeicherte Zuordnung von „{base.name}“ wird wieder angewendet: Vorlage, Kopfzeilen, Spaltenrollen, Gebietsstand und deine Korrekturen. Layout und Gestaltung bleiben unverändert.</Note>}
      </div>
      {!base && <div>
        <h3 className="wiz-h">Beispieldateien</h3>
        <p className="hint">Amtliche Dateien der Bundeswahlleiterin zum Ausprobieren. Weitere gibt es auf bundeswahlleiterin.de unter „Ergebnisse › Open Data“.</p>
        <div className="ex-list">
          {EXAMPLES.map(x => <button key={x.file} className="ex" onClick={async () => load(x.name, await loadBinary(x.file))}><Icon.file /><span><b>{x.label}</b><span className="hint">{x.hint}</span></span></button>)}
        </div>
      </div>}
    </div>
  );
}

function RawPreview({ raw, st }: { raw: RawInput; st: ImportSettings }) {
  const cells = raw.sheets[st.sheet].cells;
  const from = Math.max(0, st.headerStart - 2), rows = cells.slice(from, st.headerStart + st.headerRows + 8);
  const width = Math.min(12, Math.max(...rows.map(r => r.length)));
  return (
    <div className="dtable-wrap"><div className="dtable-scroll" style={{ maxHeight: 280 }}><table className="dtable raw">
      <tbody>{rows.map((r, k) => { const ri = from + k; const hdr = ri >= st.headerStart && ri < st.headerStart + st.headerRows; return (
        <tr key={ri} className={hdr ? 'hdr' : ri < st.headerStart ? 'pre' : ''}><td className="r num rn">{ri + 1}</td>{Array.from({ length: width }, (_, c) => <td key={c} title={txt(r[c])}>{txt(r[c])}</td>)}</tr>); })}</tbody>
    </table></div></div>
  );
}
function StepStructure({ raw, st, set, setPreset, table }: { raw: RawInput; st: ImportSettings; set: (p: Partial<ImportSettings>) => void; setPreset: (p: PresetId) => void; table: ReturnType<typeof buildTable> }) {
  const hdr = raw.sheets[st.sheet].cells[st.headerStart]?.map(txt) || [];
  const opts = hdr.map((h, i) => <option key={i} value={i}>{h || `Spalte ${i + 1}`}</option>);
  const L = st.long;
  const setL = (p: Partial<NonNullable<ImportSettings['long']>>) => set({ long: { ...(L || { key: 0, name: 1, group: 2, sub: null, value: 3, kind: null, filterCol: null, filterValue: '' }), ...p } });
  return (
    <div className="wiz-grid">
      <div className="stack-12">
        <Field label="Vorlage"><select value={st.preset} onChange={e => setPreset(e.target.value as PresetId)}>{(Object.keys(PRESET_LABELS) as PresetId[]).filter(p => p !== 'auto').map(p => <option key={p} value={p}>{PRESET_LABELS[p]}</option>)}</select></Field>
        {raw.sheets.length > 1 && <Field label="Tabellenblatt"><select value={st.sheet} onChange={e => { const s = defaultSettings(raw, 'auto', +e.target.value); set({ ...s, geoSet: st.geoSet }); }}>{raw.sheets.map((s, i) => <option key={i} value={i}>{s.name}</option>)}</select></Field>}
        <Field label="Kopfzeilen"><div className="row-btns"><span className="hint">ab Zeile</span><NumInput value={st.headerStart + 1} min={1} max={200} onChange={v => set({ headerStart: v - 1 })} ariaLabel="Erste Kopfzeile" /><span className="hint">Anzahl</span><NumInput value={st.headerRows} min={1} max={4} onChange={v => set({ headerRows: v })} ariaLabel="Anzahl Kopfzeilen" /></div></Field>
        <Field label="Form"><Seg items={[['wide', 'Breitformat'], ['long', 'Langformat']]} value={st.format} onChange={v => set({ format: v, long: v === 'long' ? (L || { key: 0, name: 1, group: 2, sub: null, value: 3, kind: null, filterCol: null, filterValue: '' }) : L })} /></Field>
        {st.preset === 'bwl-wbz' && <div className="card muted stack-8">
          <Field label="Gemeinsame Briefwahl"><Seg items={[['anteilig', 'Anteilig verteilen'], ['gemeinsam', 'Als eine Fläche']]} value={st.wbz?.briefwahl || 'anteilig'} onChange={v => set({ wbz: { briefwahl: v }, sourceTitle: wbzTitle((st.sourceTitle.match(/(\d{4})/) || [''])[0], v) })} /></Field>
          <p className="hint">Viele Ämter, Samt- und Verbandsgemeinden zählen die Briefwahl gemeinsam für mehrere Gemeinden aus. <b>Anteilig</b> verteilt diese Stimmen nach der Zahl der Wahlscheine je Gemeinde; die Werte sind dann teils geschätzt und in der Spalte „Briefwahl“ gekennzeichnet. <b>Als eine Fläche</b> zeigt nur amtliche Summen, die Gemeinden erscheinen dann zusammengefasst.</p>
        </div>}
        {st.format === 'long' && L && <div className="card muted stack-8">
          <p className="hint">Im Langformat steht jeder Wert in einer eigenen Zeile. Die Tabelle wird so gedreht, dass jede Gruppe (z. B. Partei) eine Spalte wird.</p>
          <Field label="Kennung"><select value={L.key} onChange={e => setL({ key: +e.target.value })}>{opts}</select></Field>
          <Field label="Name"><select value={L.name ?? -1} onChange={e => setL({ name: +e.target.value < 0 ? null : +e.target.value })}><option value={-1}>–</option>{opts}</select></Field>
          <Field label="Gruppe"><select value={L.group} onChange={e => setL({ group: +e.target.value })}>{opts}</select></Field>
          <Field label="Unterteilung"><select value={L.sub ?? -1} onChange={e => setL({ sub: +e.target.value < 0 ? null : +e.target.value })}><option value={-1}>–</option>{opts}</select></Field>
          <Field label="Wert"><select value={L.value} onChange={e => setL({ value: +e.target.value })}>{opts}</select></Field>
          <Field label="Nur Zeilen mit"><div className="row-btns"><select value={L.filterCol ?? -1} onChange={e => setL({ filterCol: +e.target.value < 0 ? null : +e.target.value })}><option value={-1}>alle</option>{opts}</select><input type="text" value={L.filterValue} onChange={e => setL({ filterValue: e.target.value })} placeholder="Wert" aria-label="Filterwert" /></div></Field>
        </div>}
        {table.notes.map(n => <p key={n} className="hint">{n}</p>)}
        <p className="hint"><b>{table.columns.length}</b> Spalten, <b>{table.body.length}</b> Zeilen{table.summary.some(Boolean) ? `, davon ${table.summary.filter(Boolean).length} Summenzeilen` : ''}.</p>
      </div>
      <div><h3 className="wiz-h">Rohdaten <span className="hint">Kopfzeilen markiert</span></h3><RawPreview raw={raw} st={st} /></div>
    </div>
  );
}
function StepColumns({ st, set, table }: { st: ImportSettings; set: (p: Partial<ImportSettings>) => void; table: ReturnType<typeof buildTable> }) {
  const [filter, setFilter] = useState('');
  const setRole = (label: string, role: Role) => set({ roles: { ...st.roles, [label]: role } });
  const cols = table.columns.filter(c => !filter || norm(c.label).includes(norm(filter)));
  const values = table.columns.filter(c => c.role === 'value' && c.kind === 'number');
  const hasGroups = table.groups.length > 0;
  const groupAll = () => set({ groups: [{ label: 'Werte', columns: values.map(c => c.label), total: null, parties: values.some(c => c.party) }] });
  return (
    <div className="wiz-grid">
      <div className="stack-12">
        <Note>Jede Spalte bekommt eine Rolle. <b>Kennung</b> und <b>Name</b> ordnen die Zeilen den Gebieten zu, <b>Werte</b> färben ein. Kennungen bleiben Text, führende Nullen gehen nicht verloren.</Note>
        <h3 className="wiz-h">Gruppen für „Stärkste“ und Anteile</h3>
        {hasGroups ? <div className="stack-8">{table.groups.map(g => <div key={g.id} className="card"><b>{g.label}</b><span className="hint">{g.columns.length} Spalten{g.total ? ` · Bezug: ${table.columns.find(c => c.id === g.total)?.label}` : ' · Bezug: Summe der Spalten'}{g.parties ? ' · Parteien erkannt' : ''}</span></div>)}</div>
          : <p className="hint">Keine Gruppe erkannt. Wenn die Wertspalten Stimmen oder Anteile verschiedener Parteien sind, fasse sie zu einer Gruppe zusammen.</p>}
        {values.length >= 2 && <button className="btn small" onClick={groupAll}>Alle {values.length} Wertspalten als eine Gruppe</button>}
        {st.groups && <button className="btn small ghost" onClick={() => set({ groups: null })}>Gruppen automatisch bestimmen</button>}
      </div>
      <div>
        <div className="search"><Icon.search /><input type="text" value={filter} onChange={e => setFilter(e.target.value)} placeholder={`${table.columns.length} Spalten filtern`} aria-label="Spalten filtern" /></div>
        <div className="dtable-wrap" style={{ marginTop: 8 }}><div className="dtable-scroll" style={{ maxHeight: 360 }}><table className="dtable">
          <thead><tr><th>Spalte</th><th>Art</th><th>Rolle</th><th>Beispiel</th></tr></thead>
          <tbody>{cols.slice(0, 250).map(c => { const i = +c.id.slice(1); const ex = table.body.find((r, k) => !table.summary[k] && txt(r[i]))?.[i]; return (
            <tr key={c.id}><td className="nm" title={c.label} style={{ maxWidth: 240 }}>{c.label}{c.party && <span className="chip tiny">{c.party}</span>}</td><td>{c.kind === 'number' ? 'Zahl' : 'Text'}</td>
              <td><select value={c.role} onChange={e => setRole(c.label, e.target.value as Role)} aria-label={'Rolle für ' + c.label}>{(Object.keys(ROLE_LABEL) as Role[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></td>
              <td className="num">{txt(ex ?? '')}</td></tr>); })}</tbody>
        </table></div></div>
      </div>
    </div>
  );
}
function StepGeo({ st, set, setGeo, reason, name, setName, table }: { st: ImportSettings; set: (p: Partial<ImportSettings>) => void; setGeo: (id: string) => void; reason: string; name: string; setName: (s: string) => void; table: ReturnType<typeof buildTable> }) {
  const idc = table.columns.find(c => c.role === 'id'), nmc = table.columns.find(c => c.role === 'name');
  return (
    <div className="wiz-grid">
      <div className="stack-12">
        <Field label="Gebietsstand"><GeoSelect value={st.geoSet} onChange={id => { void setGeo(id); }} /></Field>
        {reason && <Note kind="ok" icon={<Icon.check />}>Vorschlag: {reason}.</Note>}
        <p className="hint">Zuordnung über <b>{idc ? `„${idc.label}“` : 'keine Kennung'}</b>{nmc ? <> und ergänzend über den Namen <b>„{nmc.label}“</b></> : ''}. Kennungen gelten nur zusammen mit dem Gebietsstand: Wahlkreis 219 von 2021 ist ein anderes Gebiet als 219 von 2025, und Gemeinden werden zusammengelegt. Gemeindeschlüssel werden mit 8 Stellen (AGS) oder 12 Stellen (Regionalschlüssel) erkannt, Kreise mit 5 Stellen.</p>
      </div>
      <div className="stack-12">
        <Field label="Name im Projekt" stack><input type="text" value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="Quelle (Titel)" stack><input type="text" value={st.sourceTitle} onChange={e => set({ sourceTitle: e.target.value })} placeholder="z. B. Bundestagswahl 2025, vorläufiges Ergebnis" /></Field>
        <Field label="Urheber" stack><input type="text" value={st.attribution} onChange={e => set({ attribution: e.target.value })} placeholder="z. B. Die Bundeswahlleiterin" /></Field>
        <p className="hint">Beides erscheint automatisch in der Quellenzeile der Grafik.</p>
      </div>
    </div>
  );
}
function StepMatch({ st, set, ds, base }: { st: ImportSettings; set: (p: Partial<ImportSettings>) => void; ds: Dataset; base: Dataset | null }) {
  const g = GEO[st.geoSet], r = ds.report;
  const [showAll, setShowAll] = useState(false);
  const rule = (key: string, val: string | null | undefined) => { const rules = { ...st.rules }; if (val === undefined) delete rules[key]; else rules[key] = val; set({ rules }); };
  const big = g.areas.length > 1500;
  const areaOpts = useMemo(() => big ? null : g.all.map(i => <option key={i} value={g.areas[i].id}>{areaTitle(g, i)}</option>), [g, big]);
  const listOpts = useMemo(() => big ? g.all.map(i => <option key={i} value={`${g.areas[i].name} · ${areaContext(g, i)} · ${g.areas[i].id}`} />) : null, [g, big]);
  const fromList = (key: string, v: string) => { const id = v.split(' · ').pop()!; if (g.byId.has(id)) rule(key, id); };
  const open = r.issues.filter(x => x.kind !== 'byName');
  const ruled = Object.keys(st.rules).length;
  const diff = base ? (() => {
    const old = new Map(base.rowArea.map((a, i) => [a, i] as const)); const now = new Map(ds.rowArea.map((a, i) => [a, i] as const));
    let changed = 0; for (const [a, i] of now) { if (!a || !old.has(a)) continue; const o = base.rows[old.get(a)!], n = ds.rows[i]; if (JSON.stringify(o) !== JSON.stringify(n)) changed++; }
    return { added: [...now.keys()].filter(a => a && !old.has(a)).length, removed: [...old.keys()].filter(a => a && !now.has(a)).length, changed };
  })() : null;
  return (
    <div className="stack-12">
      <div className="report-grid">
        <div className="stat ok"><b>{r.exact}</b><span>✓ eindeutig über Kennung</span></div>
        <div className={'stat' + (r.byName ? ' warn' : '')}><b>{r.byName}</b><span>~ über den Namen</span></div>
        <div className={'stat' + (r.ambiguous ? ' err' : '')}><b>{r.ambiguous}</b><span>? mehrdeutig</span></div>
        <div className={'stat' + (r.unknown ? ' err' : '')}><b>{r.unknown}</b><span>✗ unbekannt</span></div>
        <div className={'stat' + (r.duplicate ? ' err' : '')}><b>{r.duplicate}</b><span>⧉ doppelt</span></div>
        <div className={'stat' + (r.missing.length ? ' warn' : '')}><b>{r.missing.length}</b><span>Gebiete ohne Daten</span></div>
      </div>
      {!!r.included && <Note kind="ok" icon={<Icon.check />}><b>{r.included}</b> Gemeinden ohne eigenen Wahlbezirk sind im Ergebnis einer Nachbargemeinde enthalten („einschl. …“) und erscheinen mit ihr als eine Fläche.</Note>}
      {diff && <Note kind="ok" icon={<Icon.refresh />}>Gegenüber dem bisherigen Stand: <b>{diff.changed}</b> Gebiete mit geänderten Werten, <b>{diff.added}</b> neu, <b>{diff.removed}</b> nicht mehr enthalten.</Note>}
      <div className="wiz-grid">
        <div className="stack-8">
          <Check checked={st.excludeSummary} onChange={v => set({ excludeSummary: v })}>Summenzeilen (Land, Bund) ausschließen · {r.summary} erkannt</Check>
          <Field label="Zeichen „–“"><Seg items={[['zero', 'genau null (amtlich)'], ['missing', 'fehlend']]} value={st.dashIsZero ? 'zero' : 'missing'} onChange={v => set({ dashIsZero: v === 'zero' })} /></Field>
          <p className="hint">{fmtInt(r.dashCells)} Zellen mit „–“ · {fmtInt(r.nullCells)} leere oder als fehlend markierte Zellen (etwa Parteien, die nicht angetreten sind). Fehlend ist nie 0: Diese Gebiete erscheinen als „keine Daten“.</p>
          {r.nameMismatch.length > 0 && <details className="card muted"><summary>{r.nameMismatch.length} Namen weichen ab, die Kennung ist eindeutig</summary>
            <ul className="plain">{r.nameMismatch.slice(0, 20).map(m => <li key={m.row}><span className="num">{m.areaId}</span> Datei: „{m.dataName}“ · Karte: „{m.geoName}“</li>)}</ul></details>}
          {r.missing.length > 0 && <details className="card muted"><summary>{r.missing.length} Gebiete ohne Daten</summary><p className="hint">{r.missing.slice(0, 60).map(id => areaTitle(g, g.byId.get(id)!)).join(' · ')}{r.missing.length > 60 ? ' …' : ''}</p></details>}
        </div>
        <div className="stack-8">
          <h3 className="wiz-h">Zu prüfen {ruled > 0 && <span className="chip">{ruled} Korrekturen gespeichert</span>}</h3>
          {!open.length && !r.byName && <Note kind="ok" icon={<Icon.check />}>Alle Zeilen sind eindeutig zugeordnet.</Note>}
          <div className="issues">
            {[...open, ...(showAll ? r.issues.filter(x => x.kind === 'byName') : [])].slice(0, 80).map(x => (
              <div key={x.kind + x.row} className={'issue ' + x.kind}>
                <span className="chip tiny">{issueLabel[x.kind]}</span><span className="nm" title={x.name}>{x.name || x.key}</span>
                <select value={st.rules[x.key] === null ? '__ignore' : st.rules[x.key] ?? x.chosen ?? ''} onChange={e => rule(x.key, e.target.value === '__ignore' ? null : e.target.value === '' ? undefined : e.target.value)} aria-label={'Gebiet für ' + x.name}>
                  <option value="">– wählen –</option><option value="__ignore">Zeile ignorieren</option>
                  {x.candidates.length > 0 && <optgroup label="Vorschläge">{x.candidates.map(id => { const i = g.byId.get(id)!; return <option key={'c' + id} value={id}>{areaTitle(g, i)}{big ? ' · ' + areaContext(g, i) : ''}</option>; })}</optgroup>}
                  {areaOpts ? <optgroup label="Alle Gebiete">{areaOpts}</optgroup>
                    : (() => { const cur = st.rules[x.key]; return cur && !x.candidates.includes(cur) && g.byId.has(cur) ? <option value={cur}>{areaTitle(g, g.byId.get(cur)!)}</option> : null; })()}
                </select>
                {big && <input className="issue-find" list="kw-area-list" placeholder="anderes Gebiet suchen …" aria-label={'Anderes Gebiet für ' + x.name} onChange={e => fromList(x.key, e.target.value)} />}
              </div>))}
          </div>
          {listOpts && <datalist id="kw-area-list">{listOpts}</datalist>}
          {r.byName > 0 && <button className="btn small ghost" onClick={() => setShowAll(!showAll)}>{showAll ? 'Nur offene zeigen' : `Auch ${r.byName} Zuordnungen über den Namen prüfen`}</button>}
          <p className="hint">Korrekturen werden als Regeln gespeichert und bei „Daten ersetzen“ wieder angewendet.</p>
        </div>
      </div>
    </div>
  );
}
