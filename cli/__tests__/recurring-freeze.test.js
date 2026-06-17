'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const {
  freezeWeeksBeforeRecurringChange,
  getWeekOverrides,
  resetAllData,
  saveEntry,
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

    assert.equal(getWeekOverrides(fmtDate(firstUsedMonday)).length, 14);
    assert.equal(getWeekOverrides(fmtDate(emptyPastMonday)).length, 14);
    assert.equal(getWeekOverrides(fmtDate(addDays(firstUsedMonday, 21))).length, 14);
    assert.equal(getWeekOverrides(fmtDate(addDays(firstUsedMonday, 35))).length, 14);
    assert.deepEqual(
      getWeekOverrides(fmtDate(addDays(firstUsedMonday, 35))).find(row => row.dayIndex === 2 && row.slot === 'am').blocks,
      [{ id: 'manual', clientId: 'c3', hours: 4 }],
      'keeps existing explicit weekly edits while freezing the remaining slots'
    );
  });
});
