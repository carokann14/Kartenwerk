// Projekte öffnen, speichern, anlegen
import { svgId } from '../lib/util';
import { saveFile } from '../export/save';
import { importExample } from '../data/examples';
import { geoEntry } from '../geo/geo';
import { addDataset, loadGeoSets, newProject, openDoc } from './actions';
import { deleteLocal, deserialize, loadLocal, saveLocal, serialize } from './persist';
import { getDoc, setUI, toast, update } from './store';
import type { Doc } from './types';

export async function saveProjectFile() {
  const d = getDoc();
  const name = (svgId(d.name).toLowerCase() || 'projekt') + '.kartenwerk.json';
  const res = await saveFile(name, serialize(d), 'application/json');
  toast(res === 'saved' ? 'Projektdatei gespeichert: ' + name : res === 'declined' ? 'Speichern abgebrochen' : 'Speichern ist in dieser Ansicht nicht möglich');
  if (res === 'saved') await saveLocal(d.id, d).catch(() => undefined);
}
export async function openProjectFile(file: File) {
  try {
    const d = deserialize(await file.text());
    const missing = [d.geoSet, ...d.datasets.map(x => x.geoSet)].filter(id => !geoEntry(id));
    if (missing.length) throw new Error('Gebietsstand fehlt in dieser Version: ' + [...new Set(missing)].join(', '));
    await openDoc(d);
    toast('Projekt geöffnet: ' + d.name);
  } catch (e) { toast((e as Error).message || 'Die Datei konnte nicht geöffnet werden.'); }
}
export async function openLocalProject(id: string) {
  const d = await loadLocal(id);
  if (!d) { toast('Projekt nicht gefunden'); return; }
  try { await openDoc(d); } catch (e) { toast((e as Error).message); }
}
export async function removeLocalProject(id: string) { await deleteLocal(id); }
export async function startEmpty(geoSet: string) { if (!(await loadGeoSets([geoSet]))) return; newProject(geoSet); setUI({ step: 'daten' }); }
export async function startExample(k = 0) {
  try {
    const ds = await importExample(k);
    if (!(await loadGeoSets([ds.geoSet]))) return;
    newProject(ds.geoSet, 'Beispiel · ' + ds.name);
    addDataset(ds);
    setUI({ step: 'faerbung', sel: { kind: 'graphic' } });
  } catch (e) { toast('Beispiel konnte nicht geladen werden: ' + (e as Error).message); }
}
export function duplicateProject() {
  const d = getDoc();
  const copy: Doc = JSON.parse(JSON.stringify(d));
  copy.id = 'p-' + Math.random().toString(36).slice(2, 9);
  copy.name = d.name + ' (Kopie)';
  void openDoc(copy).then(() => toast('Kopie angelegt'));
}
export function renameProject(name: string) { update(d => { d.name = name; }, { key: 'rename' }); }
