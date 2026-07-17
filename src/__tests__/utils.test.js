import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  getMondayOfWeek, addDays, fmt, fmtH, toHHMM, parseHHMM,
  effBillable, normalizeSlot, slotForDate,
} from '../utils.js';

describe('getMondayOfWeek', () => {
  test('returns the same week Monday for a mid-week date', () => {
    // 2026-07-15 is a Wednesday
    assert.equal(fmt(getMondayOfWeek(new Date('2026-07-15T10:00:00'))), '2026-07-13');
  });
  test('Sunday belongs to the week that started six days earlier', () => {
    // 2026-07-19 is a Sunday -> Monday 2026-07-13
    assert.equal(fmt(getMondayOfWeek(new Date('2026-07-19T10:00:00'))), '2026-07-13');
  });
});

describe('addDays', () => {
  test('adds and subtracts across month boundaries', () => {
    assert.equal(fmt(addDays(new Date('2026-07-31T00:00:00'), 1)), '2026-08-01');
    assert.equal(fmt(addDays(new Date('2026-08-01T00:00:00'), -1)), '2026-07-31');
  });
});

describe('fmtH', () => {
  test('zero and falsy render as 0h', () => {
    assert.equal(fmtH(0), '0h');
    assert.equal(fmtH(null), '0h');
  });
  test('rolls 60 minutes into the next hour', () => {
    assert.equal(fmtH(2.999), '3h');
  });
  test('formats fractional hours and keeps the sign', () => {
    assert.equal(fmtH(1.5), '1h 30m');
    assert.equal(fmtH(-1.5), '-1h 30m');
  });
});

describe('toHHMM', () => {
  test('pads minutes and rolls 60 up', () => {
    assert.equal(toHHMM(1.5), '1:30');
    assert.equal(toHHMM(1.999), '2:00');
    assert.equal(toHHMM(0), '');
  });
});

describe('parseHHMM', () => {
  test('parses colon clock format as hours', () => {
    assert.equal(parseHHMM('1:30'), 1.5);
  });
  test('treats a bare number above 12 as minutes', () => {
    assert.equal(parseHHMM('90'), 1.5);
  });
  test('treats a bare number up to 12 as hours', () => {
    assert.equal(parseHHMM('8'), 8);
  });
  test('accepts comma decimals', () => {
    assert.equal(parseHHMM('1,5'), 1.5);
  });
});

describe('effBillable', () => {
  test('falls back to hours when billableHours is null', () => {
    assert.equal(effBillable({ hours: 4, billableHours: null }), 4);
  });
  test('uses billableHours when present (including zero)', () => {
    assert.equal(effBillable({ hours: 4, billableHours: 0 }), 0);
    assert.equal(effBillable({ hours: 4, billableHours: 2 }), 2);
  });
  test('returns 0 for a missing entry', () => {
    assert.equal(effBillable(null), 0);
  });
});

describe('normalizeSlot', () => {
  test('keeps valid slots and defaults invalid ones to am', () => {
    assert.equal(normalizeSlot('pm'), 'pm');
    assert.equal(normalizeSlot('bogus'), 'am');
    assert.equal(normalizeSlot(undefined), 'am');
  });
});

describe('slotForDate', () => {
  test('splits the day at 13 and 18', () => {
    assert.equal(slotForDate(new Date('2026-07-15T09:00:00')), 'am');
    assert.equal(slotForDate(new Date('2026-07-15T13:00:00')), 'pm');
    assert.equal(slotForDate(new Date('2026-07-15T18:00:00')), 'sera');
  });
});
