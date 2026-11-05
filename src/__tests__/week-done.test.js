import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { doneCutoff, isDone, weekDoneTotals } from '../week-done.js';

describe('week-done', () => {
  test('only the current week stops at today', () => {
    assert.equal(doneCutoff('2026-11-02', '2026-11-08', '2026-11-04'), '2026-11-04');
    assert.equal(doneCutoff('2026-10-26', '2026-11-01', '2026-11-04'), null);
    assert.equal(doneCutoff('2026-11-09', '2026-11-15', '2026-11-04'), null);
  });

  test('today counts, tomorrow does not', () => {
    assert.equal(isDone('2026-11-04', '2026-11-04'), true);
    assert.equal(isDone('2026-11-05', '2026-11-04'), false);
    assert.equal(isDone('2026-11-05', null), true);
  });

  test('future-dated hours are set apart, not lost', () => {
    const day = (dateStr, dayHours, dayBillable, bilancioExtra) => ({ dateStr, dayHours, dayBillable, bilancioExtra });
    const days = [day('2026-11-02', 8, 6, 1), day('2026-11-03', 4, 4, -2), day('2026-11-04', 4, 3, 0), day('2026-11-05', 4.5, 4.5, 2)];
    assert.deepEqual(weekDoneTotals(days, '2026-11-04'), { actual: 16, billable: 13, extra: 1, futureHours: 4.5 });
    assert.deepEqual(weekDoneTotals(days, null), { actual: 20.5, billable: 17.5, extra: 3, futureHours: 0 });
  });
});
