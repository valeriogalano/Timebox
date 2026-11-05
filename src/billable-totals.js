import { isHourly } from './utils.js';

// Billable hours and their value for a set of areas. An hourly area counts
// even without a rate: its hours are billable (they show in Rendiconto), only
// their value is unknown, so it adds hours and 0 €. Before, ProgressScreen used
// its own `billing === 'hourly' && rate > 0`, and an hourly area without a rate
// vanished from "Fatturabile a consumo" while Rendiconto listed it.
export function billableTotals(clients, billableByClient) {
  return clients.filter(isHourly).reduce((totals, c) => {
    const hours = billableByClient[c.id] ?? 0;
    totals.hours += hours;
    totals.eur += hours * (c.rate || 0);
    return totals;
  }, { hours: 0, eur: 0 });
}

// The hourly rate used to value an area's remaining hours, 0 when there is none.
export const hourlyRate = client => (client && isHourly(client) ? client.rate || 0 : 0);
