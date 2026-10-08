'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const { getTodayData } = require('../commands/today');
const { logHours } = require('../commands/log');

const TEST_DATE = '2020-07-01';

describe('getTodayData', () => {
  before(() => createTestDb());

  test('returns no entries and a zero total for a day with nothing logged', () => {
    const data = getTodayData(TEST_DATE);
    assert.equal(data.date, TEST_DATE);
    assert.equal(data.total, 0);
    assert.deepEqual(data.entries, []);
  });

  test('lists the entries of the day in one list, whatever slot they were logged in', () => {
    logHours({ projectName: 'website', hoursStr: '3', slot: 'am', date: TEST_DATE, add: false });
    logHours({ projectName: 'brand', hoursStr: '2', slot: 'pm', date: TEST_DATE, add: false });
    const data = getTodayData(TEST_DATE);
    assert.equal(data.total, 5);
    assert.deepEqual(data.entries.map(e => e.project).sort(), ['Brand Identity', 'Website Redesign']);
    // la fascia non è un dato delle ore registrate: non compare nella risposta
    assert.ok(!('slots' in data) && !('amTotal' in data));
    assert.ok(data.entries.every(e => !('slot' in e)));
  });

  test('resolves client name for each entry', () => {
    const byProject = Object.fromEntries(getTodayData(TEST_DATE).entries.map(e => [e.project, e]));
    assert.equal(byProject['Website Redesign'].client, 'Acme Corp');
    assert.equal(byProject['Brand Identity'].client, 'Studio Nova');
  });

  test('exposes billableHours and totalBillable in response', () => {
    const data = getTodayData(TEST_DATE);
    for (const e of data.entries) {
      assert.ok('billableHours' in e, 'entry should include billableHours');
      assert.ok('isBillable' in e, 'entry should include isBillable');
    }
    assert.ok('totalBillable' in data);
  });

  test('billable override is reflected in totalBillable', () => {
    logHours({
      projectName: 'website', hoursStr: '4', billableHoursStr: '3',
      slot: 'am', date: '2020-07-15', add: false,
    });
    const data = getTodayData('2020-07-15');
    assert.equal(data.total, 4);
    assert.equal(data.totalBillable, 3);
    assert.equal(data.entries[0].billableHours, 3);
  });
});
