'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const { getEntriesData } = require('../commands/entries');
const { getClients, getProjects, saveClient, saveEntry } = require('../../db/queries');

const ALL = { from: '2000-01-01', to: '2999-12-31' };
const sum = (rows, key) => rows.reduce((s, r) => s + r[key], 0);

describe('getEntriesData', () => {
  let hourly;
  let flat;

  before(() => {
    createTestDb();
    // Due aree a regime noto e due entry in una data lontana dai dati demo.
    const [a, b] = getClients();
    saveClient({ ...a, billing: 'hourly' });
    saveClient({ ...b, billing: 'fixed' });
    hourly = getProjects().find(p => p.clientId === a.id);
    flat = getProjects().find(p => p.clientId === b.id);
    saveEntry({ id: 'x-pm', projectId: hourly.id, date: '2031-03-04', hours: 2, billableHours: 3, slot: 'pm', billed: true });
    saveEntry({ id: 'x-am', projectId: hourly.id, date: '2031-03-04', hours: 1, slot: 'am', billed: false });
    saveEntry({ id: 'x-flat', projectId: flat.id, date: '2031-03-05', hours: 4, billableHours: 9, slot: 'am', billed: true });
  });

  test('restituisce le entry del solo intervallo, per data e senza fascia', () => {
    const d = getEntriesData({ from: '2031-03-04', to: '2031-03-05' });
    assert.deepEqual(d.entries.map(e => e.id).sort(), ['x-am', 'x-flat', 'x-pm']);
    assert.deepEqual(d.entries.map(e => e.date), ['2031-03-04', '2031-03-04', '2031-03-05']);
    assert.ok(d.entries.every(e => !('slot' in e)));
    assert.equal(d.total, 7);
    assert.equal(d.entries[0].project, hourly.name);
  });

  test('ore fatturabili e fatturato solo nelle aree a ore', () => {
    const d = getEntriesData({ from: '2031-03-04', to: '2031-03-05' });
    const byId = Object.fromEntries(d.entries.map(e => [e.id, e]));
    const [am, pm, fixed] = [byId['x-am'], byId['x-pm'], byId['x-flat']];
    assert.equal(am.billableHours, 1);       // senza override vale il lavorato
    assert.equal(pm.billableHours, 3);
    assert.equal(pm.billed, true);
    assert.equal(fixed.billableHours, null);  // a corpo: il valore salvato resta nascosto
    assert.equal(fixed.billed, null);
  });

  test('totali per area e per progetto, sui due conteggi', () => {
    const d = getEntriesData({ from: '2031-03-04', to: '2031-03-05' });
    const byArea = Object.fromEntries(d.byArea.map(a => [a.area, a]));
    assert.deepEqual(d.byArea.map(a => a.hours), [4, 3]);   // dal più grande
    const areaOf = id => d.entries.find(e => e.id === id).area;
    assert.equal(byArea[areaOf('x-am')].billableHours, 4);
    assert.equal(byArea[areaOf('x-flat')].billableHours, null);
    assert.equal(d.byProject.length, 2);
    assert.equal(sum(d.byProject, 'hours'), d.total);
  });

  test('filtra per area e per progetto, parziale e senza maiuscole', () => {
    const area = getClients().find(c => c.id === hourly.clientId).name;
    const d = getEntriesData({ ...ALL, areaFilter: area.slice(0, 3).toUpperCase() });
    assert.ok(d.entries.length > 0);
    assert.ok(d.entries.every(e => e.area.toLowerCase().includes(area.slice(0, 3).toLowerCase())));

    const p = getEntriesData({ ...ALL, projectFilter: flat.name.toLowerCase() });
    assert.ok(p.entries.some(e => e.id === 'x-flat'));
    assert.ok(p.entries.every(e => e.project.toLowerCase().includes(flat.name.toLowerCase())));

    assert.deepEqual(getEntriesData({ ...ALL, areaFilter: 'nessunaareacosi' }).entries, []);
  });
});
