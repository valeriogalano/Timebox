'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { MIDDAY_HOUR, AM_END_HOUR, PM_END_HOUR, slotForDate, slotForDueValue } = require('../../lib/time-slots');

describe('time slot cutoff', () => {
  test('splits the day into am / pm / sera at 13:00 and 18:00', () => {
    assert.equal(MIDDAY_HOUR, 13);
    assert.equal(AM_END_HOUR, 13);
    assert.equal(PM_END_HOUR, 18);
    assert.equal(slotForDate(new Date('2026-06-24T11:59:00')), 'am');
    assert.equal(slotForDate(new Date('2026-06-24T12:59:00')), 'am');
    assert.equal(slotForDate(new Date('2026-06-24T13:00:00')), 'pm');
    assert.equal(slotForDate(new Date('2026-06-24T17:59:00')), 'pm');
    assert.equal(slotForDate(new Date('2026-06-24T18:00:00')), 'sera');
    assert.equal(slotForDate(new Date('2026-06-24T23:30:00')), 'sera');
  });

  test('maps Todoist due values without a time to AM', () => {
    assert.equal(slotForDueValue(null), 'am');
    assert.equal(slotForDueValue('2026-06-24'), 'am');
    assert.equal(slotForDueValue('2026-06-24T12:59:00'), 'am');
    assert.equal(slotForDueValue('2026-06-24T13:00:00'), 'pm');
  });
});
