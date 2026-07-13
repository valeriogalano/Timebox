'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const {
  deleteRecurring,
  freezeWeeksBeforeRecurringChange,
  getWeekOverrides,
  resetAllData,
  saveClient,
  saveEntry,
  saveProject,
  saveRecurring,
  saveWeekOverride,
  setTodoistCache,
} = require('../../db/queries');

const RECURRING = [
  { id: 'r-am', clientId: 'c1', slot: 'am', day: 0, hours: 2, position: 0 },
  { id: 'r-pm', clientId: 'c2', slot: 'pm', day: 1, hours: 3, position: 0 },
];

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

describe('recurring freeze', () => {
  it('materializes used weeks before recurring template changes', () => {
    createTestDb();
    resetAllData();
    saveClient({ id: 'c1', name: 'Area 1', color: '#3B82F6', billable: true, billing: 'hourly', rate: 85, limitType: 'weekly', limitHours: null, position: 0 });
    saveClient({ id: 'c2', name: 'Area 2', color: '#F97316', billable: true, billing: 'hourly', rate: 85, limitType: 'weekly', limitHours: null, position: 1 });
    saveClient({ id: 'c3', name: 'Area 3', color: '#06B6D4', billable: false, billing: 'none', rate: 0, limitType: 'none', limitHours: null, position: 2 });
    saveProject({ id: 'p1', clientId: 'c1', name: 'Project 1', description: null, budgetHours: null, weeklyHours: null, position: 0, archived: false });

    const currentMonday = getMonday(new Date());
    const firstUsedMonday = addDays(currentMonday, -70);
    const emptyPastMonday = addDays(firstUsedMonday, 14);

    saveEntry({
      id: 'entry-used-week',
      projectId: 'p1',
      date: fmtDate(addDays(firstUsedMonday, 2)),
      hours: 1,
      billableHours: null,
      slot: 'am',
      billed: false,
    });
    setTodoistCache(fmtDate(addDays(firstUsedMonday, 21)), [
      { id: 'task-used-week', projectId: 'p1', content: 'Cached Todoist work', hours: 1, slot: 'am' },
    ], '2026-03-12T12:00:00.000Z');
    saveWeekOverride({
      weekKey: fmtDate(addDays(firstUsedMonday, 35)),
      dayIndex: 2,
      slot: 'am',
      blocks: [{ id: 'manual', clientId: 'c3', hours: 4 }],
    });

    freezeWeeksBeforeRecurringChange(RECURRING);

    assert.equal(getWeekOverrides(fmtDate(firstUsedMonday)).length, 21);
    assert.equal(getWeekOverrides(fmtDate(emptyPastMonday)).length, 21);
    assert.equal(getWeekOverrides(fmtDate(addDays(firstUsedMonday, 21))).length, 21);
    assert.equal(getWeekOverrides(fmtDate(addDays(firstUsedMonday, 35))).length, 21);
    assert.deepEqual(
      getWeekOverrides(fmtDate(addDays(firstUsedMonday, 35))).find(row => row.dayIndex === 2 && row.slot === 'am').blocks,
      [{ id: 'manual', clientId: 'c3', hours: 4 }],
      'keeps existing explicit weekly edits while freezing the remaining slots'
    );
  });

  // saveRecurring/deleteRecurring are the functions the HTTP server (and therefore
  // the MCP set_recurring_slot tool) call directly, without going through the
  // Electron IPC handler that used to be the only place calling freeze explicitly.
  it('saveRecurring and deleteRecurring auto-freeze past weeks (HTTP/MCP path)', () => {
    createTestDb();
    resetAllData();
    saveClient({ id: 'c1', name: 'Area 1', color: '#3B82F6', billable: true, billing: 'hourly', rate: 85, limitType: 'weekly', limitHours: null, position: 0 });
    saveClient({ id: 'c2', name: 'Area 2', color: '#F97316', billable: true, billing: 'hourly', rate: 85, limitType: 'weekly', limitHours: null, position: 1 });
    saveProject({ id: 'p1', clientId: 'c1', name: 'Project 1', description: null, budgetHours: null, weeklyHours: null, position: 0, archived: false });

    const currentMonday = getMonday(new Date());
    const pastMonday = addDays(currentMonday, -21);

    saveRecurring({ id: 'r-old', clientId: 'c1', slot: 'am', day: 0, hours: 2, position: 0 });

    saveEntry({
      id: 'entry-used-week',
      projectId: 'p1',
      date: fmtDate(addDays(pastMonday, 2)),
      hours: 1,
      billableHours: null,
      slot: 'am',
      billed: false,
    });

    // Simulate the set_recurring_slot MCP tool: delete the old block, add a new one.
    deleteRecurring('r-old');
    saveRecurring({ id: 'r-new', clientId: 'c2', slot: 'am', day: 0, hours: 3, position: 0 });

    assert.deepEqual(
      getWeekOverrides(fmtDate(pastMonday)).find(row => row.dayIndex === 0 && row.slot === 'am').blocks,
      [{ id: 'r-old', clientId: 'c1', hours: 2 }],
      'past week keeps the pre-change template even when saveRecurring/deleteRecurring are called directly'
    );
  });
});
