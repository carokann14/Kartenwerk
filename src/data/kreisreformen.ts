// Frühere Kreise seit 1995 → heutige Kreise (Gebietsstand 2021 ff.). Die Regionaldatenbank führt ältere Jahre unter den
// damaligen Schlüsseln. Zusammenlegungen (Gewicht 1) werden addiert; geteilte Kreise werden nach Einwohneranteilen auf die
// neuen Kreise verteilt und gelten als geschätzt.
// Quellen: Wikipedia (Kreisreformen MV 2011, SN 2008, ST 2007), Gebietsänderungen der Statistischen Ämter.
// Viele Tabellen rechnen ältere Jahre schon auf die heutigen Kreise um (etwa Bautzen, Region Hannover ab 1994). Deshalb gilt:
// Hat der heutige Kreis in einem Jahr einen eigenen Wert, wird nichts dazugerechnet – außer der Nachfolger führt den alten
// Schlüssel fort und wurde nur vergrößert (add: Eisenach → Wartburgkreis).
// Gewichte geteilter Kreise aus den Wahlberechtigten der Regionaldatenbank (Tabelle 14111-01-04-4): Sachsen-Anhalt im selben Jahr
// (2005 liegen alte und neue Kreise vor: Rest des Nachfolgers nach Abzug der vollständigen Vorgänger), Demmin aus 2009 → 2013
// (Nachfolger 2013 bereinigt um die Entwicklung im Land).

export interface KreisAlt { to: [string, number][]; bis: string; name: string; add?: boolean }

const K = (name: string, bis: string, ...to: [string, number][]): KreisAlt => ({ name, bis, to });
const one = (name: string, bis: string, id: string) => K(name, bis, [id, 1]);

