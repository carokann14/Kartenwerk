// Diagramme (M7): Säulen (Parteiergebnis mit Vergleich), Gewinne/Verluste, waagerechte Balken (Gebiete, eigene Tabellen).
// Ergebnis sind Primitive (Texte, Flächen, Pfade) im Hauptrahmen der Variante – Arbeitsfläche und Export zeichnen sie gleich.
import { measureW } from '../lib/fonts';
import { OTHER_GREY, mixWhite } from '../lib/color';
import { GEO } from '../geo/geo';
import { atPeriod, periodText, selectedPeriod } from '../data/time';
import { partyDef, partyOf } from '../data/parties';
import { isRate } from '../data/aggregate';
import type { Cell, Dataset, Group } from '../data/types';
import type { ChartScope, ChartSpec, Doc, Variant } from '../model/types';
import { partyColor, partyLabel, unionLabelOf } from './colorModel';
import type { PathPrim, Prims, RectPrim, TextPrim } from './elements';

export interface Bar { key: string; label: string; value: number; cmp: number | null; color: string; party: string | null; other?: boolean; auto?: string }
/** Punkt einer Linie (M8): ein Zeitpunkt, Wert fehlt = Lücke in der Linie */
export interface LinePoint { period: string; value: number | null }
/** Linie im Diagramm „Linie“ (M8): ein Merkmal (Partei bzw. Zahlenspalte) über alle Zeitpunkte */
export interface LineSeries { key: string; label: string; color: string; party: string | null; points: LinePoint[]; auto?: string }
export interface ChartModel { type: ChartSpec['type']; bars: Bar[]; lines?: LineSeries[]; periods?: string[]; unit: string; curLabel: string; cmpLabel: string; hasCmp: boolean; empty: string | null; dataset: Dataset | null }

export const defaultChart = (type: ChartSpec['type'] = 'saeulen'): ChartSpec => ({ type, source: null, showCmp: true, minShare: 3, decimals: 1, color: '#2F5D8A', keyVisible: true });
const num = (v: Cell) => (typeof v === 'number' && isFinite(v) ? v : null);
const OTHER = /^(sonstige|übrige|andere)/i;
const LINE_HUES = ['#2F5D8A', '#1F7A6D', '#8A5A2F', '#6B4C9A', '#A33B4F', '#3C3F45'];

/** Zeilen eines Datensatzes im gewählten Ausschnitt (alle, ein Land, ein Gebiet) */
function scopeRows(ds: Dataset, scope: ChartScope): number[] {
  const g = GEO[ds.geoSet];
  const idx: number[] = [];
  ds.rowArea.forEach((a, i) => {
    if (!g || scope.kind === 'alle') { idx.push(i); return; }
    if (!a) return;
    if (scope.kind === 'gebiet') { if (a === scope.id) idx.push(i); return; }
    const k = g.byId.get(a); if (k != null && g.areas[k].bl === scope.bl) idx.push(i);
  });
  return idx;
}
const raw = (doc: Doc, id: string) => doc.datasets.find(d => d.id === id) || null;
const inPeriod = (doc: Doc, ds: Dataset, p?: string | null) => (ds.time ? atPeriod(ds, p || selectedPeriod(doc.periodSel, ds)) : ds);
/** Anteile je Partei (Schlüssel) einer Gruppe, summiert über die Zeilen */
function partyShares(ds: Dataset, grp: Group, rows: number[]) {
  const cols = grp.columns.map(id => ds.columns.findIndex(c => c.id === id));
  const ti = grp.total ? ds.columns.findIndex(c => c.id === grp.total) : -1;
  const sums = cols.map(() => 0); let total = 0, hasTotal = ti >= 0;
  for (const r of rows) {
    cols.forEach((ci, k) => { const v = num(ds.rows[r][ci]); if (v != null) sums[k] += v; });
    if (ti >= 0) { const t = num(ds.rows[r][ti]); if (t == null) hasTotal = false; else total += t; }
  }
  if (!hasTotal || total <= 0) total = sums.reduce((a, b) => a + b, 0);
  const out = new Map<string, { share: number; label: string; party: string | null }>();
  cols.forEach((ci, k) => {
    const c = ds.columns[ci]; if (!c || total <= 0) return;
    // „Gültige Zweitstimmen · Sonstige Parteien“ (Regionaldatenbank): Sonstige, gleich wo es im Namen steht
    const oth = !c.party && c.label.split(' · ').some(x => OTHER.test(x.trim()));
    const key = oth ? 'Sonstige' : c.party || c.short || c.label.split(' · ')[0];
    const prev = out.get(key);
    const label = oth ? 'Sonstige' : c.party ? (c.party === 'Union' ? unionLabelOf(ds, grp) : partyLabel(c.party)) : (c.short || c.label.split(' · ')[0]);
    out.set(key, { share: (prev?.share || 0) + 100 * sums[k] / total, label, party: c.party });
  });
  return out;
}
export const scopeLabel = (ds: Dataset, s: ChartScope) => {
  const g = GEO[ds.geoSet];
  if (s.kind === 'land') { const k = GEO['vg-lan-2025'] || GEO['vg-lan-2026']; const i = k?.byId.get(s.bl); return i != null ? k!.areas[i].name : s.bl; }
  if (s.kind === 'gebiet' && g) { const i = g.byId.get(s.id); return i != null ? g.areas[i].name : s.id; }
  return '';
};

