import React from 'react';
import { create } from 'zustand';
import { clamp, fmtInt, svgId } from '../../lib/util';
import { PRESETS } from '../../model/defaults';
import { getDoc, getUI, setUI, toast, update, useStore } from '../../model/store';
import { activeVariant, sourceText } from '../../render/elements';
import { analyzeSvg, buildExportSvg, renderPng, SvgReport } from '../../export/svg';
import { copyText, saveFile } from '../../export/save';
import { Check, Field, Icon, Section, Seg, ratioIcon } from '../common';

interface SvgResult extends SvgReport { svg: string; url: string; ms: number; doc: unknown }
interface PngResult { blob: Blob; url: string; w: number; h: number; doc: unknown }
// Ergebnisse überleben den Wechsel zwischen den Schritten
const useExport = create<{ svg: SvgResult | null; png: PngResult | null; busy: boolean }>(() => ({ svg: null, png: null, busy: false }));

export function fileBase() {
  const d = getDoc(), v = activeVariant(d);
  const name = svgId(d.name).toLowerCase().slice(0, 48) || 'karte';
  return `${name}-${v.preset.replace(':', 'x').toLowerCase()}`;
}
export function runSvgExport() {
  const t0 = performance.now();
  const svg = buildExportSvg(getDoc(), { merge: getUI().svgMerge, scale: 1 });
  const a = analyzeSvg(svg);
  const old = useExport.getState().svg; if (old) URL.revokeObjectURL(old.url);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  useExport.setState({ svg: { ...a, svg, url, ms: Math.round(performance.now() - t0), doc: getDoc() } });
  toast(`SVG erzeugt · ${fmtInt(a.bytes / 1024)} KB`);
  return svg;
}
async function runPngExport(w: number) {
  const d = getDoc(), v = activeVariant(d), h = Math.round(w * v.h / v.w);
  useExport.setState({ busy: true });
  try {
    // gleiche Farben als eine Fläche: keine Nahtlinien zwischen Nachbargebieten im Pixelbild
    const blob = await renderPng(buildExportSvg(d, { merge: true, scale: w / v.w }), w, h);
    const old = useExport.getState().png; if (old) URL.revokeObjectURL(old.url);
    useExport.setState({ png: { blob, url: URL.createObjectURL(blob), w, h, doc: d } });
    toast(`PNG erzeugt · ${w} × ${h}`);
  } catch (e) { toast((e as Error).message); }
  finally { useExport.setState({ busy: false }); }
}
async function download(kind: 'svg' | 'png') {
  const r = useExport.getState();
  let res: 'saved' | 'declined' | 'failed';
  if (kind === 'svg') { const svg = r.svg && r.svg.doc === getDoc() ? r.svg.svg : runSvgExport(); res = await saveFile(fileBase() + '.svg', svg, 'image/svg+xml'); }
  else {
    if (!r.png) { toast('Erst PNG erzeugen'); return; }
    if (r.png.doc !== getDoc()) await runPngExport(r.png.w);
    const p = useExport.getState().png!;
    res = await saveFile(fileBase() + `-${p.w}px.png`, p.blob, 'image/png');
  }
  toast(res === 'saved' ? 'Datei gespeichert' : res === 'declined' ? 'Speichern abgebrochen' : 'Herunterladen ist in dieser Ansicht nicht möglich');
}

