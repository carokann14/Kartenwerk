// Dateien anbieten: auf GitHub Pages per Download-Link, in der Claude-Vorschau über die downloads-Fähigkeit
type Downloads = { save: (r: { filename: string; data: string | Blob }) => Promise<unknown> };
declare global { interface Window { claude?: { use?: (n: string) => Promise<unknown> } } }

let cap: Downloads | null | undefined;
export async function downloadsCap(): Promise<Downloads | null> {
  if (cap !== undefined) return cap;
  try { cap = (window.claude?.use ? ((await window.claude.use('downloads')) as Downloads | null) : null) || null; } catch { cap = null; }
  return cap;
}
export const inClaude = () => !!window.claude?.use;
export async function saveFile(filename: string, data: string | Blob, mime = 'application/octet-stream'): Promise<'saved' | 'declined' | 'failed'> {
  if (inClaude()) {
    const c = await downloadsCap();
    if (!c) return 'failed';
    try { await c.save({ filename, data }); return 'saved'; }
    catch (e) { return (e as { code?: string })?.code === 'declined' ? 'declined' : 'failed'; }
  }
  const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'saved';
}
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
