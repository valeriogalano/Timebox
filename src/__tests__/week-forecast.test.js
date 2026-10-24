import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as esm from '../week-forecast.js';
import { forecastUsage, weeklyLimitsAtRisk } from '../week-forecast.js';
import { capUsage } from '../cap-usage.js';

// Gemello CommonJS usato da CLI e MCP: deve dare gli stessi risultati.
const cjs = createRequire(import.meta.url)('../../lib/domain.js');

const empty = () => Array.from({ length: 7 }, () => ({}));
const week = (pairs) => {
  const days = empty();
  for (const [d, map] of pairs) days[d] = map;
  return days;
};

for (const [name, impl] of [['src/week-forecast.js', esm], ['lib/domain.js', cjs]]) {
  describe(`weekForecast (${name})`, () => {
    // Area a: 4h al giorno da lunedì a venerdì, 20h nella settimana.
    const plannedByDay = week([0, 1, 2, 3, 4].map(d => [d, { a: 4 }]));

    test('a metà settimana: fatto fino a ieri, residuo di oggi, piano da domani', () => {
      // mercoledì; lunedì 3h, martedì 5h, oggi 1h finora
      const doneByDay = week([[0, { a: 3 }], [1, { a: 5 }], [2, { a: 1 }]]);
      const f = impl.weekForecast({ plannedByDay, doneByDay, todayIdx: 2 });
      // 3 + 5 (passati) + 4 (oggi: 1h fatta + 3h di residuo) + 4 + 4
      assert.deepEqual(f.byArea.a, { planned: 20, done: 9, forecast: 20 });
    });

    test('oggi oltre il piano conta il fatto, non il piano', () => {
      const doneByDay = week([[2, { a: 6 }]]);
      const f = impl.weekForecast({ plannedByDay, doneByDay, todayIdx: 2 });
      // lunedì e martedì a zero, oggi 6h, giovedì e venerdì 4h
      assert.equal(f.byArea.a.forecast, 14);
    });

    test('a settimana chiusa il previsto è il fatto', () => {
      const doneByDay = week([[0, { a: 3 }], [4, { a: 2 }]]);
      const f = impl.weekForecast({ plannedByDay, doneByDay, todayIdx: 9 });
      assert.equal(f.byArea.a.forecast, 5);
      assert.equal(f.forecast, f.done);
    });

    test('una settimana futura arriva al piano', () => {
      const f = impl.weekForecast({ plannedByDay, doneByDay: empty(), todayIdx: -3 });
      assert.deepEqual(f.byArea.a, { planned: 20, done: 0, forecast: 20 });
    });

    test('un\'area senza piano entra con il fatto, e i totali sommano le aree', () => {
      const doneByDay = week([[0, { b: 2 }], [1, { a: 4 }]]);
      const f = impl.weekForecast({ plannedByDay, doneByDay, todayIdx: 2 });
      assert.deepEqual(f.byArea.b, { planned: 0, done: 2, forecast: 2 });
      assert.equal(f.planned, 20);
      assert.equal(f.done, 6);
      // a: 0 + 4 + 4 + 4 + 4 = 16; b: 2
      assert.equal(f.forecast, 18);
    });

    test('giorni mancanti valgono vuoti', () => {
      const f = impl.weekForecast({ plannedByDay: [], doneByDay: [], todayIdx: 0 });
      assert.deepEqual(f, { byArea: {}, planned: 0, done: 0, forecast: 0 });
    });
  });

  describe(`forecastTodayIndex (${name})`, () => {
    test('lunedì è 0, domenica 6, anche a cavallo del cambio dell\'ora', () => {
      assert.equal(impl.forecastTodayIndex('2026-10-19', '2026-10-19'), 0);
      assert.equal(impl.forecastTodayIndex('2026-10-19', '2026-10-25'), 6);
      // 25/10/2026: fine dell'ora legale, il giorno dura 25 ore
      assert.equal(impl.forecastTodayIndex('2026-10-26', '2026-10-28'), 2);
    });
    test('negativo per una settimana futura, oltre 6 per una passata', () => {
      assert.equal(impl.forecastTodayIndex('2026-10-26', '2026-10-24'), -2);
      assert.equal(impl.forecastTodayIndex('2026-10-12', '2026-10-24'), 12);
    });
  });
}

describe('forecastUsage', () => {
  test('aggiunge le ore di piano restanti a entrambi i conteggi', () => {
    const u = forecastUsage(capUsage(10, 8, true), 3, true);
    assert.deepEqual(u, { worked: 13, billable: 11, worst: 13, kind: 'lavorate' });
  });
  test('fuori dalle aree a ore resta un conteggio solo', () => {
    assert.deepEqual(forecastUsage(capUsage(10), 2, false), { worked: 12, billable: 12, worst: 12, kind: null });
  });
});

describe('weeklyLimitsAtRisk', () => {
  const clients = [
    { id: 'a', name: 'A', limitType: 'weekly', limitHours: 10, billing: 'none' },
    { id: 'b', name: 'B', limitType: 'weekly', limitHours: 10, billing: 'none' },
    { id: 'c', name: 'C', limitType: 'global', limitHours: 10, billing: 'none' },
    { id: 'd', name: 'D', limitType: 'weekly', limitHours: 10, billing: 'hourly' },
  ];
  const forecast = { byArea: {
    a: { done: 6, forecast: 12 },   // ci sta ora, non a fine settimana
    b: { done: 11, forecast: 13 },  // già oltre: ha il suo avviso
    c: { done: 6, forecast: 12 },   // limite globale, non settimanale
    d: { done: 6, forecast: 9 },    // fatturabili 8: 8 + 3 = 11 oltre il tetto
  } };
  const areaUsage = { a: capUsage(6), b: capUsage(11), c: capUsage(6), d: capUsage(6, 8, true) };

  test('segnala solo i tetti settimanali che il previsto supera e il fatto ancora no', () => {
    const risk = weeklyLimitsAtRisk(clients, areaUsage, forecast);
    assert.deepEqual(risk.map(r => [r.client.id, r.usage.worst]), [['a', 12], ['d', 11]]);
    assert.equal(risk[1].usage.kind, 'fatt.');
  });

  test('un\'area senza ore né piano non è a rischio', () => {
    assert.deepEqual(weeklyLimitsAtRisk(clients.slice(0, 1), {}, { byArea: {} }), []);
  });
});
