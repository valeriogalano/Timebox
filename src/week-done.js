// Ore "fatte" di una settimana: una regola sola per Andamento e Settimana.
// Nella settimana in corso contano le ore datate fino a oggi; quelle datate nei
// giorni successivi (registrate in anticipo, o con la data sbagliata) non sono
// ancora fatte. Le settimane chiuse e quelle future contano tutto, come prima.
// Prima Andamento escludeva le ore future e Settimana no: sulla stessa
// settimana le due schermate davano numeri diversi.

// La data fino a cui contare (inclusa), o null se conta tutta la settimana.
export function doneCutoff(weekStartStr, weekEndStr, todayStr) {
  return weekStartStr <= todayStr && todayStr <= weekEndStr ? todayStr : null;
}

export function isDone(dateStr, cutoff) {
  return cutoff == null || dateStr <= cutoff;
}

// Totali del riepilogo di Settimana sui giorni già fatti, più le ore datate
// dopo oggi, che si mostrano a parte invece di sparire.
export function weekDoneTotals(days, cutoff) {
  const totals = { actual: 0, billable: 0, extra: 0, futureHours: 0 };
  for (const d of days) {
    if (isDone(d.dateStr, cutoff)) {
      totals.actual += d.dayHours;
      totals.billable += d.dayBillable;
      totals.extra += Math.max(0, d.bilancioExtra);
    } else {
      totals.futureHours += d.dayHours;
    }
  }
  return totals;
}
