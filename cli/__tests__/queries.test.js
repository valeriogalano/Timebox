'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
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
  deleteClient,
  deleteProject,
  hasProjectEntries,
} = require('../../db/queries');

describe('deleteProject', () => {
  before(() => createTestDb());

  test('removes the project entries instead of leaving them orphaned', () => {
    const [project] = getProjects();
    assert.ok(hasProjectEntries(project.id), 'seed data should give this project entries to delete');

    deleteProject(project.id);

    assert.equal(getProjects().some(p => p.id === project.id), false);
    const remainingEntries = getEntries('2000-01-01', '2999-12-31')
      .filter(e => e.projectId === project.id);
    assert.equal(remainingEntries.length, 0);
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
    deleteClient(client.id);

    assert.equal(getClients().some(row => row.id === client.id), false);
    assert.equal(getProjects().some(row => row.clientId === client.id), false);
    assert.equal(getRecurring().some(row => row.clientId === client.id), false);
    assert.equal(getWeekAreaStatuses('2026-06-22').some(row => row.areaId === client.id), false);
    assert.equal(getEntries('2000-01-01', '2999-12-31').some(row => projectIds.includes(row.projectId)), false);
  });
});

describe('entry slot invariant migration', () => {
  test('deduplicates existing project date slot rows before creating the unique index', () => {
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
      const entries = migrated.prepare('SELECT * FROM entries ORDER BY slot, id').all();
      const indexes = migrated.prepare("PRAGMA index_list('entries')").all();
      migrated.close();

      assert.equal(entries.length, 2);
      assert.deepEqual(entries.map(entry => [entry.slot, entry.hours, entry.billableHours, entry.billed]), [
        ['am', 3, 2.5, 0],
        ['pm', 3, null, 1],
      ]);
      assert.equal(indexes.some(index => index.name === 'idx_entries_project_date_slot' && index.unique === 1), true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
