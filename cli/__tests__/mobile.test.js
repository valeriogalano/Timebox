'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const { getMobileDayData, saveMobileHours, parseClock, isDate } = require('../commands/mobile');
const { getEntries, getProjects, saveEntry, saveProject, saveWeekOverride } = require('../../db/queries');

// Un martedì lontano dai dati demo.
const DATE = '2031-03-04';
const WEEK = '2031-03-03';
const entriesOf = projectId => getEntries(DATE, DATE).filter(e => e.projectId === projectId);

describe('parseClock e isDate', () => {
  test('accetta solo H:MM entro le 24 ore; vuoto vale zero', () => {
    assert.equal(parseClock('1:30'), 1.5);
    assert.equal(parseClock('0:15'), 0.25);
    assert.equal(parseClock('24:00'), 24);
    assert.equal(parseClock(''), 0);
    assert.equal(parseClock(undefined), 0);
    for (const bad of ['24:15', '1:60', '1:5', '90', '1.5', '-1:00', '1:30:00', 'abc', 1.5, {}]) {
      assert.equal(parseClock(bad), null, String(bad));
    }
  });

  test('isDate vuole una data vera in forma YYYY-MM-DD', () => {
    assert.ok(isDate('2031-03-04'));
    for (const bad of ['2031-3-4', '04/03/2031', '2031-13-40', '', null, 20310304]) assert.ok(!isDate(bad), String(bad));
  });
});

describe('pagina mobile: giornata e salvataggio', () => {
  let c1Project;
  let c2Project;

  before(() => {
    createTestDb();
    c1Project = getProjects().find(p => p.clientId === 'c1');
    c2Project = getProjects().find(p => p.clientId === 'c2');
    // Solo c2 pianificata quel giorno, il pomeriggio.
    for (const slot of ['am', 'sera']) saveWeekOverride({ weekKey: WEEK, dayIndex: 1, slot, blocks: [] });
    saveWeekOverride({ weekKey: WEEK, dayIndex: 1, slot: 'pm', blocks: [{ id: 'm-pm', clientId: 'c2', hours: 3 }] });
  });

  test('la giornata elenca i progetti per area, con le aree pianificate per prime', () => {
    const d = getMobileDayData(DATE);
    assert.equal(d.date, DATE);
    assert.equal(d.plannedHours, 3);
    assert.equal(d.areas[0].id, 'c2');
    assert.equal(d.areas[0].plannedHours, 3);
    const c1 = d.areas.find(a => a.id === 'c1');
    assert.equal(c1.plannedHours, 0);
    assert.ok(c1.projects.some(p => p.id === c1Project.id && p.hours === 0 && p.clock === ''));
    assert.ok(d.areas.every(a => a.name && a.color));
  });

  test('un progetto archiviato compare solo se quel giorno ha ore', () => {
    const archived = { ...getProjects().find(p => p.clientId === 'c3'), archived: true };
    saveProject(archived);
    const has = () => getMobileDayData(DATE).areas.flatMap(a => a.projects).some(p => p.id === archived.id);
    assert.ok(!has());
    saveEntry({ id: 'm-arch', projectId: archived.id, date: DATE, hours: 1, billableHours: null, slot: 'am', billed: false });
    assert.ok(has());
  });

  test('nuova registrazione: finisce nella fascia in cui l\'area è pianificata', () => {
    const r = saveMobileHours({ projectId: c2Project.id, date: DATE, clock: '1:30', today: '2000-01-01' });
    assert.deepEqual(r, { projectId: c2Project.id, date: DATE, hours: 1.5, clock: '1:30' });
    const [entry] = entriesOf(c2Project.id);
    assert.equal(entry.hours, 1.5);
    assert.equal(entry.slot, 'pm');
    assert.equal(entry.billed, false);
    assert.equal(getMobileDayData(DATE).trackedHours >= 1.5, true);
  });

  test('senza blocchi dell\'area: mattina sui giorni passati', () => {
    saveMobileHours({ projectId: c1Project.id, date: DATE, clock: '0:45', today: '2000-01-01' });
    assert.equal(entriesOf(c1Project.id)[0].slot, 'am');
  });

  test('si modificano solo le ore lavorate: fatturabili e fatturato restano', () => {
    const [existing] = entriesOf(c1Project.id);
    saveEntry({ ...existing, billableHours: 0.5, billed: true });
    saveMobileHours({ projectId: c1Project.id, date: DATE, clock: '2:00', today: '2000-01-01' });
    const [after] = entriesOf(c1Project.id);
    assert.equal(after.id, existing.id);
    assert.equal(after.hours, 2);
    assert.equal(after.billableHours, 0.5);
    assert.equal(after.billed, true);
  });

  test('le registrazioni sparse su più fasce si accorpano in una', () => {
    saveEntry({ id: 'm-extra', projectId: c1Project.id, date: DATE, hours: 1, billableHours: null, slot: 'sera', billed: false });
    assert.equal(entriesOf(c1Project.id).length, 2);
    saveMobileHours({ projectId: c1Project.id, date: DATE, clock: '3:00', today: '2000-01-01' });
    const after = entriesOf(c1Project.id);
    assert.equal(after.length, 1);
    assert.equal(after[0].hours, 3);
  });

  test('zero ore cancella la registrazione', () => {
    const r = saveMobileHours({ projectId: c1Project.id, date: DATE, clock: '', today: '2000-01-01' });
    assert.equal(r.hours, 0);
    assert.deepEqual(entriesOf(c1Project.id), []);
  });

  test('rifiuta ciò che non capisce, senza scrivere', () => {
    const before = getEntries(DATE, DATE).length;
    assert.equal(saveMobileHours({ projectId: c1Project.id, date: 'ieri', clock: '1:00' }).error, 'date must be YYYY-MM-DD');
    assert.match(saveMobileHours({ projectId: c1Project.id, date: DATE, clock: '25:00' }).error, /H:MM/);
    assert.deepEqual(saveMobileHours({ projectId: 'nope', date: DATE, clock: '1:00' }), { error: 'unknown project', status: 404 });
    assert.equal(getEntries(DATE, DATE).length, before);
  });
});
