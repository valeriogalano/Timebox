'use strict';

const { getDayFreeCapacityData } = require('./day-free-capacity');
const { getDayReadyBlocksData } = require('./day-ready-blocks');
const { getDayMismatchesData } = require('./day-mismatches');

function getDayInsightsData(date) {
  const freeCapacity = getDayFreeCapacityData(date);
  const readyBlocks = getDayReadyBlocksData(date);
  const mismatches = getDayMismatchesData(date);

  return {
    date,
    syncedAt: freeCapacity.syncedAt ?? readyBlocks.syncedAt ?? mismatches.syncedAt ?? null,
    freeCapacity,
    readyBlocks,
    mismatches,
  };
}

module.exports = { getDayInsightsData };
