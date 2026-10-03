// Objekte der Grafik einheitlich auswählen, verschieben, skalieren, drehen, anordnen, kopieren (M11 · Etappe 2).
// Gilt für die festen Objekte (Titel, Unterzeile, Quelle, Legende, Logo, Karte bzw. Diagramm, Lupe) und freie Textfelder.
import { current, Draft } from 'immer';
import type { Box, Doc, FrameBox, GNode, Sel, TextEl, Variant } from './types';
import { activeVariant, legendPrims, nodeTextPrims, sourceText, textPrims } from '../render/elements';
import { logoRect } from './logo';
import { isChart } from './graphicKeys';
import { boxForAll, findNode, flatNodes, isBuiltin } from './nodes';
export { boxForAll, carryNodeLayouts } from './nodes';
import { getDoc, getUI, setUI, toast, update } from './store';
import { uid } from '../lib/util';

export interface NBox { x: number; y: number; w: number; h: number; r: number }
export type Dir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const HPOS: Record<Dir, [number, number]> = { nw: [-.5, -.5], n: [0, -.5], ne: [.5, -.5], e: [.5, 0], se: [.5, .5], s: [0, .5], sw: [-.5, .5], w: [-.5, 0] };

const TEXT_IDS = ['title', 'subtitle', 'source'] as const;
const isText = (id: string): id is 'title' | 'subtitle' | 'source' => (TEXT_IDS as readonly string[]).includes(id);

