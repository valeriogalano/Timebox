// "Da decidere" (lente "Nel tempo"): un insight vale la decisione solo se la
// divergenza area↔piano è PERSISTENTE, non lo scarto di una singola settimana
// (rumore). Un'area entra se è fuori piano in >= PERSIST_MIN delle ultime
// PERSIST_WINDOW settimane CHIUSE — la corrente è in corso e va esclusa, altrimenti
// leggerebbe sempre sotto-piano. Soglie 0.85/1.1 = le stesse di statusFor.
export const PERSIST_WINDOW = 8;  // allineata alla finestra dei trend della lente
export const PERSIST_MIN = 3;
const UNDER = 0.85;
const OVER = 1.1;

// perAreaWeekly: [{ client, weeks: [{ done, planned, isCurrent }] }],
// weeks in ordine cronologico (la corrente è l'ultima).
export function persistentAreaInsights(perAreaWeekly, window = PERSIST_WINDOW, min = PERSIST_MIN) {
  const items = [];
  for (const { client, weeks } of perAreaWeekly) {
    const closed = weeks.filter(w => !w.isCurrent).slice(-window);
    let under = 0, over = 0;
    for (const w of closed) {
      if (!(w.planned > 0)) continue;                 // area chiusa/senza piano quella settimana
      if (w.done < w.planned * UNDER) under++;
      else if (w.done > w.planned * OVER) over++;
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
