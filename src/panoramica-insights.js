// "Da decidere" (lente "Nel tempo"): un insight vale la decisione solo se la
// divergenza area↔piano è PERSISTENTE, non lo scarto di una singola settimana
// (rumore). Un'area entra se è fuori piano in >= PERSIST_MIN delle ultime
// PERSIST_WINDOW settimane CHIUSE — la corrente è in corso e va esclusa, altrimenti
// leggerebbe sempre sotto-piano. Fuori piano = stesso verdetto di statusFor.
export const PERSIST_WINDOW = 8;  // allineata alla finestra dei trend della lente
export const PERSIST_MIN = 3;

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
export function persistentAreaInsights(perAreaWeekly, window = PERSIST_WINDOW, min = PERSIST_MIN) {
  const items = [];
  for (const { client, weeks } of perAreaWeekly) {
    const closed = weeks.filter(w => !w.isCurrent).slice(-window);
    let under = 0, over = 0;
    for (const w of closed) {
      if (!(w.planned > 0)) continue;                 // area chiusa/senza piano quella settimana
      const kind = statusFor(w.done, w.planned).kind;
      if (kind === 'under') under++;
      else if (kind === 'over') over++;
    }
    if (under >= min) {
      items.push({ color: client.color, area: client.name, kind: 'under', weeksOff: under, of: closed.length, severity: under / window, to: 'Aree' });
    } else if (over >= min) {
      items.push({ color: client.color, area: client.name, kind: 'over', weeksOff: over, of: closed.length, severity: over / window, to: 'Settimana' });
    }
  }
  // Più settimane fuori piano = più grave: le aree peggiori in cima.
  return items.sort((a, b) => b.weeksOff - a.weeksOff);
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
