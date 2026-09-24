// Lädt statische Dateien. In der Vorschau-Fassung (eine HTML-Datei) liegen sie eingebettet vor.
declare global { interface Window { __KW_ASSETS__?: Record<string, string>; } }

const inline = () => (typeof window !== 'undefined' ? window.__KW_ASSETS__ : undefined);
const b64ToBuf = (b64: string) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };

export async function loadJSON<T = unknown>(path: string): Promise<T> {
  const a = inline()?.[path];
  if (a) return JSON.parse(a) as T;
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} konnte nicht geladen werden (${r.status})`);
  return r.json() as Promise<T>;
}
export async function loadBinary(path: string): Promise<ArrayBuffer> {
  const a = inline()?.[path];
  if (a) return b64ToBuf(a);
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} konnte nicht geladen werden (${r.status})`);
  return r.arrayBuffer();
}
export async function loadText(path: string): Promise<ArrayBuffer> { return loadBinary(path); }
