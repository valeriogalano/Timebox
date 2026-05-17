'use strict';

const { initDb } = require('../../db/schema');
const { init, seedDemoData } = require('../../db/queries');

function createTestDb() {
  const db = initDb(':memory:');
  init(db);
  seedDemoData();
  return db;
}

module.exports = { createTestDb };