export const KREIS_ALT: Record<string, KreisAlt> = {
  // Niedersachsen
  '03201': one('Hannover, Landeshauptstadt', '2001-11-01', '03241'),
  '03253': one('Hannover, Landkreis', '2001-11-01', '03241'),
  '03152': one('Göttingen, Landkreis', '2016-11-01', '03159'),
  '03156': one('Osterode am Harz, Landkreis', '2016-11-01', '03159'),
  // Nordrhein-Westfalen
  '05313': one('Aachen, kreisfreie Stadt', '2009-10-21', '05334'),
  '05334002': one('Aachen, kreisfreie Stadt (in der Tabelle als Gemeinde geführt)', '2009-10-21', '05334'),
  '05354': one('Aachen, Kreis', '2009-10-21', '05334'),
  // Mecklenburg-Vorpommern (4.9.2011)
  '13001': one('Greifswald, kreisfreie Stadt', '2011-09-04', '13075'),
  '13002': one('Neubrandenburg, kreisfreie Stadt', '2011-09-04', '13071'),
  '13005': one('Stralsund, kreisfreie Stadt', '2011-09-04', '13073'),
  '13006': one('Wismar, kreisfreie Stadt', '2011-09-04', '13074'),
  '13051': one('Bad Doberan', '2011-09-04', '13072'),
  '13052': K('Demmin', '2011-09-04', ['13071', 0.844], ['13075', 0.156]),   // Ämter Jarmen-Tutow, Peenetal/Loitz → Vorpommern-Greifswald
  '13053': one('Güstrow', '2011-09-04', '13072'),
  '13054': one('Ludwigslust', '2011-09-04', '13076'),
  '13055': one('Mecklenburg-Strelitz', '2011-09-04', '13071'),
  '13056': one('Müritz', '2011-09-04', '13071'),
  '13057': one('Nordvorpommern', '2011-09-04', '13073'),
  '13058': one('Nordwestmecklenburg', '2011-09-04', '13074'),
  '13059': one('Ostvorpommern', '2011-09-04', '13075'),
  '13060': one('Parchim', '2011-09-04', '13076'),
  '13061': one('Rügen', '2011-09-04', '13073'),
  '13062': one('Uecker-Randow', '2011-09-04', '13075'),
  // Sachsen (1.8.2008; Hoyerswerda 1996 zum Landkreis Kamenz)
  '14161': one('Chemnitz, Stadt', '2008-08-01', '14511'),
  '14166': one('Plauen, Stadt', '2008-08-01', '14523'),
  '14167': one('Zwickau, Stadt', '2008-08-01', '14524'),
  '14171': one('Annaberg', '2008-08-01', '14521'),
  '14173': one('Chemnitzer Land', '2008-08-01', '14524'),
  '14177': one('Freiberg', '2008-08-01', '14522'),
  '14178': one('Vogtlandkreis', '2008-08-01', '14523'),
  '14181': one('Mittlerer Erzgebirgskreis', '2008-08-01', '14521'),
  '14182': one('Mittweida', '2008-08-01', '14522'),
  '14188': one('Stollberg', '2008-08-01', '14521'),
  '14191': one('Aue-Schwarzenberg', '2008-08-01', '14521'),
  '14193': one('Zwickauer Land', '2008-08-01', '14524'),
  '14262': one('Dresden, Stadt', '2008-08-01', '14612'),
  '14263': one('Görlitz, Stadt', '2008-08-01', '14626'),
  '14264': one('Hoyerswerda, Stadt', '1996-01-01', '14625'),
  '14272': one('Bautzen', '2008-08-01', '14625'),
  '14280': one('Meißen', '2008-08-01', '14627'),
  '14284': one('Niederschlesischer Oberlausitzkreis', '2008-08-01', '14626'),
  '14285': one('Riesa-Großenhain', '2008-08-01', '14627'),
  '14286': one('Löbau-Zittau', '2008-08-01', '14626'),
  '14287': one('Sächsische Schweiz', '2008-08-01', '14628'),
  '14290': one('Weißeritzkreis', '2008-08-01', '14628'),
  '14292': one('Kamenz', '2008-08-01', '14625'),
  '14365': one('Leipzig, Stadt', '2008-08-01', '14713'),
  '14374': one('Delitzsch', '2008-08-01', '14730'),
  '14375': one('Döbeln', '2008-08-01', '14522'),
  '14379': one('Leipziger Land', '2008-08-01', '14729'),
  '14383': one('Muldentalkreis', '2008-08-01', '14729'),
  '14389': one('Torgau-Oschatz', '2008-08-01', '14730'),
  // Sachsen-Anhalt (1.7.2007)
  '15101': one('Dessau, kreisfreie Stadt', '2007-07-01', '15001'),
  '15202': one('Halle (Saale), kreisfreie Stadt', '2007-07-01', '15002'),
  '15303': one('Magdeburg, kreisfreie Stadt', '2007-07-01', '15003'),
  '15151': K('Anhalt-Zerbst', '2007-07-01', ['15001', 0.203], ['15082', 0.366], ['15086', 0.074], ['15091', 0.357]),
  '15153': one('Bernburg', '2007-07-01', '15089'),
  '15154': one('Bitterfeld', '2007-07-01', '15082'),
  '15159': one('Köthen', '2007-07-01', '15082'),
  '15171': one('Wittenberg', '2007-07-01', '15091'),
  '15256': one('Burgenlandkreis', '2007-07-01', '15084'),
  '15260': one('Mansfelder Land', '2007-07-01', '15087'),
  '15261': one('Merseburg-Querfurt', '2007-07-01', '15088'),
  '15265': one('Saalkreis', '2007-07-01', '15088'),
  '15266': one('Sangerhausen', '2007-07-01', '15087'),
  '15268': one('Weißenfels', '2007-07-01', '15084'),
  '15352': K('Aschersleben-Staßfurt', '2007-07-01', ['15089', 0.933], ['15085', 0.067]),   // Falkenstein/Harz → Harz
  '15355': one('Bördekreis', '2007-07-01', '15083'),
  '15357': one('Halberstadt', '2007-07-01', '15085'),
  '15358': one('Jerichower Land', '2007-07-01', '15086'),
  '15362': one('Ohrekreis', '2007-07-01', '15083'),
  '15363': one('Stendal', '2007-07-01', '15090'),
  '15364': one('Quedlinburg', '2007-07-01', '15085'),
  '15367': one('Schönebeck', '2007-07-01', '15089'),
  '15369': one('Wernigerode', '2007-07-01', '15085'),
  '15370': one('Altmarkkreis Salzwedel', '2007-07-01', '15081'),
  // Thüringen (1.7.2021)
  '16056': { ...one('Eisenach, kreisfreie Stadt', '2021-07-01', '16063'), add: true },
};

/** Heutige Kreise, auf die sich ein früherer Kreis verteilt (Ketten wie Hoyerswerda → Kamenz → Bautzen aufgelöst) */
export function kreisTargets(key: string, known: (id: string) => boolean, depth = 0): [string, number][] | null {
  if (known(key) && !KREIS_ALT[key]) return [[key, 1]];
  const e = KREIS_ALT[key]; if (!e || depth > 4) return known(key) ? [[key, 1]] : null;
  const out: [string, number][] = [];
  for (const [id, w] of e.to) {
    const sub = known(id) ? [[id, 1]] as [string, number][] : kreisTargets(id, known, depth + 1);
    if (!sub) return null;
    for (const [s, v] of sub) out.push([s, w * v]);
  }
  return out;
}
