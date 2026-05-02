const { INIT_CLIENTS, INIT_PROJECTS, INIT_RECURRING, getSeedEntries } = require('./schema');

let db;

function init(database) {
  db = database;
}

// ── Clients ────────────────────────────────────────────────────────────────────
function getClients() {
  return db.prepare('SELECT * FROM clients').all().map(normalizeClient);
}

function saveClient(client) {
  db.prepare(`
    INSERT INTO clients (id,name,color,billing,rate,limitType,limitHours,carryover)
    VALUES (@id,@name,@color,@billing,@rate,@limitType,@limitHours,@carryover)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, color=excluded.color, billing=excluded.billing,
      rate=excluded.rate, limitType=excluded.limitType,
      limitHours=excluded.limitHours, carryover=excluded.carryover
  `).run({ ...client, carryover: client.carryover ? 1 : 0 });
}

function deleteClient(id) {
  db.prepare('DELETE FROM clients WHERE id=?').run(id);
}

function normalizeClient(row) {
  return { ...row, carryover: row.carryover === 1 };
}

// ── Projects ───────────────────────────────────────────────────────────────────
function getProjects() {
  return db.prepare('SELECT * FROM projects').all();
}

function saveProject(project) {
  db.prepare(`
    INSERT INTO projects (id,clientId,name,budgetHours)
    VALUES (@id,@clientId,@name,@budgetHours)
    ON CONFLICT(id) DO UPDATE SET
      clientId=excluded.clientId, name=excluded.name, budgetHours=excluded.budgetHours
  `).run(project);
}

function deleteProject(id) {
  db.prepare('DELETE FROM projects WHERE id=?').run(id);
}

// ── Recurring ──────────────────────────────────────────────────────────────────
function getRecurring() {
  return db.prepare('SELECT * FROM recurring').all();
}

function saveRecurring(r) {
  db.prepare(`
    INSERT INTO recurring (id,clientId,slot,day,hours)
    VALUES (@id,@clientId,@slot,@day,@hours)
    ON CONFLICT(id) DO UPDATE SET
      clientId=excluded.clientId, slot=excluded.slot,
      day=excluded.day, hours=excluded.hours
  `).run(r);
}

function deleteRecurring(id) {
  db.prepare('DELETE FROM recurring WHERE id=?').run(id);
}

// ── Entries ────────────────────────────────────────────────────────────────────
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
  const insertClient   = db.prepare('INSERT INTO clients (id,name,color,billing,rate,limitType,limitHours,carryover) VALUES (?,?,?,?,?,?,?,?)');
  const insertProject  = db.prepare('INSERT INTO projects (id,clientId,name,budgetHours) VALUES (?,?,?,?)');
  const insertRecurring = db.prepare('INSERT INTO recurring (id,clientId,slot,day,hours) VALUES (?,?,?,?,?)');
  const insertEntry    = db.prepare('INSERT INTO entries (id,projectId,date,hours,slot,billed) VALUES (?,?,?,?,?,?)');

  db.transaction(() => {
    for (const c of INIT_CLIENTS)
      insertClient.run(c.id, c.name, c.color, c.billing, c.rate, c.limitType, c.limitHours, c.carryover);
    for (const p of INIT_PROJECTS)
      insertProject.run(p.id, p.clientId, p.name, p.budgetHours);
    for (const r of INIT_RECURRING)
      insertRecurring.run(r.id, r.clientId, r.slot, r.day, r.hours);
    for (const e of getSeedEntries())
      insertEntry.run(e.id, e.projectId, e.date, e.hours, e.slot, e.billed);
  })();
}

module.exports = {
  init,
  getClients, saveClient, deleteClient,
  getProjects, saveProject, deleteProject,
  getRecurring, saveRecurring, deleteRecurring,
  getEntries, saveEntry, deleteEntry,
  getWeekOverrides, saveWeekOverride, deleteWeekOverride,
  resetAllData, seedDemoData,
};
