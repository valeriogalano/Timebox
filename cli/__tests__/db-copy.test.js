'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { initDb } = require('../../db/schema');
const { init, seedDemoData } = require('../../db/queries');
const { saveDbCopy } = require('../../lib/db-copy');

describe('saveDbCopy', () => {
  test('the copy holds the writes still in the WAL, with the database open', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'timebox-copy-'));
    const source = path.join(dir, 'timebox.db');
    const db = initDb(source);
    init(db);
    seedDemoData();
    const entries = db.prepare('SELECT COUNT(*) AS c FROM entries').get().c;
    assert.ok(entries > 0);

    // what the old handler did: the bare file misses what is still in the WAL
    const bare = path.join(dir, 'bare.db');
    fs.copyFileSync(source, bare);

    const destination = path.join(dir, 'copy.db');
    assert.equal(await saveDbCopy(db, source, destination), destination);
    db.close();

    const copy = new Database(destination, { readonly: true });
    assert.equal(copy.prepare('SELECT COUNT(*) AS c FROM entries').get().c, entries);
    copy.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('refuses to overwrite the open database', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'timebox-copy-'));
    const source = path.join(dir, 'timebox.db');
    const db = initDb(source);
    await assert.rejects(saveDbCopy(db, source, path.join(dir, '.', 'timebox.db')));
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
