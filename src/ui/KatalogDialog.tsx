// Kennzahlen-Katalog (M8): eingebaute Tabellen der Regionaldatenbank mit einem Klick als Datensatz übernehmen.
import React, { useEffect, useState } from 'react';
import { KatalogEntry, KatalogIndex, KatalogLevel, importKatalog, katalogSpan, loadKatalog } from '../data/katalog';
import { addDataset } from '../model/actions';
import { getUI, setUI, toast } from '../model/store';
import { Icon, Seg } from './common';

const KB = (n: number) => (n > 1e6 ? `${(n / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

export function KatalogDialog() {
  const [idx, setIdx] = useState<KatalogIndex | null>(null);
  const [err, setErr] = useState('');
  const [level, setLevel] = useState<KatalogLevel>('krs');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { loadKatalog().then(setIdx).catch(e => setErr((e as Error).message)); }, []);
  const close = () => setUI({ katalog: false, afterImport: null });
  const take = async (e: KatalogEntry) => {
    setBusy(e.id); setUI({ busy: `Lade „${e.label}“ …` });
    try {
      const list = await importKatalog(e, level);
      list.forEach((ds, i) => addDataset(ds, i === 0));
      if (list.length > 1) toast(`„${list[0].name}“ übernommen, dazu ${list.slice(1).map(d => d.name.split(' · ').pop()).join(' und ')} als eigene Datensätze`);
      const wantSuggest = getUI().afterImport === 'suggest';
      close();
      if (wantSuggest) setUI({ suggest: list[0].id, suggestFresh: true });
    } catch (x) { toast('Katalog-Eintrag konnte nicht geladen werden: ' + (x as Error).message); }
    finally { setBusy(null); setUI({ busy: null }); }
  };
  const themen = idx ? [...new Set(idx.entries.map(e => e.thema))] : [];
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="kat-title" onKeyDown={e => { if (e.key === 'Escape') close(); }}>
      <div className="modal katalog">
        <header className="modal-head"><h2 id="kat-title"><Icon.katalog /> Kennzahlen-Katalog</h2><span className="spacer" /><button className="btn icon ghost" onClick={close} aria-label="Schließen"><Icon.x /></button></header>
        <div className="modal-body stack-12">
          <p className="hint">Amtliche Zahlen aus der Regionaldatenbank der Statistischen Ämter, fertig aufbereitet. Ein Klick übernimmt sie als Datensatz, mit allen verfügbaren Jahren für Karte und Linie.</p>
          <div className="kat-level"><span className="hint">Ebene</span>
            <Seg items={[['krs', 'Kreise'], ['lan', 'Länder']] as [KatalogLevel, string][]} value={level} onChange={setLevel} />
            <span className="hint">{level === 'krs' ? 'Dazu Länder und Deutschland als eigene Datensätze (amtliche Werte, für Diagramme).' : 'Dazu Deutschland als eigener Datensatz.'}</span>
          </div>
          {err ? <p className="hint">Der Katalog ist hier nicht verfügbar ({err}).</p> : !idx ? <p className="hint">Wird geladen …</p> : !idx.entries.length ? <p className="hint">In dieser Fassung sind keine Katalog-Einträge enthalten.</p> :
            themen.map(t => <section key={t} className="stack-8"><h3 className="wiz-h">{t}</h3>
              {idx.entries.filter(e => e.thema === t).map(e => (
                <button key={e.id} className="kat-entry" disabled={!!busy} onClick={() => take(e)}>
                  <Icon.katalog size={20} />
                  <span><b>{busy === e.id ? 'Wird geladen …' : e.label}</b><span className="hint">{e.hint}</span>
                    <span className="kat-meta"><span className="chip">{katalogSpan(e)}</span><span className="chip">{level === 'krs' ? `${e.levels.krs ? 'Kreise · ' : ''}Länder · Deutschland` : 'Länder · Deutschland'}</span><span className="kat-src">Tabelle {e.table} · {KB(e.bytes)}</span></span></span>
                </button>))}
            </section>)}
          {idx && <p className="hint">Quelle: Statistische Ämter des Bundes und der Länder, Regionaldatenbank Deutschland, Datenlizenz Deutschland – Namensnennung – 2.0. Stand des Katalogs: {idx.built.split('-').reverse().join('.')}. Frühere Kreise werden wie beim Import auf den heutigen Zuschnitt zusammengelegt.</p>}
        </div>
      </div>
    </div>
  );
}
