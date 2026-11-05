'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { initDb } = require('../../db/schema');
const q = require('../../db/queries');
const { getWeekTargetsData, weekTargetAlerts } = require('../commands/targets');
const { getStatusData } = require('../commands/status');
const { createHttpServer } = require('../http-server');
const { fmt, getMondayOfWeek, getToday } = require('../../lib/domain');

// Settimana fissa: lunedì 2 novembre 2026, oggi mercoledì 4.
const WEEK = '2026-11-02';
const WED = '2026-11-04';

function freshDb() {
  q.init(initDb(':memory:'));
  q.saveClient({ id: 'a', name: 'Alfa', color: '#000', billable: true, billing: 'none', rate: null, limitType: 'weekly', limitHours: 18, position: 0 });
  q.saveClient({ id: 'b', name: 'Beta', color: '#111', billable: true, billing: 'none', rate: null, limitType: null, limitHours: null, position: 1 });
  q.saveProject({ id: 'pa', clientId: 'a', name: 'Progetto A', description: null, budgetHours: null, weeklyHours: null, fixedPrice: null, position: 0, archived: false });
  q.saveProject({ id: 'pb', clientId: 'b', name: 'Progetto B', description: null, budgetHours: null, weeklyHours: null, fixedPrice: null, position: 1, archived: false });
  // Alfa: 4h al giorno da lunedì a venerdì, 20h di template
  for (let day = 0; day < 5; day++) q.saveRecurring({ id: `ra${day}`, clientId: 'a', slot: 'am', day, hours: 4, position: 0 });
  const entry = (id, projectId, date, hours) => q.saveEntry({ id, projectId, date, hours, billableHours: null, slot: 'am', billed: false });
  entry('e1', 'pa', '2026-11-02', 4);
  entry('e2', 'pa', '2026-11-03', 4);
  entry('e3', 'pa', WED, 2);
  entry('e4', 'pb', '2026-11-03', 3);   // lavoro non pianificato
  entry('e5', 'pa', '2026-11-06', 5);   // datato nel futuro: non ancora fatto
}

const areaOf = (data, id) => data.areas.find(a => a.areaId === id);

describe('week area targets: queries', () => {
  before(freshDb);

  it('append-only: the first row is the Monday target, the last the final one; the same value stores nothing', () => {
    assert.deepEqual(q.getWeekAreaTargets(WEEK), []);
    const first = q.addWeekAreaTarget({ weekKey: WEEK, areaId: 'a', hours: 16 });
    assert.ok(first.createdAt);
    q.addWeekAreaTarget({ weekKey: WEEK, areaId: 'a', hours: 22 });
    const same = q.addWeekAreaTarget({ weekKey: WEEK, areaId: 'a', hours: 22 });
    assert.equal(same.createdAt, null);
    assert.deepEqual(q.getWeekAreaTargets(WEEK).map(r => r.hours), [16, 22]);
    assert.deepEqual(q.getWeekAreaTargets('2026-11-09'), []);
  });

  it('refuses a missing week or area and invalid hours', () => {
    assert.throws(() => q.addWeekAreaTarget({ weekKey: WEEK, hours: 1 }), /required/);
    assert.throws(() => q.addWeekAreaTarget({ weekKey: WEEK, areaId: 'a', hours: -1 }), /Invalid hours/);
    assert.throws(() => q.addWeekAreaTarget({ weekKey: WEEK, areaId: 'a', hours: '3' }), /Invalid hours/);
  });

  it('deleting an area and resetting the data remove its targets', () => {
    q.addWeekAreaTarget({ weekKey: WEEK, areaId: 'b', hours: 2 });
    q.deleteClient('b');
    assert.ok(q.getWeekAreaTargets(WEEK).every(r => r.areaId !== 'b'));
    q.resetAllData();
    assert.deepEqual(q.getWeekAreaTargets(WEEK), []);
  });

  it('an existing database gains the table at startup', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-targets-'));
    const file = path.join(dir, 'old.db');
    const old = initDb(file);
    old.exec('DROP TABLE week_area_targets');
    old.close();
    const reopened = initDb(file);
    const cols = reopened.prepare("PRAGMA table_info('week_area_targets')").all().map(c => c.name);
    reopened.close();
    fs.rmSync(dir, { recursive: true, force: true });
    assert.deepEqual(cols, ['id', 'weekKey', 'areaId', 'hours', 'createdAt']);
  });
});

