// Eigene Geodaten importieren: Datei → Lage (Koordinatensystem, Vorschau) → Felder, Name und Quelle
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GEO, bboxOfIds } from '../geo/geo';
import { CRS_LIST, Crs, crsFromCode, crsFromWkt, guessCrs, toGridFn } from '../geo/crs';
import type { GeoLayer, Prop } from '../geo/readers';
import type { UserGeoRaw, UserGeoReport } from '../geo/buildUserGeo';
import { addUserGeo } from '../model/geodataActions';
import { setUI, useStore } from '../model/store';
import { fmtInt } from '../lib/util';
import { Field, Icon, Note, Seg } from './common';

const STEPS = ['Datei', 'Lage', 'Felder'];
const ACCEPT = '.zip,.shp,.dbf,.prj,.cpg,.shx,.geojson,.json,.kml,.kmz,.gpkg';
const TOLS: [string, string][] = [['0', 'keine'], ['1', 'fein · 10 m'], ['3', 'mittel · 30 m'], ['10', 'grob · 100 m']];
const txt = (v: Prop | undefined) => (v == null ? '' : String(v));

interface CrsPick { crs: Crs; how: 'prj' | 'code' | 'guess'; sure: boolean; alternatives: Crs[] }
function detectCrs(L: GeoLayer): CrsPick {
  const w = crsFromWkt(L.wkt); if (w) return { crs: w, how: 'prj', sure: true, alternatives: [] };
  const c = crsFromCode(L.code); if (c) return { crs: c, how: 'code', sure: true, alternatives: [] };
  if (L.format === 'GeoJSON' || L.format === 'KML') {
    const [x0, y0, x1, y1] = L.bbox;
    if (Math.abs(x0) <= 180 && Math.abs(x1) <= 180 && Math.abs(y0) <= 90 && Math.abs(y1) <= 90) return { crs: crsFromCode(4326)!, how: 'code', sure: true, alternatives: [] };
  }
  const g = guessCrs(L.bbox, L.file + ' ' + L.name);
  return { crs: g.crs, how: 'guess', sure: g.sure, alternatives: g.alternatives };
}
/** Kennung: Feld mit eindeutigen, kurzen Werten, bevorzugt mit sprechendem Namen */
function guessFields(L: GeoLayer): { id: string | null; name: string | null } {
  const n = L.features.length || 1;
  const stats = L.fields.map(f => {
    const vals = L.features.map(x => txt(x.props[f]).trim()).filter(Boolean);
    const uniq = new Set(vals).size / n, avgLen = vals.reduce((s, v) => s + v.length, 0) / (vals.length || 1);
    const numeric = vals.length > 0 && vals.every(v => /^\d+$/.test(v));
    const wordy = vals.filter(v => /[A-Za-zÄÖÜäöüß]{3,}/.test(v)).length / (vals.length || 1);   // Namen enthalten Wörter, Codes nicht
    return { f, uniq, avgLen, numeric, wordy, filled: vals.length / n };
  });
  const idRe = /^(id|nr|nummer|num|key|schl|schluessel|schlüssel|ags|ars|rs|wk|wkr|wkr_nr|wk_nr|uwb|bwb|wbz|code|kennung|kennz|gid|objid)$|(_nr|nr_|_id|id_|nummer|schl|kennz)/i;
  const nameRe = /(^name$|_name|name_|^gen$|bezeich|^bez$|label|titel|^name)/i;
  const idC = stats.filter(s => s.uniq > 0.97 && s.avgLen <= 20 && s.filled > 0.97).sort((a, b) => (idRe.test(b.f) ? 2 : 0) + (b.numeric ? 1 : 0) - ((idRe.test(a.f) ? 2 : 0) + (a.numeric ? 1 : 0)) || a.avgLen - b.avgLen);
  const nameC = stats.filter(s => !s.numeric && s.filled > 0.8 && s.wordy > 0.8 && s.f !== idC[0]?.f).sort((a, b) => (nameRe.test(b.f) ? 2 : 0) + b.uniq - ((nameRe.test(a.f) ? 2 : 0) + a.uniq));
  return { id: idC[0]?.f || null, name: nameC[0] && (nameRe.test(nameC[0].f) || nameC[0].uniq > 0.5) ? nameC[0].f : null };
}
function guessLevel(s: string): string {
  if (/uwb|urnenwahlbezirk|wahlbezirk|wbz|stimmbezirk/i.test(s)) return 'Wahlbezirke';
  if (/bwb|briefwahl/i.test(s)) return 'Briefwahlbezirke';
  if (/wahlkreis|wkr|_wk|stimmkreis/i.test(s)) return /stimmkreis/i.test(s) ? 'Stimmkreise' : 'Wahlkreise';
  if (/ortsteil/i.test(s)) return 'Ortsteile';
  if (/stadtteil|quartier|viertel/i.test(s)) return 'Stadtteile';
  if (/bezirk/i.test(s)) return 'Bezirke';
  return 'Gebiete';
}
const pretty = (s: string) => s.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();

