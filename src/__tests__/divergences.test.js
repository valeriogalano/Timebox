import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeDivergences, DIVERGENCE_HISTORY_WEEKS, DIVERGENCE_MIN_OCCURRENCES } from '../divergences.js';

const recurring = [{ id: 'r1', day: 1, slot: 'am', clientId: 'c1', hours: 2 }];

function overrideRow(weekKey, hours) {
  return { weekKey, dayIndex: 1, slot: 'am', blocks: [{ clientId: 'c1', hours }] };
}

describe('computeDivergences', () => {
  test('avgDelta media sull\'intera finestra osservata, non sulle sole settimane divergenti', () => {
    // 3 settimane divergenti (+2h ciascuna) su una finestra di 8.
    const pastOverrides = [
      overrideRow('2026-08-03', 4),
      overrideRow('2026-08-10', 4),
      overrideRow('2026-08-17', 4),
    ];
    const [result] = computeDivergences(pastOverrides, recurring);
    // 6h su 8 settimane = 45m; sulle sole 3 settimane sarebbero 2h.
    assert.equal(result.avgDelta, 0.75);
  });

  test('occurrences conta solo le settimane effettivamente divergenti', () => {
    const pastOverrides = [
      overrideRow('2026-08-03', 4),
      overrideRow('2026-08-10', 4),
      overrideRow('2026-08-17', 4),
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
      overrideRow('2026-08-03', 5), // +3
      overrideRow('2026-08-10', 1), // -1
      overrideRow('2026-08-17', 5), // +3
      overrideRow('2026-08-24', 5), // +3
    ];
    const [result] = computeDivergences(pastOverrides, recurring);
    assert.equal(result.avgDelta, 8 / DIVERGENCE_HISTORY_WEEKS);
  });

  test('una voce dismissed viene esclusa', () => {
    const pastOverrides = [
      overrideRow('2026-08-03', 4),
      overrideRow('2026-08-10', 4),
      overrideRow('2026-08-17', 4),
    ];
    const dismissed = new Set(['1-am-c1']);
    assert.deepEqual(computeDivergences(pastOverrides, recurring, dismissed), []);
  });

  test('uno scarto medio sotto il quarto d\'ora è rumore e non compare', () => {
    // -5m per tre settimane: in media meno di 2m, "Applica" non cambierebbe nulla.
    const pastOverrides = [
      overrideRow('2026-08-03', 2 - 5 / 60),
      overrideRow('2026-08-10', 2 - 5 / 60),
      overrideRow('2026-08-17', 2 - 5 / 60),
    ];
    assert.deepEqual(computeDivergences(pastOverrides, recurring), []);
  });

  test('l\'arrotondamento è simmetrico tra scarti positivi e negativi', () => {
    // ±5h su 8 = ±37m30s, a metà fra due quarti d'ora: da entrambe le parti si arrotonda in fuori.
    const minus = [0, 0, 1].map((h, i) => overrideRow(`2026-08-${10 + i * 7}`, h)); // -2 -2 -1
    const plus = [4, 4, 3].map((h, i) => overrideRow(`2026-08-${10 + i * 7}`, h)); // +2 +2 +1
    assert.equal(computeDivergences(minus, recurring)[0].avgDelta, -0.75);
    assert.equal(computeDivergences(plus, recurring)[0].avgDelta, 0.75);
  });
});

describe('computeDivergences / soglia e ordine', () => {
  const weeks = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21'];
  const rows = (dayIndex, slot, clientId, hours) => weeks.map(weekKey => ({ weekKey, dayIndex, slot, blocks: [{ clientId, hours }] }));

  test('uno scarto medio entro la tolleranza di Andamento non compare', () => {
    // template 2h, sempre 2,5h: media +0,5h, che è la tolleranza (statusFor: ≤ → "in linea").
    assert.deepEqual(computeDivergences(rows(1, 'am', 'c1', 2.5), recurring), []);
  });

  test('uno scarto appena oltre la tolleranza compare', () => {
    // template 2h, sempre 3h: +1h, oltre mezz'ora e oltre il 10% del template.
    const [item] = computeDivergences(rows(1, 'am', 'c1', 3), recurring);
    assert.equal(item.avgDelta, 1);
  });

  test('la percentuale allarga la soglia sui template grandi', () => {
    // template 10h: tolleranza = max(0,5; 1) = 1h. +1h resta dentro, +1,25h no.
    const big = [{ id: 'r2', day: 2, slot: 'pm', clientId: 'c2', hours: 10 }];
    assert.deepEqual(computeDivergences(rows(2, 'pm', 'c2', 11), big), []);
    assert.equal(computeDivergences(rows(2, 'pm', 'c2', 11.25), big)[0].avgDelta, 1.25);
  });

  test('uno slot senza template ha la tolleranza fissa di mezz\'ora', () => {
    assert.equal(computeDivergences(rows(4, 'sera', 'c3', 1), []).length, 1);
    assert.equal(computeDivergences(rows(4, 'sera', 'c3', 0.5), []).length, 0);
  });

  test('ordina dallo scarto più grande, a parità per giorno e fascia', () => {
    const tpl = [
      { id: 'a', day: 0, slot: 'am', clientId: 'c1', hours: 2 },
      { id: 'b', day: 3, slot: 'pm', clientId: 'c2', hours: 2 },
      { id: 'c', day: 2, slot: 'am', clientId: 'c3', hours: 2 },
    ];
    const past = [
      ...rows(0, 'am', 'c1', 3),   // +1
      ...rows(3, 'pm', 'c2', 5),   // +3 (come lo scarto fisso di 3 ore)
      ...rows(2, 'am', 'c3', 3),   // +1
    ];
    const out = computeDivergences(past, tpl);
    assert.deepEqual(out.map(i => [i.day, i.avgDelta]), [[3, 3], [0, 1], [2, 1]]);
  });
});

