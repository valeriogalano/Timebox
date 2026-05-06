const { INIT_CLIENTS, INIT_PROJECTS, INIT_RECURRING, getSeedEntries } = require('./schema');

let db;

function init(database) {
  db = database;
}

// ── Clients ────────────────────────────────────────────────────────────────────
function getClients() {
  return db.prepare('SELECT * FROM clients ORDER BY position').all().map(normalizeClient);
}

function saveClient(client) {
  db.prepare(`
    INSERT INTO clients (id,name,color,billable,billing,rate,limitType,limitHours,position)
    VALUES (@id,@name,@color,@billable,@billing,@rate,@limitType,@limitHours,@position)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, color=excluded.color, billable=excluded.billable,
      billing=excluded.billing, rate=excluded.rate,
      limitType=excluded.limitType, limitHours=excluded.limitHours, position=excluded.position
  `).run({ position: 0, ...client, billable: client.billable ? 1 : 0 });
}

function deleteClient(id) {
  db.prepare('DELETE FROM clients WHERE id=?').run(id);
}

function normalizeClient(row) {
  return { ...row, billable: row.billable === 1 };
}

// ── Projects ───────────────────────────────────────────────────────────────────
function getProjects() {
  return db.prepare('SELECT * FROM projects ORDER BY position').all().map(normalizeProject);
}

function saveProject(project) {
  db.prepare(`
    INSERT INTO projects (id,clientId,name,budgetHours,weeklyHours,position,archived)
    VALUES (@id,@clientId,@name,@budgetHours,@weeklyHours,@position,@archived)
    ON CONFLICT(id) DO UPDATE SET
      clientId=excluded.clientId, name=excluded.name,
      budgetHours=excluded.budgetHours, weeklyHours=excluded.weeklyHours,
      position=excluded.position, archived=excluded.archived
  `).run({ position: 0, archived: 0, weeklyHours: null, ...project, archived: project.archived ? 1 : 0 });
}

function deleteProject(id) {
  db.prepare('DELETE FROM projects WHERE id=?').run(id);
}

function normalizeProject(row) {
  return { ...row, archived: row.archived === 1 };
}

// ── Recurring ──────────────────────────────────────────────────────────────────
function getRecurring() {
  return db.prepare('SELECT * FROM recurring ORDER BY day, slot, position').all();
}

function saveRecurring(r) {
  db.prepare(`
    INSERT INTO recurring (id,clientId,slot,day,hours,position)
    VALUES (@id,@clientId,@slot,@day,@hours,@position)
    ON CONFLICT(id) DO UPDATE SET
      clientId=excluded.clientId, slot=excluded.slot,
      day=excluded.day, hours=excluded.hours, position=excluded.position
  `).run({ position: 0, ...r });
}

function deleteRecurring(id) {
  db.prepare('DELETE FROM recurring WHERE id=?').run(id);
}

// ── Entries ────────────────────────────────────────────────────────────────────
function getProjectTotals() {
  return db.prepare(
    'SELECT projectId, SUM(hours) as totalHours FROM entries GROUP BY projectId'
  ).all().reduce((acc, row) => { acc[row.projectId] = row.totalHours; return acc; }, {});
}

function getEntries(dateFrom, dateTo) {
  return db.prepare(
    'SELECT * FROM entries WHERE date BETWEEN ? AND ? ORDER BY date'
  ).all(dateFrom, dateTo).map(normalizeEntry);
}

function saveEntry(entry) {
  db.prepare(`
    INSERT INTO entries (id,projectId,date,hours,slot,billed)
    VALUES (@id,@projectId,@date,@hours,@slot,@billed)
    ON CONFLICT(id) DO UPDATE SET
      projectId=excluded.projectId, date=excluded.date,
      hours=excluded.hours, slot=excluded.slot, billed=excluded.billed
  `).run({ ...entry, billed: entry.billed ? 1 : 0 });
}

function deleteEntry(id) {
  db.prepare('DELETE FROM entries WHERE id=?').run(id);
}

function normalizeEntry(row) {
  return { ...row, billed: row.billed === 1 };
}

// ── Week Overrides ─────────────────────────────────────────────────────────────
function getWeekOverrides(weekKey) {
  return db.prepare(
    'SELECT * FROM week_overrides WHERE weekKey=?'
  ).all(weekKey).map(row => ({
    ...row,
    blocks: JSON.parse(row.blocksJson),
  }));
}

