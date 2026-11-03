'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const {
  getClients, saveProject, saveEntry, getEntries, importCompletedTodoistTasks, deleteTodoistImport,
} = require('../../db/queries');

const DATE = '2026-10-14';
const entryOf = () => getEntries(DATE, DATE).filter(e => e.projectId === 'sub-p');

describe('removing an imported task from an entry with billable hours', () => {
  beforeEach(() => {
    createTestDb();
    saveProject({ id: 'sub-p', clientId: getClients()[0].id, name: 'Subtract target', budgetHours: null });
    importCompletedTodoistTasks([{
      todoistTaskId: 't1', projectId: 'sub-p', date: DATE, hours: 1, slot: 'am',
      titleSnapshot: 'Task', note: null, importedAt: '2026-10-14T18:00:00.000Z',
    }]);
  });

  test('billable hours never stay above the hours still worked', () => {
    const [entry] = entryOf();
    saveEntry({ ...entry, hours: 4, billableHours: 3.5 });
    deleteTodoistImport('t1');
    const [after] = entryOf();
    assert.equal(after.hours, 3);
    // capped at 3h, which equals the worked hours: no override left
    assert.equal(after.billableHours, null);
  });

  test('an override below the remaining hours is kept as is', () => {
    const [entry] = entryOf();
    saveEntry({ ...entry, hours: 4, billableHours: 2.5 });
    deleteTodoistImport('t1');
    const [after] = entryOf();
    assert.equal(after.hours, 3);
    assert.equal(after.billableHours, 2.5);
  });

  test('without an override nothing changes but the hours', () => {
    const [entry] = entryOf();
    saveEntry({ ...entry, hours: 4 });
    deleteTodoistImport('t1');
    const [after] = entryOf();
    assert.equal(after.hours, 3);
    assert.equal(after.billableHours, null);
  });
});
