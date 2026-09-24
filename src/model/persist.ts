// Speichern: Autosave im Browser (IndexedDB) und Projektdateien (.kartenwerk.json)
import type { Doc } from './types';

const DB = 'kartenwerk', STORE = 'projekte';
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction(STORE, mode); const r = fn(t.objectStore(STORE)); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
export interface ProjectMeta { id: string; name: string; modified: string; datasets: number; variants: string[] }
export async function saveLocal(id: string, doc: Doc) {
  const meta: ProjectMeta = { id, name: doc.name, modified: new Date().toISOString(), datasets: doc.datasets.length, variants: doc.variants.map(v => v.preset) };
  await tx('readwrite', s => s.put({ meta, doc }, id));
  try { localStorage.setItem('kartenwerk:last', id); } catch { /* egal */ }
}
export async function listLocal(): Promise<ProjectMeta[]> {
  try {
    const all = await tx<{ meta: ProjectMeta }[]>('readonly', s => s.getAll() as IDBRequest<{ meta: ProjectMeta }[]>);
    return all.map(x => x.meta).sort((a, b) => b.modified.localeCompare(a.modified));
  } catch { return []; }
}
export async function loadLocal(id: string): Promise<Doc | null> {
  try { const r = await tx<{ doc: Doc } | undefined>('readonly', s => s.get(id) as IDBRequest<{ doc: Doc } | undefined>); return r?.doc || null; } catch { return null; }
}
export async function deleteLocal(id: string) { try { await tx('readwrite', s => s.delete(id)); } catch { /* egal */ } }
export const lastLocalId = () => { try { return localStorage.getItem('kartenwerk:last'); } catch { return null; } };

export function serialize(doc: Doc) { return JSON.stringify({ ...doc, savedAt: new Date().toISOString() }); }
export function deserialize(text: string): Doc {
  const d = JSON.parse(text);
  if (d?.app !== 'kartenwerk' || !Array.isArray(d.variants)) throw new Error('Das ist keine Kartenwerk-Projektdatei.');
  delete d.savedAt;
  return d as Doc;
}