export function GeoImportWizard() {
  const [step, setStep] = useState(1);
  const [layers, setLayers] = useState<GeoLayer[] | null>(null);
  const [li, setLi] = useState(0);
  const [pick, setPick] = useState<CrsPick | null>(null);
  const [crsId, setCrsId] = useState('');
  const [idField, setIdField] = useState<string | null>(null);
  const [nameField, setNameField] = useState<string | null>(null);
  const [label, setLabel] = useState(''), [levelLabel, setLevelLabel] = useState('Gebiete');
  const [attribution, setAttribution] = useState(''), [source, setSource] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [tol, setTol] = useState(1);
  const [busy, setBusy] = useState(''), [err, setErr] = useState('');
  const [built, setBuilt] = useState<{ raw: UserGeoRaw; report: UserGeoReport; key: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const close = () => setUI({ geoWizard: false });
  const L = layers?.[li] || null;
  const crs = useMemo(() => (pick && crsId === pick.crs.id ? pick.crs : CRS_LIST.find(c => c.id === crsId) || pick?.crs || null), [crsId, pick]);

  function chooseLayer(ls: GeoLayer[], k: number) {
    const x = ls[k]; const p = detectCrs(x); const f = guessFields(x);
    setLi(k); setPick(p); setCrsId(p.crs.id); setIdField(f.id); setNameField(f.name);
    const nm = pretty(x.name); setLabel(nm); setLevelLabel(guessLevel(x.file + ' ' + x.name));
    const y = (x.file + ' ' + x.name).match(/(?:^|\D)(20\d\d|19\d\d)(?:\D|$)/); setYear(y ? +y[1] : new Date().getFullYear());
    const pts = x.features.reduce((s, ft) => s + ft.polys.reduce((t, p) => t + p.reduce((u, r) => u + r.length, 0), 0), 0);
    setTol(pts > 400000 ? 3 : 1); setBuilt(null);
  }
  async function onFiles(list: File[]) {
    if (!list.length) return;
    setErr(''); setBusy('Lese Dateien …');
    try {
      const { readGeoFiles } = await import('../geo/readers');
      const files = await Promise.all(list.map(async f => ({ name: f.name, buf: await f.arrayBuffer() })));
      const ls = (await readGeoFiles(files)).filter(x => x.features.length || x.skipped.other);
      if (!ls.length) throw new Error('Die Datei enthält keine Flächen.');
      const withPolys = ls.filter(x => x.features.length);
      if (!withPolys.length) throw new Error(`Die Datei enthält nur Punkte oder Linien (${ls.reduce((s, x) => s + x.skipped.other, 0)}). Übernommen werden Flächen.`);
      setLayers(withPolys); chooseLayer(withPolys, 0);
    } catch (e) { setErr((e as Error).message || 'Die Datei konnte nicht gelesen werden.'); }
    finally { setBusy(''); }
  }
  // Aufbau im Hintergrund, sobald Felder oder Vereinfachung feststehen
  const key = L && crs ? [li, crs.id, idField, nameField, tol].join('|') : '';
  useEffect(() => {
    if (step !== 3 || !L || !crs || built?.key === key) return;
    let stop = false; setBusy('Baue Flächen und gemeinsame Grenzen …');
    const t = setTimeout(async () => {
      try {
        const { buildUserGeo } = await import('../geo/buildUserGeo');
        const r = buildUserGeo(L, { crs, idField, nameField, tol });
        if (!stop) { setBuilt({ ...r, key }); setErr(''); }
      } catch (e) { if (!stop) { setBuilt(null); setErr((e as Error).message); } }
      finally { if (!stop) setBusy(''); }
    }, 30);
    return () => { stop = true; clearTimeout(t); };
  }, [step, key]); // eslint-disable-line

  const finish = () => {
    if (!built || !L || !crs) return;
    addUserGeo({ label: label.trim() || pretty(L.name), levelLabel: levelLabel.trim() || 'Gebiete', attribution: attribution.trim(), source: source.trim(), year, fileName: L.file, crs: crs.id, tol, idField, nameField, raw: built.raw });
    close();
  };
  const canNext = step === 1 ? !!L : step === 2 ? !!crs : false;
  const canFinish = !!built && built.report.areas > 0 && attribution.trim().length > 2 && !busy;
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="gwiz-title" onKeyDown={e => { if (e.key === 'Escape') close(); }}>
      <div className="modal wizard">
        <header className="modal-head">
          <h2 id="gwiz-title">Geodaten importieren</h2>
          <ol className="wiz-steps">{STEPS.map((s, k) => <li key={s} className={k + 1 === step ? 'on' : k + 1 < step ? 'done' : ''}><span className="num">{k + 1}</span>{s}</li>)}</ol>
          <button className="btn icon ghost" onClick={close} aria-label="Schließen"><Icon.x /></button>
        </header>
        <div className="modal-body">
          {step > 1 && L && <div className="wiz-file"><Icon.file /> <b>{L.file}</b><span className="chip">{L.format}</span><span className="chip">{fmtInt(L.features.length)} Flächen</span>{L.skipped.other > 0 && <span className="chip warn">{L.skipped.other} Punkte/Linien übergangen</span>}{crs && step > 2 && <span className="chip accent">{crs.label}</span>}</div>}
          {step === 1 && <div className="wiz-grid">
            <div className="stack-12">
              <DropFiles onFiles={onFiles} fileRef={fileRef} busy={busy} />
              {err && <Note kind="err">{err}</Note>}
              {layers && layers.length > 1 && <div className="stack-8"><h3 className="wiz-h">Ebene wählen</h3>{layers.map((x, k) => (
                <label key={k} className="check"><input type="radio" name="gl" checked={k === li} onChange={() => chooseLayer(layers, k)} /><b>{x.name}</b> <span className="hint">{x.format} · {fmtInt(x.features.length)} Flächen</span></label>))}</div>}
              {L && layers?.length === 1 && <Note kind="ok" icon={<Icon.check />}><b>{L.name}</b>: {fmtInt(L.features.length)} Flächen, {L.fields.length} Felder ({L.format}).</Note>}
            </div>
            <div className="stack-12">
              <h3 className="wiz-h">Was geht</h3>
              <p className="hint"><b>Shapefile</b> (.shp mit .dbf und .prj, am besten als ZIP, so wie Ämter sie anbieten), <b>GeoJSON</b>, <b>KML/KMZ</b> und <b>GeoPackage</b>. Übernommen werden Flächen mit ihren Attributen, etwa Wahlkreise, Wahlbezirke oder Stadtteile.</p>
              <p className="hint">Kartenwerk rechnet die Koordinaten um, bildet gemeinsame Grenzen und vereinfacht die Linien. Die fertige Ebene wird im Projekt gespeichert und funktioniert wie jede andere: Fokus, Daten importieren, Grenzen einblenden, eigene Gebiete.</p>
              <Note>Die Geodaten bleiben auf deinem Rechner. Für veröffentlichte Grafiken gilt die Lizenz der Quelle; den Vermerk trägst du im letzten Schritt ein.</Note>
            </div>
          </div>}
          {step === 2 && L && pick && <StepCrs L={L} pick={pick} crsId={crsId} setCrsId={setCrsId} crs={crs} />}
          {step === 3 && L && <StepFields L={L} idField={idField} setIdField={setIdField} nameField={nameField} setNameField={setNameField}
            label={label} setLabel={setLabel} levelLabel={levelLabel} setLevelLabel={setLevelLabel} attribution={attribution} setAttribution={setAttribution}
            source={source} setSource={setSource} year={year} setYear={setYear} tol={tol} setTol={setTol} built={built?.key === key ? built : null} busy={busy} err={err} />}
        </div>
        <footer className="modal-foot">
          {step > 1 && <button className="btn" onClick={() => setStep(step - 1)}>Zurück</button>}
          <span className="spacer" />
          {busy && step > 1 && <span className="hint"><span className="spinner" aria-hidden="true" /> {busy}</span>}
          {step < 3 && <button className="btn primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Weiter</button>}
          {step === 3 && <button className="btn primary" disabled={!canFinish} onClick={finish} title={attribution.trim().length > 2 ? '' : 'Quellenvermerk fehlt'}>Übernehmen</button>}
        </footer>
      </div>
    </div>
  );
}

function DropFiles({ onFiles, fileRef, busy }: { onFiles: (l: File[]) => void; fileRef: React.RefObject<HTMLInputElement>; busy: string }) {
  const [over, setOver] = useState(false);
  return (
    <div className={'dropzone' + (over ? ' over' : '')} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); onFiles(Array.from(e.dataTransfer.files)); }}>
      <Icon.upload size={28} />
      <p><b>Geodaten hierher ziehen</b></p>
      <p className="hint">ZIP mit Shapefile, .shp + .dbf + .prj, .geojson, .kml/.kmz, .gpkg · mehrere Dateien auf einmal möglich</p>
      <button className="btn primary" disabled={!!busy} onClick={() => fileRef.current?.click()}>{busy || 'Dateien auswählen …'}</button>
      {/* Dateiliste vor dem Leeren kopieren: FileList ist live */}
      <input ref={fileRef} type="file" multiple accept={ACCEPT} hidden data-geo-input="1" onChange={e => { const fl = Array.from(e.target.files || []); e.target.value = ''; onFiles(fl); }} />
    </div>
  );
}

