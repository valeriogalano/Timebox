// The renderer (ESM, src/) and the CLI/MCP (CommonJS, lib/domain.js) keep twin
// copies of the same rules. AGENTS.md asks for them to stay in step, but nothing
// checked it: this suite feeds both copies the same cases and wants the same
// answers. A rule changed in one copy only now fails here.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { capUsage } from '../cap-usage.js';
import { resolveEntrySlot, defaultEntrySlot, planDayEntrySave, fillPlannedBlocks } from '../dayPlanning.js';
import { weekForecast, forecastTodayIndex } from '../week-forecast.js';
import { fmtH, isHourly, effBillable, slotForDate, getMondayOfWeek, addDays, fmt, parseHHMM } from '../utils.js';

const cjs = createRequire(import.meta.url)('../../lib/domain.js');

function same(name, esm, twin, cases) {
  test(name, () => {
    for (const args of cases) {
      assert.deepEqual(twin(...args), esm(...args), `${name}(${JSON.stringify(args)})`);
    }
  });
}

const blocks = { am: [{ id: 'b1', clientId: 'c1', hours: 2 }], pm: [{ id: 'b2', clientId: 'c2', hours: 3 }], sera: [] };
const blocksForSlot = slot => blocks[slot] ?? [];

describe('src/ and lib/domain.js give the same answers', () => {
  same('capUsage', capUsage, cjs.capUsage, [[], [10], [10, 12], [10, 12, true], [12, 10, true], [0, 0, true]]);

  same('resolveEntrySlot', resolveEntrySlot, cjs.resolveEntrySlot, [
    [{ existingSlot: 'sera', clientId: 'c1', blocksForSlot }],
    [{ existingSlot: null, clientId: 'c2', blocksForSlot }],
    [{ existingSlot: null, clientId: 'c9', blocksForSlot }],
    [{ existingSlot: null, clientId: 'c9', blocksForSlot, fallback: 'pm' }],
  ]);

  same('defaultEntrySlot', defaultEntrySlot, cjs.defaultEntrySlot, [
    [{ isToday: false, clientId: 'c2', blocksForSlot }],
    [{ isToday: false, clientId: 'c9', blocksForSlot }],
    [{ isToday: true, clientId: 'c2', blocksForSlot }],
  ]);

  const existingList = [
    { id: 'e1', projectId: 'p1', date: '2026-11-02', hours: 2, billableHours: null, slot: 'am', billed: true },
    { id: 'e2', projectId: 'p1', date: '2026-11-02', hours: 1, billableHours: 1.5, slot: 'pm', billed: false },
  ];
  same('planDayEntrySave', planDayEntrySave, cjs.planDayEntrySave, [
    [{ existingList, projectId: 'p1', date: '2026-11-02', hours: 3, slot: 'am', newId: 'n1' }],
    [{ existingList, projectId: 'p1', date: '2026-11-02', hours: 0, slot: 'pm', newId: 'n1' }],
    [{ existingList, projectId: 'p1', date: '2026-11-02', hours: 1, slot: 'sera', newId: 'n1' }],
    [{ existingList: [], projectId: 'p2', date: '2026-11-02', hours: 2, billableHours: 1, slot: 'am', newId: 'n2' }],
  ]);

  same('fillPlannedBlocks', fillPlannedBlocks, cjs.fillPlannedBlocks, [
    [[{ id: 'b1', clientId: 'c1', hours: 2 }, { id: 'b2', clientId: 'c1', hours: 2 }], { c1: 3 }],
    [[{ id: 'b1', clientId: 'c1', hours: 2 }], { c1: 5 }],
    [[{ id: 'b1', clientId: 'c1', hours: 2 }, { id: 'b2', clientId: 'c2', hours: 1 }], {}],
  ]);

  same('forecastTodayIndex', forecastTodayIndex, cjs.forecastTodayIndex, [
    ['2026-11-02', '2026-11-04'], ['2026-11-02', '2026-10-30'], ['2026-11-02', '2026-11-10'], ['2026-11-02', '2026-11-02'],
  ]);

  same('weekForecast', weekForecast, cjs.weekForecast, [
    [{ plannedByDay: [4, 4, 4, 4, 4, 0, 0], doneByDay: [4, 5, 2, 0, 0, 0, 0], todayIdx: 2 }],
    [{ plannedByDay: [4, 4, 4, 4, 4, 0, 0], doneByDay: [4, 5, 2, 6, 0, 0, 0], todayIdx: 7 }],
    [{ plannedByDay: [4, 4, 4, 4, 4, 0, 0], doneByDay: [0, 0, 0, 0, 0, 0, 0], todayIdx: -1 }],
  ]);

  same('fmtH', fmtH, cjs.fmtH, [[0], [2.5], [3], [0.25], [1 / 3], [-1.5], [12.75]]);
  same('isHourly', isHourly, cjs.isHourly, [[{ billing: 'hourly' }], [{ billing: 'fixed' }], [{}], [undefined]]);
  same('effBillable', effBillable, cjs.effBillable, [[{ hours: 2, billableHours: null }], [{ hours: 2, billableHours: 1.5 }]]);
  same('slotForDate', slotForDate, cjs.slotForDate, [
    [new Date(2026, 10, 4, 9)], [new Date(2026, 10, 4, 12, 59)], [new Date(2026, 10, 4, 13)], [new Date(2026, 10, 4, 17, 59)], [new Date(2026, 10, 4, 18)],
  ]);
  same('getMondayOfWeek', d => fmt(getMondayOfWeek(d)), d => cjs.fmt(cjs.getMondayOfWeek(d)), [
    [new Date(2026, 10, 4)], [new Date(2026, 10, 8)], [new Date(2026, 10, 2)], [new Date(2026, 2, 29)],
  ]);
  same('addDays', (d, n) => fmt(addDays(d, n)), (d, n) => cjs.fmt(cjs.addDays(d, n)), [
    [new Date(2026, 9, 24), 7], [new Date(2026, 2, 28), 1], [new Date(2026, 11, 31), 1],
  ]);
});

// The one known divergence (audit I4 / 1.2 / 3.1): the CLI reads "1h 30m" as 1
// and has no minutes threshold. Kept visible as a todo until one parser serves
// both: it reports the mismatch without failing the suite.
test('hours parser: the CLI reads the display format like the renderer', {
  todo: 'known divergence, see audit I4: lib/domain.js parseHours lacks "1h 30m" and the minutes threshold',
}, () => {
  for (const text of ['2', '2.5', '2:30', '1h 30m', '45m', '90']) {
    assert.equal(cjs.parseHours(text), parseHHMM(text, 9), text);
  }
});
