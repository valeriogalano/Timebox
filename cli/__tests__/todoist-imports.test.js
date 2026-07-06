'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const {
  getTodoistImportIds,
  getTodoistImports,
  saveTodoistImport,
  updateTodoistImport,
  deleteTodoistImport,
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
      slot: 'pm',
      titleSnapshot: 'Task completato',
      note: 'Verificato in revisione',
      importedAt: '2025-05-12T09:00:00.000Z',
    });

    assert.deepEqual(getTodoistImportIds(['todoist-1', 'todoist-2']), ['todoist-1']);
    assert.deepEqual(getTodoistImports('2025-05-12', '2025-05-12'), [{
      todoistTaskId: 'todoist-1',
      projectId: 'p1',
      date: '2025-05-12',
      hours: 2,
      slot: 'pm',
      titleSnapshot: 'Task completato',
      note: 'Verificato in revisione',
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

  test('updates an imported task and realigns aggregated entries', () => {
    const result = updateTodoistImport({
      todoistTaskId: 'todoist-2',
      projectId: 'p1',
      date: '2025-05-14',
      hours: 1.5,
      slot: 'pm',
      titleSnapshot: 'Prima attività corretta',
      note: 'Spostata dopo review',
    });

    assert.deepEqual(result, { updated: true });
    const updated = getTodoistImports('2025-05-14', '2025-05-14')[0];
    assert.equal(updated.projectId, 'p1');
    assert.equal(updated.hours, 1.5);
    assert.equal(updated.slot, 'pm');
    assert.equal(updated.note, 'Spostata dopo review');

    const oldEntries = getEntries('2025-05-13', '2025-05-13').filter(entry => entry.projectId === 'p2');
    const oldAm = oldEntries.find(entry => entry.slot === 'am');
    assert.equal(oldAm.hours, 1);

    const newEntry = getEntries('2025-05-14', '2025-05-14').find(entry => entry.projectId === 'p1' && entry.slot === 'pm');
    assert.equal(newEntry.hours, 1.5);
  });

  test('deletes an imported task and subtracts its hours from the timesheet', () => {
    const result = deleteTodoistImport('todoist-3');

    assert.deepEqual(result, { deleted: true });
    assert.deepEqual(getTodoistImportIds(['todoist-3']), []);
    const entries = getEntries('2025-05-13', '2025-05-13').filter(entry => entry.projectId === 'p2');
    assert.equal(entries.some(entry => entry.slot === 'pm'), false);
  });

  test('preserves billable override when imported hours are removed', () => {
    saveEntry({
      id: 'manual-billable-entry',
      projectId: 'p4',
      date: '2025-05-15',
      hours: 3,
      billableHours: 1.5,
      slot: 'am',
      billed: false,
    });

    importCompletedTodoistTasks([{
      todoistTaskId: 'todoist-4',
      projectId: 'p4',
      date: '2025-05-15',
      hours: 2,
      titleSnapshot: 'Import con override',
      importedAt: '2025-05-15T09:00:00.000Z',
      slot: 'am',
    }]);

    let entry = getEntries('2025-05-15', '2025-05-15').find(item => item.projectId === 'p4' && item.slot === 'am');
    assert.equal(entry.hours, 5);
    assert.equal(entry.billableHours, 1.5);

    deleteTodoistImport('todoist-4');
    entry = getEntries('2025-05-15', '2025-05-15').find(item => item.projectId === 'p4' && item.slot === 'am');
    assert.equal(entry.hours, 3);
    assert.equal(entry.billableHours, 1.5);
  });
});
