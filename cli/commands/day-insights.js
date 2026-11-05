'use strict';

const { getDayFreeCapacityData } = require('./day-free-capacity');
const { getDayReadyBlocksData } = require('./day-ready-blocks');
const { getDayMismatchesData } = require('./day-mismatches');

function getDayInsightsData(date, now = new Date()) {
  const freeCapacity = getDayFreeCapacityData(date, now);
  const readyBlocks = getDayReadyBlocksData(date, now);
  const mismatches = getDayMismatchesData(date, now);

  return {
    date,
    syncedAt: freeCapacity.syncedAt ?? readyBlocks.syncedAt ?? mismatches.syncedAt ?? null,
    freeCapacity,
    readyBlocks,
    mismatches,
  };
}

module.exports = { getDayInsightsData };
