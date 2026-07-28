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

export function statusFor(done, planned) {
  if (!(planned > 0)) return { kind: 'none', level: 0, label: '—', glyph: '·', color: 'var(--tb-text-muted)' };
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

// Lente "In prospettiva": proiezione a ritmo template di un'area su `horizon` settimane,
// confrontata col TETTO se esiste. Senza tetto non c'è envelope da sforare: confrontare
// la proiezione col ritmo stesso è degenere (ratio sempre 1 → sempre "sotto-utilizzata"),
// quindi kind='uncapped' e nessun verdetto over/under. weekly → il tetto scala con
// l'orizzonte; global → tetto fisso sull'intero periodo.
export function areaProjection({ rhythm, horizon, limitType, limitHours = 0, rate = 0, billable = false }) {
  const projected = rhythm * horizon;
  const cap = limitType === 'weekly' ? limitHours * horizon
            : limitType === 'global' ? limitHours
            : null;
  const hasCap = cap != null && cap > 0;
  const over = hasCap && projected > cap;
  const ratio = hasCap ? projected / cap : 0;
  const potentialEur = billable ? projected * rate : 0;
  const lostEur = over && billable ? (projected - cap) * rate : 0;
  const kind = !hasCap ? 'uncapped' : over ? 'over' : 'within';
  return { projected, cap, hasCap, ratio, over, potentialEur, lostEur, kind };
}
