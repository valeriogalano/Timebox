'use strict';

const { getClients, getSlotsTrackedSince } = require('../../db/queries');
const { SLOTS, fmt, addDays } = require('../../lib/domain');
const { getDaySummaryData } = require('./day-summary');

const MAX_DAYS = 366;

function emptyCounts() {
  return { plannedHours: 0, coveredHours: 0, trackedHours: 0 };
}

function addCounts(target, counts) {
  target.plannedHours += counts.plannedHours;
  target.coveredHours += counts.coveredHours;
  target.trackedHours += counts.trackedHours;
}

// Piano contro giornata reale, per giorno, fascia e area, su un intervallo di date.
// Per ogni fascia e area: ore pianificate (template più override), ore coperte dal
// riempimento dei blocchi (fillPlannedBlocks: quanto del piano è coperto, in qualunque
// fascia si sia lavorato) e ore registrate in quella fascia (dalla fascia delle entry).
// Per ogni giorno, le ore extra fuori piano.
// Prima di slotsTrackedSince la fascia delle entry non è affidabile: quei giorni sono
// segnati e restano fuori dai totali.
function getPlanVsTrackedData({ from, to }) {
  const since = getSlotsTrackedSince();
  const areaName = Object.fromEntries(getClients().map(c => [c.id, c.name]));
  const days = [];
  const totals = { ...emptyCounts(), extraHours: 0, bySlot: Object.fromEntries(SLOTS.map(s => [s, emptyCounts()])) };

  for (let d = new Date(`${from}T00:00:00`); fmt(d) <= to; d = addDays(d, 1)) {
    const date = fmt(d);
    const summary = getDaySummaryData(date);
    const slotReliable = !!since && date >= since;
    const day = { date, slotReliable, ...emptyCounts(), extraHours: summary.extraHours, extra: summary.extra, slots: [] };

    for (const slot of SLOTS) {
      const s = summary.slots[slot];
      const byArea = new Map();
      const area = clientId => {
        if (!byArea.has(clientId)) byArea.set(clientId, { areaId: clientId, area: areaName[clientId] || '?', ...emptyCounts() });
        return byArea.get(clientId);
      };
      for (const block of s.plannedBlocks) area(block.clientId).plannedHours += block.hours;
      for (const [clientId, hours] of Object.entries(s.trackedByArea)) area(clientId).coveredHours += hours;
      for (const [clientId, hours] of Object.entries(s.actualByArea)) area(clientId).trackedHours += hours;

      const areas = [...byArea.values()].map(a => ({ ...a, deltaHours: a.trackedHours - a.plannedHours }));
      const slotCounts = emptyCounts();
      for (const a of areas) addCounts(slotCounts, a);
      day.slots.push({ slot, ...slotCounts, areas });
      addCounts(day, slotCounts);
      if (slotReliable) addCounts(totals.bySlot[slot], slotCounts);
    }

    if (slotReliable) {
      addCounts(totals, day);
      totals.extraHours += day.extraHours;
    }
    days.push(day);
  }

  const unreliableDays = days.filter(d => !d.slotReliable).map(d => d.date);
  return {
    from,
    to,
    slotsTrackedSince: since,
    unreliableDays,
    warning: unreliableDays.length
      ? `Slots are not reliable before ${since ?? 'the slot tracking start date (not set)'}: ${unreliableDays.length} day(s) excluded from totals.`
      : null,
    days,
    totals,
  };
}

module.exports = { getPlanVsTrackedData, MAX_DAYS };
