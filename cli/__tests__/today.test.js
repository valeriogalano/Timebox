'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const { getTodayData } = require('../commands/today');
const { logHours } = require('../commands/log');

const TEST_DATE = '2020-07-01';

describe('getTodayData', () => {
  before(() => createTestDb());

  test('returns empty slots and zero totals for a day with no entries', () => {
    const data = getTodayData(TEST_DATE);
    assert.equal(data.date, TEST_DATE);
    assert.equal(data.total, 0);
    assert.equal(data.amTotal, 0);
    assert.equal(data.pmTotal, 0);
    assert.equal(data.slots.am.length, 0);
    assert.equal(data.slots.pm.length, 0);
  });

  test('returns correct totals and entries after logging hours', () => {
    logHours({ projectName: 'website', hoursStr: '3', slot: 'am', date: TEST_DATE, add: false });
    logHours({ projectName: 'brand', hoursStr: '2', slot: 'pm', date: TEST_DATE, add: false });
    const data = getTodayData(TEST_DATE);
    assert.equal(data.amTotal, 3);
    assert.equal(data.pmTotal, 2);
    assert.equal(data.total, 5);
    assert.equal(data.slots.am.length, 1);
    assert.equal(data.slots.pm.length, 1);
    assert.equal(data.slots.am[0].project, 'Website Redesign');
    assert.equal(data.slots.pm[0].project, 'Brand Identity');
  });

  test('resolves client name for each entry', () => {
    const data = getTodayData(TEST_DATE);
    assert.equal(data.slots.am[0].client, 'Acme Corp');
    assert.equal(data.slots.pm[0].client, 'Studio Nova');
  });
});
