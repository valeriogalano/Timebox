'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const {
  getEntries, saveEntry, saveWeekOverride, moveEntrySlot,
  ensureSlotsTrackedSince, getSlotsTrackedSince, setSetting,
} = require('../../db/queries');
const { getPlanVsTrackedData } = require('../commands/plan-vs-tracked');

const DAY = '2031-03-04';
const entriesOf = date => getEntries(date, date).filter(e => e.projectId === 'p1');

describe('moveEntrySlot', () => {
  before(() => createTestDb());

  test('moves an entry to a free slot, keeping id, hours and billing', () => {
    saveEntry({ id: 'm1', projectId: 'p1', date: DAY, hours: 2, billableHours: 1.5, slot: 'am', billed: true });
    const result = moveEntrySlot('m1', 'pm');
    assert.equal(result.merged, false);
    assert.deepEqual(entriesOf(DAY).map(e => [e.id, e.slot, e.hours, e.billableHours, e.billed]), [['m1', 'pm', 2, 1.5, true]]);
  });

  test('the same slot is a no-op', () => {
    assert.deepEqual(moveEntrySlot('m1', 'pm'), { entry: entriesOf(DAY)[0], merged: false });
  });

  test('merges into the entry already in the target slot: hours and billable summed, billed only if both', () => {
    saveEntry({ id: 'm2', projectId: 'p1', date: DAY, hours: 1, billableHours: null, slot: 'sera', billed: false });
    const result = moveEntrySlot('m1', 'sera');
    assert.equal(result.merged, true);
    assert.deepEqual(entriesOf(DAY).map(e => [e.id, e.slot, e.hours, e.billableHours, e.billed]), [['m2', 'sera', 3, 2.5, false]]);
    assert.deepEqual(result.entry, entriesOf(DAY)[0]);
  });

  test('unknown id → null; unknown slot → error, nothing written', () => {
    assert.equal(moveEntrySlot('nope', 'am'), null);
    assert.throws(() => moveEntrySlot('m2', 'night'), /Invalid slot/);
    assert.equal(entriesOf(DAY)[0].slot, 'sera');
  });
});

describe('slotsTrackedSince', () => {
  before(() => createTestDb());

  test('is set on first call only', () => {
    assert.equal(getSlotsTrackedSince(), null);
    assert.equal(ensureSlotsTrackedSince('2026-10-17'), '2026-10-17');
    assert.equal(ensureSlotsTrackedSince('2026-12-01'), '2026-10-17');
    assert.equal(getSlotsTrackedSince(), '2026-10-17');
  });
});

describe('getPlanVsTrackedData', () => {
  // Martedì 4 e mercoledì 5 marzo 2031, settimana del 3. Il 4: c1 pianificata 2h al
  // mattino e 2h al pomeriggio, lavorate 3h tutte al pomeriggio, più 1h di c2 (fuori piano).
  before(() => {
    createTestDb();
    saveWeekOverride({ weekKey: '2031-03-03', dayIndex: 1, slot: 'am', blocks: [{ id: 'a', clientId: 'c1', hours: 2 }] });
    saveWeekOverride({ weekKey: '2031-03-03', dayIndex: 1, slot: 'pm', blocks: [{ id: 'b', clientId: 'c1', hours: 2 }] });
    saveWeekOverride({ weekKey: '2031-03-03', dayIndex: 1, slot: 'sera', blocks: [] });
    saveEntry({ id: 'w1', projectId: 'p1', date: DAY, hours: 3, billableHours: null, slot: 'pm', billed: false });
    saveEntry({ id: 'w2', projectId: 'p6', date: DAY, hours: 1, billableHours: null, slot: 'sera', billed: false });
  });

  test('without a start date every day is unreliable and the totals stay empty', () => {
    const d = getPlanVsTrackedData({ from: DAY, to: DAY });
    assert.equal(d.slotsTrackedSince, null);
    assert.deepEqual(d.unreliableDays, [DAY]);
    assert.match(d.warning, /not reliable/);
    assert.equal(d.totals.trackedHours, 0);
  });

  test('per slot and area: planned, covered by block filling and worked in that slot', () => {
    setSetting('slotsTrackedSince', '2031-03-05');
    const d = getPlanVsTrackedData({ from: DAY, to: '2031-03-05' });
    assert.deepEqual(d.days.map(x => [x.date, x.slotReliable]), [[DAY, false], ['2031-03-05', true]]);
    assert.deepEqual(d.unreliableDays, [DAY]);

    const [day] = d.days;
    const area = (slot, id) => day.slots.find(s => s.slot === slot).areas.find(a => a.areaId === id);
    assert.deepEqual(area('am', 'c1'), { areaId: 'c1', area: area('am', 'c1').area, plannedHours: 2, coveredHours: 2, trackedHours: 0, deltaHours: -2 });
    assert.deepEqual([area('pm', 'c1').coveredHours, area('pm', 'c1').trackedHours, area('pm', 'c1').deltaHours], [1, 3, 1]);
    const sera = day.slots.find(s => s.slot === 'sera').areas;
    assert.deepEqual(sera.map(a => [a.plannedHours, a.trackedHours]), [[0, 1]]);
    assert.equal(day.extraHours, 1);
    assert.deepEqual([day.plannedHours, day.coveredHours, day.trackedHours], [4, 3, 4]);
  });

  test('totals count reliable days only', () => {
    setSetting('slotsTrackedSince', '2031-01-01');
    const d = getPlanVsTrackedData({ from: DAY, to: DAY });
    assert.equal(d.warning, null);
    assert.deepEqual([d.totals.plannedHours, d.totals.coveredHours, d.totals.trackedHours, d.totals.extraHours], [4, 3, 4, 1]);
    assert.deepEqual(d.totals.bySlot.pm, { plannedHours: 2, coveredHours: 1, trackedHours: 3 });
  });
});