/** Lage eines Objekts in der Variante (ungedrehter Rahmen und Drehung um die Mitte); null, wenn es nicht sichtbar ist */
export function nodeBox(doc: Doc, id: string, v: Variant = activeVariant(doc)): NBox | null {
  if (isText(id)) { const p = textPrims(doc, id, v); return p ? { ...p.box, r: v.L[id].r ?? 0 } : null; }
  if (id === 'legend') { const p = legendPrims(doc, v.L.legend, v.L.main.w, v.ts); return p ? { ...p.box, r: v.L.legend.r ?? 0 } : null; }
  if (id === 'logo') { const b = logoRect(doc, v); return b ? { ...b, r: v.L.logo.r ?? 0 } : null; }
  if (id === 'main') { const F = v.L.main; return { x: F.x, y: F.y, w: F.w, h: F.h, r: 0 }; }
  if (id === 'inset') { if (isChart(doc) || !doc.inset.visible) return null; const F = v.L.inset; return { x: F.x, y: F.y, w: F.w, h: F.h, r: 0 }; }
  if (id === 'ann') return null;
  const n = findNode(doc.nodes, id); if (!n || n.type !== 'text') return null;
  const p = nodeTextPrims(doc, n, v); return p ? { ...p.box, r: v.L.nodes?.[id]?.r ?? 0 } : null;
}
/** Karten und Diagramme bleiben gerade (Norden oben, Achsen lesbar); Texte, Legende und Logo lassen sich drehen */
export const canRotate = (id: string) => id !== 'main' && id !== 'inset' && id !== 'ann';
/** Griffe je Objekt: Texte und Legende ändern an den Seiten nur die Breite (Höhe folgt dem Inhalt), das Logo nur proportional */
export function handleDirs(id: string): Dir[] {
  if (id === 'logo') return ['nw', 'ne', 'se', 'sw'];
  if (id === 'main' || id === 'inset') return ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  return ['nw', 'ne', 'se', 'sw', 'w', 'e'];
}
export const autoHeight = (id: string) => id !== 'main' && id !== 'inset' && id !== 'logo';
export function corners(b: NBox): [number, number][] {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, a = b.r * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return ([[-b.w / 2, -b.h / 2], [b.w / 2, -b.h / 2], [b.w / 2, b.h / 2], [-b.w / 2, b.h / 2]] as [number, number][]).map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}
export function aabb(b: NBox) {
  const pts = corners(b); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
export function unionBox(doc: Doc, ids: string[], v: Variant = activeVariant(doc)) {
  const bs = ids.map(id => nodeBox(doc, id, v)).filter((b): b is NBox => !!b).map(aabb);
  if (!bs.length) return null;
  const x0 = Math.min(...bs.map(b => b.x)), y0 = Math.min(...bs.map(b => b.y)), x1 = Math.max(...bs.map(b => b.x + b.w)), y1 = Math.max(...bs.map(b => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ---------- Auswahl ----------
/** Kennungen der ausgewählten Objekte (Titel, Karte, Textfeld …); Gebiete, Ebenen, Marker usw. zählen nicht */
export function selIds(sel: Sel): string[] {
  if (sel.kind === 'el' || sel.kind === 'frame' || sel.kind === 'node') return [sel.id];
  if (sel.kind === 'multi') return sel.ids;
  return [];
}
export function selFor(ids: string[]): Sel {
  const u = [...new Set(ids)];
  if (!u.length) return { kind: 'graphic' };
  if (u.length > 1) return { kind: 'multi', ids: u };
  const id = u[0];
  if (id === 'main' || id === 'inset') return { kind: 'frame', id };
  if (isText(id) || id === 'legend' || id === 'logo') return { kind: 'el', id };
  return { kind: 'node', id };
}
/** alle sichtbaren Objekte in Zeichenreihenfolge (für Strg+A und das Aufziehen eines Rahmens) */
export function selectableIds(doc: Doc): string[] { return flatNodes(doc.nodes).map(n => n.id).filter(id => id !== 'ann' && !!nodeBox(doc, id)); }

// ---------- Lage schreiben ----------
type AnyBox = Box | FrameBox;
/** veränderbare Lage eines Objekts in der Variante (Entwurf) */
export function layoutOf(v: Draft<Variant> | Variant, id: string): AnyBox | null {
  if (isText(id) || id === 'legend' || id === 'logo' || id === 'main' || id === 'inset') return v.L[id] as AnyBox;
  return v.L.nodes?.[id] || null;
}
/** Ausgangslage merken (Kopie), damit Gesten immer vom Anfang aus rechnen */
export const snapLayouts = (v: Variant, ids: string[]) => Object.fromEntries(ids.map(id => [id, JSON.parse(JSON.stringify(layoutOf(v, id)))])) as Record<string, AnyBox>;
const isFrame = (b: AnyBox): b is FrameBox => 'h' in b && 'view' in b;

/** Proportional um den Faktor f skalieren; die Mitte wandert mit dem Ankerpunkt (ax, ay) mit. Ausgangslage L0, Rahmen b0 */
export function scaleAbout(L: AnyBox, L0: AnyBox, b0: NBox, id: string, f: number, ax: number, ay: number, locked = false) {
  const cx = ax + (b0.x + b0.w / 2 - ax) * f, cy = ay + (b0.y + b0.h / 2 - ay) * f;
  const nw = b0.w * f, nh = b0.h * f;
  if (isFrame(L) && isFrame(L0)) {
    L.w = L0.w * f; L.h = L0.h * f; L.k = (L0.k ?? 1) * f;
    L.view = { ...L0.view, k: L0.view.k * f };   // gleicher Ausschnitt im größeren Rahmen: Karte wächst mit
    void locked;
  } else if (id === 'logo') { L.w = L0.w * f; }
  else if (id === 'legend') { L.k = (L0.k ?? 1) * f; if (L0.w) L.w = L0.w * f; }
  else { L.w = L0.w * f; L.k = (L0.k ?? 1) * f; }
  // Lage aus der neuen Mitte (der Rahmen des Objekts ist bei Texten links oben an L.x/L.y)
  L.x = cx - nw / 2 - (b0.x - L0.x) * f; L.y = cy - nh / 2 - (b0.y - L0.y) * f;
}
export const round = (L: AnyBox) => { L.x = Math.round(L.x * 10) / 10; L.y = Math.round(L.y * 10) / 10; L.w = Math.round(L.w * 10) / 10; if (isFrame(L)) L.h = Math.round(L.h * 10) / 10; if (L.k != null) L.k = Math.round(L.k * 10000) / 10000; };

// ---------- Befehle ----------
const doSelect = (ids: string[]) => setUI({ sel: selFor(ids), mapMode: null });
/** Verschieben um dx/dy (Pfeiltasten) */
export function nudge(ids: string[], dx: number, dy: number) {
  update(d => { const v = d.variants[d.active]; for (const id of ids) { const L = layoutOf(v, id); if (L) { L.x += dx; L.y += dy; } } }, { key: 'nudge-' + ids.join() });
}
/** Ausrichten: ein Objekt an der Fläche, mehrere aneinander */
export function align(ids: string[], how: 'l' | 'c' | 'r' | 't' | 'm' | 'b') {
  const doc = getDoc(), v = activeVariant(doc);
  const ref = ids.length === 1 ? { x: 0, y: 0, w: v.w, h: v.h } : unionBox(doc, ids, v);
  if (!ref) return;
  update(d => {
    const V = d.variants[d.active];
    for (const id of ids) {
      const b0 = nodeBox(doc, id, v), L = layoutOf(V, id); if (!b0 || !L) continue;
      const b = aabb(b0); let dx = 0, dy = 0;
      if (how === 'l') dx = ref.x - b.x; if (how === 'c') dx = ref.x + ref.w / 2 - (b.x + b.w / 2); if (how === 'r') dx = ref.x + ref.w - (b.x + b.w);
      if (how === 't') dy = ref.y - b.y; if (how === 'm') dy = ref.y + ref.h / 2 - (b.y + b.h / 2); if (how === 'b') dy = ref.y + ref.h - (b.y + b.h);
      L.x = Math.round(L.x + dx); L.y = Math.round(L.y + dy);
    }
  });
  toast(ids.length === 1 ? 'An der Fläche ausgerichtet' : 'Ausgerichtet');
}
/** Ebenenreihenfolge im Elementbaum: eine Stufe oder ganz nach vorn/hinten */
export function reorder(ids: string[], dir: 'up' | 'down' | 'top' | 'bottom') {
  const set = new Set(ids); if (!set.size) return;
  update(d => {
    const visit = (list: GNode[]) => {
      if (list.some(n => set.has(n.id))) {
        if (dir === 'top' || dir === 'bottom') { const mv = list.filter(n => set.has(n.id)), rest = list.filter(n => !set.has(n.id)); list.splice(0, list.length, ...(dir === 'top' ? [...rest, ...mv] : [...mv, ...rest])); }
        else if (dir === 'up') { for (let i = list.length - 2; i >= 0; i--) if (set.has(list[i].id) && !set.has(list[i + 1].id)) [list[i], list[i + 1]] = [list[i + 1], list[i]]; }
        else { for (let i = 1; i < list.length; i++) if (set.has(list[i].id) && !set.has(list[i - 1].id)) [list[i], list[i - 1]] = [list[i - 1], list[i]]; }
      }
      for (const n of list) if (n.children) visit(n.children);
    };
    visit(d.nodes as GNode[]);
  });
  toast({ up: 'Eine Ebene nach vorn', down: 'Eine Ebene nach hinten', top: 'Ganz nach vorn', bottom: 'Ganz nach hinten' }[dir]);
}
/** Drehung schreiben; 0° entfernt das Feld (ungedrehte Objekte bleiben wie vor M11) */
export function setR(L: Box, r: number) { const n = Math.round((((r % 360) + 540) % 360 - 180) * 10) / 10; if (n && n !== -180) L.r = n; else if (n === -180) L.r = 180; else delete L.r; }
export function setRotation(id: string, r: number) {
  if (!canRotate(id)) return;
  const n = ((r % 360) + 540) % 360 - 180;
  update(d => { const L = layoutOf(d.variants[d.active], id) as Box | null; if (L) setR(L, n); }, { key: 'rot-' + id });
}

// ---------- Freie Textfelder ----------
const newText = (): TextEl => ({ text: 'Neues Textfeld', visible: true, size: 28, cut: 'text', color: 'ink', align: 'start' });
function insertNodes(nodes: { node: GNode; boxes: Record<string, Box> }[], after?: string, history = true): string[] {
  update(d => {
    const list = d.nodes as GNode[];
    const at = after ? list.findIndex(n => flatNodes([n]).some(x => x.id === after)) : -1;
    const pos = at >= 0 ? at + 1 : list.findIndex(n => n.id === 'ann') >= 0 ? list.findIndex(n => n.id === 'ann') : list.length;   // vor Marker/Pfeilen
    list.splice(pos, 0, ...(nodes.map(x => x.node) as never[]));
    for (const v of d.variants) { v.L.nodes ||= {}; for (const x of nodes) if (x.boxes[v.id]) v.L.nodes[x.node.id] = x.boxes[v.id]; }
  }, { history });
  const ids = nodes.map(x => x.node.id);
  doSelect(ids);
  return ids;
}
export function addTextNode() {
  const doc = getDoc(), v = activeVariant(doc), w = Math.round(v.w * 0.6);
  const node: GNode = { id: uid('t'), type: 'text', role: 'text', text: newText() };
  insertNodes([{ node, boxes: boxForAll(doc, v, { x: Math.round((v.w - w) / 2), y: Math.round(v.h * 0.45), w }) }]);
  toast('Textfeld eingefügt · Text rechts in den Eigenschaften');
}
/** Inhalt eines Objekts als Textfeld (Kopieren, Duplizieren); null, wenn es (noch) nicht kopierbar ist */
function asTextNode(doc: Doc, id: string): GNode | null {
  if (isText(id)) {
    const t = doc.texts[id];
    const text = (id === 'source' ? sourceText(doc) : t.text) ?? '';
    return { id: uid('t'), type: 'text', role: id, text: { text, visible: true, size: t.size, cut: t.cut, color: t.color, align: t.align || 'start', ...(t.marks?.length && (id !== 'source' || t.text != null) ? { marks: JSON.parse(JSON.stringify(t.marks)) } : {}) } };
  }
  const n = findNode(doc.nodes, id);
  if (n && n.type === 'text' && n.text) return { ...JSON.parse(JSON.stringify(n)), id: uid('t') };
  return null;
}
const NOT_YET = 'Karte, Diagramm, Legende und Logo lassen sich noch nicht kopieren (kommt mit Etappe 3 und M12).';

interface Clip { items: { node: GNode; boxes: Record<string, Box>; vw: number; vh: number; from: string }[]; n: number }
let clip: Clip | null = null;
export const hasClip = () => !!clip;
function collect(doc: Doc, ids: string[]) {
  const out: Clip['items'] = []; let skipped = 0;
  for (const id of ids) {
    const node = asTextNode(doc, id); if (!node) { skipped++; continue; }
    const boxes: Record<string, Box> = {};
    for (const v of doc.variants) { const L = layoutOf(v, id); if (L) boxes[v.id] = { x: L.x, y: L.y, w: L.w, ...((L as Box).r ? { r: (L as Box).r } : {}), ...(L.k != null ? { k: L.k } : {}) }; }
    const v = activeVariant(doc);
    out.push({ node, boxes, vw: v.w, vh: v.h, from: v.id });
  }
  return { out, skipped };
}
export function copyNodes(ids: string[]): boolean {
  const { out, skipped } = collect(getDoc(), ids);
  if (!out.length) { toast(NOT_YET); return false; }
  clip = { items: out, n: 0 };
  toast(skipped ? `Kopiert (${out.length} von ${ids.length}; ${NOT_YET})` : out.length > 1 ? `${out.length} Objekte kopiert` : 'Kopiert');
  return true;
}
export function pasteNodes() {
  if (!clip) return;
  clip.n++;
  const doc = getDoc(), off = 24 * clip.n;
  const items = clip.items.map(it => {
    const node: GNode = { ...JSON.parse(JSON.stringify(it.node)), id: uid('t') };
    // Lage je Variante: gespeicherte, sonst aus der Variante der Kopie abgeleitet; versetzt, damit die Kopie sichtbar ist
    const fromV = { id: it.from, w: it.vw, h: it.vh, ts: activeVariant(doc).ts } as Variant;
    const derived = boxForAll(doc, fromV, it.boxes[it.from] || Object.values(it.boxes)[0]);
    const boxes: Record<string, Box> = {};
    for (const v of doc.variants) { const b = it.boxes[v.id] || derived[v.id]; boxes[v.id] = { ...b, x: b.x + off, y: b.y + off }; }
    return { node, boxes };
  });
  insertNodes(items);
  toast('Eingefügt');
}
/** Duplizieren (Strg+D: versetzt um 24 px; Alt+Ziehen: an Ort und Stelle, ohne eigenen Undo-Schritt). Liefert die neuen Kennungen. */
export function duplicateNodes(ids: string[], off = 24, inGesture = false): string[] | null {
  const doc = getDoc(); const { out, skipped } = collect(doc, ids);
  if (!out.length) { toast(NOT_YET); return null; }
  const nids = insertNodes(out.map(it => { const boxes: Record<string, Box> = {}; for (const [k, b] of Object.entries(it.boxes)) boxes[k] = { ...b, x: b.x + off, y: b.y + off }; return { node: it.node, boxes }; }), ids[ids.length - 1], !inGesture);
  if (skipped || !inGesture) toast(skipped ? `Dupliziert (${out.length} von ${ids.length}; ${NOT_YET})` : 'Dupliziert');
  return nids;
}
/** Löschen: freie Textfelder werden entfernt, feste Objekte ausgeblendet (einblenden unter „Ebenen“) */
export function deleteNodes(ids: string[]) {
  const doc = getDoc(); let hidden = 0, removed = 0, kept = 0;
  update(d => {
    for (const id of ids) {
      if (isText(id)) { d.texts[id].visible = false; hidden++; }
      else if (id === 'legend') { d.legend.visible = false; hidden++; }
      else if (id === 'logo') { d.logo.visible = false; hidden++; }
      else if (id === 'inset') { d.inset.visible = false; d.inset.autoHidden = false; hidden++; }
      else if (id === 'main') kept++;
      else if (!isBuiltin(id)) {
        const rm = (list: GNode[]) => { const i = list.findIndex(n => n.id === id); if (i >= 0) list.splice(i, 1); else list.forEach(n => n.children && rm(n.children)); };
        rm(d.nodes as GNode[]);
        for (const v of d.variants) if (v.L.nodes) delete v.L.nodes[id];
        removed++;
      }
    }
  });
  void doc;
  setUI({ sel: { kind: 'graphic' } });
  toast([removed ? `${removed} gelöscht` : '', hidden ? `${hidden} ausgeblendet (einblenden unter „Ebenen“)` : '', kept ? 'Karte bzw. Diagramm bleibt' : ''].filter(Boolean).join(' · ') || 'Nichts zu löschen');
}
export function selectAll() { doSelect(selectableIds(getDoc())); }
/** Skalierung über die Eckgriffe zurücknehmen (100 %): Größe des Objekts zurück, Mitte bleibt */
export function resetScale(id: string) {
  const doc = getDoc(), v = activeVariant(doc), L0 = layoutOf(v, id), b0 = nodeBox(doc, id, v);
  if (!L0 || !b0 || !L0.k || L0.k === 1) return;
  const snap = JSON.parse(JSON.stringify(L0)) as AnyBox;
  update(d => { const L = layoutOf(d.variants[d.active], id); if (!L) return; scaleAbout(L, snap, b0, id, 1 / snap.k!, b0.x + b0.w / 2, b0.y + b0.h / 2); round(L); delete L.k; });
}
export { current };
export const uiSelIds = () => selIds(getUI().sel);
/** Auswahl bereinigen, wenn ausgewählte Textfelder nicht mehr existieren (Rückgängig, andere Grafik der Mappe) */
export function sanitizeSel() {
  const doc = getDoc(), sel = getUI().sel; if (!doc || (sel.kind !== 'node' && sel.kind !== 'multi')) return;
  const ids = selIds(sel), keep = ids.filter(id => isBuiltin(id) || findNode(doc.nodes, id));
  if (keep.length !== ids.length) setUI({ sel: selFor(keep) });
}
