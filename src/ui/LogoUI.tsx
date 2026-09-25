// Logo: Hochladen, Eigenschaften, Zeile im Schritt „Elemente“
import React, { useRef, useState } from 'react';
import { clamp } from '../lib/util';
import { forgetLogo, isRemembered, logoRatio, readLogoFile, rememberLogo, rememberedLogo, removeLogo, resetLogoPlace, setLogoAsset, setLogoVisible, setLogoWidth } from '../model/logo';
import { getDoc, setUI, toast, update } from '../model/store';
import type { Doc } from '../model/types';
import { activeVariant } from '../render/elements';
import { Check, Field, Icon, NumInput, Section } from './common';

const ACCEPT = '.svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp';

/** Datei übernehmen. Gemerkt wird sie, wenn noch nichts gemerkt ist oder das bisherige Logo das gemerkte war. */
async function takeFile(f: File) {
  const d0 = getDoc(), keep = !rememberedLogo() || isRemembered(d0.logo.asset);
  try {
    const asset = await readLogoFile(f);
    setLogoAsset(asset);
    setUI({ sel: { kind: 'el', id: 'logo' } });
    if (!keep) toast('Logo übernommen');
    else toast(rememberLogo(asset, getDoc().logo.opacity) ? 'Logo übernommen · für neue Grafiken gemerkt' : 'Logo übernommen · im Browser merken ging nicht (zu groß oder Speicher gesperrt)');
  } catch (err) { toast((err as Error).message || 'Das Logo konnte nicht gelesen werden.'); }
}
/** Verstecktes Dateifeld und Funktion zum Öffnen */
export function useLogoUpload() {
  const ref = useRef<HTMLInputElement>(null);
  const input = <input ref={ref} type="file" accept={ACCEPT} hidden data-logo-input="1" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void takeFile(f); }} />;
  return { input, open: () => ref.current?.click() };
}

let opTimer = 0;
/** Deckkraft ändern; ist das Logo gemerkt, gilt sie (verzögert) auch für neue Grafiken */
function setOpacity(o: number) {
  update(d => { d.logo.opacity = o; }, { key: 'logo-op' });
  clearTimeout(opTimer);
  opTimer = window.setTimeout(() => { const lg = getDoc().logo; if (lg.asset && isRemembered(lg.asset)) rememberLogo(lg.asset, lg.opacity); }, 600);
}

export function LogoProps({ doc }: { doc: Doc }) {
  const [, tick] = useState(0);
  const up = useLogoUpload();
  const lg = doc.logo, a = lg.asset, v = activeVariant(doc), b = v.L.logo;
  const saved = rememberedLogo(), remembered = isRemembered(a);
  const kind = !a ? '' : a.mime === 'image/svg+xml' ? 'SVG · bleibt im SVG-Export ein Vektor' : `${a.mime === 'image/png' ? 'PNG' : 'JPG'} · ${a.w} × ${a.h} px`;
  return <>
    <div className="rp-head"><h2>Eigenschaften</h2></div>
    <h3 className="props-title">Logo</h3>
    <p className="props-sub">{a ? `${a.name} · ${kind}` : 'noch keines geladen'}</p>
    {a && <div className="logo-preview"><img src={a.data} alt={'Logo ' + a.name} style={{ opacity: lg.opacity }} /></div>}
    <div className="row-btns">
      <button className="btn small" onClick={up.open}><Icon.upload /> {a ? 'Anderes Logo …' : 'Logo hochladen …'}</button>
      {!a && saved && <button className="btn small" onClick={() => setLogoAsset(saved.asset, saved.opacity)}><Icon.image /> Gemerktes Logo einsetzen</button>}
    </div>
    {up.input}
    {!a && <p className="hint">SVG, PNG oder JPG. Am besten SVG: Es bleibt im SVG-Export ein Vektor. Bei PNG und JPG schneidet Kartenwerk transparente oder weiße Ränder ab und verkleinert große Bilder auf höchstens 1600 px.</p>}
    {a && <>
      <Check checked={lg.visible} onChange={setLogoVisible}>Sichtbar</Check>
      <Check checked={remembered} onChange={on => {
        if (!on) { forgetLogo(); tick(x => x + 1); return; }
        if (rememberLogo(a, lg.opacity)) tick(x => x + 1); else toast('Merken ging nicht: Das Logo ist zu groß oder der Browser-Speicher ist gesperrt.');
      }}>Für neue Grafiken merken</Check>
      <p className="hint">Gemerkt wird nur in diesem Browser, nicht im Repo. Neue Grafiken bekommen das Logo dann automatisch unten links in der Karte. In der Projektdatei ist das Logo dieser Grafik immer enthalten.</p>
      <Section title="Größe und Platz">
        <Field label="Breite (px)"><NumInput min={16} max={v.w} value={Math.round(b.w)} onChange={n => setLogoWidth(clamp(n, 16, v.w))} ariaLabel="Breite des Logos" /></Field>
        <Field label="Deckkraft"><div className="row-btns nowrap"><input type="range" min={10} max={100} value={Math.round(lg.opacity * 100)} onChange={e => setOpacity(+e.target.value / 100)} aria-label="Deckkraft des Logos" /><span className="num">{Math.round(lg.opacity * 100)} %</span></div></Field>
        <dl className="kv"><dt>Position</dt><dd>{Math.round(b.x)}, {Math.round(b.y)}</dd><dt>Größe</dt><dd>{Math.round(b.w)} × {Math.round(b.w * logoRatio(a))}</dd></dl>
        <button className="btn small" onClick={resetLogoPlace}>Zurücksetzen: unten links in der Karte</button>
        <p className="hint">Ziehen verschiebt das Logo in dieser Variante, der Griff oben rechts ändert die Größe (die Unterkante bleibt). Pfeiltasten verschieben um 1 px, mit Umschalt um 10 px. Entf blendet es aus.</p>
      </Section>
      <button className="btn small ghost danger" onClick={removeLogo}><Icon.trash /> Aus dieser Grafik entfernen</button>
    </>}
  </>;
}

/** Zeile unter „Rahmenelemente“ */
export function LogoRow({ doc }: { doc: Doc }) {
  const up = useLogoUpload();
  const a = doc.logo.asset;
  return (
    <div className="lrow flat">
      <input type="checkbox" checked={doc.logo.visible && !!a} disabled={!a} onChange={e => setLogoVisible(e.target.checked)} aria-label="Logo anzeigen" />
      <span className="ln">Logo{!a && <small className="dim"> keines geladen</small>}</span>
      {a ? <button className="btn ghost small" onClick={() => setUI({ sel: { kind: 'el', id: 'logo' } })}>bearbeiten</button>
        : <button className="btn ghost small" onClick={up.open}>hochladen …</button>}
      {up.input}
    </div>
  );
}
