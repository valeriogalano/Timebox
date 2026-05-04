const Database = require('better-sqlite3');

const INIT_CLIENTS = [
  { id: 'c1', name: 'Acme Corp',    color: '#4A8FE8', billing: 'hourly',  rate: 85,   limitType: 'weekly',  limitHours: 20, carryover: 0 },
  { id: 'c2', name: 'The Blog',     color: '#E07B3A', billing: 'fixed',   rate: null, limitType: 'monthly', limitHours: 40, carryover: 1 },
  { id: 'c3', name: 'GreenTech SA', color: '#3DB33D', billing: 'budget',  rate: 70,   limitType: 'monthly', limitHours: 60, carryover: 0 },
  { id: 'c4', name: 'Studio Nova',  color: '#9B59B6', billing: 'hourly',  rate: 120,  limitType: 'weekly',  limitHours: 10, carryover: 0 },
];

const INIT_PROJECTS = [
  { id: 'p1', clientId: 'c1', name: 'Website Redesign',  budgetHours: 80   },
  { id: 'p2', clientId: 'c1', name: 'API Integration',   budgetHours: 40   },
  { id: 'p3', clientId: 'c2', name: 'Monthly Articles',  budgetHours: null },
  { id: 'p4', clientId: 'c3', name: 'Dashboard MVP',     budgetHours: 120  },
  { id: 'p5', clientId: 'c3', name: 'Mobile App',        budgetHours: 60   },
  { id: 'p6', clientId: 'c4', name: 'Brand Identity',    budgetHours: 30   },
];

const INIT_RECURRING = [
  { id: 'r1',  clientId: 'c1', slot: 'am', day: 0, hours: 2,   position: 0 },
  { id: 'r11', clientId: 'c3', slot: 'am', day: 0, hours: 1.5, position: 1 },
  { id: 'r2',  clientId: 'c1', slot: 'am', day: 1, hours: 3.5, position: 0 },
  { id: 'r3',  clientId: 'c3', slot: 'am', day: 2, hours: 3.5, position: 0 },
  { id: 'r4',  clientId: 'c3', slot: 'am', day: 3, hours: 2,   position: 0 },
  { id: 'r12', clientId: 'c1', slot: 'am', day: 3, hours: 1.5, position: 1 },
  { id: 'r5',  clientId: 'c1', slot: 'am', day: 4, hours: 3.5, position: 0 },
  { id: 'r6',  clientId: 'c2', slot: 'pm', day: 0, hours: 2.5, position: 0 },
  { id: 'r7',  clientId: 'c2', slot: 'pm', day: 1, hours: 1.5, position: 0 },
  { id: 'r13', clientId: 'c4', slot: 'pm', day: 1, hours: 1,   position: 1 },
  { id: 'r8',  clientId: 'c4', slot: 'pm', day: 2, hours: 2,   position: 0 },
  { id: 'r9',  clientId: 'c4', slot: 'pm', day: 3, hours: 2,   position: 0 },
  { id: 'r10', clientId: 'c2', slot: 'pm', day: 4, hours: 2.5, position: 0 },
];

function getSeedEntries() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = today.getDate();
  const monday = new Date(today);
  const dow = monday.getDay();
  monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1));

  function d(offset) {
    const dt = new Date(monday);
    dt.setDate(dt.getDate() + offset);
    return dt.toISOString().slice(0, 10);
  }

  const prevMonday = new Date(monday);
  prevMonday.setDate(prevMonday.getDate() - 7);
  function pd(offset) {
    const dt = new Date(prevMonday);
    dt.setDate(dt.getDate() + offset);
    return dt.toISOString().slice(0, 10);
  }

  return [
    { id: 'e1',  projectId: 'p1', date: d(0),  hours: 3.5, slot: 'am', billed: 1 },
    { id: 'e2',  projectId: 'p3', date: d(0),  hours: 2,   slot: 'pm', billed: 1 },
    { id: 'e3',  projectId: 'p2', date: d(1),  hours: 4,   slot: 'am', billed: 0 },
    { id: 'e4',  projectId: 'p3', date: d(1),  hours: 2.5, slot: 'pm', billed: 1 },
    { id: 'e5',  projectId: 'p4', date: d(2),  hours: 2,   slot: 'am', billed: 0 },
    { id: 'e6',  projectId: 'p1', date: pd(0), hours: 3.5, slot: 'am', billed: 1 },
    { id: 'e7',  projectId: 'p6', date: pd(1), hours: 2,   slot: 'pm', billed: 1 },
    { id: 'e8',  projectId: 'p4', date: pd(2), hours: 3.5, slot: 'am', billed: 0 },
    { id: 'e9',  projectId: 'p5', date: pd(3), hours: 2,   slot: 'pm', billed: 0 },
    { id: 'e10', projectId: 'p3', date: pd(4), hours: 2.5, slot: 'pm', billed: 1 },
  ];
}

function initDb(dbPath) {
  const db = new Database(dbPath);

  // Hold an exclusive lock so iCloud Drive cannot lock the file during writes.
  // WAL mode avoids journal-file conflicts with iCloud's sync daemon.
  db.pragma('locking_mode = EXCLUSIVE');
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      billing TEXT,
      rate REAL,
      limitType TEXT,
      limitHours REAL,
      carryover INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      clientId TEXT,
      name TEXT,
      budgetHours REAL
    );
    CREATE TABLE IF NOT EXISTS recurring (
      id TEXT PRIMARY KEY,
      clientId TEXT,
      slot TEXT,
      day INTEGER,
      hours REAL,
      position INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      projectId TEXT,
      date TEXT,
      hours REAL,
      slot TEXT,
      billed INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS week_overrides (
      id TEXT PRIMARY KEY,
      weekKey TEXT NOT NULL,
      dayIndex INTEGER NOT NULL,
      slot TEXT NOT NULL,
      blocksJson TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);
    CREATE INDEX IF NOT EXISTS idx_overrides_weekkey ON week_overrides(weekKey);
  `);

  // Migration: add position column to recurring if it doesn't exist yet
  try {
    db.exec('ALTER TABLE recurring ADD COLUMN position INTEGER DEFAULT 0');
  } catch (_) {}

  return db;
}

module.exports = { initDb, INIT_CLIENTS, INIT_PROJECTS, INIT_RECURRING, getSeedEntries };
