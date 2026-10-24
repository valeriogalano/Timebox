// Previsto della settimana: dove arrivo a fine settimana se completo il piano. È la misura
// su cui Andamento → Settimana e gli avvisi sui limiti in Settimana danno il verdetto,
// perché a metà settimana il Fatto contro il piano dell'intera settimana dice sempre "sotto".
// A settimana chiusa il Previsto coincide con il Fatto, quindi il verdetto non cambia.
//
// Giorno per giorno: prima di oggi conta il fatto; da oggi in avanti il giorno arriva almeno
// al piano, o a quanto è già registrato se è di più. Oggi vale quindi fatto + residuo del
// piano di oggi, max(0, piano − fatto), per area.
// Gemello CommonJS per CLI e MCP: weekForecast e forecastTodayIndex in lib/domain.js.
import { capUsage } from './cap-usage.js';

// Indice di oggi nella settimana che inizia il lunedì `weekKey` (entrambe YYYY-MM-DD):
// 0 = lunedì … 6 = domenica, negativo per una settimana futura, oltre 6 per una passata.
export function forecastTodayIndex(weekKey, todayStr) {
  const utc = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((utc(todayStr) - utc(weekKey)) / 86400000);
}

// plannedByDay, doneByDay: 7 mappe { areaId: ore }, da lunedì a domenica.
// Restituisce, per area e in totale, piano, fatto e previsto.
export function weekForecast({ plannedByDay, doneByDay, todayIdx }) {
  const byArea = {};
  const area = id => (byArea[id] ??= { planned: 0, done: 0, forecast: 0 });
  for (let d = 0; d < 7; d++) {
    const planned = plannedByDay[d] || {};
    const done = doneByDay[d] || {};
    for (const id of new Set([...Object.keys(planned), ...Object.keys(done)])) {
      const a = area(id);
      const p = planned[id] ?? 0, f = done[id] ?? 0;
      a.planned += p;
      a.done += f;
      a.forecast += d < todayIdx ? f : Math.max(f, p);
    }
  }
  const sum = key => Object.values(byArea).reduce((s, a) => s + a[key], 0);
  return { byArea, planned: sum('planned'), done: sum('done'), forecast: sum('forecast') };
}

// Uso di un tetto settimanale a fine settimana: alle ore già registrate si aggiungono le ore
// di piano che restano (previsto − fatto), su entrambi i conteggi, perché nelle aree a ore
// un'ora pianificata è un'ora da fatturare.
export function forecastUsage(usage, remaining, hourly) {
  return capUsage(usage.worked + remaining, usage.billable + remaining, hourly);
}
