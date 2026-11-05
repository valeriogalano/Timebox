'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const {
  deleteRecurring,
  freezeWeeksBeforeRecurringChange,
  getRecurring,
  getWeekOverrides,
  replaceRecurringSlot,
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
  // Local date formatting on purpose: toISOString() is UTC and, in a timezone
  // ahead of UTC (e.g. Europe/Rome), turns a local Monday midnight into the
  // previous day (a Sunday) — exactly the bug this suite exercises elsewhere.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
    assert.equal(getWeekOverrides(fmtDate(addDays(firstUsedMonday, 21))).length, 21, 'past week with only Todoist cache is still within the past range');
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

  function seed() {
    createTestDb();
    resetAllData();
    saveClient({ id: 'c1', name: 'Area 1', color: '#3B82F6', billable: true, billing: 'hourly', rate: 85, limitType: 'weekly', limitHours: null, position: 0 });
    saveClient({ id: 'c2', name: 'Area 2', color: '#F97316', billable: true, billing: 'hourly', rate: 85, limitType: 'weekly', limitHours: null, position: 1 });
    saveProject({ id: 'p1', clientId: 'c1', name: 'Project 1', description: null, budgetHours: null, weeklyHours: null, position: 0, archived: false });
    saveRecurring({ id: 'r-old', clientId: 'c1', slot: 'am', day: 0, hours: 2, position: 0 });
  }
  const entry = (id, date) => saveEntry({ id, projectId: 'p1', date, hours: 1, billableHours: null, slot: 'am', billed: false });
  const todayIndex = (new Date().getDay() + 6) % 7;

  it('freezes only the days before today in the current week, and never future weeks', () => {
    seed();
    const monday = getMonday(new Date());
    entry('e-now', fmtDate(monday));
    entry('e-future', fmtDate(addDays(monday, 14)));
    setTodoistCache(fmtDate(addDays(monday, 21)), [
      { id: 't1', projectId: 'p1', content: 'x', hours: 1, slot: 'am' },
    ], '2026-03-12T12:00:00.000Z');
    saveWeekOverride({ weekKey: fmtDate(addDays(monday, 28)), dayIndex: 1, slot: 'am', blocks: [] });

    freezeWeeksBeforeRecurringChange(getRecurring());

    const current = getWeekOverrides(fmtDate(monday));
    assert.equal(current.length, todayIndex * 3);
    assert.ok(current.every(r => r.dayIndex < todayIndex), 'today and later days are not frozen');
    assert.equal(getWeekOverrides(fmtDate(addDays(monday, 7))).length, 0);
    assert.equal(getWeekOverrides(fmtDate(addDays(monday, 14))).length, 0, 'future week with an entry');
    assert.equal(getWeekOverrides(fmtDate(addDays(monday, 21))).length, 0, 'future week with Todoist cache');
    assert.equal(getWeekOverrides(fmtDate(addDays(monday, 28))).length, 1, 'future explicit override untouched');
  });

  it('Todoist cache alone does not make a past week the starting point', () => {
    seed();
    const monday = getMonday(new Date());
    setTodoistCache(fmtDate(addDays(monday, -14)), [
      { id: 't1', projectId: 'p1', content: 'x', hours: 1, slot: 'am' },
    ], '2026-03-12T12:00:00.000Z');
    freezeWeeksBeforeRecurringChange(getRecurring());
    assert.equal(getWeekOverrides(fmtDate(addDays(monday, -14))).length, 0);
  });

  it('replaceRecurringSlot freezes past weeks and replaces the slot', () => {
    seed();
    const pastMonday = addDays(getMonday(new Date()), -14);
    entry('e-past', fmtDate(pastMonday));
    const { removed, created } = replaceRecurringSlot(0, 'am', [{ clientId: 'c2', hours: 3 }]);
    assert.equal(removed, 1);
    assert.equal(created.length, 1);
    assert.deepEqual(getRecurring().map(r => [r.clientId, r.hours]), [['c2', 3]]);
    assert.deepEqual(
      getWeekOverrides(fmtDate(pastMonday)).find(r => r.dayIndex === 0 && r.slot === 'am').blocks,
      [{ id: 'r-old', clientId: 'c1', hours: 2 }]
    );
  });

  it('replaceRecurringSlot rejects an invalid block without deleting or freezing anything', () => {
    seed();
    entry('e-past', fmtDate(addDays(getMonday(new Date()), -14)));
    for (const [slot, blocks] of [
      ['am', [{ clientId: 'c2', hours: 1 }, { clientId: 'Area 2', hours: 1 }]],
      ['am', [{ clientId: 'c2', hours: -1 }]],
      ['am', [{ clientId: 'c2', hours: 0 }]],
      ['night', [{ clientId: 'c2', hours: 1 }]],
    ]) {
      assert.throws(() => replaceRecurringSlot(0, slot, blocks));
    }
    assert.throws(() => replaceRecurringSlot(7, 'am', []));
    assert.deepEqual(getRecurring().map(r => r.id), ['r-old']);
    assert.equal(getWeekOverrides(fmtDate(addDays(getMonday(new Date()), -14))).length, 0);
  });
});
