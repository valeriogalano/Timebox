'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createTestDb } = require('./helpers');
const { createHttpServer } = require('../http-server');
const { getClients, setTodoistCache } = require('../../db/queries');

function currentWeekDate(offset) {
  const today = new Date();
  const monday = new Date(today);
  const dow = monday.getDay();
  monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1) + offset);
  return monday.toISOString().slice(0, 10);
}

function previousWeekDate(offset) {
  const today = new Date();
  const monday = new Date(today);
  const dow = monday.getDay();
  monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1) - 7 + offset);
  return monday.toISOString().slice(0, 10);
}

function get(port, path) {
  return new Promise((resolve, reject) => {
    const [pathname, search] = path.split('?');
    const opts = { hostname: '127.0.0.1', port, path: search ? `${pathname}?${search}` : pathname, method: 'GET' };
    http.get(opts, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    }).on('error', reject);
  });
}

function request(port, method, path, body) {
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

function post(port, path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1', port, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

describe('HTTP server', () => {
  let server;
  let port;

  before(() => {
    createTestDb();
    server = createHttpServer();
    return new Promise(resolve => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  after(() => new Promise(resolve => server.close(resolve)));

  it('GET /ping → { ok: true }', async () => {
    const { status, body } = await get(port, '/ping');
    assert.equal(status, 200);
    assert.equal(body.ok, true);
  });

  it('GET /today → { date, slots, amTotal, pmTotal }', async () => {
    const { status, body } = await get(port, '/today');
    assert.equal(status, 200);
    assert.ok(body.date, 'has date');
    assert.ok(body.slots, 'has slots');
    assert.ok('am' in body.slots, 'has am slot');
    assert.ok('pm' in body.slots, 'has pm slot');
  });

  it('GET /today?date=2020-01-01 → total 0 (no entries)', async () => {
    const { status, body } = await get(port, '/today?date=2020-01-01');
    assert.equal(status, 200);
    assert.equal(body.date, '2020-01-01');
    assert.equal(body.amTotal, 0);
    assert.equal(body.pmTotal, 0);
  });

  it('GET /day-summary?date=2020-01-01 → template blocks, zero tracked and positive residual', async () => {
    const { status, body } = await get(port, '/day-summary?date=2020-01-01');
    assert.equal(status, 200);
    assert.equal(body.date, '2020-01-01');
    assert.equal(body.slots.am.source, 'template');
    assert.equal(body.slots.pm.source, 'template');
    assert.equal(body.trackedHours, 0);
    assert.equal(body.extraHours, 0);
    assert.ok(body.plannedCapacity > 0, 'has planned capacity');
    assert.equal(body.residualCapacity, body.plannedCapacity);
  });

  it('GET /day-summary for seeded Tuesday → override/template metadata and extra hours', async () => {
    const overrideDate = currentWeekDate(1);
    const { status, body } = await get(port, `/day-summary?date=${overrideDate}`);
    assert.equal(status, 200);
    assert.equal(body.slots.am.source, 'template');
    assert.equal(body.slots.pm.source, 'template');
    assert.equal(body.plannedCapacity, 6);
    assert.equal(body.trackedHours, 8);
    assert.equal(body.extraHours, 3);
    assert.equal(body.residualCapacity, 1);
    assert.ok(body.extra.some(item => item.area === 'Acme Corp' && item.hours === 0.5), 'includes overflow on planned area');
    assert.ok(body.extra.some(item => item.area === 'The Blog' && item.hours === 2.5), 'includes overflow on planned pm area');
  });

  it('GET /day-free-capacity for custom Todoist cache → separates reserved capacity from actually free capacity', async () => {
    setTodoistCache('2020-01-08', [
      { id: 'fc1', projectId: 'p4', content: 'Sensor triage', hours: 1, slot: 'am' },
      { id: 'fc2', content: 'Inbox follow-up', hours: 1, slot: 'pm', todoistProjectName: 'Inbox' },
    ], '2026-06-17T09:00:00.000Z');

    const { status, body } = await get(port, '/day-free-capacity?date=2020-01-08');
    assert.equal(status, 200);
    assert.equal(body.date, '2020-01-08');
    assert.equal(body.totals.plannedCapacity, 5.5);
    assert.equal(body.totals.estimatedHours, 2);
    assert.equal(body.totals.matchedTaskHours, 1);
    assert.equal(body.totals.unmatchedTaskHours, 1);
    assert.equal(body.totals.availableAfterTrackedAndTasks, 3.5);
    assert.equal(body.totals.reservedWithoutTasksHours, 4.5);
    assert.equal(body.totals.freeUnallocatedHours, 0);
    assert.equal(body.counts.reservedWithoutTasks, 2);
    assert.equal(body.counts.tasksWithoutTimeboxProject, 1);
    assert.equal(body.reservedWithoutTasks[0].reason, 'insufficient_tasks');
    assert.equal(body.reservedWithoutTasks[1].reason, 'no_tasks');
  });

  it('GET /day-ready-blocks for custom Todoist cache → groups uncovered blocks by area and project', async () => {
    setTodoistCache('2020-01-08', [
      { id: 'rb1', projectId: 'p4', content: 'Sensor triage', hours: 1, slot: 'am' },
      { id: 'rb2', content: 'Inbox follow-up', hours: 1, slot: 'pm', todoistProjectName: 'Inbox' },
    ], '2026-06-17T09:00:00.000Z');

    const { status, body } = await get(port, '/day-ready-blocks?date=2020-01-08');
    assert.equal(status, 200);
    assert.equal(body.date, '2020-01-08');
    assert.equal(body.counts.groups, 2);
    assert.equal(body.groups[0].area, 'GreenTech SA');
    assert.equal(body.groups[0].projects[0].project, 'Dashboard MVP');
    assert.equal(body.groups[0].projects[0].taskCount, 1);
    assert.equal(body.groups[0].projects[0].estimatedHours, 1);
    assert.ok(body.groups[0].projects.some(project => project.project === 'Mobile App' && project.taskCount === 0));
    assert.equal(body.groups[1].area, 'Studio Nova');
    assert.equal(body.groups[1].projects[0].project, 'Brand Identity');
    assert.equal(body.groups[1].projects[0].taskCount, 0);
  });

  it('GET /todoist-imported for seeded Tuesday → imported tasks with project, area and match status', async () => {
    const seededDate = previousWeekDate(1);
    const { status, body } = await get(port, `/todoist-imported?date=${seededDate}`);
    assert.equal(status, 200);
    assert.equal(body.dateStr, seededDate);
    assert.ok(body.syncedAt, 'has sync timestamp');
    assert.equal(body.tasks.length, 2);
    assert.deepEqual(body.tasks.map(task => task.slot), ['am', 'pm']);
    assert.equal(body.tasks[0].title, 'Setup endpoint autenticazione');
    assert.equal(body.tasks[0].todoistProject, 'API Integration');
    assert.equal(body.tasks[0].timeboxProject, 'API Integration');
    assert.equal(body.tasks[0].area, 'Acme Corp');
    assert.equal(body.tasks[0].estimatedHours, 3.5);
    assert.equal(body.tasks[0].matchStatus, 'matched');
  });

  it('GET /todoist-imported for missing day → empty task list', async () => {
    const { status, body } = await get(port, '/todoist-imported?date=2020-01-01');
    assert.equal(status, 200);
    assert.equal(body.dateStr, '2020-01-01');
    assert.equal(body.syncedAt, null);
    assert.deepEqual(body.tasks, []);
  });

  it('GET /day-mismatches for custom Todoist cache → operational mismatch groups', async () => {
    setTodoistCache('2020-01-01', [
      { id: 'tm1', content: 'Unmapped inbox task', hours: 1.5, slot: 'am', todoistProjectName: 'Inbox' },
      { id: 'tm2', projectId: 'p3', content: 'Article outside planned block', hours: 1, slot: 'pm' },
      { id: 'tm3', projectId: 'p4', content: 'Sensor API over capacity', hours: 4, slot: 'am' },
    ], '2026-06-16T10:00:00.000Z');

    const { status, body } = await get(port, '/day-mismatches?date=2020-01-01');
    assert.equal(status, 200);
    assert.equal(body.date, '2020-01-01');
    assert.equal(body.counts.tasksWithoutTimeboxProject, 1);
    assert.equal(body.counts.tasksOutsidePlannedArea, 1);
    assert.equal(body.counts.tasksOverBlockCapacity, 1);
    assert.ok(body.counts.blocksWithoutReadyTasks >= 1, 'has uncovered planned blocks');
    assert.equal(body.counts.estimatedBeyondResidualCapacity, 1);
    assert.equal(body.mismatches.tasksWithoutTimeboxProject[0].title, 'Unmapped inbox task');
    assert.equal(body.mismatches.tasksOutsidePlannedArea[0].area, 'The Blog');
    assert.equal(body.mismatches.tasksOverBlockCapacity[0].overflowHours, 0.5);
    assert.equal(body.mismatches.estimatedBeyondResidualCapacity.overflowHours, 1);
  });

  it('GET /week → has 5 days and total', async () => {
    const { status, body } = await get(port, '/week');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.days), 'days is array');
    assert.equal(body.days.length, 5);
    assert.ok('total' in body, 'has total');
    assert.ok(body.monday, 'has monday');
    assert.ok(body.friday, 'has friday');
  });

  it('GET /week?offset=-1 → different week from /week', async () => {
    const [cur, prev] = await Promise.all([
      get(port, '/week'),
      get(port, '/week?offset=-1'),
    ]);
    assert.equal(cur.status, 200);
    assert.equal(prev.status, 200);
    assert.notEqual(cur.body.monday, prev.body.monday);
  });

  it('GET /projects → non-empty array with expected fields', async () => {
    const { status, body } = await get(port, '/projects');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body) && body.length > 0, 'non-empty array');
    const p = body[0];
    assert.ok('project' in p, 'has project');
    assert.ok('client' in p, 'has client');
    assert.ok('area' in p, 'has area');
  });

  it('GET /areas → 4 seed areas', async () => {
    const { status, body } = await get(port, '/areas');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body), 'is array');
    assert.equal(body.length, 4);
    assert.ok('area' in body[0], 'has area field');
  });

  it('GET /status → { today, todayTotal, weekTotal, alerts }', async () => {
    const { status, body } = await get(port, '/status');
    assert.equal(status, 200);
    assert.ok(body.today, 'has today');
    assert.ok('todayTotal' in body, 'has todayTotal');
    assert.ok('weekTotal' in body, 'has weekTotal');
    assert.ok(Array.isArray(body.alerts), 'has alerts array');
  });

  it('POST /log → logs hours and returns result', async () => {
    const { status, body } = await post(port, '/log', {
      project: 'website',
      hours: '1',
      slot: 'am',
      date: '2025-06-15',
      add: false,
    });
    assert.equal(status, 200);
    assert.ok(body.action, 'has action');
    assert.ok(body.project, 'has project');
  });

  it('POST /log with billableHours → persists override', async () => {
    const { status, body } = await post(port, '/log', {
      project: 'website',
      hours: '4',
      billableHours: '3:30',
      slot: 'am',
      date: '2025-09-10',
      add: false,
    });
    assert.equal(status, 200);
    assert.equal(body.hours, 4);
    assert.equal(body.billableHours, 3.5);
  });

  it('GET /today includes billableHours and totalBillable fields', async () => {
    await post(port, '/log', {
      project: 'brand', hours: '2', billableHours: '1', slot: 'pm', date: '2025-09-11', add: false,
    });
    const { status, body } = await get(port, '/today?date=2025-09-11');
    assert.equal(status, 200);
    assert.ok('totalBillable' in body, 'has totalBillable');
    const entry = body.slots.pm[0];
    assert.ok('billableHours' in entry, 'entry has billableHours');
    assert.equal(entry.billableHours, 1);
    assert.equal(body.totalBillable, 1);
  });

  it('POST /log with unknown project → status 400', async () => {
    const { status, body } = await post(port, '/log', {
      project: 'NonexistentXYZ999',
      hours: '1',
    });
    assert.equal(status, 400);
    assert.ok(body.error, 'has error message');
  });

  it('GET /areas?search=acme → filtered by name, has id field', async () => {
    const { status, body } = await get(port, '/areas?search=acme');
    assert.equal(status, 200);
    assert.ok(body.length > 0, 'has results');
    assert.ok(body.every(c => c.name.toLowerCase().includes('acme')), 'all match acme');
    assert.ok('id' in body[0], 'has id field');
  });

  it('GET /projects?search=website → filtered by project name', async () => {
    const { status, body } = await get(port, '/projects?search=website');
    assert.equal(status, 200);
    assert.ok(body.length > 0, 'has results');
    assert.ok(body.every(p => p.project.toLowerCase().includes('website')), 'all match website');
  });

  it('POST /projects → creates project and returns id', async () => {
    const clients = getClients();
    const { status, body } = await post(port, '/projects', {
      name: 'Test Project XYZ',
      areaId: clients[0].id,
    });
    assert.equal(status, 200);
    assert.ok(body.id, 'has id');
    assert.equal(body.name, 'Test Project XYZ');
    assert.ok(body.client, 'has client name');
    assert.equal(body.area, body.client);
  });

  it('POST /projects without required fields → 400', async () => {
    const { status } = await post(port, '/projects', { name: 'Missing client' });
    assert.equal(status, 400);
  });

  it('PATCH /areas/:id → renames area', async () => {
    const clients = getClients();
    const target = clients[0];
    const { status, body } = await request(port, 'PATCH', `/areas/${target.id}`, { name: 'Renamed Area' });
    assert.equal(status, 200);
    assert.equal(body.oldName, target.name);
    assert.equal(body.newName, 'Renamed Area');
    assert.equal(body.newAreaName, 'Renamed Area');
  });

  it('PATCH /areas/:id with unknown id → 404', async () => {
    const { status } = await request(port, 'PATCH', '/areas/nonexistent-id', { name: 'X' });
    assert.equal(status, 404);
  });

  it('PATCH /projects/:id → renames project', async () => {
    const { body: created } = await post(port, '/projects', {
      name: 'Rename Me',
      areaId: getClients()[0].id,
    });
    const { status, body } = await request(port, 'PATCH', `/projects/${created.id}`, { name: 'Renamed Project' });
    assert.equal(status, 200);
    assert.equal(body.name, 'Renamed Project');
  });

  it('PATCH /projects/:id → moves project to another area', async () => {
    const clients = getClients();
    const { body: created } = await post(port, '/projects', {
      name: 'Move Me',
      areaId: clients[0].id,
    });
    const { status, body } = await request(port, 'PATCH', `/projects/${created.id}`, { areaId: clients[1].id });
    assert.equal(status, 200);
    assert.equal(body.clientId, clients[1].id);
    assert.equal(body.areaId, clients[1].id);
  });

  it('DELETE /projects/:id (no entries) → 200', async () => {
    const { body: created } = await post(port, '/projects', {
      name: 'Delete Me',
      areaId: getClients()[0].id,
    });
    const { status, body } = await request(port, 'DELETE', `/projects/${created.id}`);
    assert.equal(status, 200);
    assert.equal(body.name, 'Delete Me');
  });

  it('DELETE /projects/:id (has entries) → 409', async () => {
    // Use a seed project that has logged hours (p1 = Website Redesign)
    const { body: projects } = await get(port, '/projects?search=website');
    const proj = projects[0];
    const { status, body } = await request(port, 'DELETE', `/projects/${proj.id}`);
    assert.equal(status, 409);
    assert.ok(body.error.includes('entries'), 'error mentions entries');
  });

  it('POST /projects/merge → merges entries and deletes source', async () => {
    const clients = getClients();
    // Create two fresh projects with no entries
    const { body: src } = await post(port, '/projects', { name: 'Merge Source', areaId: clients[0].id });
    const { body: dst } = await post(port, '/projects', { name: 'Merge Dest',   areaId: clients[0].id });
    // Log an entry on source
    await post(port, '/log', { project: 'Merge Source', hours: '1', date: '2025-08-01' });
    const { status, body } = await post(port, '/projects/merge', { fromId: src.id, toId: dst.id });
    assert.equal(status, 200);
    assert.equal(body.count, 1);
    assert.equal(body.from, 'Merge Source');
    assert.equal(body.to, 'Merge Dest');
  });

  it('POST /projects/merge with unknown fromId → 400', async () => {
    const clients = getClients();
    const { body: dst } = await post(port, '/projects', { name: 'Merge Dest 2', areaId: clients[0].id });
    const { status } = await post(port, '/projects/merge', { fromId: 'nonexistent', toId: dst.id });
    assert.equal(status, 400);
  });
});
