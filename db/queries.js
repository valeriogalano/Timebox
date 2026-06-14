const { INIT_CLIENTS, INIT_PROJECTS, INIT_RECURRING, getSeedEntries } = require('./schema');
const { randomUUID } = require('crypto');

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
    INSERT INTO projects (id,clientId,name,description,budgetHours,weeklyHours,position,archived)
    VALUES (@id,@clientId,@name,@description,@budgetHours,@weeklyHours,@position,@archived)
    ON CONFLICT(id) DO UPDATE SET
      clientId=excluded.clientId, name=excluded.name, description=excluded.description,
      budgetHours=excluded.budgetHours, weeklyHours=excluded.weeklyHours,
      position=excluded.position, archived=excluded.archived
  `).run({ position: 0, archived: 0, weeklyHours: null, description: null, ...project, archived: project.archived ? 1 : 0 });
}

function deleteProject(id) {
  db.prepare('DELETE FROM projects WHERE id=?').run(id);
}

function hasProjectEntries(id) {
  return db.prepare('SELECT COUNT(*) as c FROM entries WHERE projectId = ?').get(id).c > 0;
}

function mergeBillable(aBillable, aHours, bBillable, bHours) {
  const aSet = aBillable != null;
  const bSet = bBillable != null;
  if (!aSet && !bSet) return null;
  const a = aSet ? aBillable : aHours;
  const b = bSet ? bBillable : bHours;
  return a + b;
}

function mergeProjectEntries(fromId, toId) {
  let count = 0;
  db.transaction(() => {
    const sources = db.prepare('SELECT * FROM entries WHERE projectId = ?').all(fromId);
    count = sources.length;
    for (const e of sources) {
      const existing = db.prepare(
        'SELECT * FROM entries WHERE projectId = ? AND date = ? AND slot = ?'
      ).get(toId, e.date, e.slot);
      if (existing) {
        const mergedBillable = mergeBillable(existing.billableHours, existing.hours, e.billableHours, e.hours);
        db.prepare('UPDATE entries SET hours = ?, billableHours = ? WHERE id = ?').run(existing.hours + e.hours, mergedBillable, existing.id);
        db.prepare('DELETE FROM entries WHERE id = ?').run(e.id);
      } else {
        db.prepare('UPDATE entries SET projectId = ? WHERE id = ?').run(toId, e.id);
      }
    }
    db.prepare('DELETE FROM projects WHERE id = ?').run(fromId);
  })();
  return { count };
}

const TODOIST_COLORS = {
  berry_red:   '#b8255f',
  red:         '#db4035',
  orange:      '#ff9933',
  yellow:      '#fad000',
  olive_green: '#afb83b',
  lime_green:  '#7ecc49',
  green:       '#299438',
  mint_green:  '#6accbc',
  teal:        '#158fad',
  sky_blue:    '#14aaf5',
  light_blue:  '#96c3eb',
  blue:        '#4073ff',
  grape:       '#884dff',
  violet:      '#af38eb',
  lavender:    '#eb96eb',
  magenta:     '#e05194',
  salmon:      '#ff8d85',
  charcoal:    '#808080',
  grey:        '#b8b8b8',
  taupe:       '#ccac93',
};

function todoistColorLabel(colorKey) {
  return colorKey
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getOrCreateTodoistClient(colorKey) {
  const clientId = `todoist-${colorKey}`;
  let client = db.prepare('SELECT * FROM clients WHERE id=?').get(clientId);
  if (!client) {
    const maxPos = db.prepare('SELECT MAX(position) as m FROM clients').get().m ?? 0;
    const color = TODOIST_COLORS[colorKey] ?? '#E44332';
    const name = `Todoist - ${todoistColorLabel(colorKey)}`;
    db.prepare(`
      INSERT INTO clients (id,name,color,billable,billing,rate,limitType,limitHours,position)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(clientId, name, color, 0, 'none', 0, 'none', null, maxPos + 1);
    client = { id: clientId };
  }
  return client;
}

