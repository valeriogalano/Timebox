'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const { getWeekData } = require('../commands/week');
const { logHours } = require('../commands/log');

describe('getWeekData', () => {
  before(() => createTestDb());

  test('always returns exactly 7 days, including the weekend', () => {
    const data = getWeekData(new Date('2020-08-12T00:00:00'));
    assert.equal(data.days.length, 7);
  });

  test('monday is correct for a Wednesday input, and the week runs through Sunday', () => {
    // 2020-08-12 is a Wednesday; Monday of that week is 2020-08-10
    const data = getWeekData(new Date('2020-08-12T00:00:00'));
    assert.equal(data.days[0].date, '2020-08-10');
    assert.equal(data.days[4].date, '2020-08-14');
    assert.equal(data.days[5].date, '2020-08-15');
    assert.equal(data.days[6].date, '2020-08-16');
  });

  test('offset -1 gives previous week', () => {
    const current = getWeekData(new Date('2020-08-12T00:00:00'), 0);
    const prev = getWeekData(new Date('2020-08-12T00:00:00'), -1);
    assert.equal(prev.days[0].date, '2020-08-03');
    assert.equal(prev.days[6].date, '2020-08-09');
  });

  test('includes hours logged on Saturday/Sunday in the totals', () => {
    // Isolated week (2020-08-24 is a Monday) so this doesn't affect other tests' totals
    logHours({ projectName: 'website', hoursStr: '1.5', slot: 'am', date: '2020-08-29', add: false });
    const data = getWeekData(new Date('2020-08-24T00:00:00'));
    assert.equal(data.days[5].date, '2020-08-29');
    assert.equal(data.days[5].total, 1.5);
    assert.equal(data.total, 1.5);
  });

  test('empty week returns total 0', () => {
    const data = getWeekData(new Date('2020-08-12T00:00:00'));
    assert.equal(data.total, 0);
  });

  test('sums hours across all days', () => {
    logHours({ projectName: 'website', hoursStr: '2', slot: 'am', date: '2020-08-10', add: false });
    logHours({ projectName: 'brand', hoursStr: '3', slot: 'pm', date: '2020-08-12', add: false });
    const data = getWeekData(new Date('2020-08-12T00:00:00'));
    assert.equal(data.total, 5);
  });

  test('exposes totalBillable and per-day totalBillable', () => {
    logHours({ projectName: 'website', hoursStr: '4', billableHoursStr: '3',
      slot: 'am', date: '2020-09-07', add: false });
    const data = getWeekData(new Date('2020-09-09T00:00:00'));
    assert.ok('totalBillable' in data);
    const monday = data.days[0];
    assert.ok('totalBillable' in monday);
    assert.equal(monday.total, 4);
    assert.equal(monday.totalBillable, 3);
    assert.equal(data.totalBillable, 3);
    assert.equal(monday.entries[0].billableHours, 3);
  });
});
