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
import { gapWithinTolerance, templateHoursByArea, weekTargets, areaGaps, targetWarnings, GAP_EPSILON } from '../area-targets.js';
import { TOL_HOURS, TOL_PCT } from '../progress-insights.js';
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

  test('verdict tolerance constants', () => {
    assert.deepEqual([cjs.TOL_HOURS, cjs.TOL_PCT, cjs.GAP_EPSILON], [TOL_HOURS, TOL_PCT, GAP_EPSILON]);
  });
  same('gapWithinTolerance', gapWithinTolerance, cjs.gapWithinTolerance, [[0.5, 4], [-0.51, 4], [2, 20], [-2.1, 20], [0, 0]]);
  same('templateHoursByArea', templateHoursByArea, cjs.templateHoursByArea, [
    [[{ clientId: 'c1', day: 0, hours: 2 }, { clientId: 'c1', day: 6, hours: 1 }, { clientId: 'c2', day: 3, hours: 4 }, { clientId: 'c2', day: 7, hours: 9 }]],
    [[]],
  ]);
  same('weekTargets', weekTargets, cjs.weekTargets, [
    [{ areaIds: ['c1', 'c2'], templateByArea: { c1: 10 } }],
    [{ areaIds: ['c1'], rows: [{ areaId: 'c1', hours: 12 }, { areaId: 'c1', hours: 8 }, { areaId: 'zz', hours: 3 }], templateByArea: { c1: 10 } }],
  ]);
  const plannedByDay = [{ c1: 4 }, { c1: 4 }, { c1: 4, c2: 2 }, { c1: 4 }, { c1: 4 }, {}, {}];
  const doneByDay = [{ c1: 4 }, { c1: 3, c3: 1 }, { c1: 1 }, {}, {}, {}, {}];
  same('areaGaps', areaGaps, cjs.areaGaps, [
    [{ targets: { c1: 20, c2: 2 }, plannedByDay, doneByDay, todayIdx: 2 }],
    [{ targets: { c1: 20 }, plannedByDay, doneByDay, todayIdx: 7 }],
    [{ targets: {}, plannedByDay, doneByDay, todayIdx: -1 }],
  ]);
  same('targetWarnings', targetWarnings, cjs.targetWarnings, [
    [{ client: { limitType: 'weekly', limitHours: 20 }, target: 30, status: 'active' }],
    [{ client: { limitType: 'global', limitHours: 20 }, target: 30, status: 'closed' }],
    [{ client: null, target: 0, status: 'closed' }],
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

// The CLI/MCP parser (parseHoursStrict) reads the same forms as the renderer.
// One difference is deliberate: a bare number above the minutes threshold ("90")
// is minutes in the UI and hours for an agent, where it is then out of range.
test('hours parser: the CLI reads the forms the renderer reads', () => {
  for (const text of ['', '2', '2.5', '2,5', '2:30', '1h 30m', '2h', '45m', '9']) {
    assert.equal(cjs.parseHoursStrict(text), parseHHMM(text, 9), text);
  }
  assert.equal(cjs.parseHoursStrict('90'), 90);
  assert.equal(parseHHMM('90', 9), 1.5);
});
