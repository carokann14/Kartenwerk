// Feinschliff · Automatisch nachrücken: Titel/Unterzeile ändern sich → nicht bewegte Elemente rücken nach, bewegte bleiben.
import fs from 'node:fs';
const assets: Record<string, string> = {};
for (const f of fs.readdirSync('public/data')) assets['data/' + f] = fs.readFileSync('public/data/' + f, 'utf8');
(globalThis as unknown as { window: unknown }).window = { __KW_ASSETS__: assets };
const { loadGeo, ensureGeo } = await import('../src/geo/geo');
const { defaultDoc } = await import('../src/model/defaults');
const { defaultChart } = await import('../src/render/chart');
const { makeVariant, makeLayout, restackUnmoved } = await import('../src/model/layout');
type Doc = ReturnType<typeof defaultDoc>;
const ok = (c: boolean, m: string) => { console.log((c ? 'ok: ' : 'FEHLER: ') + m); if (!c) process.exitCode = 1; };
await loadGeo();
await ensureGeo(['vg-lan-2026']);

const withTexts = (d: Doc, patch: { title?: object; subtitle?: object }): Doc =>
  ({ ...d, texts: { ...d.texts, title: { ...d.texts.title, ...(patch.title || {}) }, subtitle: { ...d.texts.subtitle, ...(patch.subtitle || {}) } } }) as Doc;
const build = (preset: string, chart = false): Doc => {
  const d0 = defaultDoc('vg-lan-2026') as Doc;
  const d = chart ? { ...d0, graphics: [{ id: 'g1', name: 'Diagramm', kind: 'chart' }], chart: { ...defaultChart('saeulen') } } as unknown as Doc : d0;
  return { ...d, variants: [makeVariant(d, preset)], active: 0 } as Doc;
};
const LONG = 'Ein sehr langer Titel, der auf mehrere Zeilen umbrechen muss, weil er nicht in eine Zeile passt';
const KEYS = ['title', 'subtitle', 'source', 'legend', 'main', 'inset', 'logo'] as const;
const box = (v: Doc['variants'][number], k: (typeof KEYS)[number]) => v.L[k] as { x: number; y: number; w?: number; h?: number };

for (const preset of ['4:5', '9:16', '16:9']) {
  const d = build(preset);
  const v0 = d.variants[0];
  // 1) Titel wird länger: Unterzeile und Karte rücken nach (Hochformat/Querformat je nach Aufbau), Titel bleibt
  const d1 = withTexts(d, { title: { text: LONG } });
  const r1 = restackUnmoved(d, d1), v1 = r1.variants[0];
  const expect = makeLayout(d1, v0.w, v0.h, v0.ts, v0.guides);
  ok(box(v1, 'title').y === box(v0, 'title').y, `${preset}: Titel bleibt oben`);
  ok(box(v1, 'subtitle').y > box(v0, 'subtitle').y + 20, `${preset}: Unterzeile rückt nach unten (${box(v0, 'subtitle').y} → ${box(v1, 'subtitle').y})`);
  ok(KEYS.every(k => Math.abs(box(v1, k).x - (expect[k] as { x: number }).x) < 1.5 && Math.abs(box(v1, k).y - (expect[k] as { y: number }).y) < 1.5 && Math.abs((box(v1, k).w ?? 0) - ((expect[k] as { w?: number }).w ?? 0)) < 1.5 && Math.abs((box(v1, k).h ?? 0) - ((expect[k] as { h?: number }).h ?? 0)) < 1.5), `${preset}: alle unbewegten Elemente stehen wie im neuen Standard-Layout`);
  if (preset !== '16:9') ok(box(v1, 'main').y > box(v0, 'main').y + 20, `${preset}: Karte rückt nach (${box(v0, 'main').y} → ${box(v1, 'main').y})`);
  // 2) von Hand verschobene Unterzeile bleibt stehen, Karte rückt trotzdem nach
  const dm = { ...d, variants: [{ ...v0, L: { ...v0.L, subtitle: { ...v0.L.subtitle, y: v0.L.subtitle.y + 57 } } }] } as Doc;
  const rm = restackUnmoved(dm, withTexts(dm, { title: { text: LONG } })).variants[0];
  ok(box(rm, 'subtitle').y === box(dm.variants[0], 'subtitle').y, `${preset}: von Hand verschobene Unterzeile bleibt (${box(rm, 'subtitle').y})`);
  ok(box(rm, 'title').y === box(v0, 'title').y, `${preset}: Titel ebenfalls unverändert`);
  // 3) Unterzeile ausblenden: Karte rückt nach oben
  const d3 = withTexts(d, { subtitle: { visible: false } });
  const v3 = restackUnmoved(d, d3).variants[0];
  if (preset !== '16:9') ok(box(v3, 'main').y < box(v0, 'main').y - 10, `${preset}: Unterzeile aus → Karte rückt nach oben (${box(v0, 'main').y} → ${box(v3, 'main').y})`);
  else ok(box(v3, 'legend').y < box(v0, 'legend').y - 10, `${preset}: Unterzeile aus → Legende rückt nach oben`);
  // 4) Ausschnitt gesperrt: Sicht bleibt, Rahmen rückt trotzdem
  const dl = { ...d, variants: [{ ...v0, locked: { main: true, inset: false } }] } as Doc;
  const vl = restackUnmoved(dl, withTexts(dl, { title: { text: LONG } })).variants[0];
  ok(JSON.stringify(vl.L.main.view) === JSON.stringify(v0.L.main.view), `${preset}: gesperrter Ausschnitt behält seine Sicht`);
  // 5) nichts Relevantes geändert → identisches Dokument
  const dn = { ...d, texts: { ...d.texts } } as Doc;
  ok(restackUnmoved(d, dn) === dn, `${preset}: gleiche Texte → keine Änderung`);
}

