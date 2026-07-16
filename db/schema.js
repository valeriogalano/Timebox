const Database = require('better-sqlite3');

const INIT_CLIENTS = [
  { id: 'c1', name: 'Acme Corp',    color: '#3B82F6', billing: 'hourly', rate: 85,   limitType: 'weekly', limitHours: 20, billable: 1, position: 0 },
  { id: 'c2', name: 'The Blog',     color: '#F97316', billing: 'fixed',  rate: null, limitType: 'weekly', limitHours: 10, billable: 1, position: 1 },
  { id: 'c3', name: 'GreenTech SA', color: '#06B6D4', billing: 'hourly', rate: 70,   limitType: 'global', limitHours: 200, billable: 1, position: 2 },
  { id: 'c4', name: 'Studio Nova',  color: '#8B5CF6', billing: 'hourly', rate: 120,  limitType: 'global', limitHours: 80,  billable: 1, position: 3 },
];

const INIT_PROJECTS = [
  { id: 'p1', clientId: 'c1', name: 'Website Redesign',  description: 'Restyling completo del sito pubblico: UX, UI e ottimizzazione mobile.',          budgetHours: 80,   weeklyHours: 10,   position: 0 },
  { id: 'p2', clientId: 'c1', name: 'API Integration',   description: 'Integrazione REST con i sistemi ERP del cliente, autenticazione OAuth2.',         budgetHours: 40,   weeklyHours: null, position: 1 },
  { id: 'p3', clientId: 'c2', name: 'Monthly Articles',  description: 'Quattro articoli mensili su tech e produttività per il blog editoriale.',          budgetHours: null, weeklyHours: 5,    position: 0 },
  { id: 'p4', clientId: 'c3', name: 'Dashboard MVP',     description: 'Prima versione della dashboard IoT: grafici real-time e alert soglie sensori.',    budgetHours: 120,  weeklyHours: null, position: 0 },
  { id: 'p5', clientId: 'c3', name: 'Mobile App',        description: 'App iOS/Android per monitoraggio impianti in campo, offline-first.',               budgetHours: 60,   weeklyHours: null, position: 1 },
  { id: 'p6', clientId: 'c4', name: 'Brand Identity',    description: 'Logo, palette colori, tipografia e linee guida per il nuovo brand dello studio.',  budgetHours: 30,   weeklyHours: null, position: 0 },
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
  { id: 'r14', clientId: 'c3', slot: 'sera', day: 1, hours: 1.5, position: 0 },
  { id: 'r15', clientId: 'c4', slot: 'sera', day: 3, hours: 1,   position: 0 },
];

function getSeedEntries() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = today.getDate();
  const monday = new Date(today);
  const dow = monday.getDay();
  monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1));

  function fmtLocal(dt) {
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  function d(offset) {
    const dt = new Date(monday);
    dt.setDate(dt.getDate() + offset);
    return fmtLocal(dt);
  }

  const prevMonday = new Date(monday);
  prevMonday.setDate(prevMonday.getDate() - 7);
  function pd(offset) {
    const dt = new Date(prevMonday);
    dt.setDate(dt.getDate() + offset);
    return fmtLocal(dt);
  }

  return [
    { id: 'e1',  projectId: 'p1', date: d(0),  hours: 3.5, billableHours: null, slot: 'am', billed: 1 },
    { id: 'e2',  projectId: 'p3', date: d(0),  hours: 2,   billableHours: null, slot: 'pm', billed: 1 },
    { id: 'e3',  projectId: 'p2', date: d(1),  hours: 4,   billableHours: 3.5,  slot: 'am', billed: 0 }, // arrotondamento contrattuale
    { id: 'e4',  projectId: 'p3', date: d(1),  hours: 2,   billableHours: null, slot: 'pm', billed: 1 },
    { id: 'e5',  projectId: 'p4', date: d(2),  hours: 2.5, billableHours: 2,    slot: 'am', billed: 0 }, // cap fisso raggiunto
    { id: 'e11', projectId: 'p3', date: d(1),  hours: 2,   billableHours: 0,    slot: 'am', billed: 0 }, // lavoro interno
    { id: 'e12', projectId: 'p6', date: d(2),  hours: 2,   billableHours: 1.5,  slot: 'pm', billed: 0 }, // sconto di cortesia
    { id: 'e6',  projectId: 'p1', date: pd(0), hours: 3.5, billableHours: null, slot: 'am', billed: 1 },
    { id: 'e7',  projectId: 'p6', date: pd(1), hours: 2,   billableHours: null, slot: 'pm', billed: 1 },
    { id: 'e8',  projectId: 'p4', date: pd(2), hours: 3.5, billableHours: null, slot: 'am', billed: 0 },
    { id: 'e9',  projectId: 'p5', date: pd(3), hours: 2,   billableHours: null, slot: 'pm', billed: 0 },
    { id: 'e10', projectId: 'p3', date: pd(4), hours: 2.5, billableHours: null, slot: 'pm', billed: 1 },
    { id: 'e13', projectId: 'p4', date: d(1),  hours: 1.5, billableHours: null, slot: 'sera', billed: 0 }, // sessione serale
    { id: 'e14', projectId: 'p6', date: pd(3), hours: 1,   billableHours: null, slot: 'sera', billed: 1 },
  ];
}