function getWeekOverridesRange(fromWeekKey, toWeekKey) {
  return db.prepare(
    'SELECT * FROM week_overrides WHERE weekKey >= ? AND weekKey <= ?'
  ).all(fromWeekKey, toWeekKey).map(row => ({
    ...row,
    blocks: JSON.parse(row.blocksJson),
  }));
}

function saveWeekOverride(override) {
  const id = `${override.weekKey}-${override.dayIndex}-${override.slot}`;
  db.prepare(`
    INSERT INTO week_overrides (id,weekKey,dayIndex,slot,blocksJson)
    VALUES (?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET blocksJson=excluded.blocksJson
  `).run(id, override.weekKey, override.dayIndex, override.slot, JSON.stringify(override.blocks));
}

function deleteWeekOverride(weekKey, dayIndex, slot) {
  const id = `${weekKey}-${dayIndex}-${slot}`;
  db.prepare('DELETE FROM week_overrides WHERE id=?').run(id);
}

function freezeWeeksBeforeRecurringChange(currentRecurring) {
  const dates = db.prepare('SELECT DISTINCT date FROM entries').all().map(r => r.date);
  if (!dates.length) return;

  function toMonday(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  const weekKeys = [...new Set(dates.map(toMonday))];
  const insert = db.prepare(`
    INSERT OR IGNORE INTO week_overrides (id, weekKey, dayIndex, slot, blocksJson)
    VALUES (?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const weekKey of weekKeys) {
      for (let dayIndex = 0; dayIndex < 5; dayIndex++) {
        for (const slot of ['am', 'pm']) {
          const id = `${weekKey}-${dayIndex}-${slot}`;
          const blocks = currentRecurring
            .filter(r => r.day === dayIndex && r.slot === slot)
            .sort((a, b) => a.position - b.position)
            .map(r => ({ id: r.id, clientId: r.clientId, hours: r.hours }));
          insert.run(id, weekKey, dayIndex, slot, JSON.stringify(blocks));
        }
      }
    }
  })();
}

// ── Data management ────────────────────────────────────────────────────────────
function resetAllData() {
  db.exec(`
    DELETE FROM entries;
    DELETE FROM week_overrides;
    DELETE FROM recurring;
    DELETE FROM projects;
    DELETE FROM clients;
  `);
}

function seedDemoData() {
  resetAllData();
  const insertClient   = db.prepare('INSERT INTO clients (id,name,color,billable,billing,rate,limitType,limitHours,position) VALUES (?,?,?,?,?,?,?,?,?)');
  const insertProject  = db.prepare('INSERT INTO projects (id,clientId,name,budgetHours,weeklyHours,position) VALUES (?,?,?,?,?,?)');
  const insertRecurring = db.prepare('INSERT INTO recurring (id,clientId,slot,day,hours,position) VALUES (?,?,?,?,?,?)');
  const insertEntry    = db.prepare('INSERT INTO entries (id,projectId,date,hours,slot,billed) VALUES (?,?,?,?,?,?)');

  db.transaction(() => {
    for (const c of INIT_CLIENTS)
      insertClient.run(c.id, c.name, c.color, c.billable ?? 1, c.billing, c.rate, c.limitType ?? null, c.limitHours, c.position ?? 0);
    for (const p of INIT_PROJECTS)
      insertProject.run(p.id, p.clientId, p.name, p.budgetHours, p.weeklyHours ?? null, p.position ?? 0);
    for (const r of INIT_RECURRING)
      insertRecurring.run(r.id, r.clientId, r.slot, r.day, r.hours, r.position ?? 0);
    for (const e of getSeedEntries())
      insertEntry.run(e.id, e.projectId, e.date, e.hours, e.slot, e.billed);
  })();
}

module.exports = {
  init,
  getClients, saveClient, deleteClient,
  getProjects, saveProject, deleteProject,
  getRecurring, saveRecurring, deleteRecurring,
  getEntries, getProjectTotals, saveEntry, deleteEntry,
  getWeekOverrides, getWeekOverridesRange, saveWeekOverride, deleteWeekOverride, freezeWeeksBeforeRecurringChange,
  resetAllData, seedDemoData,
};
