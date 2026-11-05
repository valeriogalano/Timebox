'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createTestDb } = require('./helpers');
const { createHttpServer } = require('../http-server');
const { getClients, getRecurring, getWeekOverrides } = require('../../db/queries');
const { isDate, isSlot, isDayIndex, isPositiveHours } = require('../../lib/validate');

function call(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const req = http.request({
      hostname: '127.0.0.1', port, path, method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe('validators', () => {
  it('isDate wants a real YYYY-MM-DD day', () => {
    assert.equal(isDate('2026-11-02'), true);
    for (const v of ['tomorrow', '2026-02-30', '2026-1-2', '', null]) assert.equal(isDate(v), false, String(v));
  });
  it('isSlot, isDayIndex and isPositiveHours', () => {
    assert.deepEqual(['am', 'pm', 'sera', 'foo'].map(isSlot), [true, true, true, false]);
    assert.deepEqual([0, 6, 7, -1, 1.5, '1'].map(isDayIndex), [true, true, false, false, false, false]);
    assert.deepEqual([2, 0.5, 0, -1, 25, '2', NaN].map(isPositiveHours), [true, true, false, false, false, false, false]);
  });
});

describe('HTTP input validation', () => {
  let server, port, areaId;
  before(() => {
    createTestDb();
    areaId = getClients()[0].id;
    server = createHttpServer();
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => { port = server.address().port; resolve(); }));
  });
  after(() => server.close());

  it('the day endpoints refuse a date that is not a day', async () => {
    for (const path of ['/today', '/day-summary', '/day-free-capacity', '/day-ready-blocks',
      '/todoist-imported', '/day-mismatches', '/day/insights']) {
      const res = await call(port, 'GET', `${path}?date=tomorrow`);
      assert.equal(res.status, 400, path);
    }
    assert.equal((await call(port, 'GET', '/today?date=2026-11-02')).status, 200);
  });

  it('POST /overrides checks slot, dayIndex and block hours', async () => {
    const base = { weekKey: '2020-06-15', dayIndex: 1, slot: 'am', blocks: [{ id: 'b1', clientId: areaId, hours: 2 }] };
    for (const bad of [{ slot: 'foo' }, { dayIndex: 99 }, { dayIndex: '1' },
      { blocks: [{ id: 'b1', clientId: areaId, hours: -1 }] }, { blocks: [{ id: 'b1', clientId: areaId }] }]) {
      const res = await call(port, 'POST', '/overrides', { ...base, ...bad });
      assert.equal(res.status, 400, JSON.stringify(bad));
    }
    assert.equal(getWeekOverrides('2020-06-15').length, 0, 'nothing invalid was stored');
    assert.equal((await call(port, 'POST', '/overrides', base)).status, 200);
  });

  it('DELETE /overrides wants a Monday, a day index and a slot', async () => {
    for (const q of ['week=2026-11-03&day=1&slot=am', 'week=2026-11-02&day=9&slot=am', 'week=2026-11-02&day=1&slot=x']) {
      assert.equal((await call(port, 'DELETE', `/overrides?${q}`)).status, 400, q);
    }
  });

  it('POST /recurring checks slot, day and hours', async () => {
    const before = getRecurring().length;
    const base = { clientId: areaId, slot: 'am', day: 0, hours: 2 };
    for (const bad of [{ slot: 'foo' }, { day: 7 }, { hours: -2 }, { hours: 30 }]) {
      const res = await call(port, 'POST', '/recurring', { ...base, ...bad });
      assert.equal(res.status, 400, JSON.stringify(bad));
    }
    assert.equal(getRecurring().length, before);
  });
});