function initDb(dbPath) {
  const db = new Database(dbPath);

  // Hold an exclusive lock so iCloud Drive cannot lock the file during writes.
  // WAL mode avoids journal-file conflicts with iCloud's sync daemon.
  db.pragma('locking_mode = EXCLUSIVE');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF');

  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      billable INTEGER DEFAULT 1,
      billing TEXT,
      rate REAL,
      limitType TEXT,
      limitHours REAL,
      position INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      clientId TEXT REFERENCES clients(id) ON DELETE CASCADE,
      name TEXT,
      budgetHours REAL,
      weeklyHours REAL,
      description TEXT,
      position INTEGER DEFAULT 0,
      archived INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS recurring (
      id TEXT PRIMARY KEY,
      clientId TEXT REFERENCES clients(id) ON DELETE CASCADE,
      slot TEXT,
      day INTEGER,
      hours REAL,
      position INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      projectId TEXT REFERENCES projects(id) ON DELETE CASCADE,
      date TEXT,
      hours REAL,
      billableHours REAL,
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
    CREATE TABLE IF NOT EXISTS week_area_status (
      id TEXT PRIMARY KEY,
      weekKey TEXT NOT NULL,
      areaId TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('active', 'minimal', 'closed'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS todoist_cache (
      dateStr TEXT PRIMARY KEY,
      tasksJson TEXT NOT NULL DEFAULT '[]',
      syncedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS todoist_imports (
      todoistTaskId TEXT PRIMARY KEY,
      projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      hours REAL NOT NULL,
      slot TEXT NOT NULL DEFAULT 'am',
      titleSnapshot TEXT,
      note TEXT,
      importedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);
    CREATE INDEX IF NOT EXISTS idx_overrides_weekkey ON week_overrides(weekKey);
    CREATE INDEX IF NOT EXISTS idx_week_area_status_weekkey ON week_area_status(weekKey);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_week_area_status_unique ON week_area_status(weekKey, areaId);
    CREATE INDEX IF NOT EXISTS idx_todoist_imports_date ON todoist_imports(date);
    CREATE INDEX IF NOT EXISTS idx_todoist_imports_project_date ON todoist_imports(projectId, date);
  `);

  // Migrations
  try { db.exec('ALTER TABLE recurring ADD COLUMN position INTEGER DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE clients ADD COLUMN billable INTEGER DEFAULT 1'); } catch (_) {}
  try {
    db.exec('ALTER TABLE clients ADD COLUMN position INTEGER DEFAULT 0');
    const clientRows = db.prepare('SELECT id FROM clients ORDER BY rowid').all();
    clientRows.forEach((row, i) => db.prepare('UPDATE clients SET position=? WHERE id=?').run(i, row.id));
  } catch (_) {}
  try {
    db.exec('ALTER TABLE projects ADD COLUMN position INTEGER DEFAULT 0');
    const projectRows = db.prepare('SELECT id FROM projects ORDER BY rowid').all();
    projectRows.forEach((row, i) => db.prepare('UPDATE projects SET position=? WHERE id=?').run(i, row.id));
  } catch (_) {}
  try { db.exec('ALTER TABLE projects ADD COLUMN archived INTEGER DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE projects ADD COLUMN weeklyHours REAL'); } catch (_) {}
  try { db.exec('ALTER TABLE projects ADD COLUMN description TEXT'); } catch (_) {}
  try { db.exec('ALTER TABLE entries ADD COLUMN billableHours REAL'); } catch (_) {}
  try { db.exec("ALTER TABLE todoist_imports ADD COLUMN slot TEXT NOT NULL DEFAULT 'am'"); } catch (_) {}
  try { db.exec('ALTER TABLE todoist_imports ADD COLUMN note TEXT'); } catch (_) {}
  db.exec("UPDATE todoist_imports SET slot = 'am' WHERE slot IS NULL OR slot NOT IN ('am', 'pm', 'sera')");
  db.exec(`
    UPDATE entries
    SET slot = 'am'
    WHERE slot IS NULL OR slot NOT IN ('am', 'pm', 'sera');

    CREATE TEMP TABLE entry_slot_dedupe AS
    SELECT
      MIN(rowid) AS keepRowid,
      projectId,
      date,
      slot,
      SUM(hours) AS hours,
      CASE
        WHEN SUM(CASE WHEN billableHours IS NOT NULL THEN 1 ELSE 0 END) > 0
        THEN SUM(COALESCE(billableHours, hours))
        ELSE NULL
      END AS billableHours,
      MIN(COALESCE(billed, 0)) AS billed
    FROM entries
    GROUP BY projectId, date, slot
    HAVING COUNT(*) > 1;

    UPDATE entries
    SET
      hours = (SELECT hours FROM entry_slot_dedupe WHERE keepRowid = entries.rowid),
      billableHours = (SELECT billableHours FROM entry_slot_dedupe WHERE keepRowid = entries.rowid),
      billed = (SELECT billed FROM entry_slot_dedupe WHERE keepRowid = entries.rowid)
    WHERE rowid IN (SELECT keepRowid FROM entry_slot_dedupe);

    DELETE FROM entries
    WHERE rowid IN (
      SELECT entries.rowid
      FROM entries
      JOIN entry_slot_dedupe
        ON entries.projectId = entry_slot_dedupe.projectId
       AND entries.date = entry_slot_dedupe.date
       AND entries.slot = entry_slot_dedupe.slot
       AND entries.rowid != entry_slot_dedupe.keepRowid
    );

    DROP TABLE entry_slot_dedupe;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_project_date_slot
      ON entries(projectId, date, slot);
  `);

  cleanupOrphans(db);
  rebuildForeignKeyTables(db);
  ensureIndexes(db);
  db.pragma('foreign_keys = ON');

  return db;
}

function cleanupOrphans(db) {
  db.exec(`
    DELETE FROM entries
    WHERE projectId IS NOT NULL
      AND projectId NOT IN (SELECT id FROM projects);

    DELETE FROM todoist_imports
    WHERE projectId NOT IN (SELECT id FROM projects);

    DELETE FROM recurring
    WHERE clientId IS NOT NULL
      AND clientId NOT IN (SELECT id FROM clients);

    DELETE FROM week_area_status
    WHERE areaId NOT IN (SELECT id FROM clients);

    DELETE FROM projects
    WHERE clientId IS NOT NULL
      AND clientId NOT IN (SELECT id FROM clients);
  `);
}

function tableHasForeignKeys(db, tableName) {
  return db.prepare(`PRAGMA foreign_key_list('${tableName}')`).all().length > 0;
}

function rebuildTable(db, tableName, createSql, columns) {
  const tmpName = `${tableName}_fk_migration`;
  const existingColumns = new Set(db.prepare(`PRAGMA table_info('${tableName}')`).all().map(column => column.name));
  const selectColumns = columns.map(column => {
    if (existingColumns.has(column)) return column;
    if (column === 'position' || column === 'archived') return `0 AS ${column}`;
    if (column === 'billed') return `0 AS ${column}`;
    return `NULL AS ${column}`;
  });
  db.exec(`DROP TABLE IF EXISTS ${tmpName};`);
  db.exec(createSql.replace(`CREATE TABLE ${tableName}`, `CREATE TABLE ${tmpName}`));
  db.exec(`
    INSERT INTO ${tmpName} (${columns.join(', ')})
    SELECT ${selectColumns.join(', ')} FROM ${tableName};
    DROP TABLE ${tableName};
    ALTER TABLE ${tmpName} RENAME TO ${tableName};
  `);
}

function rebuildForeignKeyTables(db) {
  const tables = [
    {
      name: 'projects',
      columns: ['id', 'clientId', 'name', 'description', 'budgetHours', 'weeklyHours', 'position', 'archived'],
      sql: `CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        clientId TEXT REFERENCES clients(id) ON DELETE CASCADE,
        name TEXT,
        description TEXT,
        budgetHours REAL,
        weeklyHours REAL,
        position INTEGER DEFAULT 0,
        archived INTEGER DEFAULT 0
      )`,
    },
    {
      name: 'recurring',
      columns: ['id', 'clientId', 'slot', 'day', 'hours', 'position'],
      sql: `CREATE TABLE recurring (
        id TEXT PRIMARY KEY,
        clientId TEXT REFERENCES clients(id) ON DELETE CASCADE,
        slot TEXT,
        day INTEGER,
        hours REAL,
        position INTEGER DEFAULT 0
      )`,
    },
    {
      name: 'entries',
      columns: ['id', 'projectId', 'date', 'hours', 'billableHours', 'slot', 'billed'],
      sql: `CREATE TABLE entries (
        id TEXT PRIMARY KEY,
        projectId TEXT REFERENCES projects(id) ON DELETE CASCADE,
        date TEXT,
        hours REAL,
        billableHours REAL,
        slot TEXT,
        billed INTEGER DEFAULT 0
      )`,
    },
    {
      name: 'week_area_status',
      columns: ['id', 'weekKey', 'areaId', 'status'],
      sql: `CREATE TABLE week_area_status (
        id TEXT PRIMARY KEY,
        weekKey TEXT NOT NULL,
        areaId TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK(status IN ('active', 'minimal', 'closed'))
      )`,
    },
    {
      name: 'todoist_imports',
      columns: ['todoistTaskId', 'projectId', 'date', 'hours', 'slot', 'titleSnapshot', 'note', 'importedAt'],
      sql: `CREATE TABLE todoist_imports (
        todoistTaskId TEXT PRIMARY KEY,
        projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        hours REAL NOT NULL,
        slot TEXT NOT NULL DEFAULT 'am',
        titleSnapshot TEXT,
        note TEXT,
        importedAt TEXT NOT NULL
      )`,
    },
  ];

  for (const table of tables) {
    if (!tableHasForeignKeys(db, table.name)) {
      rebuildTable(db, table.name, table.sql, table.columns);
    }
  }
}

function ensureIndexes(db) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);
    CREATE INDEX IF NOT EXISTS idx_overrides_weekkey ON week_overrides(weekKey);
    CREATE INDEX IF NOT EXISTS idx_week_area_status_weekkey ON week_area_status(weekKey);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_week_area_status_unique ON week_area_status(weekKey, areaId);
    CREATE INDEX IF NOT EXISTS idx_todoist_imports_date ON todoist_imports(date);
    CREATE INDEX IF NOT EXISTS idx_todoist_imports_project_date ON todoist_imports(projectId, date);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_project_date_slot
      ON entries(projectId, date, slot);
  `);
}

module.exports = { initDb, INIT_CLIENTS, INIT_PROJECTS, INIT_RECURRING, getSeedEntries };
