// Auswahl und Transformieren (M11 · Etappe 2): Textfelder, Drehen, Skalieren, Kopieren/Einfügen/Duplizieren, Ebenen, Formate, Export
import fs from 'node:fs';
const assets: Record<string, string> = {};
for (const f of fs.readdirSync('public/data')) assets['data/' + f] = fs.readFileSync('public/data/' + f, 'utf8');
for (const f of fs.readdirSync('public/fonts')) assets['fonts/' + f] = fs.readFileSync('public/fonts/' + f).toString('base64');
(globalThis as unknown as { window: unknown }).window = { __KW_ASSETS__: assets, addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout };
(globalThis as unknown as { localStorage: unknown }).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const ok = (c: boolean, m: string) => { console.log((c ? 'ok: ' : 'FEHLER: ') + m); if (!c) process.exitCode = 1; };
const near = (a: number, b: number, t = 1.5) => Math.abs(a - b) <= t;

const { loadGeo } = await import('../src/geo/geo');
const { loadFonts } = await import('../src/lib/fonts');
const { newProject, addVariant, relayoutActive } = await import('../src/model/actions');
const { getDoc, getUI, undo } = await import('../src/model/store');
const { normalizeDoc } = await import('../src/model/defaults');
const { flatNodes, freeNodes } = await import('../src/model/nodes');
const T = await import('../src/model/transform');
const { buildExportSvg } = await import('../src/export/svg');
const { activeVariant } = await import('../src/render/elements');
await loadGeo(); await loadFonts();

newProject('btw-wk-2025');
const exp0 = buildExportSvg(getDoc());
const order = () => flatNodes(getDoc().nodes).map(n => n.id).join(',');

// Textfeld einfügen
T.addTextNode();
let d = getDoc(); const tid = freeNodes(d.nodes)[0]?.id;
ok(!!tid && order() === `main,inset,legend,title,subtitle,source,logo,${tid},ann`, 'Textfeld liegt vor Markern/Pfeilen: ' + order());
ok(getUI().sel.kind === 'node' && (getUI().sel as { id: string }).id === tid, 'neues Textfeld ist ausgewählt');
ok(!!activeVariant(d).L.nodes?.[tid], 'Lage in der Variante');
const svg1 = buildExportSvg(d);
ok(/<g id="Textfeld-Neues-Textfeld">/.test(svg1), 'Export: eigene Gruppe „Textfeld-…“');
ok(!/<text/.test(svg1), 'Export: Text als Pfade');
// neues Format übernimmt die Lage proportional
addVariant('1:1');
d = getDoc();
const vq = d.variants[d.active], v0 = d.variants[0];
ok(!!vq.L.nodes?.[tid], 'neues Format: Textfeld hat eine Lage');
ok(near(vq.L.nodes![tid].x / vq.w, v0.L.nodes![tid].x / v0.w, 0.01) && near(vq.L.nodes![tid].y / vq.h, v0.L.nodes![tid].y / v0.h, 0.01), 'neues Format: Lage proportional zur Fläche');
relayoutActive();
ok(!!getDoc().variants[getDoc().active].L.nodes?.[tid], 'Standard-Layout neu: Textfeld behält seine Lage');

