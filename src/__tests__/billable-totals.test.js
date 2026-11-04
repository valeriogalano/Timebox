import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { billableTotals, hourlyRate } from '../billable-totals.js';

const clients = [
  { id: 'a', billing: 'hourly', rate: 50 },
  { id: 'b', billing: 'hourly', rate: null },   // hourly, no rate yet
  { id: 'c', billing: 'fixed', rate: 80 },
  { id: 'd', billing: 'none', rate: 0 },
];

describe('billableTotals', () => {
  test('every hourly area counts its hours, the value needs a rate', () => {
    assert.deepEqual(billableTotals(clients, { a: 2, b: 3, c: 4, d: 5 }), { hours: 5, eur: 100 });
  });

  test('missing entries count as zero', () => {
    assert.deepEqual(billableTotals(clients, {}), { hours: 0, eur: 0 });
  });
});

describe('hourlyRate', () => {
  test('only hourly areas have a rate, and a missing one is 0', () => {
    assert.deepEqual(clients.map(hourlyRate), [50, 0, 0, 0]);
    assert.equal(hourlyRate(undefined), 0);
  });
});
