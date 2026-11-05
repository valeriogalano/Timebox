'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { createTestDb } = require('./helpers');
const { initDb, mergeSameDayEntries } = require('../../db/schema');
const q = require('../../db/queries');
const { getEntries, saveEntry, saveWeekOverride } = q;
const { getPlanVsTrackedData } = require('../commands/plan-vs-tracked');

const DAY = '2031-03-04';
const entriesOf = (date, projectId = 'p1') => getEntries(date, date).filter(e => e.projectId === projectId);

// A database as the previous version left it: one entry per project, day and slot.
function oldDatabase(file) {
  const db = initDb(file);
  q.init(db);
  q.seedDemoData();
  db.exec(`
    DROP INDEX idx_entries_project_date;
    CREATE UNIQUE INDEX idx_entries_project_date_slot ON entries(projectId, date, slot);
    INSERT INTO settings (key, value) VALUES ('slotsTrackedSince', '2026-10-17');
  `);
  const insert = db.prepare('INSERT INTO entries (id,projectId,date,hours,billableHours,slot,billed) VALUES (?,?,?,?,?,?,?)');
  insert.run('a1', 'p1', DAY, 2, null, 'am', 1);      // billed, billable = hours
  insert.run('a2', 'p1', DAY, 1.5, 1, 'pm', 1);       // billed, billable below hours
  insert.run('a3', 'p1', DAY, 0.5, null, 'sera', 1);  // billed
  insert.run('b1', 'p2', DAY, 2, null, 'am', 1);      // billed
  insert.run('b2', 'p2', DAY, 1, null, 'pm', 0);      // not billed, imported from Todoist
  insert.run('c1', 'p3', DAY, 1, 2, 'am', 0);         // a round-up and a write-off cancel out
  insert.run('c2', 'p3', DAY, 1, 0, 'pm', 0);
  insert.run('d1', 'p4', DAY, 3, null, 'pm', 1);      // alone: untouched
  insert.run('n1', 'p5', DAY, 2, null, 'am', 0);      // a row without hours counts as zero
  insert.run('n2', 'p5', DAY, null, null, 'pm', 0);
  db.prepare(`INSERT INTO todoist_imports (todoistTaskId,projectId,date,hours,slot,titleSnapshot,note,importedAt)
    VALUES ('t1','p2',?,1,'pm','Task',NULL,'2031-03-04T10:00:00Z')`).run(DAY);
  db.close();
}

describe('migration to one entry per project and day', () => {
  let dir, file, db;
  const backups = () => fs.readdirSync(dir).filter(f => f.includes('-before-entry-merge-'));

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'timebox-merge-'));
    file = path.join(dir, 'timebox.db');
    oldDatabase(file);
    db = initDb(file);
    q.init(db);
  });
  after(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('same-day entries merge: hours summed, billable as effective values, billed only if all were', () => {
    const row = id => db.prepare('SELECT id, hours, billableHours, billed FROM entries WHERE id = ?').get(id);
    assert.deepEqual(entriesOf(DAY, 'p1').map(e => e.id), ['a1']);
    assert.deepEqual(row('a1'), { id: 'a1', hours: 4, billableHours: 3.5, billed: 1 });
    assert.deepEqual(row('b1'), { id: 'b1', hours: 3, billableHours: null, billed: 0 });
    assert.deepEqual(row('c1'), { id: 'c1', hours: 2, billableHours: null, billed: 0 });
    assert.deepEqual(row('d1'), { id: 'd1', hours: 3, billableHours: null, billed: 1 });
    assert.deepEqual(row('n1'), { id: 'n1', hours: 2, billableHours: null, billed: 0 });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM entries WHERE date = ?').get(DAY).n, 5);
  });

  test('the unique index is on project and day, and the slot setting is gone', () => {
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'entries'").all().map(r => r.name);
    assert.ok(indexes.includes('idx_entries_project_date'));
    assert.ok(!indexes.includes('idx_entries_project_date_slot'));
    assert.throws(() => db.prepare("INSERT INTO entries (id,projectId,date,hours) VALUES ('x','p4',?,1)").run(DAY), /UNIQUE/);
    assert.equal(q.getSetting('slotsTrackedSince'), null);
  });

  test('a copy of the database before the merge sits next to it', () => {
    assert.equal(backups().length, 1);
    const copy = new Database(path.join(dir, backups()[0]), { readonly: true });
    assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM entries WHERE date = ?').get(DAY).n, 10);
    copy.close();
  });

  test('an import still finds its hours in the merged entry', () => {
    assert.equal(q.getTodoistImports(DAY, DAY)[0].slot, undefined);
    assert.deepEqual(q.deleteTodoistImport('t1'), { deleted: true });
    assert.equal(entriesOf(DAY, 'p2')[0].hours, 2);
  });

  test('opening the database again changes nothing and makes no second copy', () => {
    const before = db.prepare('SELECT * FROM entries ORDER BY id').all();
    db.close();
    db = initDb(file);
    q.init(db);
    assert.deepEqual(db.prepare('SELECT * FROM entries ORDER BY id').all(), before);
    assert.equal(backups().length, 1);
  });
});

