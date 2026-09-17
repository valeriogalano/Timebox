import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeDivergences, DIVERGENCE_HISTORY_WEEKS, DIVERGENCE_MIN_OCCURRENCES } from '../divergences.js';

const recurring = [{ id: 'r1', day: 1, slot: 'am', clientId: 'c1', hours: 2 }];

function overrideRow(weekKey, hours) {
  return { weekKey, dayIndex: 1, slot: 'am', blocks: [{ clientId: 'c1', hours }] };
}

describe('computeDivergences', () => {
  test('avgDelta media sull\'intera finestra osservata, non sulle sole settimane divergenti', () => {
    // 3 settimane divergenti (+1h ciascuna) su una finestra di 8.
    const pastOverrides = [
      overrideRow('2026-08-03', 3),
      overrideRow('2026-08-10', 3),
      overrideRow('2026-08-17', 3),
    ];
    const [result] = computeDivergences(pastOverrides, recurring);
    assert.equal(result.avgDelta, 3 / DIVERGENCE_HISTORY_WEEKS);
  });

  test('occurrences conta solo le settimane effettivamente divergenti', () => {
    const pastOverrides = [
      overrideRow('2026-08-03', 3),
      overrideRow('2026-08-10', 3),
      overrideRow('2026-08-17', 3),
    ];
    const [result] = computeDivergences(pastOverrides, recurring);
    assert.equal(result.occurrences, 3);
  });

  test('sotto DIVERGENCE_MIN_OCCURRENCES la voce non compare', () => {
    const pastOverrides = [
      overrideRow('2026-08-03', 3),
      overrideRow('2026-08-10', 3),
    ];
    assert.equal(pastOverrides.length, DIVERGENCE_MIN_OCCURRENCES - 1);
    assert.deepEqual(computeDivergences(pastOverrides, recurring), []);
  });

  test('scarti di segno opposto si compensano invece di sommarsi in valore assoluto', () => {
    const pastOverrides = [
      overrideRow('2026-08-03', 3), // +1
      overrideRow('2026-08-10', 1), // -1
      overrideRow('2026-08-17', 3), // +1
    ];
    const [result] = computeDivergences(pastOverrides, recurring);
    assert.equal(result.avgDelta, 1 / DIVERGENCE_HISTORY_WEEKS);
  });

  test('una voce dismissed viene esclusa', () => {
    const pastOverrides = [
      overrideRow('2026-08-03', 3),
      overrideRow('2026-08-10', 3),
      overrideRow('2026-08-17', 3),
    ];
    const dismissed = new Set(['1-am-c1']);
    assert.deepEqual(computeDivergences(pastOverrides, recurring, dismissed), []);
  });
});
