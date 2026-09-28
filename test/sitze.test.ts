// M9 · Sitzverteilung: Sainte-Laguë, Anordnung im Halbkreis, Tabelle mit Sitzen, Koalition, Reihenfolge, Projektion aus
// dem Katalog (Bundestagswahl 2025), Zeichnen (Punkte und Halbring), Vorschläge. Ohne data-src.
import fs from 'node:fs';
const assets: Record<string, string> = {};
for (const f of fs.readdirSync('public/data')) assets['data/' + f] = fs.readFileSync('public/data/' + f, 'utf8');
for (const f of fs.readdirSync('public/katalog')) assets['katalog/' + f] = f.endsWith('.json') ? fs.readFileSync('public/katalog/' + f, 'utf8') : fs.readFileSync('public/katalog/' + f).toString('base64');
(globalThis as unknown as { window: unknown }).window = { __KW_ASSETS__: assets };
const { loadGeo } = await import('../src/geo/geo');
const { sainteLague, seatLayout } = await import('../src/render/seats');
const { chartModel, chartPrims, defaultChart } = await import('../src/render/chart');
const { defaultSource, chartTexts } = await import('../src/render/chartSource');
const { defaultDoc } = await import('../src/model/defaults');
const { suggestFor } = await import('../src/model/suggest');
const { tableDataset } = await import('../src/ui/TableEditor');
const { loadKatalog, importKatalog } = await import('../src/data/katalog');
type Doc = ReturnType<typeof defaultDoc>;
const ok = (c: boolean, m: string) => { console.log((c ? 'ok: ' : 'FEHLER: ') + m); if (!c) process.exitCode = 1; };
await loadGeo();

// ---------- Sainte-Laguë ----------
{
  const r = sainteLague([{ key: 'A', v: 53000 }, { key: 'B', v: 24000 }, { key: 'C', v: 23000 }], 7);
  ok(r.get('A') === 3 && r.get('B') === 2 && r.get('C') === 2, `Lehrbuchbeispiel 7 Sitze: A ${r.get('A')}, B ${r.get('B')}, C ${r.get('C')} (3/2/2)`);
  const z = sainteLague([{ key: 'A', v: 1 }], 0);
  ok(z.get('A') === 0, '0 Sitze bleiben 0');
}
// ---------- Anordnung ----------
for (const n of [1, 3, 7, 20, 100, 138, 630, 736]) {
  const L = seatLayout(n);
  let minD = Infinity;
  for (let i = 0; i < L.seats.length; i++) for (let j = i + 1; j < L.seats.length; j++) minD = Math.min(minD, Math.hypot(L.seats[i].x - L.seats[j].x, L.seats[i].y - L.seats[j].y));
  const sorted = L.seats.every((s, i) => i === 0 || L.seats[i - 1].a >= s.a - 1e-9);
  const inside = L.seats.every(s => Math.hypot(s.x, s.y) <= 1 + 1e-9 && s.y >= -1e-9);
  ok(L.seats.length === n && (n === 1 || minD >= 2 * L.r * 0.999) && sorted && inside, `${n} Sitze: ${L.rows} Reihen, Punktradius ${L.r.toFixed(3)}, kleinster Abstand ${n > 1 ? minD.toFixed(3) : '–'}, nach Winkel sortiert, im Halbkreis`);
}

