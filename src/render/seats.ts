// Sitzverteilung (M9): Rechner (Sainte-Laguë), politische Reihenfolge und Anordnung der Sitze im Halbkreis.
// Reine Funktionen ohne Zustand – genutzt von chart.ts (Modell und Zeichnen) und den Tests.

/** Sitze nach Sainte-Laguë/Schepers (Höchstzahlverfahren mit Divisoren 1, 3, 5 …); Gleichstand: mehr Stimmen zuerst.
 *  Nur die übergebenen Parteien (Hürde vorher anwenden). */
export function sainteLague(votes: { key: string; v: number }[], seats: number): Map<string, number> {
  const out = new Map(votes.map(p => [p.key, 0]));
  const list = votes.filter(p => p.v > 0);
  for (let s = 0; s < seats && list.length; s++) {
    let best = list[0], bq = -1;
    for (const p of list) {
      const q = p.v / (2 * out.get(p.key)! + 1);
      if (q > bq + 1e-12 || (Math.abs(q - bq) <= 1e-12 && p.v > best.v)) { bq = q; best = p; }
    }
    out.set(best.key, out.get(best.key)! + 1);
  }
  return out;
}

/** Sitzordnung von links nach rechts (Parteischlüssel aus data/parties.ts); Unbekannte stehen in der Mitte, „Sonstige“ ganz rechts */
export const POLITICAL_ORDER = ['LINKE', 'BSW', 'SPD', 'GRÜNE', 'SSW', 'Volt', 'PARTEI', 'Tierschutz', '*', 'FDP', 'FW', 'Union', 'AfD', 'Sonstige'];
export function politicalRank(party: string | null, key: string): number {
  const i = POLITICAL_ORDER.indexOf(party || key);
  return i >= 0 ? i : POLITICAL_ORDER.indexOf('*');
}

/** Sitze im Halbkreis: Mittelpunkt (0, 0), äußerer Radius 1, y nach oben. Reihen so gewählt, dass die Punkte dicht, aber ohne
 *  Überlappung liegen; Sitze je Reihe im Verhältnis zum Radius. Ergebnis nach Winkel sortiert (links zuerst), damit
 *  aufeinanderfolgende Sitze einer Partei einen Keil bilden. `r` = Punktradius (Anteil am äußeren Radius). */
export function seatLayout(n: number, inner = 0.4): { seats: { x: number; y: number; a: number; row: number }[]; r: number; rows: number } {
  if (n <= 0) return { seats: [], r: 0, rows: 0 };
  const spacing = (R: number) => (1 - inner) / Math.max(1, R - 1);
  const radius = (R: number, i: number) => 1 - (R - 1 - i) * spacing(R);
  const cap = (R: number) => { let c = 0; for (let i = 0; i < R; i++) c += Math.floor(Math.PI * radius(R, i) / spacing(R)) + 1; return c; };
  let R = 1;
  while (cap(R) < n && R < 60) R++;
  const d = spacing(R), radii = Array.from({ length: R }, (_, i) => radius(R, i));
  // Sitze je Reihe: verhältnismäßig zum Radius, größte Reste, höchstens die Kapazität der Reihe
  const sumR = radii.reduce((a, b) => a + b, 0);
  const capI = radii.map(r => Math.floor(Math.PI * r / d) + 1);
  const raw = radii.map(r => n * r / sumR), per = raw.map((x, i) => Math.min(capI[i], Math.floor(x)));
  let rest = n - per.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => ({ i, f: x - Math.floor(x) })).sort((a, b) => b.f - a.f || b.i - a.i);
  while (rest > 0) { let moved = false; for (const { i } of order) { if (rest > 0 && per[i] < capI[i]) { per[i]++; rest--; moved = true; } } if (!moved) break; }
  const seats: { x: number; y: number; a: number; row: number }[] = [];
  radii.forEach((r, i) => {
    const k = per[i];
    for (let j = 0; j < k; j++) {
      const a = k === 1 ? Math.PI / 2 : Math.PI - j * Math.PI / (k - 1);
      seats.push({ x: r * Math.cos(a), y: r * Math.sin(a), a, row: i });
    }
  });
  seats.sort((p, q) => q.a - p.a || p.row - q.row);
  // Punktradius: knapp unter dem halben Abstand (Reihen bzw. Nachbarn in der engsten Reihe)
  let minArc = Infinity;
  radii.forEach((r, i) => { if (per[i] > 1) minArc = Math.min(minArc, Math.PI * r / (per[i] - 1)); });
  const r = 0.42 * Math.min(R > 1 ? d : 1 - inner, minArc);
  return { seats, r, rows: R };
}