export function PanelExport() {
  const doc = useStore(s => s.doc!);
  const ui = useStore(s => s.ui);
  const { svg, png, busy } = useExport();
  const v = activeVariant(doc);
  const pw = clamp(ui.pngWidth || v.w * 2, 200, 10000);
  const src = sourceText(doc);
  // Veraltete Ergebnisse kennzeichnen, sobald sich die Grafik ändert
  const svgStale = !!svg && svg.doc !== doc;
  const pngStale = !!png && png.doc !== doc;

  return (
    <>
      <Section title="Variante" aside={`${v.w} × ${v.h} px`}>
        <select value={doc.active} onChange={e => { const k = +e.target.value; update(d => { d.active = k; }, { history: false }); setUI({ sel: { kind: 'graphic' }, mapMode: null }); }} aria-label="Variante für den Export">
          {doc.variants.map((x, k) => <option key={x.id} value={k}>{PRESETS[x.preset]?.label || x.preset} · {x.w} × {x.h}</option>)}
        </select>
        <Field label="Hintergrund"><Seg items={[['white', 'Weiß'], ['transparent', 'Transparent']]} value={doc.background} onChange={b => update(d => { d.background = b; })} /></Field>
      </Section>
      <Section title="Format">
        <Seg full items={[['png', 'PNG · zum Posten'], ['svg', 'SVG · Vektor']]} value={ui.exportProfile} onChange={p => setUI({ exportProfile: p })} />
        <p className="hint">{ui.exportProfile === 'png' ? 'Fertiges Bild für Instagram, X, Bluesky, LinkedIn & Co. 2× ist scharf auf hochauflösenden Bildschirmen; die Plattformen verkleinern selbst.' : 'Echte Vektoren zum Weiterbearbeiten, etwa in Illustrator, Affinity, Figma oder Inkscape. Text als Pfade, Ebenen als benannte Gruppen.'}</p>
      </Section>
      {ui.exportProfile === 'svg' ? <Section title="SVG">
          <Check checked={ui.svgMerge} onChange={v2 => setUI({ svgMerge: v2 })}>Gleiche Farben zu einer Fläche zusammenfassen</Check>
          <p className="hint">Aus: jedes Gebiet ist ein eigener, benannter Pfad (einzeln bearbeitbar). An: weniger Pfade und kleinere Datei, sinnvoll bei Gemeinden.</p>
          <button className="btn primary" onClick={runSvgExport}><Icon.download /> SVG erzeugen</button>
          {svg && <div className="card">
            {svgStale && <p className="hint warn-text"><Icon.warn size={13} /> Die Grafik hat sich seitdem geändert. „Herunterladen“ erzeugt sie neu.</p>}
            <div className="stat-row"><div className="stat"><b>{(svg.bytes / 1024 / 1024).toFixed(2).replace('.', ',')}</b><span>MB</span></div><div className="stat"><b>{svg.colors}</b><span>Farben</span></div><div className="stat"><b>{fmtInt(svg.paths)}</b><span>Pfade</span></div></div>
            <div className="report">{svg.checks.map(c => <div key={c.label} className={'rr ' + (c.ok ? 'ok' : 'warn')}>{c.ok ? <Icon.check /> : <Icon.warn />}<span>{c.label}</span></div>)}</div>
            <div className="row-btns"><button className="btn small primary" onClick={() => download('svg')}><Icon.download /> Herunterladen</button><button className="btn small" onClick={async () => toast(await copyText(svg.svg) ? 'SVG-Code kopiert' : 'Kopieren nicht möglich')}><Icon.copy /> SVG-Code kopieren</button></div>
            <img className="preview-img" src={svg.url} alt="Vorschau des exportierten SVG" />
          </div>}
        </Section> : <Section title="PNG">
        <Field label="Faktor"><Seg items={[['1', '1×'], ['2', '2×'], ['3', '3×'], ['4', '4×']]} value={String(Math.round(pw / v.w * 10) / 10) as '1'} onChange={f => setUI({ pngWidth: Math.round(v.w * +f) })} /></Field>
        <Field label="Breite (px)"><input type="number" min={200} max={10000} step={10} value={pw} onChange={e => setUI({ pngWidth: clamp(+e.target.value || v.w, 200, 10000) })} aria-label="Breite in Pixeln" /></Field>
        <p className="hint num">{pw} × {Math.round(pw * v.h / v.w)} px</p>
        <button className="btn primary" disabled={busy} onClick={() => runPngExport(pw)}><Icon.image /> {busy ? 'Wird erzeugt …' : 'PNG erzeugen'}</button>
        {png && <div className="card">
          {pngStale && <p className="hint warn-text"><Icon.warn size={13} /> Die Grafik hat sich seitdem geändert. „Herunterladen“ erzeugt sie neu.</p>}
          <div className="meta-row"><span className="chip num">{png.w} × {png.h} px</span><span className="chip num">{fmtInt(png.blob.size / 1024)} KB</span>{doc.background === 'transparent' && <span className="chip">transparent</span>}</div>
          <div className="row-btns"><button className="btn small primary" onClick={() => download('png')}><Icon.download /> Herunterladen</button></div>
          <img className={'preview-img' + (doc.background === 'transparent' ? ' checker' : '')} src={png.url} alt="Vorschau des PNG" />
        </div>}
      </Section>}
      <Section title="Quellenvermerk">
        <textarea readOnly rows={5} value={src} aria-label="Quellenvermerk" />
        <button className="btn small" onClick={async () => toast(await copyText(src) ? 'Quellenvermerk kopiert' : 'Kopieren nicht möglich')}><Icon.copy /> Für die Bildunterschrift kopieren</button>
      </Section>
      <Section title="Alle Formate">
        <p className="hint">Varianten legst du oben in der Kopfleiste an. Jede hat ihr eigenes Layout, Daten und Farben teilen sie. {doc.variants.length > 1 ? `Dieses Projekt hat ${doc.variants.length} Varianten.` : ''}</p>
        <div className="meta-row">{doc.variants.map((x, k) => <button key={x.id} className={'chip btn-chip' + (k === doc.active ? ' accent' : '')} onClick={() => update(d => { d.active = k; }, { history: false })}>{ratioIcon(x.w, x.h)}{x.preset}</button>)}</div>
      </Section>
    </>
  );
}
