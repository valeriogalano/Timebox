'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const {
  getClients, saveProject, getEntries, getTodoistImports, getTodoistImportIds,
  importCompletedTodoistTasks, deleteTodoistImport, mergeProjectEntries,
} = require('../../db/queries');

const DATE = '2026-10-14';
const task = projectId => ({
  todoistTaskId: 't1', projectId, date: DATE, hours: 2, slot: 'am',
  titleSnapshot: 'Task', note: null, importedAt: '2026-10-14T18:00:00.000Z',
});
const hoursOf = projectId => getEntries(DATE, DATE)
  .filter(e => e.projectId === projectId).reduce((sum, e) => sum + e.hours, 0);

describe('mergeProjectEntries and the Todoist import ledger', () => {
  beforeEach(() => {
    createTestDb();
    const clientId = getClients()[0].id;
    saveProject({ id: 'imp-to', clientId, name: 'Merge target', budgetHours: null });
    saveProject({ id: 'imp-from', clientId, name: 'Merge source', budgetHours: null });
    importCompletedTodoistTasks([task('imp-from')]);
  });

  test('the imports move to the target instead of vanishing with the source', () => {
    mergeProjectEntries('imp-from', 'imp-to');
    assert.deepEqual(getTodoistImportIds(['t1']), ['t1']);
    assert.equal(getTodoistImports(DATE, DATE).find(i => i.todoistTaskId === 't1').projectId, 'imp-to');
  });

  test('importing the same task again adds nothing', () => {
    mergeProjectEntries('imp-from', 'imp-to');
    assert.equal(importCompletedTodoistTasks([task('imp-to')]).importedCount, 0);
    assert.equal(hoursOf('imp-to'), 2);
  });

  test('undoing the import takes the hours off the target', () => {
    mergeProjectEntries('imp-from', 'imp-to', false);
    deleteTodoistImport('t1');
    assert.equal(hoursOf('imp-to'), 0);
  });
});
