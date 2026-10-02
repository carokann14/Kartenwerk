// Platzierung schwebender Elemente (Farbwähler) im Fenster – ohne DOM, damit testbar.

/** Platz für den Farbwähler im Fenster suchen: bevorzugt unter dem Farbfeld (linksbündig), sonst darüber; waagerecht so
 *  verschoben, dass er ganz im Fenster bleibt. Gibt die linke obere Ecke in Fensterkoordinaten zurück. */
export function placePopover(anchor: { left: number; right: number; top: number; bottom: number }, pw: number, ph: number, vw: number, vh: number, gap = 4, margin = 8): { left: number; top: number } {
  // waagerecht: linksbündig am Feld; ragt es rechts hinaus, rechtsbündig; zuletzt ins Fenster schieben
  let left = anchor.left;
  if (left + pw > vw - margin) left = anchor.right - pw;
  left = Math.max(margin, Math.min(left, vw - margin - pw));
  // senkrecht: darunter, wenn es passt; sonst darüber; sonst dort, wo mehr Platz ist, und ins Fenster geschoben
  const below = anchor.bottom + gap, above = anchor.top - gap - ph;
  let top: number;
  if (below + ph <= vh - margin) top = below;
  else if (above >= margin) top = above;
  else top = vh - anchor.bottom > anchor.top ? below : above;
  top = Math.max(margin, Math.min(top, vh - margin - ph));
  return { left: Math.round(left), top: Math.round(top) };
}
