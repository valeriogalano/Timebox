'use strict';

// "Blocchi pianificati senza azioni": per il giorno corrente le fasce già finite
// (mattina alle 13, pomeriggio alle 18) non contano. Orologio fisso passato come `now`.

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const { isSlotOver } = require('../../lib/time-slots');
const { getDayMismatchesData } = require('../commands/day-mismatches');
const { getDayFreeCapacityData } = require('../commands/day-free-capacity');
const { getDayReadyBlocksData } = require('../commands/day-ready-blocks');
const { saveWeekOverride } = require('../../db/queries');

const DATE = '2031-03-04';
const WEEK = '2031-03-03';
const at = time => new Date(`${DATE}T${time}`);

describe('isSlotOver', () => {
  test('sul giorno corrente le fasce finiscono alle 13 e alle 18', () => {
    assert.equal(isSlotOver('am', DATE, at('12:59:00')), false);
    assert.equal(isSlotOver('am', DATE, at('13:00:00')), true);
    assert.equal(isSlotOver('pm', DATE, at('17:59:00')), false);
    assert.equal(isSlotOver('pm', DATE, at('18:00:00')), true);
    assert.equal(isSlotOver('sera', DATE, at('23:59:00')), false);
  });

  test('giorni passati e futuri restano invariati', () => {
    assert.equal(isSlotOver('am', '2031-03-03', at('20:00:00')), false);
    assert.equal(isSlotOver('am', '2031-03-05', at('20:00:00')), false);
  });
});

describe('blocchi senza azioni e fasce finite', () => {
  before(() => {
    createTestDb();
    saveWeekOverride({ weekKey: WEEK, dayIndex: 1, slot: 'am', blocks: [{ id: 'o-am', clientId: 'c1', hours: 2 }] });
    saveWeekOverride({ weekKey: WEEK, dayIndex: 1, slot: 'pm', blocks: [{ id: 'o-pm', clientId: 'c1', hours: 3 }] });
    saveWeekOverride({ weekKey: WEEK, dayIndex: 1, slot: 'sera', blocks: [{ id: 'o-se', clientId: 'c2', hours: 2 }] });
  });

  const slotsOf = list => list.map(b => b.slot);

  for (const [time, expected, hours] of [
    ['09:00:00', ['am', 'pm', 'sera'], 7],
    ['14:00:00', ['pm', 'sera'], 5],
    ['19:00:00', ['sera'], 2],
  ]) {
    test(`alle ${time} GUI e MCP vedono le stesse fasce`, () => {
      const now = at(time);
      assert.deepEqual(slotsOf(getDayMismatchesData(DATE, now).mismatches.blocksWithoutReadyTasks), expected);
      assert.deepEqual(slotsOf(getDayReadyBlocksData(DATE, now).groups), expected);
      const free = getDayFreeCapacityData(DATE, now);
      assert.deepEqual(slotsOf(free.reservedWithoutTasks), expected);
      assert.equal(free.totals.reservedWithoutTasksHours, hours);
    });
  }

  test('un altro giorno non cambia', () => {
    const now = new Date('2031-03-05T20:00:00');
    assert.equal(getDayMismatchesData(DATE, now).counts.blocksWithoutReadyTasks, 3);
  });
});
