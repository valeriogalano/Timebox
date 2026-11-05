// Obiettivo settimanale per area e scarto. Il lunedì si fissa quante ore fare su ogni area;
// lo scarto dice quante ne mancano ancora, tenuto conto dei blocchi che restano:
//
//   scarto = obiettivo − fatto − blocchi rimasti
//   blocchi rimasti = per oggi max(0, piano di oggi − fatto di oggi), per i giorni dopo
//                     il loro piano, weekend compreso
//
// I conti dipendono solo dallo stato (obiettivo, ore, blocchi effettivi), mai da come i
// blocchi sono stati modificati: spostare un blocco non cambia lo scarto, compensare lo
// chiude, togliere il blocco di oggi dopo averci lavorato lascia le ore mancanti in vista.
// Scarto positivo = ore che mancano; negativo = ore oltre l'obiettivo.
// Gemello CommonJS per CLI e MCP in lib/domain.js: stesse funzioni, stessi risultati.
import { TOL_HOURS, TOL_PCT } from './progress-insights.js';

// Sotto questa soglia due numeri di ore sono uguali (arrotondamento), per gli avvisi
// sull'obiettivo.
export const GAP_EPSILON = 0.01;

// Uno scarto entro la tolleranza dei verdetti di Andamento (mezz'ora o il 10%
// dell'obiettivo, la più larga) è "in pari": la GUI lo scrive così e status non lo elenca.
export function gapWithinTolerance(gap, target) {
  return Math.abs(gap) <= Math.max(TOL_HOURS, target * TOL_PCT);
}

// Ore di template per area: la somma della ricorrenza, weekend compreso. È l'obiettivo di
// un'area finché nella settimana non se ne fissa uno.
export function templateHoursByArea(recurring) {
  const out = {};
  for (const r of recurring) {
    if (r.day >= 0 && r.day < 7) out[r.clientId] = (out[r.clientId] ?? 0) + r.hours;
  }
  return out;
}

// rows: le righe append-only della settimana, in ordine di inserimento. Per ogni area:
// `monday` è la prima riga (l'obiettivo del lunedì, per la taratura del template),
// `target` l'ultima (l'obiettivo finale, su cui si misura lo scarto), `set` dice se c'è
// almeno una riga. Senza righe valgono entrambi il template.
export function weekTargets({ areaIds, rows = [], templateByArea = {} }) {
  const out = {};
  for (const id of areaIds) {
    const template = templateByArea[id] ?? 0;
    out[id] = { template, monday: template, target: template, set: false };
  }
  for (const r of rows) {
    const t = out[r.areaId];
    if (!t) continue;
    if (!t.set) t.monday = r.hours;
    t.target = r.hours;
    t.set = true;
  }
  return out;
}

// targets: { areaId: ore }. plannedByDay, doneByDay: 7 mappe { areaId: ore }, da lunedì a
// domenica. todayIdx come forecastTodayIndex: negativo per una settimana futura, oltre 6
// per una passata. Le ore fatte vanno passate fino a oggi: un'ora datata nel futuro non è
// ancora fatta.
export function areaGaps({ targets, plannedByDay, doneByDay, todayIdx }) {
  const byArea = {};
  const area = id => (byArea[id] ??= { target: targets[id] ?? 0, done: 0, remaining: 0, gap: 0 });
  for (const id of Object.keys(targets)) area(id);
  for (let d = 0; d < 7; d++) {
    const planned = plannedByDay[d] || {};
    const done = doneByDay[d] || {};
    for (const id of new Set([...Object.keys(planned), ...Object.keys(done)])) {
      const a = area(id);
      const p = planned[id] ?? 0, f = done[id] ?? 0;
      a.done += f;
      if (d === todayIdx) a.remaining += Math.max(0, p - f);
      else if (d > todayIdx) a.remaining += p;
    }
  }
  for (const a of Object.values(byArea)) a.gap = a.target - a.done - a.remaining;
  const sum = key => Object.values(byArea).reduce((s, a) => s + a[key], 0);
  return { byArea, target: sum('target'), done: sum('done'), remaining: sum('remaining'), gap: sum('gap') };
}

// Avvisi sull'obiettivo di un'area: segnalano, non bloccano.
// - sopra il limite settimanale dell'area;
// - area chiusa nella settimana con un obiettivo sopra lo zero.
export function targetWarnings({ client, target, status }) {
  const out = [];
  if (client?.limitType === 'weekly' && client.limitHours > 0 && target > client.limitHours + GAP_EPSILON)
    out.push({ kind: 'over-weekly-limit', limit: client.limitHours });
  if (status === 'closed' && target > GAP_EPSILON) out.push({ kind: 'closed-with-target' });
  return out;
}
