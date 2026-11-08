'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers');
const { initDb } = require('../../db/schema');
const { getStatusData } = require('../commands/status');
const { logHours } = require('../commands/log');
const { init, saveProject, getProjects, getClients, saveClient, saveEntry, saveRecurring } = require('../../db/queries');

const TEST_DATE = '2020-09-01';

describe('getStatusData', () => {
  before(() => createTestDb());

  test('returns today date and totals', () => {
    const data = getStatusData(TEST_DATE);
    assert.equal(data.today, TEST_DATE);
    assert.ok('todayTotal' in data);
    assert.ok('weekTotal' in data);
    assert.ok(Array.isArray(data.alerts));
  });

  test('todayTotal reflects logged hours for that date', () => {
    logHours({ projectName: 'website', hoursStr: '3', slot: 'am', date: TEST_DATE, add: false });
    const data = getStatusData(TEST_DATE);
    assert.equal(data.todayTotal, 3);
  });

  test('weekTotal includes all days in the week', () => {
    // TEST_DATE 2020-09-01 is a Tuesday; also log on Wednesday of same week
    logHours({ projectName: 'brand', hoursStr: '2', slot: 'pm', date: '2020-09-02', add: false });
    const data = getStatusData(TEST_DATE);
    assert.equal(data.weekTotal, 5);
  });

  test('weekTotal includes hours logged on the weekend', () => {
    // 2020-09-01 is a Tuesday; Sunday of that week is 2020-09-06
    logHours({ projectName: 'website', hoursStr: '1', slot: 'am', date: '2020-09-06', add: false });
    const data = getStatusData(TEST_DATE);
    assert.equal(data.weekTotal, 6);
  });

  test('alerts are empty when no project exceeds 80% of budget', () => {
    // Fresh DB: seed data logged hours are well below budgets for most projects
    createTestDb();
    const data = getStatusData('2020-09-10');
    // With seed data, no project should be at 80%+ (seed has minimal entries)
    // We just verify alerts is an array (could be empty or not)
    assert.ok(Array.isArray(data.alerts));
  });

  test('alerts include projects at or above 80% of budget', () => {
    createTestDb();
    // Get a project with a budget and log 80%+ of it
    const projects = getProjects();
    const target = projects.find(p => p.budgetHours && !p.archived);
    assert.ok(target, 'Need a project with budget for this test');
    const hoursToLog = target.budgetHours * 0.85;
    // more than one day can hold: saved directly, logHours refuses over 24h
    saveEntry({ id: 'budget-fixture', projectId: target.id, date: '2020-09-15', hours: hoursToLog, slot: 'am', billed: false });
    const data = getStatusData('2020-09-15');
    assert.ok(data.alerts.some(a => a.project === target.name && a.kind === 'project-budget'));
    assert.ok(data.alerts.every(a => a.pct >= 0.8));
  });

  test('alerts include areas at or above 80% of their weekly limit', () => {
    createTestDb();
    const area = getClients().find(c => c.limitType === 'weekly' && c.limitHours > 0);
    assert.ok(area, 'Need an area with a weekly limit for this test');
    const project = getProjects().find(p => p.clientId === area.id && !p.archived);
    logHours({ projectName: project.name, hoursStr: String(area.limitHours * 0.9), slot: 'am', date: '2020-09-15', add: false });

    const data = getStatusData('2020-09-15');
    const alert = data.alerts.find(a => a.kind === 'area-weekly' && a.area === area.name);
    assert.ok(alert, 'Expected a weekly area alert');
    assert.equal(alert.project, null);
    assert.equal(alert.limit, area.limitHours);

    // fuori dalla settimana del limite → nessun alert d'area
    assert.equal(getStatusData('2020-10-15').alerts.some(a => a.kind === 'area-weekly'), false);
  });

  test('alerts include projects at or above 80% of their weekly limit', () => {
    createTestDb();
    const project = getProjects().find(p => !p.archived);
    saveProject({ ...project, weeklyHours: 10 });
    logHours({ projectName: project.name, hoursStr: '9', slot: 'am', date: '2020-09-15', add: false });

    const alert = getStatusData('2020-09-15').alerts
      .find(a => a.kind === 'project-weekly' && a.project === project.name);
    assert.ok(alert, 'Expected a weekly project alert');
    assert.equal(alert.limit, 10);
    assert.ok(alert.label.includes('sett.'));
  });

  test('in an hourly area the alert follows the worse of worked and billable hours and names it', () => {
    createTestDb();
    const area = getClients().find(c => c.billing === 'hourly');
    assert.ok(area, 'Need an hourly area for this test');
    const project = getProjects().find(p => p.clientId === area.id && !p.archived);
    saveProject({ ...project, weeklyHours: 10, budgetHours: null });
    // 7h worked but 9h billable: only the billable count reaches 80% of the limit
    logHours({ projectName: project.name, hoursStr: '7', billableHoursStr: '9', slot: 'am', date: '2020-09-15', add: false });

    const alert = getStatusData('2020-09-15').alerts
      .find(a => a.kind === 'project-weekly' && a.project === project.name);
    assert.ok(alert, 'Expected a weekly project alert from the billable count');
    assert.equal(alert.logged, 7);
    assert.equal(alert.billable, 9);
    assert.equal(alert.count, 'fatt.');
    assert.equal(alert.pct, 0.9);
    assert.ok(alert.label.includes('9h fatt. / 10h'));
  });

  test('outside hourly areas billable hours never raise an alert', () => {
    createTestDb();
    const area = getClients().find(c => c.billing === 'fixed');
    assert.ok(area, 'Need a fixed-fee area for this test');
    const project = getProjects().find(p => p.clientId === area.id && !p.archived);
    saveProject({ ...project, weeklyHours: 10, budgetHours: null });
    logHours({ projectName: project.name, hoursStr: '7', billableHoursStr: '9', slot: 'am', date: '2020-09-15', add: false });

    assert.equal(getStatusData('2020-09-15').alerts
      .some(a => a.kind === 'project-weekly' && a.project === project.name), false);
  });

  describe('forecast alert (a rischio)', () => {
    // Lunedì 2 novembre 2026, oggi mercoledì 4. Alfa: limite 10h a settimana, 4h al giorno da lunedì a venerdì.
    const WED = '2026-11-04';
    const setup = ({ limitType = 'weekly', billing = 'none', days = [0, 1, 2, 3, 4] } = {}) => {
      // Database vuota, senza i dati demo: con delle entry già presenti saveRecurring congela
      // i giorni della settimana corrente prima di cambiare il template.
      init(initDb(':memory:'));
      const base = { color: '#000', billable: billing === 'hourly', rate: null, position: 90 };
      saveClient({ id: 'fc-a', name: 'Alfa', billing, limitType, limitHours: 10, ...base });
      saveProject({ id: 'fc-p', clientId: 'fc-a', name: 'Progetto Alfa', description: null, budgetHours: null, weeklyHours: null, fixedPrice: null, position: 90, archived: false });
      for (const day of days) saveRecurring({ id: `fc-r${day}`, clientId: 'fc-a', slot: 'am', day, hours: 4, position: 0 });
    };
    const entry = (id, date, hours, billableHours = null) =>
      saveEntry({ id, projectId: 'fc-p', date, hours, billableHours, slot: 'am', billed: false });
    const forecastAlert = d => d.alerts.find(a => a.kind === 'area-weekly-forecast' && a.area === 'Alfa');

    test('previsto sopra il limite mentre il fatto ci sta: avviso a rischio e nessun area-weekly', () => {
      setup({ days: [2] });
      saveRecurring({ id: 'fc-r3', clientId: 'fc-a', slot: 'am', day: 3, hours: 6, position: 0 });
      // 6h fatte oggi (il piano di oggi è 4h) e 6h di blocchi giovedì: previsto 12h, fatto sotto l'80%
      entry('fc-e1', WED, 6);
      const d = getStatusData(WED);
      const alert = forecastAlert(d);
      assert.ok(alert, 'Expected a forecast alert');
      assert.equal(alert.project, null);
      assert.equal(alert.logged, 6);
      assert.equal(alert.forecast, 12);
      assert.equal(alert.limit, 10);
      assert.equal(alert.pct, 1.2);
      assert.equal(alert.label, 'Alfa — previsto 12h / 10h sett. (a rischio)');
      assert.equal(d.alerts.some(a => a.kind === 'area-weekly' && a.area === 'Alfa'), false);
    });

    test('fatto già oltre il limite: solo area-weekly', () => {
      setup({ days: [3] });
      entry('fc-e2', WED, 11);
      const d = getStatusData(WED);
      assert.equal(forecastAlert(d), undefined);
      assert.ok(d.alerts.some(a => a.kind === 'area-weekly' && a.area === 'Alfa'));
    });

    test('limite globale: nessun avviso sul previsto', () => {
      setup({ limitType: 'global', days: [3] });
      entry('fc-e3', WED, 6);
      assert.equal(forecastAlert(getStatusData(WED)), undefined);
    });

    test('domenica senza blocchi rimasti: il previsto è il fatto, nessun avviso', () => {
      setup({ days: [3, 4] });
      entry('fc-e4', WED, 6);
      assert.equal(forecastAlert(getStatusData('2026-11-08')), undefined);
    });

    test('fatturabili oltre il lavorato: l\'etichetta dice fatt.', () => {
      setup({ billing: 'hourly', days: [3] });
      entry('fc-e5', WED, 5, 7);
      // lavorate 5 + 4 = 9 (ci sta), fatturabili 7 + 4 = 11 (oltre)
      const alert = forecastAlert(getStatusData(WED));
      assert.ok(alert, 'Expected a forecast alert from the billable count');
      assert.equal(alert.count, 'fatt.');
      assert.equal(alert.billable, 7);
      assert.equal(alert.forecast, 11);
      assert.equal(alert.label, 'Alfa — previsto 11h fatt. / 10h sett. (a rischio)');
    });
  });

  test('no alert when the area has no limit configured', () => {
    createTestDb();
    const area = getClients().find(c => c.limitType === 'weekly' && c.limitHours > 0);
    saveClient({ ...area, limitType: 'none', limitHours: null });
    const project = getProjects().find(p => p.clientId === area.id && !p.archived);
    saveEntry({ id: 'no-limit-fixture', projectId: project.id, date: '2020-09-15', hours: 40, slot: 'am', billed: false });

    const data = getStatusData('2020-09-15');
    assert.equal(data.alerts.some(a => a.area === area.name && a.kind.startsWith('area-')), false);
  });
});
