import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SLOT_CAPACITY_HOURS,
  normalizeSlotCapacityHours,
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

describe('getSlotCapacityLoad', () => {
  test('takes the larger of planned and logged', () => {
    assert.equal(getSlotCapacityLoad(3, 5), 5);
    assert.equal(getSlotCapacityLoad(5, 3), 5);
  });
  test('coerces missing values to 0', () => {
    assert.equal(getSlotCapacityLoad(undefined, null), 0);
  });
});
