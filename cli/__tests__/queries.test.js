'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const Database = require('better-sqlite3');
const { createTestDb } = require('./helpers');
const { initDb } = require('../../db/schema');
const {
  getClients,
  getProjects,
  getEntries,
  getRecurring,
  saveWeekAreaStatus,
  getWeekAreaStatuses,
  saveClient,
  deleteClient,
  deleteProject,
  deleteEntry,
  HasEntriesError,
  hasProjectEntries,
  getSetting,
  setSetting,
} = require('../../db/queries');

describe('deleteProject', () => {
  before(() => createTestDb());

  test('refuses a project with logged entries and keeps them', () => {
    const [project] = getProjects();
    assert.ok(hasProjectEntries(project.id), 'seed data should give this project entries');

    assert.throws(() => deleteProject(project.id), HasEntriesError);

    assert.equal(getProjects().some(p => p.id === project.id), true);
    assert.ok(hasProjectEntries(project.id));
  });

  test('deletes a project once it has no entries', () => {
    const [project] = getProjects();
    getEntries('2000-01-01', '2999-12-31')
      .filter(e => e.projectId === project.id)
      .forEach(e => deleteEntry(e.id));

    deleteProject(project.id);

    assert.equal(getProjects().some(p => p.id === project.id), false);
  });
});

describe('referential integrity', () => {
  test('enables foreign keys and declares cascade relationships', () => {
    const db = createTestDb();

    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    assert.ok(db.prepare("PRAGMA foreign_key_list('projects')").all().some(row => row.table === 'clients' && row.on_delete === 'CASCADE'));
    assert.ok(db.prepare("PRAGMA foreign_key_list('entries')").all().some(row => row.table === 'projects' && row.on_delete === 'CASCADE'));
    assert.ok(db.prepare("PRAGMA foreign_key_list('recurring')").all().some(row => row.table === 'clients' && row.on_delete === 'CASCADE'));
    assert.ok(db.prepare("PRAGMA foreign_key_list('week_area_status')").all().some(row => row.table === 'clients' && row.on_delete === 'CASCADE'));
    assert.ok(db.prepare("PRAGMA foreign_key_list('todoist_imports')").all().some(row => row.table === 'projects' && row.on_delete === 'CASCADE'));
  });

  test('deleteClient removes dependent projects, recurring blocks, statuses and entries', () => {
    createTestDb();
    const [client] = getClients();
    const projectIds = getProjects().filter(project => project.clientId === client.id).map(project => project.id);
    assert.ok(projectIds.length > 0, 'seed data should give this client projects to delete');

    saveWeekAreaStatus({ weekKey: '2026-06-22', areaId: client.id, status: 'minimal' });
    // with hours on its projects the area is refused, and nothing is removed
    assert.throws(() => deleteClient(client.id), HasEntriesError);
    assert.equal(getClients().some(row => row.id === client.id), true);

    getEntries('2000-01-01', '2999-12-31')
      .filter(e => projectIds.includes(e.projectId))
      .forEach(e => deleteEntry(e.id));
    deleteClient(client.id);

    assert.equal(getClients().some(row => row.id === client.id), false);
    assert.equal(getProjects().some(row => row.clientId === client.id), false);
    assert.equal(getRecurring().some(row => row.clientId === client.id), false);
    assert.equal(getWeekAreaStatuses('2026-06-22').some(row => row.areaId === client.id), false);
    assert.equal(getEntries('2000-01-01', '2999-12-31').some(row => projectIds.includes(row.projectId)), false);
  });
});

describe('default area status', () => {
  test('an area without a weekly override keeps its own default, and active is a real override', () => {
    createTestDb();
    const [client] = getClients();
    assert.equal(client.defaultStatus, 'active', 'areas default to active until set otherwise');

    saveClient({ ...client, defaultStatus: 'minimal' });
    assert.equal(getClients().find(c => c.id === client.id).defaultStatus, 'minimal');

    // 'active' non è "nessun override": su un'area a default minimal è l'eccezione
    // della settimana, quindi deve restare persistita.
    saveWeekAreaStatus({ weekKey: '2026-06-22', areaId: client.id, status: 'active' });
    const stored = getWeekAreaStatuses('2026-06-22').find(r => r.areaId === client.id);
    assert.equal(stored?.status, 'active');
  });
});