/** Umrisse im Kartenraster für die Vorschau (ausgedünnt) */
function previewPaths(L: GeoLayer, crs: Crs): { d: string; bb: [number, number, number, number] } {
  const f = toGridFn(crs);
  let total = 0; for (const ft of L.features) for (const p of ft.polys) total += p[0]?.length || 0;
  const step = Math.max(1, Math.ceil(total / 40000));
  let d = ''; const bb: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ft of L.features) for (const p of ft.polys) {
    const r = p[0]; if (!r || r.length < 3) continue;
    for (let i = 0; i < r.length; i += step) {
      const [x, y] = f(r[i][0], r[i][1]);
      if (!isFinite(x) || !isFinite(y)) continue;
      d += (i ? 'L' : 'M') + x + ' ' + y;
      if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (x > bb[2]) bb[2] = x; if (y > bb[3]) bb[3] = y;
    }
    d += 'Z';
  }
  return { d, bb };
}
function StepCrs({ L, pick, crsId, setCrsId, crs }: { L: GeoLayer; pick: CrsPick; crsId: string; setCrsId: (s: string) => void; crs: Crs | null }) {
  const wk = GEO['btw-wk-2025'];
  const pv = useMemo(() => (crs ? previewPaths(L, crs) : null), [L, crs]);
  const de = useMemo(() => bboxOfIds(wk, wk.all), [wk]);
  const deD = useMemo(() => wk.all.map(i => wk.areas[i].d).join(''), [wk]);
  const ok = pv && pv.bb[0] >= de[0] - 2000 && pv.bb[2] <= de[2] + 2000 && pv.bb[1] >= de[1] - 2000 && pv.bb[3] <= de[3] + 2000;
  const opts = [...(CRS_LIST.some(c => c.id === pick.crs.id) ? [] : [pick.crs]), ...CRS_LIST];
  const zoom = pv ? (() => { const w = pv.bb[2] - pv.bb[0], h = pv.bb[3] - pv.bb[1], p = Math.max(w, h) * 0.08 + 50; return [pv.bb[0] - p, pv.bb[1] - p, w + 2 * p, h + 2 * p]; })() : null;
  const near = useMemo(() => zoom ? wk.all.filter(i => { const b = wk.areas[i].bbox; return b[2] > zoom[0] && b[0] < zoom[0] + zoom[2] && b[3] > zoom[1] && b[1] < zoom[1] + zoom[3]; }).map(i => wk.areas[i].d).join('') : '', [zoom?.join(',')]); // eslint-disable-line
  return (
    <div className="wiz-grid">
      <div className="stack-12">
        <Field label="Koordinatensystem" stack>
          <select value={crsId} onChange={e => setCrsId(e.target.value)} aria-label="Koordinatensystem">
            {opts.map(c => <option key={c.id} value={c.id}>{c.label}{c.id.startsWith('EPSG') ? ` · ${c.id}` : ''}</option>)}
          </select>
        </Field>
        {pick.how === 'prj' && <Note kind="ok" icon={<Icon.check />}>Aus der Datei gelesen ({L.format === 'Shapefile' ? '.prj' : 'Angabe im GeoPackage'}): {pick.crs.label}.</Note>}
        {pick.how === 'code' && <Note kind="ok" icon={<Icon.check />}>Aus der Datei: {pick.crs.label}.</Note>}
        {pick.how === 'guess' && <Note kind="warn">Die Datei nennt kein Koordinatensystem. Nach den Zahlenwerten passt am ehesten <b>{pick.crs.label}</b>{pick.alternatives.length ? <>, möglich wäre auch {pick.alternatives.map(a => a.label).join(', ')}</> : null}. Prüfe die Lage in der Vorschau.</Note>}
        {pv && !ok && <Note kind="err">Die Flächen liegen nicht (ganz) in Deutschland. Wahrscheinlich passt das Koordinatensystem nicht.</Note>}
        {pv && ok && <p className="hint">Rechts: die Flächen (orange) über den Bundestagswahlkreisen. Liegen sie deckungsgleich auf den Grenzen der Umgebung, stimmt das System. Ein Versatz von einigen hundert Metern oder mehr deutet auf ein falsches System hin.</p>}
      </div>
      <div className="stack-12">
        {pv && <div className="geo-previews">
          <svg viewBox={`${de[0] - 3000} ${de[1] - 3000} ${de[2] - de[0] + 6000} ${de[3] - de[1] + 6000}`} className="geo-prev de" aria-label="Lage in Deutschland">
            <path d={deD} fill="var(--line)" stroke="none" />
            <rect x={pv.bb[0]} y={pv.bb[1]} width={Math.max(600, pv.bb[2] - pv.bb[0])} height={Math.max(600, pv.bb[3] - pv.bb[1])} fill="none" stroke="var(--accent)" strokeWidth={1400} />
          </svg>
          {zoom && <svg viewBox={zoom.join(' ')} className="geo-prev zoom" aria-label="Flächen über den Wahlkreisgrenzen">
            <path d={near} fill="var(--panel-2)" stroke="var(--muted)" strokeWidth={zoom[2] / 500} strokeLinejoin="round" />
            <path d={pv.d} fill="rgba(214,110,20,.12)" stroke="#D66E14" strokeWidth={zoom[2] / 700} strokeLinejoin="round" fillRule="evenodd" />
          </svg>}
        </div>}
      </div>
    </div>
  );
}

