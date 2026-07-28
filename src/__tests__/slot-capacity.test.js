import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SLOT_CAPACITY_HOURS,
  normalizeSlotCapacityHours,
  normalizeSlotCapacity,
  dayCapacityHours,
  getSlotCapacityLoad,
} from '../slot-capacity.js';

describe('normalizeSlotCapacityHours', () => {
  test('falls back to the default for invalid or non-positive input', () => {
    assert.equal(normalizeSlotCapacityHours('nope'), DEFAULT_SLOT_CAPACITY_HOURS);
    assert.equal(normalizeSlotCapacityHours(0), DEFAULT_SLOT_CAPACITY_HOURS);
    assert.equal(normalizeSlotCapacityHours(-3), DEFAULT_SLOT_CAPACITY_HOURS);
  });
  test('clamps to the 0.5..12 range', () => {
    assert.equal(normalizeSlotCapacityHours(0.1), 0.5);
    assert.equal(normalizeSlotCapacityHours(20), 12);
  });
  test('rounds to the nearest quarter hour', () => {
    assert.equal(normalizeSlotCapacityHours(3.1), 3);
    assert.equal(normalizeSlotCapacityHours(3.13), 3.25);
  });
  test('parses numeric strings', () => {
    assert.equal(normalizeSlotCapacityHours('4'), 4);
  });
});

describe('normalizeSlotCapacity', () => {
  test('expands a legacy single number over every slot', () => {
    assert.deepEqual(normalizeSlotCapacity('4'), { am: 4, pm: 4, sera: 4 });
    assert.deepEqual(normalizeSlotCapacity(3), { am: 3, pm: 3, sera: 3 });
  });
  test('reads the per-slot JSON shape', () => {
    assert.deepEqual(normalizeSlotCapacity('{"am":5,"pm":4,"sera":2}'), { am: 5, pm: 4, sera: 2 });
    assert.deepEqual(normalizeSlotCapacity({ am: 5, pm: 4, sera: 2 }), { am: 5, pm: 4, sera: 2 });
  });
  test('falls back to the default for missing, invalid or absent values', () => {
    const d = DEFAULT_SLOT_CAPACITY_HOURS;
    assert.deepEqual(normalizeSlotCapacity(undefined), { am: d, pm: d, sera: d });
    assert.deepEqual(normalizeSlotCapacity('nope'), { am: d, pm: d, sera: d });
    assert.deepEqual(normalizeSlotCapacity({ am: 5 }), { am: 5, pm: d, sera: d });
  });
});

describe('dayCapacityHours', () => {
  test('sums the slots', () => {
    assert.equal(dayCapacityHours({ am: 5, pm: 4, sera: 2 }), 11);
    assert.equal(dayCapacityHours(undefined), DEFAULT_SLOT_CAPACITY_HOURS * 3);
  });
});

describe('getSlotCapacityLoad', () => {
  test('takes the larger of planned and logged', () => {
    assert.equal(getSlotCapacityLoad(3, 5), 5);
    assert.equal(getSlotCapacityLoad(5, 3), 5);
  });
  test('coerces missing values to 0', () => {
    assert.equal(getSlotCapacityLoad(undefined, null), 0);
  });
});
