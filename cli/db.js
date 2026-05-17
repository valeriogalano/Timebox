'use strict';

const path = require('path');
const os = require('os');
const { initDb } = require('../db/schema');
const { init } = require('../db/queries');

const DEFAULT_DB_PATH = path.join(
  os.homedir(), 'Library', 'Application Support', 'Timebox', 'timebox.db'
);

function openDb() {
  const dbPath = process.env.TIMEBOX_DB || DEFAULT_DB_PATH;
  // initDb runs schema creation and all migrations (adds missing columns).
  // busy_timeout avoids instant failure if the Electron app holds a momentary lock.
  const db = initDb(dbPath);
  db.pragma('busy_timeout = 3000');
  init(db);
  return db;
}

module.exports = { openDb, DEFAULT_DB_PATH };
