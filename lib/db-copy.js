'use strict';

const path = require('path');

// A consistent copy of the open database. The file alone is not one: in WAL
// mode the latest writes live in the -wal file until a checkpoint, so
// copying timebox.db gave a file without them (on a fresh database, without
// even the tables). better-sqlite3's backup() goes through SQLite's online
// backup API on the open connection, so it works under the exclusive lock
// that keeps every other program, sqlite3 .backup included, out of the file.
async function saveDbCopy(db, sourcePath, destinationPath) {
  if (path.resolve(destinationPath) === path.resolve(sourcePath)) {
    throw new Error('The copy cannot overwrite the open database');
  }
  await db.backup(destinationPath);
  return destinationPath;
}

module.exports = { saveDbCopy };
