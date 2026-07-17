import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeProjectDayEntries,
  getEffectiveBlocks,
  computeDayPlanning,
} from '../dayPlanning.js';

describe('mergeProjectDayEntries', () => {
  test('sums the AM/PM rows of the same project+day into one entry', () => {
    const merged = mergeProjectDayEntries([
      { projectId: 1, date: '2026-07-15', hours: 2, billableHours: null, billed: true },
      { projectId: 1, date: '2026-07-15', hours: 3, billableHours: null, billed: true },
    ]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].hours, 5);
  });
  test('billableHours stays null when it equals total hours', () => {
    const [m] = mergeProjectDayEntries([
      { projectId: 1, date: '2026-07-15', hours: 2, billableHours: 2, billed: false },
      { projectId: 1, date: '2026-07-15', hours: 3, billableHours: 3, billed: false },
    ]);
    assert.equal(m.billableHours, null);
  });
  test('billableHours surfaces the summed billable when it diverges', () => {
    const [m] = mergeProjectDayEntries([
      { projectId: 1, date: '2026-07-15', hours: 2, billableHours: 1, billed: false },
      { projectId: 1, date: '2026-07-15', hours: 3, billableHours: 3, billed: false },
    ]);
    assert.equal(m.billableHours, 4);
  });
  test('billed is true only when every row is billed', () => {
    const [m] = mergeProjectDayEntries([
      { projectId: 1, date: '2026-07-15', hours: 2, billableHours: null, billed: true },
      { projectId: 1, date: '2026-07-15', hours: 3, billableHours: null, billed: false },
    ]);
    assert.equal(m.billed, false);
  });
  test('keeps distinct projects separate', () => {
    const merged = mergeProjectDayEntries([
      { projectId: 1, date: '2026-07-15', hours: 2, billableHours: null, billed: true },
      { projectId: 2, date: '2026-07-15', hours: 3, billableHours: null, billed: true },
    ]);
    assert.equal(merged.length, 2);
  });
});

describe('getEffectiveBlocks', () => {
  const recurring = [
    { id: 'b', day: 0, slot: 'am', clientId: 10, hours: 2, position: 1 },
    { id: 'a', day: 0, slot: 'am', clientId: 11, hours: 1, position: 0 },
    { id: 'c', day: 0, slot: 'pm', clientId: 10, hours: 3, position: 0 },
  ];
  test('returns recurring blocks for the day/slot sorted by position', () => {
    const blocks = getEffectiveBlocks(recurring, {}, 'w', 0, 'am');
    assert.deepEqual(blocks.map(b => b.id), ['a', 'b']);
  });
  test('a week override replaces the recurring blocks for that slot', () => {
    const overrides = { w: { 0: { am: [{ id: 'x', clientId: 99, hours: 4 }] } } };
    const blocks = getEffectiveBlocks(recurring, overrides, 'w', 0, 'am');
    assert.deepEqual(blocks.map(b => b.id), ['x']);
  });
  test('an override can clear a slot with an empty array', () => {
    const overrides = { w: { 0: { am: [] } } };
    assert.deepEqual(getEffectiveBlocks(recurring, overrides, 'w', 0, 'am'), []);
  });
});

describe('computeDayPlanning', () => {
  const clients = [{ id: 10 }, { id: 11 }];
  const projects = [
    { id: 100, clientId: 10 },
    { id: 110, clientId: 11 },
  ];
  const base = {
    dayIndex: 0, isToday: false, isFuture: false,
    weekOverrides: {}, weekKey: 'w',
    clients, projects,
  };

  test('computes planned/logged totals and the delta', () => {
    const r = computeDayPlanning({
      ...base,
      recurring: [{ id: 'b1', day: 0, slot: 'am', clientId: 10, hours: 4, position: 0 }],
      rawDayEntries: [{ projectId: 100, slot: 'am', hours: 3 }],
      dayEntries: [{ projectId: 100, hours: 3 }],
    });
    assert.equal(r.plannedTotal, 4);
    assert.equal(r.dayHours, 3);
    assert.equal(r.delta, -1);
    assert.equal(r.amLogged, 3);
  });

  test('logging against an unplanned client shows up as extra', () => {
    const r = computeDayPlanning({
      ...base,
      recurring: [{ id: 'b1', day: 0, slot: 'am', clientId: 10, hours: 4, position: 0 }],
      rawDayEntries: [{ projectId: 110, slot: 'am', hours: 2 }],
      dayEntries: [{ projectId: 110, hours: 2 }],
    });
    const extra = r.extraBlocks.find(b => b.clientId === '11');
    assert.ok(extra, 'expected an extra block for the unplanned client');
    assert.equal(extra.hours, 2);
  });

  test('blocks for clients not in the client list are filtered out', () => {
    const r = computeDayPlanning({
      ...base,
      recurring: [{ id: 'ghost', day: 0, slot: 'am', clientId: 999, hours: 4, position: 0 }],
      rawDayEntries: [],
      dayEntries: [],
    });
    assert.equal(r.plannedTotal, 0);
    assert.equal(r.visibleBlocks.length, 0);
  });

  test('uncovered Todoist tasks become orphans only for today/future', () => {
    const args = {
      ...base,
      recurring: [],
      rawDayEntries: [],
      dayEntries: [],
      todoistTasks: [{ projectId: 100, slot: 'am', hours: 2 }],
    };
    assert.equal(computeDayPlanning({ ...args, isFuture: false }).orphanTodoist.length, 0);
    const future = computeDayPlanning({ ...args, isFuture: true }).orphanTodoist;
    assert.equal(future.length, 1);
    assert.equal(future[0].hours, 2);
  });
});
