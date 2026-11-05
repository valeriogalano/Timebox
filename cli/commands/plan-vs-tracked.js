'use strict';

const { getClients } = require('../../db/queries');
const { SLOTS, fmt, addDays } = require('../../lib/domain');
const { getDaySummaryData } = require('./day-summary');

const MAX_DAYS = 366;

function emptyCounts() {
  return { plannedHours: 0, coveredHours: 0 };
}

function addCounts(target, counts) {
  target.plannedHours += counts.plannedHours;
  target.coveredHours += counts.coveredHours;
}

// Piano contro giornata reale, per giorno, fascia e area, su un intervallo di date.
// Per ogni fascia e area: ore pianificate (template più override) e ore coperte dal
// riempimento dei blocchi (fillPlannedBlocks). Le ore registrate non hanno fascia:
// per ogni giorno ci sono il loro totale e le ore extra fuori piano.
function getPlanVsTrackedData({ from, to }) {
  const areaName = Object.fromEntries(getClients().map(c => [c.id, c.name]));
  const days = [];
  const totals = { ...emptyCounts(), trackedHours: 0, extraHours: 0, bySlot: Object.fromEntries(SLOTS.map(s => [s, emptyCounts()])) };

  for (let d = new Date(`${from}T00:00:00`); fmt(d) <= to; d = addDays(d, 1)) {
    const date = fmt(d);
    const summary = getDaySummaryData(date);
    const day = { date, ...emptyCounts(), trackedHours: summary.trackedHours, extraHours: summary.extraHours, extra: summary.extra, slots: [] };

    for (const slot of SLOTS) {
      const s = summary.slots[slot];
      const byArea = new Map();
      const area = clientId => {
        if (!byArea.has(clientId)) byArea.set(clientId, { areaId: clientId, area: areaName[clientId] || '?', ...emptyCounts() });
        return byArea.get(clientId);
      };
      for (const block of s.plannedBlocks) area(block.clientId).plannedHours += block.hours;
      for (const [clientId, hours] of Object.entries(s.trackedByArea)) area(clientId).coveredHours += hours;

      const areas = [...byArea.values()];
      const slotCounts = emptyCounts();
      for (const a of areas) addCounts(slotCounts, a);
      day.slots.push({ slot, ...slotCounts, areas });
      addCounts(day, slotCounts);
      addCounts(totals.bySlot[slot], slotCounts);
    }

    addCounts(totals, day);
    totals.trackedHours += day.trackedHours;
    totals.extraHours += day.extraHours;
    days.push(day);
  }

  return { from, to, days, totals };
}

module.exports = { getPlanVsTrackedData, MAX_DAYS };