// Diagramm: Titel wächst, Diagrammfläche rückt nach, Titel bleibt
{
  const d = build('4:5', true), v0 = d.variants[0];
  const d1 = withTexts(d, { title: { text: LONG, size: 80 } });
  const v1 = restackUnmoved(d, d1).variants[0];
  ok(box(v1, 'subtitle').y > box(v0, 'subtitle').y + 20 && box(v1, 'main').y > box(v0, 'main').y + 20 && box(v1, 'main').h < box(v0, 'main').h, `Diagramm: Unterzeile und Fläche rücken nach, Fläche wird niedriger (${box(v0, 'main').y}/${box(v0, 'main').h} → ${box(v1, 'main').y}/${box(v1, 'main').h})`);
  ok(box(v1, 'title').y === box(v0, 'title').y, 'Diagramm: Titel bleibt');
  // zweiter Schritt: wieder kürzer → zurück an die Ausgangsposition (Invariante bleibt erhalten)
  const d2 = withTexts(d1, { title: { text: d.texts.title.text, size: d.texts.title.size } });
  const v2 = restackUnmoved(d1, d2).variants[0];
  ok(Math.abs(box(v2, 'main').y - box(v0, 'main').y) < 1.5 && Math.abs(box(v2, 'subtitle').y - box(v0, 'subtitle').y) < 1.5, 'Diagramm: Titel wieder kurz → Ausgangslage');
  // Unterzeile von Hand verschoben, dann Größe des Titels ändern: bleibt bewegt
  const dm = { ...d1, variants: [{ ...restackUnmoved(d, d1).variants[0] }] } as Doc;
  const moved = { ...dm, variants: [{ ...dm.variants[0], L: { ...dm.variants[0].L, main: { ...dm.variants[0].L.main, y: dm.variants[0].L.main.y + 33 } } }] } as Doc;
  const rr = restackUnmoved(moved, withTexts(moved, { title: { size: 40 } })).variants[0];
  ok(box(rr, 'main').y === box(moved.variants[0], 'main').y, 'Diagramm: von Hand verschobene Fläche bleibt bei späterer Textänderung');
}
console.log(process.exitCode ? '\nFEHLGESCHLAGEN' : '\nAlle Nachrück-Tests bestanden.');