// ---------- Tabelle mit Sitzen: Bundestag 2025 ----------
const bt = tableDataset('Bundestag 2025: Sitze', ['Partei', 'Sitze'], [['CDU/CSU', '208'], ['AfD', '152'], ['SPD', '120'], ['Grüne', '85'], ['Die Linke', '64'], ['SSW', '1']]);
const doc0 = { ...defaultDoc('vg-krs-2025'), datasets: [bt] } as Doc;
const src = defaultSource(doc0, bt, 'sitze')!;
ok(src.kind === 'sitze' && src.from === 'tabelle' && !src.calc, `Spalte „Sitze“ wird direkt übernommen: ${JSON.stringify(src)}`);
const spec = { ...defaultChart('sitze'), source: src };
{
  const M = chartModel({ ...doc0, chart: spec } as Doc), S = M.seats!;
  ok(S.total === 630 && S.majority === 316, `630 Sitze, Mehrheit ab ${S.majority}`);
  ok(S.groups.map(g => g.label).join(', ') === 'Die Linke, SPD, Grüne, SSW, CDU/CSU, AfD', `politisch links → rechts: ${S.groups.map(g => g.label).join(', ')}`);
  ok(M.bars.length === 6 && M.bars.every(b => b.value > 0), 'Parteien auch als Liste (Farbe und Name je Partei)');
  const tx = chartTexts({ ...doc0, chart: spec } as Doc, spec)!;
  ok(tx.title === 'Sitzverteilung' && /630 Sitze, Mehrheit ab 316/.test(tx.subtitle), `Texte: ${tx.title} · ${tx.subtitle}`);
}
// Koalition
{
  const sp = { ...spec, coalition: ['Union', 'SPD'] };
  const keys = chartModel({ ...doc0, chart: spec } as Doc).seats!.groups.map(g => g.key);
  const union = keys.find(k => /CDU/.test(k))!, spd = keys.find(k => k === 'SPD')!;
  sp.coalition = [union, spd];
  const S = chartModel({ ...doc0, chart: sp } as Doc).seats!;
  ok(!!S.coalition && S.coalition.seats === 328 && S.coalition.reached, `Koalition CDU/CSU + SPD: ${S.coalition?.seats} Sitze, Mehrheit ${S.coalition?.reached ? 'erreicht' : 'verfehlt'}`);
  ok(S.groups[0].key === spd && S.groups[1].key === union, `Koalition steht links: ${S.groups.map(g => g.label).join(', ')}`);
  const tx = chartTexts({ ...doc0, chart: sp } as Doc, sp)!;
  ok(tx.title === 'CDU/CSU und SPD: 328 Sitze', `Titel: ${tx.title}`);
  const sp2 = { ...spec, coalition: [spd, keys.find(k => k === 'Grüne' || /Gr/.test(k))!] };
  const S2 = chartModel({ ...doc0, chart: sp2 } as Doc).seats!, tx2 = chartTexts({ ...doc0, chart: sp2 } as Doc, sp2)!;
  ok(!S2.coalition!.reached && /es fehlen 111/.test(tx2.subtitle), `SPD + Grüne: ${S2.coalition!.seats} Sitze, ${tx2.subtitle}`);
}
// eigene Reihenfolge
{
  const S0 = chartModel({ ...doc0, chart: spec } as Doc).seats!;
  const rev = [...S0.groups.map(g => g.key)].reverse();
  const S = chartModel({ ...doc0, chart: { ...spec, seatOrder: rev } } as Doc).seats!;
  ok(S.groups.map(g => g.key).join() === rev.join(), `eigene Reihenfolge: ${S.groups.map(g => g.label).join(', ')}`);
}
// Zeichnen
{
  const v = { L: { main: { x: 100, y: 200, w: 880, h: 800 } }, ts: 1 } as never;
  const P = chartPrims({ ...doc0, chart: spec } as Doc, v);
  const dots = (P.paths || []).filter(p => p.fill !== 'none').reduce((a, p) => a + (p.d.match(/a/g) || []).length / 2, 0);
  ok(dots === 630, `Punkte: ${dots} Kreise in ${(P.paths || []).filter(p => p.fill !== 'none').length} Pfaden (einer je Partei)`);
  ok(P.texts.some(t => t.text === 'Mehrheit: 316') && P.texts.some(t => t.text === '630'), 'Mehrheitsmarke und Gesamtzahl');
  ok(P.texts.filter(t => /^\d+$/.test(t.text)).length >= 6, 'Sitze je Partei in der Beschriftung');
  const inBox = P.texts.every(t => t.y >= 200 - 1 && t.y <= 1000 + 1) && P.rects.every(r => r.x >= 100 - 1 && r.x + r.w <= 980 + 1);
  ok(inBox, 'alles im Rahmen');
  const PR = chartPrims({ ...doc0, chart: { ...spec, seatStyle: 'ring' } } as Doc, v);
  ok((PR.paths || []).filter(p => p.fill !== 'none').length === 6, 'Halbring: ein Bogen je Partei');
  const PC = chartPrims({ ...doc0, chart: { ...spec, coalition: ['SPD'] } } as Doc, v);
  ok(PC.texts.some(t => t.text === '120') && PC.texts.some(t => /von 630 Sitzen · 196 fehlen/.test(t.text)), 'Mitte zeigt Koalitionssumme und Abstand zur Mehrheit');
}

