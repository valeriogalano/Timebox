'use strict';

const path = require('path');
const os = require('os');
const { initDb } = require('../db/schema');
const { init } = require('../db/queries');

function defaultDbPath() {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Timebox', 'timebox.db');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Timebox', 'timebox.db');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'Timebox', 'timebox.db');
}

const DEFAULT_DB_PATH = defaultDbPath();

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
