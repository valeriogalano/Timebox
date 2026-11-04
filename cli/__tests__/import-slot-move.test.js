'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const {
  getClients, saveProject, getEntries, getTodoistImports,
  importCompletedTodoistTasks, deleteTodoistImport, moveEntrySlot,
} = require('../../db/queries');

const DATE = '2026-10-14';
const entries = () => getEntries(DATE, DATE).filter(e => e.projectId === 'slot-p');

describe('moving an entry with imported hours to another slot', () => {
  beforeEach(() => {
    createTestDb();
    saveProject({ id: 'slot-p', clientId: getClients()[0].id, name: 'Slot target', budgetHours: null });
    importCompletedTodoistTasks([{
      todoistTaskId: 't1', projectId: 'slot-p', date: DATE, hours: 2, slot: 'am',
      titleSnapshot: 'Task', note: null, importedAt: '2026-10-14T18:00:00.000Z',
    }]);
  });

  test('the import follows the hours to the new slot', () => {
    moveEntrySlot(entries()[0].id, 'pm');
    assert.equal(getTodoistImports(DATE, DATE).find(i => i.todoistTaskId === 't1').slot, 'pm');
  });

  test('undoing the import then takes the hours off', () => {
    moveEntrySlot(entries()[0].id, 'pm');
    deleteTodoistImport('t1');
    assert.deepEqual(entries(), []);
  });
});