/** Wie `chartModelRaw`, hängt aber am Ende von Hand gesetzte Balkenfarben und -namen ein (`ChartSpec.barColors`/`barLabels`,
 *  je Bar-Schlüssel) – ein einziger Punkt statt an jeder der mehreren Rückgaben unten, siehe m4-2r/m7-4. `Bar.auto` trägt
 *  dabei immer den automatisch ermittelten Namen (auch ohne eigene Überschreibung), damit die Bedienung ihn als Platzhalter
 *  zeigen kann, während `Bar.label` (Anzeige/Export) die eigene Fassung übernimmt, sobald eine gesetzt ist. */
export function chartModel(doc: Doc): ChartModel {
  const m = chartModelRaw(doc), bc = doc.chart?.barColors, bl = doc.chart?.barLabels;
  if (m.lines && m.lines.length) {
    const lines = m.lines.map(l => ({ ...l, auto: l.label, color: bc?.[l.key] ?? l.color, label: bl?.[l.key] ?? l.label }));
    const bars: Bar[] = lines.map(l => { const last = [...l.points].reverse().find(p => p.value != null); return { key: l.key, label: l.label, value: last?.value ?? 0, cmp: null, color: l.color, party: l.party, auto: l.auto, other: l.key === 'Sonstige' }; });
    return { ...m, lines, bars };
  }
  if (!m.bars.length) return m;
  return { ...m, bars: m.bars.map(b => ({ ...b, auto: b.label, color: bc?.[b.key] ?? b.color, label: bl?.[b.key] ?? b.label })) };
}
function chartModelRaw(doc: Doc): ChartModel {
  const spec = doc.chart, base: ChartModel = { type: spec?.type || 'saeulen', bars: [], unit: '', curLabel: '', cmpLabel: '', hasCmp: false, empty: null, dataset: null };
  const src = spec?.source;
  if (!spec || !src) return { ...base, empty: 'Daten wählen: Schritt „Diagramm“' };
  const ds0 = raw(doc, src.dataset); if (!ds0) return { ...base, empty: 'Der Datensatz fehlt.' };
  if (src.kind === 'partei') {
    const ds = inPeriod(doc, ds0, src.period), grp = ds.groups.find(g => g.id === src.group) || ds.groups.find(g => g.parties);
    if (!grp) return { ...base, empty: 'Der Datensatz hat keine Parteien.' };
    const rows = scopeRows(ds, src.scope);
    const cur = partyShares(ds, grp, rows);
    let cmp: Map<string, { share: number }> | null = null, cmpLabel = '';
    if (src.cmp) {
      const c0 = raw(doc, src.cmp.dataset);
      if (c0) {
        const cds = inPeriod(doc, c0, src.cmp.period), cg = cds.groups.find(g => g.id === src.cmp!.group);
        if (cg) { cmp = partyShares(cds, cg, scopeRows(cds, src.scope)); cmpLabel = cds.time && src.cmp.period ? String(periodText(src.cmp.period)).slice(-4) : /Vorperiode/.test(cg.label) ? 'Vorwahl' : c0.name; }
      }
    }
    const curLabel = ds.time ? periodText(ds.period || ds.time.periods[ds.time.periods.length - 1]).slice(-4) : cmp ? (ds.name.match(/\b(19|20)\d\d\b/)?.[0] || 'aktuell') : '';
    const minShare = spec.minShare;
    const kept: Bar[] = []; let other = 0, otherCmp = cmp ? 100 : 0;
    for (const [key, v] of cur) {
      const isOther = !v.party && OTHER.test(v.label);
      if (isOther || v.share < minShare) { other += v.share; continue; }
      const c = cmp?.get(key)?.share ?? null;
      if (c != null) otherCmp -= c;
      kept.push({ key, label: v.label, value: v.share, cmp: c, color: v.party ? partyColor(doc, v.party) : doc.categoryColors[v.label] || OTHER_GREY, party: v.party });
    }
    kept.sort((a, b) => b.value - a.value);
    if (other > 0.05) kept.push({ key: 'Sonstige', label: 'Sonstige', value: other, cmp: cmp ? Math.max(0, otherCmp) : null, color: OTHER_GREY, party: null, other: true });
    const hasCmp = !!cmp && kept.some(b => b.cmp != null);
    if (spec.type === 'gewinne') {
      if (!hasCmp) return { ...base, dataset: ds, empty: 'Für Gewinne und Verluste fehlt ein Vergleichswert.' };
      return { ...base, dataset: ds, bars: kept.filter(b => b.cmp != null).map(b => ({ ...b, value: b.value - b.cmp! })), unit: ' Pkt.', curLabel, cmpLabel, hasCmp };
    }
    return { ...base, dataset: ds, bars: kept, unit: ' %', curLabel, cmpLabel, hasCmp };
  }
  if (src.kind === 'gebiete') {
    const ds = inPeriod(doc, ds0, src.period), g = GEO[ds.geoSet];
    const ci = ds.columns.findIndex(c => c.id === src.column); if (ci < 0) return { ...base, empty: 'Die Spalte fehlt.' };
    const col = ds.columns[ci];
    const rows = scopeRows(ds, src.scope).filter(r => num(ds.rows[r][ci]) != null);
    let bars: Bar[] = rows.map(r => { const a = ds.rowArea[r]; const k = a && g ? g.byId.get(a) : undefined; return { key: a || String(r), label: k != null ? g!.areas[k].name : String(ds.rows[r][1] ?? ds.rowKey[r]), value: num(ds.rows[r][ci])!, cmp: null, color: spec.color, party: null }; });
    bars.sort((a, b) => (src.select === 'bottom' ? a.value - b.value : b.value - a.value));
    if (src.select !== 'alle') bars = bars.slice(0, Math.max(1, src.n));
    return { ...base, dataset: ds, bars, unit: /%|prozent/i.test(col.label) ? ' %' : '' };
  }
  if (src.kind === 'linie') {
    const ds = ds0;
    if (!ds.time || ds.time.periods.length < 2) return { ...base, dataset: ds, empty: 'Für eine Linie braucht es einen Datensatz mit mindestens zwei Zeitpunkten.' };
    const periods = ds.time.periods;
    if (src.mode === 'partei') {
      const grp = ds.groups.find(g => g.id === src.group) || ds.groups.find(g => g.parties);
      if (!grp) return { ...base, dataset: ds, empty: 'Der Datensatz hat keine Parteien.' };
      const byPeriod = periods.map(p => { const dsp = atPeriod(ds, p); return partyShares(dsp, grp, scopeRows(dsp, src.scope)); });
      const maxShare = new Map<string, number>(), meta = new Map<string, { label: string; party: string | null }>();
      byPeriod.forEach(shares => { for (const [k, v] of shares) { maxShare.set(k, Math.max(maxShare.get(k) || 0, v.share)); meta.set(k, { label: v.label, party: v.party }); } });
      const minShare = spec.minShare;
      const kept = [...maxShare.keys()].filter(k => (maxShare.get(k) || 0) >= minShare && !OTHER.test(meta.get(k)!.label));
      const rest = [...maxShare.keys()].filter(k => !kept.includes(k));
      const lines: LineSeries[] = kept.map(k => { const mm = meta.get(k)!; return { key: k, label: mm.label, party: mm.party, color: mm.party ? partyColor(doc, mm.party) : doc.categoryColors[mm.label] || OTHER_GREY, points: periods.map((p, i) => ({ period: p, value: byPeriod[i].get(k)?.share ?? null })) }; });
      if (rest.length && rest.some(k => (maxShare.get(k) || 0) > 0.05)) lines.push({ key: 'Sonstige', label: 'Sonstige', party: null, color: OTHER_GREY, points: periods.map((p, i) => ({ period: p, value: rest.reduce((s, k) => s + (byPeriod[i].get(k)?.share ?? 0), 0) })) });
      lines.sort((a, b) => (b.points[b.points.length - 1]?.value ?? 0) - (a.points[a.points.length - 1]?.value ?? 0));
      if (!lines.length) return { ...base, dataset: ds, empty: 'Keine Werte im gewählten Ausschnitt.' };
      return { ...base, dataset: ds, lines, periods, unit: ' %' };
    }
    // mode 'werte': eine oder mehrere Zahlenspalten, je Zeitpunkt über den Ausschnitt summiert bzw. (bei Raten) gemittelt
    const cols = src.columns.map(id => ds.columns.findIndex(c => c.id === id)).filter(i => i >= 0);
    if (!cols.length) return { ...base, dataset: ds, empty: 'Spalte wählen.' };
    const lines: LineSeries[] = cols.map((ci, idx) => {
      const c = ds.columns[ci], rate = isRate(c);
      const points = periods.map(p => {
        const dsp = atPeriod(ds, p), rows = scopeRows(dsp, src.scope);
        let sum = 0, cnt = 0;
        for (const r of rows) { const v = num(dsp.rows[r][ci]); if (v != null) { sum += v; cnt++; } }
        return { period: p, value: cnt ? (rate ? sum / cnt : sum) : null };
      });
      return { key: c.id, label: c.label, party: null, color: cols.length > 1 ? LINE_HUES[idx % LINE_HUES.length] : spec.color, points };
    });
    const pct = cols.some(ci => isRate(ds.columns[ci]) || /%|prozent|anteil/i.test(ds.columns[ci].label));
    return { ...base, dataset: ds, lines, periods, unit: pct ? ' %' : '' };
  }
  // eigene Tabelle: Zeilen = Kategorien
  const ds = ds0, ci = ds.columns.findIndex(c => c.id === src.column), ki = src.cmp ? ds.columns.findIndex(c => c.id === src.cmp) : -1;
  if (ci < 0) return { ...base, empty: 'Die Spalte fehlt.' };
  const nameCol = Math.max(0, ds.columns.findIndex(c => c.role === 'name'));
  let bars: Bar[] = ds.rows.map((r, i) => {
    const label = String(r[nameCol] ?? '').trim(), p = partyOf(label), v = num(r[ci]), c = ki >= 0 ? num(r[ki]) : null;
    return { key: label || String(i), label: p ? (partyDef(p.key)?.label || label) : label, value: v ?? NaN, cmp: c, color: p ? partyColor(doc, p.key) : OTHER.test(label) ? OTHER_GREY : spec.color, party: p?.key || null, other: OTHER.test(label) };
  }).filter(b => isFinite(b.value));
  const orderByValue = (a: Bar, b: Bar) => (+!!a.other - +!!b.other) || b.value - a.value;
  if (spec.type === 'gewinne') {
    if (ki < 0) return { ...base, dataset: ds, empty: 'Für Gewinne und Verluste eine Vergleichsspalte wählen.' };
    bars = bars.filter(b => b.cmp != null).sort(orderByValue).map(b => ({ ...b, value: b.value - b.cmp! }));
  } else bars.sort(orderByValue);
  const lab = (id: string | null) => ds.columns.find(c => c.id === id)?.label || '';
  const pct = /%|prozent|anteil/i.test(lab(src.column)) || bars.some(b => b.party);
  return { ...base, dataset: ds, bars, unit: spec.type === 'gewinne' ? (pct ? ' Pkt.' : '') : pct ? ' %' : '', curLabel: lab(src.column), cmpLabel: lab(src.cmp), hasCmp: ki >= 0 };
}