describe('mergeSameDayEntries on a database in memory', () => {
  test('merges without a copy: there is no file to copy next to', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE entries (id TEXT PRIMARY KEY, projectId TEXT, date TEXT, hours REAL, billableHours REAL, slot TEXT, billed INTEGER);
      INSERT INTO entries VALUES ('a','p','2031-01-01',1,NULL,'am',1), ('b','p','2031-01-01',1,NULL,'pm',1), ('c',NULL,'2031-01-01',1,NULL,'am',0), ('d',NULL,'2031-01-01',1,NULL,'pm',0);`);
    assert.equal(mergeSameDayEntries(db), null);
    // rows without a project are left alone: the unique index does not see them either
    assert.deepEqual(db.prepare('SELECT id, hours, billed FROM entries ORDER BY id').all().map(r => [r.id, r.hours, r.billed]),
      [['a', 2, 1], ['c', 1, 0], ['d', 1, 0]]);
    assert.equal(mergeSameDayEntries(db), null);
    db.close();
  });
});

describe('saveEntry', () => {
  before(() => createTestDb());

  test('moving an entry onto a day where its project has one merges the two', () => {
    saveEntry({ id: 'm1', projectId: 'p1', date: DAY, hours: 2, billableHours: 1.5, billed: true });
    saveEntry({ id: 'm2', projectId: 'p1', date: '2031-03-05', hours: 1, billableHours: null, billed: false });
    saveEntry({ id: 'm2', projectId: 'p1', date: DAY, hours: 1, billableHours: null, billed: false });
    assert.deepEqual(entriesOf(DAY).map(e => [e.id, e.hours, e.billableHours, e.billed]), [['m1', 3, 2.5, false]]);
    assert.deepEqual(entriesOf('2031-03-05'), []);
  });

  test('a new entry on a day the project already has replaces its hours (upsert)', () => {
    saveEntry({ id: 'm3', projectId: 'p1', date: DAY, hours: 5, billableHours: null, billed: false });
    assert.deepEqual(entriesOf(DAY).map(e => [e.id, e.hours]), [['m3', 5]]);
  });
});

describe('getPlanVsTrackedData', () => {
  // Martedì 4 marzo 2031, settimana del 3: c1 pianificata 2h al mattino e 2h al
  // pomeriggio, lavorate 3h, più 1h di c4 (fuori piano).
  before(() => {
    createTestDb();
    saveWeekOverride({ weekKey: '2031-03-03', dayIndex: 1, slot: 'am', blocks: [{ id: 'a', clientId: 'c1', hours: 2 }] });
    saveWeekOverride({ weekKey: '2031-03-03', dayIndex: 1, slot: 'pm', blocks: [{ id: 'b', clientId: 'c1', hours: 2 }] });
    saveWeekOverride({ weekKey: '2031-03-03', dayIndex: 1, slot: 'sera', blocks: [] });
    saveEntry({ id: 'w1', projectId: 'p1', date: DAY, hours: 3, billableHours: null, billed: false });
    saveEntry({ id: 'w2', projectId: 'p6', date: DAY, hours: 1, billableHours: null, billed: false });
  });

  test('per slot and area: planned and covered by block filling; per day: worked and extra', () => {
    const d = getPlanVsTrackedData({ from: DAY, to: DAY });
    const [day] = d.days;
    const area = (slot, id) => day.slots.find(s => s.slot === slot).areas.find(a => a.areaId === id);
    assert.deepEqual(area('am', 'c1'), { areaId: 'c1', area: area('am', 'c1').area, plannedHours: 2, coveredHours: 2 });
    assert.equal(area('pm', 'c1').coveredHours, 1);
    assert.deepEqual(day.slots.find(s => s.slot === 'sera').areas, []);
    assert.deepEqual([day.plannedHours, day.coveredHours, day.trackedHours, day.extraHours], [4, 3, 4, 1]);
    assert.deepEqual([d.totals.plannedHours, d.totals.coveredHours, d.totals.trackedHours, d.totals.extraHours], [4, 3, 4, 1]);
    assert.deepEqual(d.totals.bySlot.pm, { plannedHours: 2, coveredHours: 1 });
  });
});

describe('an entry whose project no longer exists', () => {
  // The CLI and MCP show it as area "?" (and count it) instead of failing.
  const { getTodayData } = require('../commands/today');
  const { getWeekData } = require('../commands/week');
  const { getDaySummaryData } = require('../commands/day-summary');
  const { getEntriesData } = require('../commands/entries');
  const ORPHAN_DAY = '2031-03-11';

  before(() => {
    const db = createTestDb();
    db.pragma('foreign_keys = OFF');
    db.prepare("INSERT INTO entries (id,projectId,date,hours,billableHours,billed) VALUES ('orphan','gone',?,2,NULL,0)").run(ORPHAN_DAY);
  });

  test('today, week, day summary and entries list it under "?"', () => {
    const [today] = getTodayData(ORPHAN_DAY).entries;
    assert.deepEqual([today.project, today.area, today.isBillable], ['gone', '?', false]);
    const day = getWeekData(new Date(`${ORPHAN_DAY}T12:00:00`), 0).days.find(d => d.date === ORPHAN_DAY);
    assert.deepEqual([day.entries[0].project, day.entries[0].area, day.entries[0].areaStatus], ['gone', '?', 'active']);
    const [summary] = getDaySummaryData(ORPHAN_DAY).trackedEntries;
    assert.deepEqual([summary.project, summary.clientId, summary.area, summary.areaStatus], ['gone', null, '?', 'active']);
    const [entry] = getEntriesData({ from: ORPHAN_DAY, to: ORPHAN_DAY }).entries;
    assert.deepEqual([entry.project, entry.area, entry.areaId, entry.billableHours], ['?', '?', null, null]);
  });
});
