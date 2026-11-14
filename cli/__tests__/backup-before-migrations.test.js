'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { initDb } = require('../../db/schema');

let dir, dbPath;
const backups = () => fs.existsSync(path.join(dir, 'backups')) ? fs.readdirSync(path.join(dir, 'backups')).sort() : [];

// A database from before some columns existed: only what migrations must add is missing.
function createOldDb() {
  const old = new Database(dbPath);
  old.exec("CREATE TABLE clients (id TEXT PRIMARY KEY, name TEXT NOT NULL); INSERT INTO clients VALUES ('a', 'Alfa')");
  old.close();
}

describe('backup before migrations', () => {
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'timebox-backup-')); dbPath = path.join(dir, 'timebox.db'); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('a new database has nothing to back up', () => {
    initDb(dbPath).close();
    assert.deepEqual(backups(), []);
  });

  test('an existing database is copied before it is migrated, with its old content', () => {
    createOldDb();
    initDb(dbPath).close();
    const [file] = backups();
    assert.match(file, /^timebox-\d{17}\.db$/);
    const copy = new Database(path.join(dir, 'backups', file), { readonly: true });
    assert.equal(copy.prepare('SELECT name FROM clients').get().name, 'Alfa');
    assert.equal(copy.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('clients') WHERE name = 'defaultStatus'").get().n, 0);
    copy.close();
  });

  test('only the last 3 copies are kept', () => {
    createOldDb();
    initDb(dbPath).close();
    const [first] = backups();
    for (let i = 0; i < 4; i++) initDb(dbPath).close();
    const kept = backups();
    assert.equal(kept.length, 3);
    assert.ok(!kept.includes(first), 'the oldest copy should have been removed');
  });

  test('a failed backup stops the start and leaves the database unmigrated', () => {
    createOldDb();
    fs.writeFileSync(path.join(dir, 'backups'), 'not a folder');
    assert.throws(() => initDb(dbPath), /Backup del database non riuscito/);
    const db = new Database(dbPath, { readonly: true });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'projects'").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('clients') WHERE name = 'defaultStatus'").get().n, 0);
    db.close();
  });

  test('an ALTER that fails for a reason other than a duplicate column is not swallowed', () => {
    const old = new Database(dbPath);
    old.exec('CREATE TABLE base (x); CREATE VIEW recurring AS SELECT x FROM base');
    old.close();
    assert.throws(() => initDb(dbPath), /view/i);
  });
});
