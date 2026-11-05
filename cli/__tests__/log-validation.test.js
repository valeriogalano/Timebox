'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const { logHours } = require('../commands/log');
const { getEntries } = require('../../db/queries');
const { parseHoursStrict, isDateString } = require('../../lib/domain');

const DATE = '2020-06-15';
const log = (hoursStr, extra = {}) =>
  logHours({ projectName: 'website', hoursStr, slot: 'am', date: DATE, add: false, ...extra });
const websiteHours = () => getEntries(DATE, DATE).filter(e => e.slot === 'am').map(e => e.hours);

describe('parseHoursStrict', () => {
  test('reads every form the app writes or accepts', () => {
    for (const [text, hours] of [['2', 2], ['2.5', 2.5], ['2,5', 2.5], ['2:30', 2.5], ['2h 30m', 2.5],
      ['2h30m', 2.5], ['2h', 2], ['45m', 0.75], ['0', 0], ['', 0], ['0h', 0]]) {
      assert.equal(parseHoursStrict(text), hours, text);
    }
  });

  test('anything else is null, not zero', () => {
    for (const text of ['abc', '-3', '2 ore', '1:75', '2h 30', 'h', '1..5']) {
      assert.equal(parseHoursStrict(text), null, text);
    }
  });
});

describe('isDateString', () => {
  test('accepts real days only', () => {
    assert.equal(isDateString('2026-11-03'), true);
    for (const value of ['tomorrow', '2026-02-30', '2026-13-01', '20261103', '', undefined]) {
      assert.equal(isDateString(value), false, String(value));
    }
  });
});

describe('logHours rejects what it cannot read', () => {
  beforeEach(() => createTestDb());

  test('a typo is an error and leaves the existing entry alone', () => {
    log('2');
    assert.throws(() => log('abc'), /Invalid hours/);
    assert.deepEqual(websiteHours(), [2]);
  });

  test('the display format keeps its minutes', () => {
    log('2h 30m');
    assert.deepEqual(websiteHours(), [2.5]);
  });

  test('negative and more than 24 hours are refused', () => {
    assert.throws(() => log('-3'), /Invalid hours/);
    assert.throws(() => log('90'), /Invalid hours/);
    log('20');
    assert.throws(() => log('5', { add: true }), /Invalid hours/);
  });

  test('billable hours are read the same way', () => {
    assert.throws(() => log('2', { billableHoursStr: 'x' }), /Invalid hours/);
  });

  test('a date that is not YYYY-MM-DD is refused', () => {
    assert.throws(() => log('2', { date: 'tomorrow' }), /Invalid date/);
    assert.equal(getEntries('tomorrow', 'tomorrow').length, 0);
  });

  test('an explicit 0 still deletes', () => {
    log('2');
    assert.equal(log('0').action, 'deleted');
    assert.deepEqual(websiteHours(), []);
  });
});