// ---------- Zeichnen ----------
const fmt = (v: number, dec: number, sign = false) => (sign && v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
/** Säule mit leicht gerundeter Oberkante (bzw. Unterkante bei negativen Werten) */
function barD(x: number, y0: number, w: number, y1: number): string {
  const up = y1 < y0, h = Math.abs(y0 - y1), r = Math.min(3, w / 4, h / 2);
  if (h < 0.5) return '';
  const f = (n: number) => +n.toFixed(1);
  if (up) return `M${f(x)} ${f(y0)}V${f(y1 + r)}Q${f(x)} ${f(y1)} ${f(x + r)} ${f(y1)}H${f(x + w - r)}Q${f(x + w)} ${f(y1)} ${f(x + w)} ${f(y1 + r)}V${f(y0)}Z`;
  return `M${f(x)} ${f(y0)}V${f(y1 - r)}Q${f(x)} ${f(y1)} ${f(x + r)} ${f(y1)}H${f(x + w - r)}Q${f(x + w)} ${f(y1)} ${f(x + w)} ${f(y1 - r)}V${f(y0)}Z`;
}
function hBarD(x0: number, y: number, x1: number, h: number): string {
  const w = Math.abs(x1 - x0), r = Math.min(3, h / 4, w / 2); if (w < 0.5) return '';
  const f = (n: number) => +n.toFixed(1);
  return `M${f(x0)} ${f(y)}H${f(x1 - r)}Q${f(x1)} ${f(y)} ${f(x1)} ${f(y + r)}V${f(y + h - r)}Q${f(x1)} ${f(y + h)} ${f(x1 - r)} ${f(y + h)}H${f(x0)}Z`;
}
export function chartPrims(doc: Doc, v: Variant): Prims {
  const M = chartModel(doc), spec = doc.chart!, F = v.L.main, ts = v.ts;
  const ink = doc.style.ink, soft = doc.style.inkSoft;
  const texts: TextPrim[] = [], rects: RectPrim[] = [], paths: PathPrim[] = [];
  const box = { x: F.x, y: F.y, w: F.w, h: F.h };
  if (M.empty || !M.bars.length) {
    texts.push({ x: F.x + F.w / 2, y: F.y + F.h / 2, text: M.empty || 'Keine Werte im gewählten Ausschnitt', cut: 'text', size: Math.round(22 * ts), color: soft, anchor: 'middle' });
    rects.push({ x: F.x, y: F.y, w: F.w, h: F.h, fill: '#F5F3EF' });
    return { texts, rects, paths, box };
  }
  const dec = spec.decimals, n = M.bars.length;
  const valSize = Math.round((spec.valueSize ?? 28) * ts), nameSize = Math.round(24 * ts), smallSize = Math.round(18 * ts);
  const gapMul = Math.min(1.3, Math.max(0.15, 1 - (spec.gap ?? 0)));
  // Zeichenerklärung (etwa „2025 · 2021“), nur bei Vergleich
  let top = F.y;
  const showCmp = M.type === 'saeulen' && spec.showCmp && M.hasCmp;
  if (spec.keyVisible && showCmp && M.curLabel && M.cmpLabel) {
    const s = Math.round(20 * ts), sq = Math.round(s * 0.8);
    let x = F.x;
    for (const [lab, col] of [[M.curLabel, '#5A5F66'], [M.cmpLabel, mixWhite('#5A5F66', 0.6)]] as const) {
      rects.push({ x, y: top + (s - sq) / 2 + 2, w: sq, h: sq, fill: col });
      texts.push({ x: x + sq + 6, y: top + s * 0.85, text: lab, cut: 'text', size: s, color: soft, anchor: 'start' });
      x += sq + 6 + measureW(lab, 'text', s) + 22;
    }
    top += s + Math.round(18 * ts);
  }
  if (M.type === 'balken') {
    // waagerecht: Namen links, Balken, Wert am Ende; helle Hilfslinien
    const nameW = Math.min(F.w * 0.42, Math.max(...M.bars.map(b => measureW(b.label, 'text', nameSize))) + 12);
    const x0 = F.x + nameW, valW = Math.max(...M.bars.map(b => measureW(fmt(b.value, dec) + M.unit, 'bold', valSize))) + 10;
    const width = F.w - nameW - valW, tickH = Math.round((spec.axisGap ?? 20) * ts), axisSize = Math.round((spec.axisSize ?? 16) * ts);
    const rowH = Math.min((F.y + F.h - top - tickH) / n, 96 * ts), bh = Math.min(rowH * 0.62, 52 * ts) * gapMul;
    const max = Math.max(...M.bars.map(b => b.value), 0), min = Math.min(...M.bars.map(b => b.value), 0), span = max - min || 1;
    const X = (val: number) => x0 + (val - min) / span * width;
    // Hilfslinien mit runden Schritten
    const step = niceStep(span / 4), gridOn = spec.gridOn !== false;
    for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) {
      const x = X(t);
      if (gridOn) paths.push({ d: `M${x.toFixed(1)} ${top.toFixed(1)}V${(top + rowH * n).toFixed(1)}`, fill: 'none', stroke: t === 0 ? '#9A968E' : '#E4E0D8', width: t === 0 ? 1.2 : 1 });
      texts.push({ x, y: top + rowH * n + tickH * 0.9, text: fmt(t, step < 1 ? 1 : 0), cut: 'text', size: axisSize, color: soft, anchor: 'middle' });
    }
    M.bars.forEach((b, k) => {
      const y = top + k * rowH + (rowH - bh) / 2, cy = y + bh / 2;
      texts.push({ x: F.x + nameW - 12, y: cy + nameSize * 0.34, text: fit(b.label, nameW - 14, nameSize), cut: 'text', size: nameSize, color: ink, anchor: 'end' });
      const d = b.value >= 0 ? hBarD(X(0), y, X(b.value), bh) : hBarD(X(0), y, X(b.value), bh);
      if (d) paths.push({ d, fill: b.color });
      texts.push({ x: X(Math.max(0, b.value)) + 8, y: cy + valSize * 0.34, text: fmt(b.value, dec) + M.unit, cut: 'bold', size: valSize, color: ink, anchor: 'start' });
    });
    return { texts, rects, paths, box };
  }
  if (M.type === 'linie') {
    const lines = M.lines || [], periods = M.periods || [];
    const axisSize = Math.round((spec.axisSize ?? 16) * ts), labSize = Math.round((spec.valueSize ?? 24) * ts);
    const gridOn = spec.gridOn !== false, ptsOn = spec.pointsOn !== false;
    const endLabel = (l: (typeof lines)[number]) => { const last = [...l.points].reverse().find(p => p.value != null); return last ? `${l.label} ${fmt(last.value!, dec)}${M.unit}` : l.label; };
    const endW = Math.max(0, ...lines.map(l => measureW(endLabel(l), 'bold', labSize)));
    const allVals = lines.flatMap(l => l.points.map(p => p.value)).filter((x): x is number => x != null);
    const maxV = Math.max(0, ...allVals), minV = Math.min(0, ...allVals);
    const step = niceStep((maxV - minV) / 4 || 1);
    const niceMax = Math.ceil(maxV / step) * step, niceMin = Math.floor(minV / step) * step;
    const yLabW = Math.max(measureW(fmt(niceMin, step < 1 ? 1 : 0), 'text', axisSize), measureW(fmt(niceMax, step < 1 ? 1 : 0), 'text', axisSize));
    const plotLeft = F.x + yLabW + 10, plotRight = F.x + F.w - endW - 16, plotTop = top + 6, plotBottom = F.y + F.h - axisSize * 1.9;
    const span = (niceMax - niceMin) || 1;
    const X = (i: number) => plotLeft + (periods.length > 1 ? i / (periods.length - 1) : 0.5) * (plotRight - plotLeft);
    const Y = (val: number) => plotBottom - (val - niceMin) / span * (plotBottom - plotTop);
    for (let t = niceMin; t <= niceMax + 1e-9; t += step) {
      const y = Y(t);
      if (gridOn) paths.push({ d: `M${plotLeft.toFixed(1)} ${y.toFixed(1)}H${plotRight.toFixed(1)}`, fill: 'none', stroke: Math.abs(t) < 1e-9 ? '#9A968E' : '#E4E0D8', width: Math.abs(t) < 1e-9 ? 1.2 : 1 });
      texts.push({ x: plotLeft - 8, y: y + axisSize * 0.32, text: fmt(t, step < 1 ? 1 : 0), cut: 'text', size: axisSize, color: soft, anchor: 'end' });
    }
    periods.forEach((p, i) => texts.push({ x: X(i), y: plotBottom + axisSize * 1.4, text: (periodText(p).match(/\d{4}/) || [periodText(p)])[0], cut: 'text', size: axisSize, color: soft, anchor: 'middle' }));
    for (const l of lines) {
      const pts = l.points.map((p, i) => (p.value != null ? [X(i), Y(p.value)] as const : null));
      let d = '';
      pts.forEach((pt, i) => { if (!pt) return; d += (d && pts[i - 1] ? 'L' : 'M') + pt[0].toFixed(1) + ' ' + pt[1].toFixed(1) + ' '; });
      if (d) paths.push({ d: d.trim(), fill: 'none', stroke: l.color, width: 2.6, cap: 'round' });
      if (ptsOn) pts.forEach(pt => { if (pt) paths.push({ d: `M${(pt[0] - 3.2).toFixed(1)} ${pt[1].toFixed(1)}a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0`, fill: l.color }); });
      const lastPt = [...pts].reverse().find((p): p is readonly [number, number] => !!p);
      if (lastPt) texts.push({ x: lastPt[0] + 8, y: lastPt[1] + labSize * 0.34, text: endLabel(l), cut: 'bold', size: labSize, color: l.color, anchor: 'start' });
    }
    return { texts, rects, paths, box };
  }
  // Säulen bzw. Gewinne/Verluste
  const nameH = Math.round(nameSize * 1.6), valH = Math.round(valSize * 1.5);
  const groupW = F.w / n;
  const bw = (showCmp ? Math.min(groupW * 0.5, 110 * ts) : Math.min(groupW * 0.64, 140 * ts)) * gapMul, cw = showCmp ? Math.max(4, bw * 0.42) : 0, gap = showCmp ? 3 : 0;
  const pos = Math.max(0, ...M.bars.map(b => Math.max(b.value, showCmp ? b.cmp ?? 0 : 0)));
  const neg = Math.max(0, ...M.bars.map(b => -Math.min(b.value, 0)));
  const plotTop = top + valH + (showCmp ? Math.round(smallSize * 1.1) : 0), plotBot = F.y + F.h - nameH - (neg > 0 ? valH : 0);
  const scale = (plotBot - plotTop) / ((pos + neg) || 1), y0 = plotTop + pos * scale;
  // Wertbeschriftung: passt sie nicht über die Säulengruppe, wird sie kleiner
  const labOf = (b: Bar) => fmt(b.value, dec, M.type === 'gewinne') + (M.type === 'gewinne' ? '' : M.unit);
  const widest = Math.max(...M.bars.map(b => measureW(labOf(b), 'bold', valSize)));
  const vSize = widest > groupW * 0.94 ? Math.max(Math.round(12 * ts), Math.floor(valSize * groupW * 0.94 / widest)) : valSize;
  M.bars.forEach((b, k) => {
    const gx = F.x + k * groupW + (groupW - bw - gap - cw) / 2;
    const y1 = y0 - b.value * scale;
    const d = barD(gx, y0, bw, y1); if (d) paths.push({ d, fill: b.color });
    const lab = labOf(b), lw = measureW(lab, 'bold', vSize);
    let ly = b.value >= 0 ? y1 - vSize * 0.35 : y1 + vSize * 1.05;
    if (showCmp && b.cmp != null) {
      const cx = gx + bw + gap, cy1 = y0 - b.cmp * scale;
      const dc = barD(cx, y0, cw, cy1); if (dc) paths.push({ d: dc, fill: mixWhite(b.color, 0.6) });
      const ct = fmt(b.cmp, dec), cwid = measureW(ct, 'text', smallSize), cly = cy1 - smallSize * 0.4;
      texts.push({ x: cx + cw / 2, y: cly, text: ct, cut: 'text', size: smallSize, color: soft, anchor: 'middle' });
      // überdeckt der Hauptwert die Vergleichszahl, rückt er über sie
      const overlapX = gx + bw / 2 + lw / 2 > cx + cw / 2 - cwid / 2 - 4;
      if (b.value >= 0 && overlapX && ly > cly - smallSize - 2) ly = Math.min(ly, cly - smallSize * 1.05);
    }
    texts.push({ x: gx + bw / 2, y: ly, text: lab, cut: 'bold', size: vSize, color: ink, anchor: 'middle' });
    texts.push({ x: F.x + k * groupW + groupW / 2, y: F.y + F.h - nameH + nameSize * 1.05, text: fit(b.label, groupW - 6, nameSize), cut: 'text', size: nameSize, color: ink, anchor: 'middle' });
  });
  paths.push({ d: `M${F.x.toFixed(1)} ${y0.toFixed(1)}H${(F.x + F.w).toFixed(1)}`, fill: 'none', stroke: ink, width: 1.4 });
  return { texts, rects, paths, box };
}
function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1))), m = raw / p;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
}
/** Text kürzen, bis er passt */
function fit(text: string, w: number, size: number) {
  if (measureW(text, 'text', size) <= w) return text;
  let t = text; while (t.length > 3 && measureW(t + '…', 'text', size) > w) t = t.slice(0, -1);
  return t + '…';
}
