'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { initDb } = require('../../db/schema');
const { init, saveWeekOverride, freezeWeeksBeforeRecurringChange, getWeekOverrides, getWeekOverridesRange } = require('../../db/queries');
const { createTestDb } = require('./helpers');

function tempDbPath() {
  return path.join(os.tmpdir(), `timebox-sunday-migration-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

describe('week_overrides Sunday keys', () => {
  it('migration re-keys an orphan Sunday row under its Monday twin', () => {
    const dbPath = tempDbPath();
    try {
      let db = initDb(dbPath);
      // Insert a legacy Sunday-keyed row directly, bypassing saveWeekOverride,
      // to simulate the pre-existing corrupted data.
      db.prepare(`
        INSERT INTO week_overrides (id, weekKey, dayIndex, slot, blocksJson)
        VALUES ('2026-05-03-2-am', '2026-05-03', 2, 'am', ?)
      `).run(JSON.stringify([{ id: 'orphan', clientId: 'c1', hours: 4 }]));
      db.close();

      // Re-open: migrations run again on the persisted file.
      db = initDb(dbPath);
      init(db);

      const mondayRows = db.prepare('SELECT * FROM week_overrides WHERE weekKey = ?').all('2026-05-04');
      assert.equal(mondayRows.length, 1);
      assert.deepEqual(JSON.parse(mondayRows[0].blocksJson), [{ id: 'orphan', clientId: 'c1', hours: 4 }]);

      const sundayRows = db.prepare('SELECT * FROM week_overrides WHERE weekKey = ?').all('2026-05-03');
      assert.equal(sundayRows.length, 0);
      db.close();
    } finally {
      fs.rmSync(dbPath, { force: true });
      fs.rmSync(`${dbPath}-journal`, { force: true });
      fs.rmSync(`${dbPath}-wal`, { force: true });
      fs.rmSync(`${dbPath}-shm`, { force: true });
    }
  });

  it('migration drops a Sunday row that already has a Monday twin (Monday wins)', () => {
    const dbPath = tempDbPath();
    try {
      let db = initDb(dbPath);
      db.prepare(`
        INSERT INTO week_overrides (id, weekKey, dayIndex, slot, blocksJson)
        VALUES ('2026-05-04-2-am', '2026-05-04', 2, 'am', ?)
      `).run(JSON.stringify([{ id: 'monday-version', clientId: 'c1', hours: 2 }]));
      db.prepare(`
        INSERT INTO week_overrides (id, weekKey, dayIndex, slot, blocksJson)
        VALUES ('2026-05-03-2-am', '2026-05-03', 2, 'am', ?)
      `).run(JSON.stringify([{ id: 'stale-sunday-version', clientId: 'c1', hours: 99 }]));
      db.close();

      db = initDb(dbPath);
      init(db);

      const mondayRows = db.prepare('SELECT * FROM week_overrides WHERE weekKey = ?').all('2026-05-04');
      assert.equal(mondayRows.length, 1);
      assert.deepEqual(JSON.parse(mondayRows[0].blocksJson), [{ id: 'monday-version', clientId: 'c1', hours: 2 }]);

      const sundayRows = db.prepare('SELECT * FROM week_overrides WHERE weekKey = ?').all('2026-05-03');
      assert.equal(sundayRows.length, 0);
      db.close();
    } finally {
      fs.rmSync(dbPath, { force: true });
      fs.rmSync(`${dbPath}-journal`, { force: true });
      fs.rmSync(`${dbPath}-wal`, { force: true });
      fs.rmSync(`${dbPath}-shm`, { force: true });
    }
  });

  it('freeze with a pre-existing Sunday-keyed override creates no Sunday rows', () => {
    createTestDb();
    // A Sunday-keyed override sitting in the DB (legacy data) must not seed
    // getUsedWeekKeys with a Sunday series when the template changes.
    saveWeekOverride({ weekKey: '2026-05-03', dayIndex: 2, slot: 'am', blocks: [{ id: 'x', clientId: 'c1', hours: 1 }] });

    freezeWeeksBeforeRecurringChange([{ id: 'r1', clientId: 'c1', slot: 'am', day: 0, hours: 2, position: 0 }]);

    assert.equal(getWeekOverrides('2026-05-03').length, 1, 'leaves the pre-existing Sunday row untouched, but does not add more of them');

    // No other Sunday-keyed week should have been materialized by the freeze.
    const rangeRows = getWeekOverridesRange('2026-01-01', '2026-12-31');
    const sundayKeys = new Set(rangeRows.filter(r => new Date(`${r.weekKey}T00:00:00`).getDay() === 0).map(r => r.weekKey));
    assert.deepEqual([...sundayKeys], ['2026-05-03'], 'only the pre-existing Sunday key remains, no new Sunday series was created');
  });
});
