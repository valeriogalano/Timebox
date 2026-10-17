'use strict';

// Due misure distinte per fascia: il riempimento distribuisce le ore di un'area sui
// suoi blocchi del giorno, qualunque fascia abbia l'entry; le ore lavorate per fascia
// vengono invece dalla fascia delle entry.

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const { getDaySummaryData } = require('../commands/day-summary');
const { getDayFreeCapacityData } = require('../commands/day-free-capacity');
const { getDayMismatchesData } = require('../commands/day-mismatches');
const { getProjects, saveEntry, deleteEntry, saveWeekOverride } = require('../../db/queries');

// Un martedì lontano dai dati demo: 2031-03-04, settimana del 2031-03-03.
const DATE = '2031-03-04';
const WEEK = '2031-03-03';

describe('ore registrate e fasce', () => {
  let project;

  before(() => {
    createTestDb();
    project = getProjects().find(p => p.clientId === 'c1');
    // Area c1 pianificata 2h al mattino e 3h al pomeriggio; c2 2h la sera.
    saveWeekOverride({ weekKey: WEEK, dayIndex: 1, slot: 'am', blocks: [{ id: 't-am', clientId: 'c1', hours: 2 }] });
    saveWeekOverride({ weekKey: WEEK, dayIndex: 1, slot: 'pm', blocks: [{ id: 't-pm', clientId: 'c1', hours: 3 }] });
    saveWeekOverride({ weekKey: WEEK, dayIndex: 1, slot: 'sera', blocks: [{ id: 't-se', clientId: 'c2', hours: 2 }] });
    // Tutte le ore di c1 in un'unica entry, che il salvataggio mette al mattino.
    saveEntry({ id: 't-entry', projectId: project.id, date: DATE, hours: 4, billableHours: null, slot: 'am', billed: false });
  });

  test('il riepilogo distribuisce le ore sui blocchi dell\'area in ordine di fascia', () => {
    const d = getDaySummaryData(DATE);
    assert.deepEqual(d.slots.am.trackedByArea, { c1: 2 });
    assert.deepEqual(d.slots.pm.trackedByArea, { c1: 2 });
    assert.deepEqual(d.slots.sera.trackedByArea, {});
    assert.deepEqual([d.slots.am.trackedHours, d.slots.pm.trackedHours, d.slots.sera.trackedHours], [2, 2, 0]);
    assert.equal(d.trackedHours, 4);
    assert.equal(d.extraHours, 0);
  });

  test('le ore lavorate per fascia vengono dalla fascia delle entry, accanto al riempimento', () => {
    const d = getDaySummaryData(DATE);
    assert.equal(d.trackedEntries.length, 1);
    assert.equal(d.trackedEntries[0].slot, 'am');
    // Il riempimento mette 2h al mattino e 2h al pomeriggio; il lavoro sta tutto al mattino.
    assert.deepEqual([d.slots.am.actualByArea, d.slots.pm.actualByArea, d.slots.sera.actualByArea], [{ c1: 4 }, {}, {}]);
    assert.deepEqual([d.slots.am.actualHours, d.slots.pm.actualHours, d.slots.sera.actualHours], [4, 0, 0]);

    saveEntry({ id: 't-sera', projectId: project.id, date: DATE, hours: 1, billableHours: null, slot: 'sera', billed: false });
    const after = getDaySummaryData(DATE);
    assert.deepEqual(after.slots.sera.actualByArea, { c1: 1 });
    assert.deepEqual(after.slots.am.trackedByArea, { c1: 2 });
    assert.deepEqual(after.slots.pm.trackedByArea, { c1: 3 });
    deleteEntry('t-sera');
  });

  test('le ore oltre il piano dell\'area sono extra, non di una fascia', () => {
    saveEntry({ id: 't-entry', projectId: project.id, date: DATE, hours: 6, billableHours: null, slot: 'am', billed: false });
    const d = getDaySummaryData(DATE);
    assert.deepEqual([d.slots.am.trackedHours, d.slots.pm.trackedHours], [2, 3]);
    assert.equal(d.extraHours, 1);
    saveEntry({ id: 't-entry', projectId: project.id, date: DATE, hours: 4, billableHours: null, slot: 'am', billed: false });
  });

  test('capacità libera: il blocco del pomeriggio risulta coperto per le ore che gli spettano', () => {
    const d = getDayFreeCapacityData(DATE);
    const c1 = d.reservedWithoutTasks.filter(r => r.areaId === 'c1');
    // 2h del mattino coperte, del pomeriggio resta 1h su 3: prima erano 3h scoperte
    assert.deepEqual(c1.map(r => [r.slot, r.trackedHours, r.reservedWithoutTasksHours]), [['pm', 2, 1]]);
  });

  test('mismatch: solo l\'ora scoperta del pomeriggio resta un blocco senza azioni', () => {
    const d = getDayMismatchesData(DATE);
    const c1 = d.mismatches.blocksWithoutReadyTasks.filter(b => b.areaId === 'c1');
    assert.deepEqual(c1.map(b => [b.slot, b.trackedHours, b.availableHours]), [['pm', 2, 1]]);
  });
});