// Drehen
T.setRotation('title', 30);
d = getDoc(); let v = activeVariant(d);
ok(v.L.title.r === 30, 'Titel gedreht (30°)');
ok(/<g id="Titel" transform="rotate\(30 /.test(buildExportSvg(d)), 'Export: Titel mit rotate um die Mitte');
T.setRotation('title', 370);
ok(activeVariant(getDoc()).L.title.r === 10, 'Winkel wird auf −180…180 gebracht');
T.setRotation('title', 0);
ok(!('r' in activeVariant(getDoc()).L.title), '0° entfernt das Feld wieder');
T.setRotation('main', 20);
ok(!('r' in activeVariant(getDoc()).L.main), 'Karte lässt sich nicht drehen');
ok(!T.canRotate('inset') && T.canRotate('legend') && T.canRotate('logo') && T.canRotate(tid), 'drehbar: Texte, Legende, Logo, Textfelder');

// Skalieren über eine Ecke (proportional samt Schrift)
d = getDoc(); v = activeVariant(d);
const b0 = T.nodeBox(d, 'subtitle', v)!, L0 = T.snapLayouts(v, ['subtitle']);
const { update } = await import('../src/model/store');
update(dd => { const L = T.layoutOf(dd.variants[dd.active], 'subtitle')!; T.scaleAbout(L, L0.subtitle, b0, 'subtitle', 1.5, b0.x, b0.y); T.round(L); });
d = getDoc(); v = activeVariant(d);
const b1 = T.nodeBox(d, 'subtitle', v)!;
ok(near(b1.w, b0.w * 1.5) && near(b1.h, b0.h * 1.5, 3) && near(b1.x, b0.x) && near(b1.y, b0.y), `Unterzeile ×1,5 um die linke obere Ecke: ${b0.w}×${b0.h} → ${b1.w}×${b1.h.toFixed(1)}`);
ok(v.L.subtitle.k === 1.5, 'Skalierung als k je Format gespeichert');
T.resetScale('subtitle');
d = getDoc(); v = activeVariant(d);
const b2 = T.nodeBox(d, 'subtitle', v)!;
ok(!('k' in v.L.subtitle) && near(b2.w, b0.w) && near(b2.h, b0.h, 3), '100 %: Größe zurück');
// Karte über die Ecke: Rahmen, Ausschnitt-Maßstab und Linien wachsen mit
const F0 = JSON.parse(JSON.stringify(v.L.main)), fb = T.nodeBox(d, 'main', v)!;
update(dd => { const L = T.layoutOf(dd.variants[dd.active], 'main')!; T.scaleAbout(L, F0, fb, 'main', 0.8, fb.x, fb.y); T.round(L); });
v = activeVariant(getDoc());
ok(near(v.L.main.w, F0.w * 0.8) && near(v.L.main.view.k, F0.view.k * 0.8, 1e-6) && v.L.main.k === 0.8, 'Karte ×0,8: Rahmen, Maßstab, Inhalt (k)');
const sv = buildExportSvg(getDoc());
ok(sv.length > 1000 && sv !== exp0, 'Export der skalierten Karte entsteht');

// Duplizieren, Kopieren, Einfügen
T.duplicateNodes(['title']);
d = getDoc(); v = activeVariant(d);
const dup = freeNodes(d.nodes).find(n => n.role === 'title')!;
ok(!!dup && dup.text!.text === d.texts.title.text, 'Titel duplizieren → Textfeld mit dem Titeltext');
ok(near(v.L.nodes![dup.id].x, v.L.title.x + 24) && near(v.L.nodes![dup.id].y, v.L.title.y + 24), 'Kopie um 24 px versetzt');
ok(flatNodes(d.nodes).findIndex(n => n.id === dup.id) === flatNodes(d.nodes).findIndex(n => n.id === 'title') + 1, 'Kopie liegt direkt über dem Original');
ok(d.variants.every(x => !!x.L.nodes?.[dup.id]), 'Kopie hat in jedem Format eine Lage');
ok(T.copyNodes(['main']) === false, 'Karte kopieren: noch nicht (Hinweis)');
ok(T.copyNodes([tid]) === true, 'Textfeld kopieren');
T.pasteNodes(); T.pasteNodes();
d = getDoc(); v = activeVariant(d);
const pasted = freeNodes(d.nodes).filter(n => n.id !== tid && n.id !== dup.id);
ok(pasted.length === 2 && near(v.L.nodes![pasted[1].id].x - v.L.nodes![pasted[0].id].x, 24), 'zweimal einfügen: jeweils weiter versetzt');
ok((getUI().sel as { id?: string }).id === pasted[1].id, 'Eingefügtes ist ausgewählt');

// Ebenenreihenfolge
T.reorder([tid], 'bottom');
ok(flatNodes(getDoc().nodes)[0].id === tid, 'ganz nach hinten');
T.reorder([tid], 'up');
ok(flatNodes(getDoc().nodes)[1].id === tid, 'eine Ebene nach vorn');
T.reorder(['title'], 'top');
const fl = flatNodes(getDoc().nodes);
ok(fl[fl.length - 1].id === 'title', 'Titel ganz nach vorn');

// Ausrichten an der Fläche
T.align(['source'], 'c');
d = getDoc(); v = activeVariant(d);
const sb = T.nodeBox(d, 'source', v)!;
ok(near(sb.x + sb.w / 2, v.w / 2), 'Quelle mittig auf der Fläche');

// Mehrfachauswahl
T.selectAll();
const s = getUI().sel;
ok(s.kind === 'multi' && s.ids.includes('main') && s.ids.includes('title') && s.ids.includes(tid) && !s.ids.includes('ann'), 'Strg+A: alle sichtbaren Objekte');
T.nudge(['title', tid], 5, -3);
// Löschen
const before = getDoc();
T.deleteNodes([dup.id, 'legend', 'main']);
d = getDoc();
ok(!flatNodes(d.nodes).some(n => n.id === dup.id) && d.variants.every(x => !x.L.nodes?.[dup.id]), 'Textfeld gelöscht samt Lage in allen Formaten');
ok(!d.legend.visible && flatNodes(d.nodes).some(n => n.id === 'main'), 'Legende ausgeblendet, Karte bleibt');
undo();
ok(getDoc() === before, 'Rückgängig stellt alles wieder her');

// Normalisieren: fehlende Lage ergänzen, verwaiste entfernen
const raw = JSON.parse(JSON.stringify(getDoc()));
delete raw.variants[0].L.nodes[tid];
raw.variants[0].L.nodes['t-weg'] = { x: 1, y: 2, w: 3 };
const nd = normalizeDoc(raw);
ok(!!nd.variants[0].L.nodes?.[tid] && !nd.variants[0].L.nodes?.['t-weg'], 'Projekt laden: fehlende Lage ergänzt, verwaiste entfernt');
ok(JSON.stringify(normalizeDoc(nd).nodes) === JSON.stringify(nd.nodes), 'Normalisieren ist stabil');

// gedrehtes Textfeld im Export
T.setRotation(tid, -45);
ok(new RegExp(`<g id="Textfeld-Neues-Textfeld" transform="rotate\\(-45 `).test(buildExportSvg(getDoc())), 'Export: gedrehtes Textfeld');
const ub = T.unionBox(getDoc(), [tid])!, nb = T.nodeBox(getDoc(), tid)!;
ok(near(ub.w, (nb.w + nb.h) / Math.SQRT2, 2) && near(ub.h, (nb.w + nb.h) / Math.SQRT2, 2), 'gedreht (−45°): umschließender Rahmen passt');
