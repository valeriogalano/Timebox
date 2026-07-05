'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const {
  getTodoistImportIds,
  getTodoistImports,
  saveTodoistImport,
  importCompletedTodoistTasks,
  getEntries,
  saveEntry,
} = require('../../db/queries');

describe('Todoist import ledger', () => {
  before(() => createTestDb());

  test('records imported tasks and finds them by id', () => {
    saveTodoistImport({
      todoistTaskId: 'todoist-1',
      projectId: 'p1',
      date: '2025-05-12',
      hours: 2,
      titleSnapshot: 'Task completato',
      importedAt: '2025-05-12T09:00:00.000Z',
    });

    assert.deepEqual(getTodoistImportIds(['todoist-1', 'todoist-2']), ['todoist-1']);
    assert.deepEqual(getTodoistImports('2025-05-12', '2025-05-12'), [{
      todoistTaskId: 'todoist-1',
      projectId: 'p1',
      date: '2025-05-12',
      hours: 2,
      titleSnapshot: 'Task completato',
      importedAt: '2025-05-12T09:00:00.000Z',
    }]);
  });

  test('does not duplicate a task imported more than once', () => {
    saveTodoistImport({
      todoistTaskId: 'todoist-1',
      projectId: 'p1',
      date: '2025-05-12',
      hours: 4,
      titleSnapshot: 'Task duplicato',
      importedAt: '2025-05-12T15:00:00.000Z',
    });

    const imports = getTodoistImports('2025-05-12', '2025-05-12');
    assert.equal(imports.length, 1);
    assert.equal(imports[0].hours, 2);
  });

  test('adds only new task hours while preserving manual time', () => {
    saveEntry({
      id: 'manual-entry',
      projectId: 'p2',
      date: '2025-05-13',
      hours: 1,
      billableHours: null,
      slot: 'am',
      billed: false,
    });

    const first = importCompletedTodoistTasks([
      {
        todoistTaskId: 'todoist-2',
        projectId: 'p2',
        date: '2025-05-13',
        hours: 2,
        titleSnapshot: 'Prima attività',
        importedAt: '2025-05-13T09:00:00.000Z',
        slot: 'am',
      },
    ]);
    const second = importCompletedTodoistTasks([
      {
        todoistTaskId: 'todoist-2',
        projectId: 'p2',
        date: '2025-05-13',
        hours: 2,
        titleSnapshot: 'Prima attività',
        importedAt: '2025-05-13T09:00:00.000Z',
        slot: 'am',
      },
      {
        todoistTaskId: 'todoist-3',
        projectId: 'p2',
        date: '2025-05-13',
        hours: 2,
        titleSnapshot: 'Seconda attività',
        importedAt: '2025-05-13T15:00:00.000Z',
        slot: 'pm',
      },
    ]);

    assert.deepEqual(first, { importedCount: 1, importedHours: 2 });
    assert.deepEqual(second, { importedCount: 1, importedHours: 2 });
    const entries = getEntries('2025-05-13', '2025-05-13').filter(entry => entry.projectId === 'p2');
    assert.equal(entries.length, 2);
    const bySlot = Object.fromEntries(entries.map(entry => [entry.slot, entry]));
    assert.equal(bySlot.am.hours, 3);
    assert.equal(bySlot.pm.hours, 2);
  });
});