function StepFields(p: {
  L: GeoLayer; idField: string | null; setIdField: (s: string | null) => void; nameField: string | null; setNameField: (s: string | null) => void;
  label: string; setLabel: (s: string) => void; levelLabel: string; setLevelLabel: (s: string) => void; attribution: string; setAttribution: (s: string) => void;
  source: string; setSource: (s: string) => void; year: number; setYear: (n: number) => void; tol: number; setTol: (n: number) => void;
  built: { raw: UserGeoRaw; report: UserGeoReport } | null; busy: string; err: string;
}) {
  const { L, built } = p, r = built?.report;
  const rows = L.features.slice(0, 8);
  const cols = L.fields.slice(0, 14);
  return (
    <div className="stack-12">
      <div className="wiz-grid">
        <div className="stack-12">
          <Field label="Kennung"><select value={p.idField ?? ''} onChange={e => p.setIdField(e.target.value || null)} aria-label="Feld mit der Kennung"><option value="">fortlaufend nummerieren</option>{L.fields.map(f => <option key={f} value={f}>{f}</option>)}</select></Field>
          <Field label="Name"><select value={p.nameField ?? ''} onChange={e => p.setNameField(e.target.value || null)} aria-label="Feld mit dem Namen"><option value="">wie die Kennung</option>{L.fields.map(f => <option key={f} value={f}>{f}</option>)}</select></Field>
          <p className="hint">Über die <b>Kennung</b> finden Tabellen später ihre Gebiete, etwa die Wahlbezirksnummer. Zeilen mit gleicher Kennung werden zu einer Fläche zusammengefasst.</p>
          <Field label="Name der Karte"><input type="text" value={p.label} onChange={e => p.setLabel(e.target.value)} aria-label="Name der Karte" placeholder="z. B. Wahlbezirke Berlin 2026" /></Field>
          <Field label="Gebiete heißen"><input type="text" value={p.levelLabel} onChange={e => p.setLevelLabel(e.target.value)} aria-label="Bezeichnung der Gebiete (Mehrzahl)" placeholder="z. B. Wahlbezirke" /></Field>
          <Field label="Stand (Jahr)"><input type="number" min={1990} max={2100} value={p.year} onChange={e => p.setYear(+e.target.value || p.year)} aria-label="Jahr" /></Field>
        </div>
        <div className="stack-12">
          <Field label="Quellenvermerk" stack><textarea rows={2} value={p.attribution} onChange={e => p.setAttribution(e.target.value)} placeholder="z. B. Geometrien: Amt für Statistik Berlin-Brandenburg, CC BY 3.0 DE" aria-label="Quellenvermerk (Pflicht)" /></Field>
          <p className="hint">Pflicht: erscheint in der Quellenzeile, zusammen mit „vereinfacht“. Wortlaut nach den Nutzungsbedingungen der Quelle.</p>
          <Field label="Fundstelle" stack><input type="text" value={p.source} onChange={e => p.setSource(e.target.value)} placeholder="Adresse der Download-Seite (optional)" aria-label="Fundstelle" /></Field>
          <Field label="Vereinfachung" stack><Seg full items={TOLS} value={String(p.tol)} onChange={v => p.setTol(+v)} /></Field>
        </div>
      </div>
      {p.err && <Note kind="err">{p.err}</Note>}
      {r && <div className="report-grid">
        <div className="stat ok"><b>{fmtInt(r.areas)}</b><span>Gebiete</span></div>
        <div className={'stat' + (r.merged.length ? ' warn' : '')}><b>{r.merged.length}</b><span>Kennungen mehrfach · zusammengefasst</span></div>
        <div className={'stat' + (r.noId ? ' warn' : '')}><b>{r.noId}</b><span>ohne Kennung</span></div>
        <div className={'stat' + (r.dropped ? ' warn' : '')}><b>{r.dropped}</b><span>zu klein für das 10-m-Raster</span></div>
        <div className={'stat' + (r.outside ? ' warn' : '')}><b>{r.outside}</b><span>außerhalb Deutschlands</span></div>
        <div className="stat"><b>{fmtInt(r.bytes / 1024)} KB</b><span>im Projekt · {fmtInt(r.points)} Punkte</span></div>
      </div>}
      {r && r.merged.length > 0 && <p className="hint">Mehrfach: {r.merged.slice(0, 12).join(', ')}{r.merged.length > 12 ? ' …' : ''}. Stimmt die Kennung? Sonst ein anderes Feld wählen.</p>}
      <h3 className="wiz-h">Attribute <span className="hint">erste {rows.length} von {fmtInt(L.features.length)} Zeilen{L.fields.length > cols.length ? `, ${cols.length} von ${L.fields.length} Feldern` : ''}</span></h3>
      <div className="dtable-wrap"><div className="dtable-scroll" style={{ maxHeight: 230 }}><table className="dtable">
        <thead><tr>{cols.map(f => <th key={f} className={f === p.idField ? 'hl' : f === p.nameField ? 'hl2' : ''}>{f}{f === p.idField ? ' · Kennung' : f === p.nameField ? ' · Name' : ''}</th>)}</tr></thead>
        <tbody>{rows.map((ft, k) => <tr key={k}>{cols.map(f => <td key={f} className="nm" title={txt(ft.props[f])}>{txt(ft.props[f])}</td>)}</tr>)}</tbody>
      </table></div></div>
      {!p.attribution.trim() && <Note kind="warn">Zum Übernehmen fehlt noch der Quellenvermerk.</Note>}
    </div>
  );
}
