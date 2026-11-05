'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const {
  getClients, saveProject, saveEntry, getEntries, importCompletedTodoistTasks, updateTodoistImport,
} = require('../../db/queries');

const DATE = '2026-10-14';
const entryOf = () => getEntries(DATE, DATE).filter(e => e.projectId === 'imp-p');

function importTask(id, hours) {
  return importCompletedTodoistTasks([{
    todoistTaskId: id, projectId: 'imp-p', date: DATE, hours, slot: 'am',
    titleSnapshot: 'Task', note: null, importedAt: '2026-10-14T18:00:00.000Z',
  }]);
}

describe('Todoist imports and the billed state', () => {
  beforeEach(() => {
    createTestDb();
    saveProject({ id: 'imp-p', clientId: getClients()[0].id, name: 'Import target', budgetHours: null });
  });

  test('importing hours into a billed entry makes it unbilled', () => {
    saveEntry({ id: 'e1', projectId: 'imp-p', date: DATE, hours: 2, billableHours: null, slot: 'am', billed: true });
    importTask('t1', 1);
    const [entry] = entryOf();
    assert.equal(entry.hours, 3);
    assert.equal(entry.billed, false, 'the imported hour was never invoiced');
  });

  test('editing only the note of an import leaves a billed entry billed', () => {
    importTask('t1', 1);
    const [imported] = entryOf();
    saveEntry({ ...imported, billed: true });
    updateTodoistImport({ todoistTaskId: 't1', note: 'checked' });
    const [entry] = entryOf();
    assert.equal(entry.hours, 1);
    assert.equal(entry.billed, true);
  });
});