// ---------- Rechner: Umfrage in Prozent ----------
{
  const um = tableDataset('Umfrage', ['Partei', 'Prozent'], [['CDU/CSU', '27'], ['AfD', '25'], ['SPD', '15'], ['Grüne', '11'], ['Linke', '10'], ['BSW', '4'], ['FDP', '3'], ['Sonstige', '5']]);
  const d = { ...defaultDoc('vg-krs-2025'), datasets: [um] } as Doc;
  const s = defaultSource(d, um, 'sitze')!;
  ok(s.kind === 'sitze' && !!s.calc && s.calc.seats === 630 && s.calc.threshold === 5, `Prozente → Rechner: ${JSON.stringify(s)}`);
  const S = chartModel({ ...d, chart: { ...defaultChart('sitze'), source: s } } as Doc).seats!;
  const by = Object.fromEntries(S.groups.map(g => [g.label, g.seats]));
  ok(S.total === 630 && !by['BSW'] && !by['FDP'] && !by['Sonstige'], `630 Sitze nur für Parteien über 5 %: ${JSON.stringify(by)}`);
  // 27/88 × 630 = 193,3 → Sainte-Laguë ±1
  ok(Math.abs(by['CDU/CSU'] - 630 * 27 / 88) <= 1 && Math.abs(by['Die Linke'] - 630 * 10 / 88) <= 1, 'Sitze verhältnismäßig zu den Anteilen der Parteien über der Hürde');
  ok(S.below.map(b => b.label).join() === 'BSW,FDP', `unter der Hürde vermerkt: ${S.below.map(b => `${b.label} ${b.share}`).join(', ')}`);
  const tx = chartTexts({ ...d, chart: { ...defaultChart('sitze'), source: s } } as Doc, { ...defaultChart('sitze'), source: s })!;
  ok(/Projektion/.test(tx.title) && /Sainte-Laguë, 5-%-Hürde/.test(tx.subtitle), `Texte: ${tx.title} · ${tx.subtitle}`);
}

// ---------- Projektion aus dem Katalog: Bundestagswahl 2025 (Deutschland) ----------
{
  const K = await loadKatalog(), e = K.entries.find(x => x.id === 'bundestagswahlen')!;
  const list = await importKatalog(e, 'lan'), de = list.find(x => !x.geoSet)!;
  const d = { ...defaultDoc(''), datasets: list } as Doc;
  const s = defaultSource(d, de, 'sitze')!;
  ok(s.kind === 'sitze' && s.from === 'wahl' && s.calc?.seats === 630, `Wahlergebnis → Projektion: ${JSON.stringify(s)}`);
  const S = chartModel({ ...d, chart: { ...defaultChart('sitze'), source: s } } as Doc).seats!;
  const by = Object.fromEntries(S.groups.map(g => [g.label, g.seats]));
  const amtlich: Record<string, number> = { 'CDU/CSU': 208, AfD: 152, SPD: 120, 'Grüne': 85, 'Die Linke': 64 };
  const dev = Math.max(...Object.entries(amtlich).map(([k, v]) => Math.abs((by[k] ?? 0) - v)));
  ok(S.total === 630 && dev <= 1, `2025: ${JSON.stringify(by)} – größte Abweichung zu den amtlichen Sitzen ${dev} (amtlich 629 + 1 SSW)`);
  // die Tabelle 14111 führt BSW unter „Sonstige“, deshalb nur die FDP
  ok(S.below.some(b => b.label === 'FDP') && !S.groups.some(g => g.label === 'FDP'), `an der Hürde: ${S.below.map(b => `${b.label} ${b.share.toFixed(2)} %`).join(', ')}`);
  // 2013: FDP und AfD knapp unter 5 %
  const s13 = { ...s, period: de.time!.periods.find(p => p.startsWith('2013'))! };
  const S13 = chartModel({ ...d, chart: { ...defaultChart('sitze'), source: s13 } } as Doc).seats!;
  ok(!S13.groups.some(g => g.label === 'FDP' || g.label === 'AfD') && S13.groups.some(g => g.label === 'CDU/CSU'), `2013 ohne FDP und AfD: ${S13.groups.map(g => `${g.label} ${g.seats}`).join(', ')}`);
  const sug = suggestFor(d, de.id);
  ok(sug.some(x => x.icon === 'sitze'), `Vorschlag Projektion: ${sug.map(x => x.label).join(' | ')}`);
}
// Vorschlag bei Tabelle mit Spalte „Sitze“: zuerst
{
  const sug = suggestFor(doc0, bt.id);
  ok(sug[0]?.icon === 'sitze', `Tabelle mit Sitzen → zuerst Sitzverteilung: ${sug.map(x => x.label).join(' | ')}`);
}
console.log(process.exitCode ? '\nFEHLGESCHLAGEN' : '\nAlle Sitzverteilungs-Tests bestanden.');
