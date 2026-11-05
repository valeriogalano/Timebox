'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const { getClients, saveProject, saveEntry, getEntries, mergeProjectEntries } = require('../../db/queries');

function entry(id, projectId, hours, billed) {
  return { id, projectId, date: '2026-10-14', hours, billableHours: null, slot: 'am', billed };
}

describe('mergeProjectEntries and the billed state', () => {
  let clientId;
  beforeEach(() => {
    createTestDb();
    clientId = getClients()[0].id;
    saveProject({ id: 'merge-to', clientId, name: 'Merge target', budgetHours: null });
    saveProject({ id: 'merge-from', clientId, name: 'Merge source', budgetHours: null });
  });

  const merged = () => getEntries('2026-10-14', '2026-10-14').filter(e => e.projectId === 'merge-to');

  test('a billed entry merged with an unbilled one is no longer billed', () => {
    saveEntry(entry('to-1', 'merge-to', 2, true));
    saveEntry(entry('from-1', 'merge-from', 3, false));
    mergeProjectEntries('merge-from', 'merge-to');
    const [result] = merged();
    assert.equal(result.hours, 5);
    assert.equal(result.billed, false, '3h never invoiced must stay visible in Rendiconto');
  });

  test('two billed entries stay billed', () => {
    saveEntry(entry('to-1', 'merge-to', 2, true));
    saveEntry(entry('from-1', 'merge-from', 3, true));
    mergeProjectEntries('merge-from', 'merge-to');
    assert.equal(merged()[0].billed, true);
  });

  test('an entry moved to a free slot keeps its own state', () => {
    saveEntry(entry('from-1', 'merge-from', 3, true));
    mergeProjectEntries('merge-from', 'merge-to');
    assert.equal(merged()[0].billed, true);
  });
});