describe('settings', () => {
  test('persists the slot capacity setting as a generic key/value row', () => {
    createTestDb();

    assert.equal(getSetting('slotCapacityHours'), null);
    setSetting('slotCapacityHours', '4.5');

    assert.equal(getSetting('slotCapacityHours'), '4.5');
  });
});

describe('one entry per project and day, on a legacy database', () => {
  test('merges the rows of a project on the same day, whatever their slot, before creating the unique index', () => {
    const dir = mkdtempSync(join(tmpdir(), 'timebox-entry-slot-'));
    const dbPath = join(dir, 'timebox.db');
    try {
      const dirty = new Database(dbPath);
      dirty.exec(`
        CREATE TABLE clients (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL
        );
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          clientId TEXT,
          name TEXT
        );
        CREATE TABLE entries (
          id TEXT PRIMARY KEY,
          projectId TEXT,
          date TEXT,
          hours REAL,
          billableHours REAL,
          slot TEXT,
          billed INTEGER DEFAULT 0
        );
        INSERT INTO clients (id, name) VALUES ('c1', 'Area');
        INSERT INTO projects (id, clientId, name) VALUES ('p1', 'c1', 'Project');
        INSERT INTO entries (id, projectId, date, hours, billableHours, slot, billed)
        VALUES
          ('same-slot-1', 'p1', '2025-01-01', 1, NULL, 'am', 1),
          ('same-slot-2', 'p1', '2025-01-01', 2, 1.5, 'am', 0),
          ('other-slot', 'p1', '2025-01-01', 3, NULL, 'pm', 1);
      `);
      dirty.close();

      const migrated = initDb(dbPath);
      const entries = migrated.prepare('SELECT * FROM entries ORDER BY id').all();
      const indexes = migrated.prepare("PRAGMA index_list('entries')").all();
      migrated.close();

      assert.deepEqual(entries.map(entry => [entry.id, entry.hours, entry.billableHours, entry.billed]), [
        ['same-slot-1', 6, 5.5, 0],
      ]);
      assert.equal(indexes.some(index => index.name === 'idx_entries_project_date' && index.unique === 1), true);
      assert.equal(readdirSync(dir).filter(f => f.startsWith('timebox-before-entry-merge-')).length, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('project totals: worked and billable', () => {
  test('billable totals use the override where present and the worked hours elsewhere', () => {
    createTestDb();
    const q = require('../../db/queries');
    const before = { worked: q.getProjectTotals().p1 ?? 0, billable: q.getProjectBillableTotals().p1 ?? 0 };
    q.saveEntry({ id: 'cap-1', projectId: 'p1', date: '2019-01-07', hours: 5, billableHours: 3, billed: false });
    q.saveEntry({ id: 'cap-2', projectId: 'p1', date: '2019-01-08', hours: 2, billableHours: null, billed: false });
    assert.equal(q.getProjectTotals().p1 - before.worked, 7);
    assert.equal(q.getProjectBillableTotals().p1 - before.billable, 5);
  });
});

describe('Todoist cache, week overrides and template by area', () => {
  test('cache rows are read by date and all together', () => {
    createTestDb();
    const q = require('../../db/queries');
    assert.deepEqual(q.getTodoistCache([]), []);
    q.setTodoistCache('2031-02-03', [{ id: 't' }], '2031-02-03T08:00:00Z');
    assert.deepEqual(q.getTodoistCache(['2031-02-03', '2031-02-04']), [{ dateStr: '2031-02-03', tasks: [{ id: 't' }], syncedAt: '2031-02-03T08:00:00Z' }]);
    assert.ok(q.getAllTodoistCache().some(row => row.dateStr === '2031-02-03'));
  });

  test('deleteWeekOverride removes one day and slot; deleteRecurringByClient removes an area from the template', () => {
    createTestDb();
    const q = require('../../db/queries');
    q.saveWeekOverride({ weekKey: '2031-02-03', dayIndex: 1, slot: 'pm', blocks: [] });
    q.deleteWeekOverride('2031-02-03', 1, 'pm');
    assert.deepEqual(q.getWeekOverrides('2031-02-03'), []);
    assert.ok(q.getRecurring().some(r => r.clientId === 'c1'));
    q.deleteRecurringByClient('c1');
    assert.ok(!q.getRecurring().some(r => r.clientId === 'c1'));
  });
});
