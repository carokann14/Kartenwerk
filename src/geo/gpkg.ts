// GeoPackage lesen, ohne Bibliothek: minimaler Lesezugriff auf SQLite (Tabellen-B-Bäume, Datensätze, Überlaufseiten)
// und die Geometrie-Spalten (GeoPackage-Kopf + WKB). Schreiben, Indizes und WAL-Dateien werden nicht gebraucht.

type Val = number | string | Uint8Array | null;

class Sqlite {
  u: Uint8Array; dv: DataView; ps: number; U: number; td: TextDecoder;
  constructor(buf: ArrayBuffer) {
    this.u = new Uint8Array(buf); this.dv = new DataView(buf);
    if (String.fromCharCode(...this.u.subarray(0, 15)) !== 'SQLite format 3') throw new Error('Das ist keine GeoPackage-Datei (kein SQLite-Format).');
    const ps = this.dv.getUint16(16, false); this.ps = ps === 1 ? 65536 : ps;
    this.U = this.ps - this.u[20];
    const te = this.dv.getUint32(56, false);
    this.td = new TextDecoder(te === 2 ? 'utf-16le' : te === 3 ? 'utf-16be' : 'utf-8');
  }
  /** Varint (bis 9 Byte) → [Wert, Länge] */
  varint(p: number): [number, number] {
    let v = 0;
    for (let i = 0; i < 8; i++) { const b = this.u[p + i]; v = v * 128 + (b & 0x7f); if (!(b & 0x80)) return [v, i + 1]; }
    return [v * 256 + this.u[p + 8], 9];
  }
  /** Nutzlast einer Blattzelle, auch über Überlaufseiten */
  payload(p: number, P: number): Uint8Array {
    const U = this.U, X = U - 35;
    if (P <= X) return this.u.subarray(p, p + P);
    const M = Math.floor((U - 12) * 32 / 255) - 23, K = M + ((P - M) % (U - 4)), local = K <= X ? K : M;
    const out = new Uint8Array(P); out.set(this.u.subarray(p, p + local));
    let got = local, next = this.dv.getUint32(p + local, false);
    while (got < P && next) {
      const off = (next - 1) * this.ps, n = Math.min(U - 4, P - got);
      out.set(this.u.subarray(off + 4, off + 4 + n), got); got += n; next = this.dv.getUint32(off, false);
    }
    return out;
  }
  record(b: Uint8Array): Val[] {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const vi = (p: number): [number, number] => { let v = 0; for (let i = 0; i < 8; i++) { const x = b[p + i]; v = v * 128 + (x & 0x7f); if (!(x & 0x80)) return [v, i + 1]; } return [v * 256 + b[p + 8], 9]; };
    const [hs, l0] = vi(0); const types: number[] = [];
    for (let p = l0; p < hs;) { const [t, l] = vi(p); types.push(t); p += l; }
    const out: Val[] = []; let p = hs;
    for (const t of types) {
      if (t === 0) out.push(null);
      else if (t >= 1 && t <= 6) {
        const n = [0, 1, 2, 3, 4, 6, 8][t];
        if (n === 8) out.push(Number(dv.getBigInt64(p, false)));
        else { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + b[p + i]; if (b[p] & 0x80) v -= 2 ** (8 * n); out.push(v); }
        p += n;
      } else if (t === 7) { out.push(dv.getFloat64(p, false)); p += 8; }
      else if (t === 8) out.push(0);
      else if (t === 9) out.push(1);
      else if (t >= 12) {
        const n = t % 2 === 0 ? (t - 12) / 2 : (t - 13) / 2, s = b.subarray(p, p + n);
        out.push(t % 2 === 0 ? s.slice() : this.td.decode(s)); p += n;
      } else out.push(null);
    }
    return out;
  }
  /** Alle Zeilen einer Tabelle (B-Baum ab rootpage) */
  *rows(root: number): Generator<{ rowid: number; vals: Val[] }> {
    const stack = [root];
    while (stack.length) {
      const pg = stack.pop()!, off = (pg - 1) * this.ps, h = off + (pg === 1 ? 100 : 0), type = this.u[h], n = this.dv.getUint16(h + 3, false);
      if (type === 0x0d) {
        for (let i = 0; i < n; i++) {
          let p = off + this.dv.getUint16(h + 8 + 2 * i, false);
          const [P, l1] = this.varint(p); p += l1; const [rowid, l2] = this.varint(p); p += l2;
          yield { rowid, vals: this.record(this.payload(p, P)) };
        }
      } else if (type === 0x05) {
        const kids: number[] = [];
        for (let i = 0; i < n; i++) kids.push(this.dv.getUint32(off + this.dv.getUint16(h + 12 + 2 * i, false), false));
        kids.push(this.dv.getUint32(h + 8, false));
        for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);   // in Reihenfolge abarbeiten
      } else throw new Error('Unerwarteter Seitentyp in der GeoPackage-Datei.');
    }
  }
}

