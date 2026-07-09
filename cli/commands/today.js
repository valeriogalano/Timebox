'use strict';

const { getEntries, getProjects, getClients } = require('../../db/queries');
const { effBillable } = require('../format');
const { SLOTS, normalizeSlot } = require('../../lib/domain');

function getTodayData(date) {
  const entries = getEntries(date, date);
  const projects = getProjects();
  const clients = getClients();
  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));
  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));

  const slots = Object.fromEntries(SLOTS.map(slot => [slot, []]));
  for (const e of entries) {
    const project = projectMap[e.projectId];
    const client = project ? clientMap[project.clientId] : null;
    const slot = normalizeSlot(e.slot);
    const isBillable = client && client.billing !== 'none';
    slots[slot].push({
      hours: e.hours,
      billableHours: e.billableHours ?? null,
      project: project?.name || e.projectId,
      client: client?.name || '?',
      area: client?.name || '?',
      isBillable,
      billed: e.billed,
    });
  }

  const slotTotals = {};
  const slotBillable = {};
  for (const slot of SLOTS) {
    slotTotals[slot] = slots[slot].reduce((s, e) => s + e.hours, 0);
    slotBillable[slot] = slots[slot].reduce((s, e) => s + (e.isBillable ? effBillable(e) : 0), 0);
  }
  const total = SLOTS.reduce((s, slot) => s + slotTotals[slot], 0);
  const totalBillable = SLOTS.reduce((s, slot) => s + slotBillable[slot], 0);

  return {
    date, slots, slotTotals, slotBillable,
    amTotal: slotTotals.am, pmTotal: slotTotals.pm, seraTotal: slotTotals.sera, total,
    amBillable: slotBillable.am, pmBillable: slotBillable.pm, seraBillable: slotBillable.sera, totalBillable,
  };
}

module.exports = { getTodayData };
