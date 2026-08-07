// "Da decidere" (lente "Nel tempo"): la decisione che questa card alimenta è una sola —
// "la RICORRENZA di quest'area è tarata male?". È strutturale, non riguarda la prossima
// settimana (quella si legge in Settimana, e infatti la corrente è esclusa dal calcolo).
//
// Per quella domanda la misura giusta è la MEDIA: la ricorrenza è una media settimanale
// per costruzione, quindi se pianifico 10h/sett e ne faccio 7 il piano è tarato 3h troppo
// alto, e come si distribuiscono quelle 7h è irrilevante — sopra e sotto DEVONO compensarsi.
// Contare le settimane fuori piano misurava un'altra cosa, la volatilità: un'area a 5h e
// 15h alternate è fuori piano 8 volte su 8 ma la ricorrenza è tarata benissimo, e mandare
// a toccarla peggiorerebbe le cose.
export const PERSIST_WINDOW = 8;  // allineata alla finestra dei trend della lente
// Sotto questo numero di settimane chiuse con piano non si cambia un template: due dati
// non sono un ritmo.
export const MIN_HISTORY = 4;

// Verdetto piano↔consuntivo. Due soglie, ciascuna combinata in ore e in percentuale:
// la percentuale da sola grida per le aree piccole (1h pianificata, 1h30 fatta = +50%
// ma è mezz'ora), le ore da sole tacciono per quelle grandi. Vince la più larga delle due.
export const TOL_HOURS = 0.5;     // mezz'ora: rumore di tracciamento, non un segnale
export const TOL_PCT = 0.10;
export const STRONG_HOURS = 2;    // oltre: scarto marcato → glifo doppio
export const STRONG_PCT = 0.30;

// Piano a zero con ore fatte è sovraccarico, non "nessun verdetto": è lavoro
// interamente fuori piano, il caso che il verdetto deve gridare più forte.
// Solo piano 0 E fatto 0 è davvero "—" (area senza attività nella settimana).
export function statusFor(done, planned) {
  if (!(planned > 0) && !(done > 0)) return { kind: 'none', level: 0, label: '—', glyph: '·', color: 'var(--tb-text-muted)' };
  const delta = (done || 0) - planned;
  const tol = Math.max(TOL_HOURS, planned * TOL_PCT);
  if (Math.abs(delta) <= tol) {
    return { kind: 'on', level: 0, label: 'In linea', glyph: '▪', color: 'var(--tb-text-primary)' };
  }
  const level = Math.abs(delta) > Math.max(STRONG_HOURS, planned * STRONG_PCT) ? 2 : 1;
  return delta > 0
    ? { kind: 'over', level, label: level === 2 ? 'Molto sovraccarico' : 'Sovraccarico', glyph: '▴'.repeat(level), color: 'var(--tb-text-primary)' }
    : { kind: 'under', level, label: level === 2 ? 'Molto sottocarico' : 'Sottocarico', glyph: '▾'.repeat(level), color: 'var(--tb-text-muted)' };
}

// perAreaWeekly: [{ client, weeks: [{ done, planned, isCurrent }] }],
// weeks in ordine cronologico (la corrente è l'ultima).
export function areaPlanFitInsights(perAreaWeekly, window = PERSIST_WINDOW, minHistory = MIN_HISTORY) {
  const items = [];
  for (const { client, weeks } of perAreaWeekly) {
    // Le settimane senza piano non sono "sotto piano": l'area era chiusa o non
    // pianificata, includerle nella media abbasserebbe il ritmo di riferimento.
    const closed = weeks.filter(w => !w.isCurrent).slice(-window).filter(w => w.planned > 0);
    if (closed.length < minHistory) continue;
    const done    = closed.reduce((s, w) => s + (w.done || 0), 0);
    const planned = closed.reduce((s, w) => s + w.planned, 0);
    // statusFor sui TOTALI: la tolleranza si scala già sul pianificato, quindi applicata
    // alla somma vale come applicata alla media, senza soglie nuove da tarare.
    const { kind, level } = statusFor(done, planned);
    if (kind === 'on' || kind === 'none') continue;
    items.push({
      color: client.color, area: client.name, kind, level,
      // Il numero utile è la media settimanale: è esattamente ciò che va scritto nella
      // ricorrenza, non uno scarto da ricalcolare a mente.
      avgDone: done / closed.length,
      avgPlanned: planned / closed.length,
      of: closed.length,
      severity: Math.abs(done - planned) / planned,
      to: kind === 'under' ? 'Aree' : 'Settimana',
    });
  }
  // Scarto proporzionale più grande = piano più fuori taratura: in cima.
  return items.sort((a, b) => b.severity - a.severity);
}

// Lente "In prospettiva": quanto manca a esaurire i tetti CUMULATIVI (budget totale
// di progetto, limite globale d'area). I tetti *settimanali* non stanno qui: si
// azzerano ogni settimana, quindi non li si "raggiunge" mai — il loro numero utile è
// il margine della settimana corrente, che si legge in Settimana.
//
// Il ritmo di proiezione è quello MISURATO sulle ultime settimane chiuse, non il ritmo
// template: il template sovrastima (INVALSI 14,25h/sett a fronte di ~10,6 reali) e a
// livello progetto non esiste affatto, perché `recurring` mappa solo le aree.
export const RUNWAY_WINDOW = 4;   // settimane chiuse su cui si misura il ritmo

// Fasce, non settimane esatte: il ritmo misurato ha un'incertezza più larga della
// distanza fra "3" e "4 settimane", quindi un numero preciso comunicherebbe una
// precisione che il dato non ha. 8 è il fondo scala, allineato alla finestra di Trend.
const BANDS = [
  { max: 2,        band: 'entro2',  label: 'Esaurito entro 2 settimane', glyph: '▴▴' },
  { max: 4,        band: 'entro4',  label: 'Esaurito entro 4 settimane', glyph: '▴'  },
  { max: 8,        band: 'entro8',  label: 'Esaurito entro 8 settimane', glyph: '▪'  },
  { max: Infinity, band: 'oltre8',  label: 'Oltre 8 settimane',          glyph: '▪'  },
];

export function capRunway({ cap, consumed = 0, rhythm = 0 }) {
  if (!(cap > 0)) {
    return { hasCap: false, remaining: 0, weeks: null, band: 'nocap', label: 'Senza tetto', glyph: '·' };
  }
  const remaining = cap - consumed;
  const base = { hasCap: true, cap, consumed, remaining, rhythm, ratio: consumed / cap };
  // Tetto già sfondato: è il caso che il verdetto deve gridare più forte, non un
  // runway a zero settimane da leggere come "quasi".
  if (remaining <= 0) {
    return { ...base, weeks: 0, band: 'esaurito', label: 'Tetto esaurito', glyph: '▴▴' };
  }
  // Ritmo nullo: il progetto è fermo. Dividere darebbe Infinity, che stampato come
  // "oltre 8 settimane" mentirebbe dicendo che il lavoro procede lentamente.
  if (!(rhythm > 0)) {
    return { ...base, weeks: null, band: 'nessuno', label: 'Fermo · nessun esaurimento previsto', glyph: '·' };
  }
  const weeks = remaining / rhythm;
  const { band, label, glyph } = BANDS.find(b => weeks <= b.max);
  return { ...base, weeks, band, label, glyph };
}
