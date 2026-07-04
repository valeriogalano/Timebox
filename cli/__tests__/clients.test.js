'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const { getClientsData } = require('../commands/clients');

describe('getClientsData', () => {
  before(() => createTestDb());

  test('returns all clients', () => {
    const data = getClientsData();
    // Seed creates 4 clients
    assert.equal(data.length, 4);
  });

  test('returns expected fields for each client', () => {
    const data = getClientsData();
    for (const c of data) {
      assert.ok('name' in c);
      assert.ok('color' in c);
      assert.ok('billable' in c);
      assert.ok('billing' in c);
      assert.ok('rate' in c);
      assert.ok('limitType' in c);
      assert.ok('limitHours' in c);
    }
  });

  test('includes known clients from seed data', () => {
    const data = getClientsData();
    const names = data.map(c => c.name);
    assert.ok(names.includes('Acme Corp'));
    assert.ok(names.includes('The Blog'));
    assert.ok(names.includes('GreenTech SA'));
    assert.ok(names.includes('Studio Nova'));
  });

  test('billable is a boolean', () => {
    const data = getClientsData();
    assert.ok(data.every(c => typeof c.billable === 'boolean'));
  });

  test('color is exposed', () => {
    const data = getClientsData();
    assert.ok(data.every(c => typeof c.color === 'string'));
    assert.ok(data.every(c => c.color.startsWith('#')));
  });
});