/** Spaltennamen aus CREATE TABLE; markiert die Spalte, die die rowid ist (INTEGER PRIMARY KEY) */
function columnsOf(sql: string): { names: string[]; rowidCol: number } {
  const a = sql.indexOf('('), b = sql.lastIndexOf(')');
  const body = sql.slice(a + 1, b), parts: string[] = [];
  let depth = 0, cur = '', q = '';
  for (const c of body) {
    if (q) { cur += c; if (c === q) q = ''; continue; }
    if (c === '"' || c === '`' || c === "'" || c === '[') { q = c === '[' ? ']' : c; cur += c; continue; }
    if (c === '(') depth++; if (c === ')') depth--;
    if (c === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += c;
  }
  if (cur.trim()) parts.push(cur);
  const names: string[] = []; let rowidCol = -1;
  for (const p0 of parts) {
    const p = p0.trim();
    if (/^(CONSTRAINT|PRIMARY\s+KEY|UNIQUE|CHECK|FOREIGN\s+KEY)\b/i.test(p)) continue;
    const m = p.match(/^("([^"]+)"|`([^`]+)`|\[([^\]]+)\]|'([^']+)'|(\S+))\s*(.*)$/s); if (!m) continue;
    const name = m[2] || m[3] || m[4] || m[5] || m[6];
    if (/^INTEGER\s+PRIMARY\s+KEY/i.test(m[7] || '')) rowidCol = names.length;
    names.push(name);
  }
  return { names, rowidCol };
}

export type Polys = number[][][][];   // Polygone → Ringe → Punkte [x, y]
/** WKB → Polygone (Punkte und Linien werden übergangen) */
export function wkbPolys(b: Uint8Array, start = 0): { polys: Polys; other: number } {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = start; const polys: Polys = []; let other = 0;
  const geom = () => {
    const le = b[p] === 1; p += 1;
    let t = dv.getUint32(p, le); p += 4;
    let dims = 2;
    if (t & 0x80000000) dims++; if (t & 0x40000000) dims++;
    if (t & 0x20000000) p += 4;   // EWKB mit SRID
    t &= 0x0fffffff;
    if (t > 3000) { dims = 4; t -= 3000; } else if (t > 2000) { dims = 3; t -= 2000; } else if (t > 1000) { dims = 3; t -= 1000; }
    const u32 = () => { const v = dv.getUint32(p, le); p += 4; return v; };
    const ring = () => { const n = u32(), r: number[][] = []; for (let i = 0; i < n; i++) { r.push([dv.getFloat64(p, le), dv.getFloat64(p + 8, le)]); p += 8 * dims; } return r; };
    if (t === 3) { const n = u32(), rs: number[][][] = []; for (let i = 0; i < n; i++) rs.push(ring()); polys.push(rs); }
    else if (t === 6 || t === 7) { const n = u32(); for (let i = 0; i < n; i++) geom(); }
    else if (t === 1) { p += 8 * dims; other++; }
    else if (t === 2) { const n = u32(); p += n * 8 * dims; other++; }
    else if (t === 4 || t === 5) { const n = u32(); for (let i = 0; i < n; i++) geom(); other++; }
    else throw new Error('Geometrietyp ' + t + ' wird nicht unterstützt.');
  };
  geom();
  return { polys, other };
}
/** GeoPackage-Geometrie: Kopf „GP“ + WKB */
function gpkgGeom(b: Uint8Array): { polys: Polys; other: number } | null {
  if (b[0] !== 0x47 || b[1] !== 0x50) return wkbPolys(b);   // manche Programme schreiben reines WKB
  const flags = b[3], env = (flags >> 1) & 7, empty = (flags >> 4) & 1;
  if (empty) return null;
  const envLen = [0, 32, 48, 48, 64][env] ?? 0;
  return wkbPolys(b, 8 + envLen);
}

export interface GpkgLayer { name: string; fields: string[]; rows: { props: Record<string, Val>; polys: Polys | null; other: number }[]; wkt: string | null; srs: string | null }
export function readGpkg(buf: ArrayBuffer): GpkgLayer[] {
  const db = new Sqlite(buf);
  const master = new Map<string, { root: number; sql: string }>();
  for (const r of db.rows(1)) if (r.vals[0] === 'table') master.set(String(r.vals[1]), { root: Number(r.vals[3]), sql: String(r.vals[4] || '') });
  const table = (name: string) => {
    const t = master.get(name); if (!t) return [];
    const { names, rowidCol } = columnsOf(t.sql);
    const out: Record<string, Val>[] = [];
    for (const r of db.rows(t.root)) { const o: Record<string, Val> = {}; names.forEach((n, i) => { o[n] = i === rowidCol && r.vals[i] == null ? r.rowid : r.vals[i] ?? null; }); out.push(o); }
    return out;
  };
  if (!master.has('gpkg_geometry_columns')) throw new Error('Die GeoPackage-Datei enthält keine Geometrie-Tabellen.');
  const srs = new Map(table('gpkg_spatial_ref_sys').map(r => [Number(r.srs_id), r]));
  const layers: GpkgLayer[] = [];
  for (const gc of table('gpkg_geometry_columns')) {
    const name = String(gc.table_name), col = String(gc.column_name), t = master.get(name); if (!t) continue;
    const s = srs.get(Number(gc.srs_id));
    const { names, rowidCol } = columnsOf(t.sql);
    const fields = names.filter((n, i) => n !== col && i !== rowidCol);
    const rows: GpkgLayer['rows'] = [];
    for (const r of db.rows(t.root)) {
      const props: Record<string, Val> = {}; let polys: Polys | null = null, other = 0;
      names.forEach((n, i) => {
        const v = i === rowidCol && r.vals[i] == null ? r.rowid : r.vals[i] ?? null;
        if (n === col) { if (v instanceof Uint8Array) { const g = gpkgGeom(v); if (g) { polys = g.polys; other = g.other; } } }
        else if (i !== rowidCol) props[n] = v instanceof Uint8Array ? null : v;
      });
      rows.push({ props, polys, other });
    }
    layers.push({ name, fields, rows, wkt: s ? String(s.definition || '') : null, srs: s ? `${s.organization || 'EPSG'}:${s.organization_coordsys_id ?? gc.srs_id}` : null });
  }
  return layers;
}