function importTodoistProjects(todoistProjects) {
  const existing = db.prepare('SELECT name FROM projects').all().map(r => r.name);
  const existingSet = new Set(existing);

  const maxProjPos = db.prepare('SELECT MAX(position) as m FROM projects').get().m ?? 0;
  let added = 0;
  todoistProjects.forEach((tp, i) => {
    if (existingSet.has(tp.name)) return;
    const colorKey = tp.color ?? 'charcoal';
    const client = getOrCreateTodoistClient(colorKey);
    db.prepare(`
      INSERT INTO projects (id,clientId,name,description,budgetHours,weeklyHours,position,archived)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(randomUUID(), client.id, tp.name, null, null, null, maxProjPos + 1 + i, 0);
    added++;
  });
  return { added };
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

function deleteRecurringByClient(clientId) {
  db.prepare('DELETE FROM recurring WHERE clientId=?').run(clientId);
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
    INSERT INTO entries (id,projectId,date,hours,billableHours,slot,billed)
    VALUES (@id,@projectId,@date,@hours,@billableHours,@slot,@billed)
    ON CONFLICT(id) DO UPDATE SET
      projectId=excluded.projectId, date=excluded.date,
      hours=excluded.hours, billableHours=excluded.billableHours,
      slot=excluded.slot, billed=excluded.billed
  `).run({ billableHours: null, ...entry, billed: entry.billed ? 1 : 0 });
}

function deleteEntry(id) {
  db.prepare('DELETE FROM entries WHERE id=?').run(id);
}

function normalizeEntry(row) {
  return { ...row, billed: row.billed === 1, billableHours: row.billableHours ?? null };
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
  const RECURRING_DAYS = 7;
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
      for (let dayIndex = 0; dayIndex < RECURRING_DAYS; dayIndex++) {
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

// ── Settings ───────────────────────────────────────────────────────────────────
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)').run(key, value);
}

// ── Todoist cache ──────────────────────────────────────────────────────────────
function getTodoistCache(dates) {
  if (!dates || dates.length === 0) return [];
  const placeholders = dates.map(() => '?').join(',');
  return db.prepare(`SELECT dateStr, tasksJson, syncedAt FROM todoist_cache WHERE dateStr IN (${placeholders})`).all(...dates)
    .map(row => ({ dateStr: row.dateStr, tasks: JSON.parse(row.tasksJson), syncedAt: row.syncedAt }));
}

function setTodoistCache(dateStr, tasks, syncedAt) {
  db.prepare('INSERT OR REPLACE INTO todoist_cache (dateStr,tasksJson,syncedAt) VALUES (?,?,?)').run(dateStr, JSON.stringify(tasks), syncedAt);
}

function getAllTodoistCache() {
  return db.prepare('SELECT dateStr, tasksJson, syncedAt FROM todoist_cache ORDER BY dateStr DESC').all()
    .map(row => ({ dateStr: row.dateStr, tasks: JSON.parse(row.tasksJson), syncedAt: row.syncedAt }));
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
  db.prepare('DELETE FROM todoist_cache').run();

  const insertClient    = db.prepare('INSERT INTO clients (id,name,color,billable,billing,rate,limitType,limitHours,position) VALUES (?,?,?,?,?,?,?,?,?)');
  const insertProject   = db.prepare('INSERT INTO projects (id,clientId,name,description,budgetHours,weeklyHours,position) VALUES (?,?,?,?,?,?,?)');
  const insertRecurring = db.prepare('INSERT INTO recurring (id,clientId,slot,day,hours,position) VALUES (?,?,?,?,?,?)');
  const insertEntry     = db.prepare('INSERT INTO entries (id,projectId,date,hours,billableHours,slot,billed) VALUES (?,?,?,?,?,?,?)');

  const today = new Date();
  const prevMonday = new Date(today);
  const dow = prevMonday.getDay();
  prevMonday.setDate(prevMonday.getDate() - (dow === 0 ? 6 : dow - 1) - 7);
  function pd(offset) {
    const dt = new Date(prevMonday);
    dt.setDate(dt.getDate() + offset);
    return dt.toISOString().slice(0, 10);
  }

  const now = new Date().toISOString();
  const todoistDays = [
    { date: pd(0), tasks: [
      { id: 'td1', projectId: 'p1', content: 'Revisione mockup homepage', hours: 2,   slot: 'am', completed: true, labels: ['Focus 🔕'] },
      { id: 'td2', projectId: 'p3', content: 'Articolo newsletter maggio',  hours: 2.5, slot: 'pm', completed: true, labels: ['IA 🤖', '🍅🍅'] },
    ]},
    { date: pd(1), tasks: [
      { id: 'td3', projectId: 'p2', content: 'Setup endpoint autenticazione', hours: 3.5, slot: 'am', completed: true, labels: ['Bug 🪲'] },
      { id: 'td4', projectId: 'p6', content: 'Palette colori brand',          hours: 1,   slot: 'pm', completed: true, labels: ['Backup 🔀'] },
    ]},
    { date: pd(2), tasks: [
      { id: 'td5', projectId: 'p4', content: 'Integrazione API dati sensori', hours: 2, slot: 'am', completed: true, labels: ['Focus 🔕'] },
      { id: 'td6', projectId: 'p1', content: 'Fix layout mobile',             hours: 1, slot: 'am', completed: true, labels: ['Bug 🪲', '🍅'] },
    ]},
    { date: pd(3), tasks: [
      { id: 'td7', projectId: 'p4', content: 'Grafici dashboard overview', hours: 2, slot: 'am', completed: true, labels: ['IA 🤖'] },
      { id: 'td8', projectId: 'p6', content: 'Bozze logo varianti',         hours: 2, slot: 'pm', completed: true, labels: ['Backup 🔀'] },
    ]},
    { date: pd(4), tasks: [
      { id: 'td9',  projectId: 'p5', content: 'Schermata onboarding',  hours: 2,   slot: 'pm', completed: true, labels: ['Focus 🔕'] },
      { id: 'td10', projectId: 'p3', content: 'Revisione articolo SEO', hours: 2.5, slot: 'pm', completed: true, labels: ['IA 🤖', '🍅🍅'] },
    ]},
  ];

  db.transaction(() => {
    for (const c of INIT_CLIENTS)
      insertClient.run(c.id, c.name, c.color, c.billable ?? 1, c.billing, c.rate, c.limitType ?? null, c.limitHours, c.position ?? 0);
    for (const p of INIT_PROJECTS)
      insertProject.run(p.id, p.clientId, p.name, p.description ?? null, p.budgetHours, p.weeklyHours ?? null, p.position ?? 0);
    for (const r of INIT_RECURRING)
      insertRecurring.run(r.id, r.clientId, r.slot, r.day, r.hours, r.position ?? 0);
    for (const e of getSeedEntries())
      insertEntry.run(e.id, e.projectId, e.date, e.hours, e.billableHours ?? null, e.slot, e.billed);
    for (const { date, tasks } of todoistDays)
      db.prepare('INSERT OR REPLACE INTO todoist_cache (dateStr,tasksJson,syncedAt) VALUES (?,?,?)').run(date, JSON.stringify(tasks), now);
  })();
}

module.exports = {
  init,
  getClients, saveClient, deleteClient,
  getProjects, saveProject, deleteProject, hasProjectEntries, mergeProjectEntries,
  getRecurring, saveRecurring, deleteRecurring, deleteRecurringByClient,
  getEntries, getProjectTotals, saveEntry, deleteEntry,
  getWeekOverrides, getWeekOverridesRange, saveWeekOverride, deleteWeekOverride, freezeWeeksBeforeRecurringChange,
  getSetting, setSetting,
  getTodoistCache, setTodoistCache, getAllTodoistCache,
  importTodoistProjects,
  resetAllData, seedDemoData,
};
