'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const { getClients, saveClient, deleteClient, saveWeekOverride, getWeekOverrides } = require('../../db/queries');

describe('deleting an area cleans the week overrides', () => {
  test('its blocks leave every override, the other areas stay', () => {
    createTestDb();
    const [keep] = getClients();
    saveClient({ id: 'gone', name: 'Gone', color: 'grey', billable: false, billing: 'none', rate: null,
      limitType: 'none', limitHours: null, position: 99, defaultStatus: 'active' });
    saveWeekOverride({ weekKey: '2020-06-15', dayIndex: 0, slot: 'am',
      blocks: [{ id: 'b1', clientId: 'gone', hours: 2 }, { id: 'b2', clientId: keep.id, hours: 1 }] });
    saveWeekOverride({ weekKey: '2020-06-15', dayIndex: 1, slot: 'pm',
      blocks: [{ id: 'b3', clientId: 'gone', hours: 3 }] });

    deleteClient('gone');

    const bySlot = Object.fromEntries(getWeekOverrides('2020-06-15').map(o => [`${o.dayIndex}-${o.slot}`, o]));
    const blocksOf = key => bySlot[key].blocks;
    assert.deepEqual(blocksOf('0-am').map(b => b.clientId), [keep.id]);
    assert.deepEqual(blocksOf('1-pm'), [], 'the slot stays explicitly empty');
  });
});
