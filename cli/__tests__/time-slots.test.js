'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { MIDDAY_HOUR, slotForDate, slotForDueValue } = require('../../lib/time-slots');

describe('time slot cutoff', () => {
  test('uses noon as the AM/PM cutoff', () => {
    assert.equal(MIDDAY_HOUR, 12);
    assert.equal(slotForDate(new Date('2026-06-24T11:59:00')), 'am');
    assert.equal(slotForDate(new Date('2026-06-24T12:00:00')), 'pm');
    assert.equal(slotForDate(new Date('2026-06-24T12:59:00')), 'pm');
  });

  test('maps Todoist due values without a time to AM', () => {
    assert.equal(slotForDueValue(null), 'am');
    assert.equal(slotForDueValue('2026-06-24'), 'am');
    assert.equal(slotForDueValue('2026-06-24T12:00:00'), 'pm');
  });
});
