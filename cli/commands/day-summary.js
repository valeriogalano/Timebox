'use strict';

const {
  getEntries,
  getProjects,
  getClients,
  getRecurring,
  getWeekOverrides,
  getWeekAreaStatusMap,
} = require('../../db/queries');
const { fmt, getMondayOfWeek, effBillable, isHourly } = require('../format');
const { SLOTS, fillPlannedBlocks } = require('../../lib/domain');

function getEffectiveBlocks(recurring, overrideMap, weekKey, dayIndex, slot) {
  const dayOverride = overrideMap[weekKey]?.[dayIndex];
  if (dayOverride && dayOverride[slot] !== undefined) return dayOverride[slot];
  return recurring
    .filter(r => r.day === dayIndex && r.slot === slot)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(r => ({ id: r.id, clientId: r.clientId, hours: r.hours }));
}

function buildOverrideMap(rows) {
  return rows.reduce((acc, row) => {
    if (!acc[row.weekKey]) acc[row.weekKey] = {};
    if (!acc[row.weekKey][row.dayIndex]) acc[row.weekKey][row.dayIndex] = {};
    acc[row.weekKey][row.dayIndex][row.slot] = row.blocks;
    return acc;
  }, {});
}

function resolveAreaStatus(clientId, clientMap, areaStatusMap) {
  return areaStatusMap[clientId] ?? clientMap[clientId]?.defaultStatus ?? 'active';
}

function mapBlock(block, clientMap, areaStatusMap) {
  const client = clientMap[block.clientId];
  return {
    id: block.id,
    clientId: block.clientId,
    area: client?.name || '?',
    areaStatus: resolveAreaStatus(block.clientId, clientMap, areaStatusMap),
    hours: block.hours,
  };
}

function mapEntry(entry, projectMap, clientMap, areaStatusMap) {
  const project = projectMap[entry.projectId];
  const client = project ? clientMap[project.clientId] : null;
  const isBillable = isHourly(client);
  return {
    id: entry.id,
    projectId: entry.projectId,
    project: project?.name || entry.projectId,
    clientId: project?.clientId || null,
    area: client?.name || '?',
    areaStatus: project ? resolveAreaStatus(project.clientId, clientMap, areaStatusMap) : 'active',
    hours: entry.hours,
    billableHours: entry.billableHours ?? null,
    effectiveBillableHours: isBillable ? effBillable(entry) : 0,
    billed: entry.billed,
  };
}

function getDaySummaryData(date) {
  const day = new Date(`${date}T00:00:00`);
  const dayIndex = (day.getDay() + 6) % 7;
  const weekKey = fmt(getMondayOfWeek(day));
  const recurring = getRecurring();
  const overrides = buildOverrideMap(getWeekOverrides(weekKey));
  const entries = getEntries(date, date);
  const projects = getProjects();
  const clients = getClients();
  const projectMap = Object.fromEntries(projects.map(project => [project.id, project]));
  const clientMap = Object.fromEntries(clients.map(client => [client.id, client]));
  const areaStatusMap = getWeekAreaStatusMap(weekKey);
  const areaStatuses = clients.map(client => ({
    areaId: client.id,
    area: client.name,
    status: resolveAreaStatus(client.id, clientMap, areaStatusMap),
  }));

  const plannedBlocks = {};
  const sourceBySlot = {};
  for (const slot of SLOTS) {
    plannedBlocks[slot] = getEffectiveBlocks(recurring, overrides, weekKey, dayIndex, slot);
    sourceBySlot[slot] = overrides[weekKey]?.[dayIndex]?.[slot] !== undefined ? 'override' : 'template';
  }
  const allBlocks = SLOTS.flatMap(slot => plannedBlocks[slot]);
  // Le registrazioni stanno sulla giornata, non sulla fascia: quella dell'entry non
  // si sceglie e non dice quando si è lavorato.
  const allEntries = entries.map(entry => mapEntry(entry, projectMap, clientMap, areaStatusMap));

  const clientPlanned = {};
  for (const block of allBlocks) {
    clientPlanned[block.clientId] = (clientPlanned[block.clientId] || 0) + block.hours;
  }

  const clientLogged = {};
  for (const entry of allEntries) {
    if (!entry.clientId) continue;
    clientLogged[entry.clientId] = (clientLogged[entry.clientId] || 0) + entry.hours;
  }

  // Ore registrate di ogni fascia, per area: quelle finite nei suoi blocchi quando le
  // ore dell'area si distribuiscono sul giorno in ordine (mattina, pomeriggio, sera).
  // Le ore oltre il piano e quelle fuori dalle aree pianificate restano in `extra`.
  const trackedByArea = Object.fromEntries(SLOTS.map(slot => [slot, {}]));
  const fill = fillPlannedBlocks(allBlocks, clientLogged);
  let blockIndex = 0;
  for (const slot of SLOTS) {
    for (const block of plannedBlocks[slot]) {
      const hours = fill[blockIndex++];
      if (hours > 0) trackedByArea[slot][block.clientId] = (trackedByArea[slot][block.clientId] || 0) + hours;
    }
  }

  const trackedInPlan = Object.entries(clientPlanned).reduce((sum, [clientId, planned]) => {
    return sum + Math.min(clientLogged[clientId] || 0, planned);
  }, 0);

  const extraByClient = {};
  const plannedClientIds = new Set(Object.keys(clientPlanned));
  for (const entry of allEntries) {
    if (!entry.clientId) continue;
    if (!plannedClientIds.has(entry.clientId)) {
      extraByClient[entry.clientId] = (extraByClient[entry.clientId] || 0) + entry.hours;
    }
  }
  for (const [clientId, planned] of Object.entries(clientPlanned)) {
    const logged = clientLogged[clientId] || 0;
    if (logged > planned) extraByClient[clientId] = (extraByClient[clientId] || 0) + (logged - planned);
  }

  const plannedCapacity = allBlocks.reduce((sum, block) => sum + block.hours, 0);
  const trackedHours = allEntries.reduce((sum, entry) => sum + entry.hours, 0);
  const trackedBillableHours = allEntries.reduce((sum, entry) => sum + entry.effectiveBillableHours, 0);
  const extraHours = Object.values(extraByClient).reduce((sum, hours) => sum + hours, 0);
  const residualCapacity = Math.max(0, plannedCapacity - trackedInPlan);

  return {
    date,
    weekKey,
    dayIndex,
    areaStatuses,
    slots: Object.fromEntries(SLOTS.map(slot => [slot, {
      source: sourceBySlot[slot],
      plannedBlocks: plannedBlocks[slot].map(block => mapBlock(block, clientMap, areaStatusMap)),
      plannedCapacity: plannedBlocks[slot].reduce((sum, block) => sum + block.hours, 0),
      trackedByArea: trackedByArea[slot],
      trackedHours: Object.values(trackedByArea[slot]).reduce((sum, hours) => sum + hours, 0),
    }])),
    trackedEntries: allEntries,
    plannedCapacity,
    trackedHours,
    trackedBillableHours,
    trackedInPlan,
    residualCapacity,
    extraHours,
    extra: Object.entries(extraByClient).map(([clientId, hours]) => ({
      clientId,
      area: clientMap[clientId]?.name || '?',
      areaStatus: resolveAreaStatus(clientId, clientMap, areaStatusMap),
      hours,
    })),
  };
}

module.exports = { getDaySummaryData };
