// Elementbaum einer Grafik (M11 · Etappe 1): Reihenfolge und Zusammensetzung der Objekte.
// Die Objekte haben in dieser Etappe feste Kennungen; Inhalt und Lage stehen in den bisherigen Feldern.
import type { Box, Doc, GNode, GraphicKind, Variant } from './types';

export const NODE_IDS = ['main', 'inset', 'legend', 'title', 'subtitle', 'source', 'logo', 'ann'] as const;
export type BuiltinId = typeof NODE_IDS[number];

export const NODE_NAMES: Record<string, string> = { main: 'Karte', inset: 'Lupe', legend: 'Legende', title: 'Titel', subtitle: 'Unterzeile', source: 'Quelle', logo: 'Logo', ann: 'Marker, Textkästen und Pfeile' };
export const nodeName = (n: GNode, kind: GraphicKind = 'map') => n.name || (n.id === 'main' && kind === 'chart' ? 'Diagramm' : NODE_NAMES[n.id] || (n.type === 'text' ? 'Textfeld' : 'Objekt'));

/** Feste Objekte einer neuen Grafik, hinten → vorn (wie der bisherige SVG-Export: Karte, Lupe, Legende, Texte, Logo, Marker) */
export function defaultNodes(kind: GraphicKind): GNode[] {
  const content: GNode[] = kind === 'chart' ? [{ id: 'main', type: 'chart' }] : [{ id: 'main', type: 'map' }, { id: 'inset', type: 'map' }];
  return [
    ...content,
    { id: 'legend', type: 'legend' },
    { id: 'title', type: 'text' }, { id: 'subtitle', type: 'text' }, { id: 'source', type: 'text' },
    { id: 'logo', type: 'logo' },
    { id: 'ann', type: 'annotations' },
  ];
}
const TYPE_OF = (kind: GraphicKind): Record<BuiltinId, GNode['type'] | null> => ({ main: kind === 'chart' ? 'chart' : 'map', inset: kind === 'chart' ? null : 'map', legend: 'legend', title: 'text', subtitle: 'text', source: 'text', logo: 'logo', ann: 'annotations' });

/** Alle Objekte in Zeichenreihenfolge (Gruppen aufgelöst) */
export function flatNodes(nodes: GNode[] | undefined): GNode[] {
  const out: GNode[] = [];
  const rec = (list: GNode[]) => { for (const n of list) { if (n.type === 'group') rec(n.children || []); else out.push(n); } };
  rec(nodes || []);
  return out;
}
/** Baum prüfen und ergänzen: jedes feste Objekt genau einmal und mit passender Art, unbekannte, doppelte und leere Gruppen entfernen,
 *  fehlende an der Stelle einfügen, an der sie in der Vorgabe stünden. Ein fehlerfreier Baum bleibt dasselbe Objekt. */
export function ensureNodes(nodes: GNode[] | undefined, kind: GraphicKind): GNode[] {
  const want = TYPE_OF(kind);
  const seen = new Set<string>();
  const clean = (list: GNode[]): GNode[] => {
    const out: GNode[] = [];
    for (const n of list) {
      if (!n || typeof n.id !== 'string') continue;
      if (n.type === 'group') { const ch = clean(n.children || []); if (ch.length) out.push({ ...n, children: ch }); continue; }
      if (seen.has(n.id)) continue;
      const t = want[n.id as BuiltinId];
      if (t === undefined) {   // freies Objekt: Textfeld mit eigenem Text (ab Etappe 2)
        if (n.type === 'text' && n.text && typeof n.text.text === 'string') { seen.add(n.id); out.push(n); }
        continue;
      }
      if (!t) continue;   // keine Lupe im Diagramm
      seen.add(n.id);
      out.push(n.type === t ? n : { ...n, type: t });
    }
    return out;
  };
  let res = clean(Array.isArray(nodes) ? nodes : []);
  const def = defaultNodes(kind);
  def.forEach((n, i) => {
    if (seen.has(n.id)) return;
    // hinter dem Vorgänger aus der Vorgabe einfügen (in der Wurzel), sonst vor dem nächsten vorhandenen festen Objekt
    const has = (x: GNode, idList: string[]) => flatNodes([x]).some(y => idList.includes(y.id));
    const before = def.slice(0, i).map(x => x.id), after = def.slice(i + 1).map(x => x.id);
    let at = -1;
    for (let k = res.length - 1; k >= 0; k--) if (has(res[k], before)) { at = k + 1; break; }
    if (at < 0) { at = res.findIndex(x => has(x, after)); if (at < 0) at = res.length; }
    res = [...res.slice(0, at), n, ...res.slice(at)];
    seen.add(n.id);
  });
  return Array.isArray(nodes) && JSON.stringify(res) === JSON.stringify(nodes) ? nodes : res;
}
export const isBuiltin = (id: string): id is BuiltinId => (NODE_IDS as readonly string[]).includes(id);
/** freie Objekte (Textfelder) einer Grafik in Zeichenreihenfolge */
export const freeNodes = (nodes: GNode[] | undefined) => flatNodes(nodes).filter(n => !isBuiltin(n.id));
export const findNode = (nodes: GNode[] | undefined, id: string) => flatNodes(nodes).find(n => n.id === id) || null;
export const graphicKind = (d: Pick<Doc, 'graphics' | 'page'>): GraphicKind => d.graphics?.[d.page]?.kind || 'map';

/** Lage für alle Varianten aus einer Lage in der Variante `from` (proportional zur Größe der Fläche) */
export function boxForAll(doc: Pick<Doc, 'variants'>, from: Variant, b: Box): Record<string, Box> {
  const out: Record<string, Box> = {};
  for (const v of doc.variants) {
    if (v.id === from.id) { out[v.id] = { ...b }; continue; }
    const sx = v.w / from.w, sy = v.h / from.h, s = Math.min(sx, sy);
    out[v.id] = { x: Math.round(b.x * sx), y: Math.round(b.y * sy), w: Math.round(b.w * s), ...(b.r ? { r: b.r } : {}), k: +(((b.k ?? 1) * s * (from.ts / v.ts)) || 1).toFixed(3) };
  }
  return out;
}
/** Lage freier Textfelder in einer neuen oder neu angeordneten Variante übernehmen (aus der aktiven Variante abgeleitet) */
export function carryNodeLayouts(doc: Pick<Doc, 'nodes' | 'variants'> & { active?: number }, target: Variant) {
  const free = freeNodes(doc.nodes); if (!free.length) return;
  const act = doc.variants[doc.active ?? -1];
  const src = (act && act.id !== target.id && act.L.nodes ? act : null) || doc.variants.find(v => v.id !== target.id && free.some(n => v.L.nodes?.[n.id])) || null;
  target.L.nodes ||= {};
  for (const n of free) {
    if (target.L.nodes[n.id]) continue;
    const from = src && src.L.nodes?.[n.id] ? src : doc.variants.find(v => v.id !== target.id && v.L.nodes?.[n.id]);
    if (!from) { const w = Math.round(target.w * 0.6); target.L.nodes[n.id] = { x: Math.round((target.w - w) / 2), y: Math.round(target.h * 0.45), w }; continue; }   // ohne Lage: mittig
    target.L.nodes[n.id] = boxForAll({ variants: [from, target] }, from, from.L.nodes![n.id])[target.id];
  }
}