describe('getWeekTargetsData', () => {
  before(freshDb);

  it('without targets: template, done up to today, blocks left and gap', () => {
    const d = getWeekTargetsData(WEEK, WED);
    const a = areaOf(d, 'a');
    // 10h fatte (le 5h di venerdì non ancora), restano 2h di oggi + 8h
    assert.deepEqual(
      { t: a.target, m: a.mondayTarget, set: a.targetSet, done: a.done, rem: a.remaining, gap: a.gap },
      { t: 20, m: 20, set: false, done: 10, rem: 10, gap: 0 },
    );
    // Beta non ha template: le ore non pianificate superano l'obiettivo
    assert.equal(areaOf(d, 'b').gap, -3);
    assert.deepEqual(d.totals, { target: 20, done: 13, remaining: 10, gap: -3 });
  });

  it('removing today\'s block after logging hours: hours still missing, not overload', () => {
    q.saveWeekOverride({ weekKey: WEEK, dayIndex: 2, slot: 'am', blocks: [] });
    assert.equal(areaOf(getWeekTargetsData(WEEK, WED), 'a').gap, 2);
    // compensating on Saturday closes it
    q.saveWeekOverride({ weekKey: WEEK, dayIndex: 5, slot: 'am', blocks: [{ id: 'x', clientId: 'a', hours: 2 }] });
    assert.equal(areaOf(getWeekTargetsData(WEEK, WED), 'a').gap, 0);
  });

  it('the gap follows the final target, and warns above the weekly limit and on a closed area', () => {
    q.addWeekAreaTarget({ weekKey: WEEK, areaId: 'a', hours: 16 });
    q.addWeekAreaTarget({ weekKey: WEEK, areaId: 'a', hours: 24 });
    q.addWeekAreaTarget({ weekKey: WEEK, areaId: 'b', hours: 1 });
    q.saveWeekAreaStatus({ weekKey: WEEK, areaId: 'b', status: 'closed' });
    const d = getWeekTargetsData(WEEK, WED);
    const a = areaOf(d, 'a');
    assert.deepEqual({ m: a.mondayTarget, t: a.target, gap: a.gap, limit: a.weeklyLimit }, { m: 16, t: 24, gap: 4, limit: 18 });
    assert.deepEqual(a.warnings, [{ kind: 'over-weekly-limit', limit: 18 }]);
    assert.deepEqual(areaOf(d, 'b').warnings, [{ kind: 'closed-with-target' }]);

    const alerts = weekTargetAlerts(d);
    assert.deepEqual(alerts.map(x => x.kind), ['area-gap', 'over-weekly-limit', 'area-gap', 'closed-with-target']);
    assert.match(alerts[0].label, /^Alfa: 4h missing \(target 24h, done 10h, blocks left 10h\)$/);
    assert.match(alerts[1].label, /above the weekly limit \(18h\)/);
    assert.match(alerts[2].label, /^Beta: 2h over target/);
    assert.match(alerts[3].label, /closed this week/);
  });

  it('a closed week has no blocks left', () => {
    const a = areaOf(getWeekTargetsData(WEEK, '2026-11-20'), 'a');
    assert.equal(a.remaining, 0);
    assert.equal(a.done, 15);
  });
});

describe('status and HTTP', () => {
  let server, port;
  before(() => new Promise(resolve => {
    freshDb();
    server = createHttpServer();
    server.listen(0, '127.0.0.1', () => { port = server.address().port; resolve(); });
  }));
  after(() => new Promise(resolve => server.close(resolve)));

  function call(method, path, body) {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : '';
      const req = http.request({ hostname: '127.0.0.1', port, path, method, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, res => {
        let raw = '';
        res.on('data', c => { raw += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
      });
      req.on('error', reject);
      req.end(payload);
    });
  }

  it('status carries the gap alerts of the current week', () => {
    const data = getStatusData(WED);
    assert.ok(Array.isArray(data.gapAlerts));
    assert.ok(data.gapAlerts.some(a => a.kind === 'area-gap' && a.areaId === 'b'));
  });

  it('GET /targets defaults to the current week and refuses a non-Monday', async () => {
    const res = await call('GET', '/targets');
    assert.equal(res.status, 200);
    assert.equal(res.body.weekKey, fmt(getMondayOfWeek(getToday())));
    assert.ok(Array.isArray(res.body.alerts));
    assert.equal((await call('GET', '/targets?week=2026-11-04')).status, 400);
  });

  it('POST /targets appends a target and GET /targets reads it', async () => {
    const saved = await call('POST', '/targets', { weekKey: WEEK, areaId: 'a', hours: 12 });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.hours, 12);
    const res = await call('GET', `/targets?week=${WEEK}`);
    const a = res.body.areas.find(x => x.areaId === 'a');
    assert.equal(a.target, 12);
    assert.equal(a.targetSet, true);
  });

  it('POST /targets validates week, hours and area', async () => {
    assert.equal((await call('POST', '/targets', { weekKey: '2026-11-03', areaId: 'a', hours: 1 })).status, 400);
    assert.equal((await call('POST', '/targets', { weekKey: WEEK, areaId: 'a', hours: -2 })).status, 400);
    assert.equal((await call('POST', '/targets', { weekKey: WEEK, areaId: 'a', hours: '2' })).status, 400);
    assert.equal((await call('POST', '/targets', { weekKey: WEEK, areaId: 'Alfa', hours: 2 })).status, 404);
  });
});
