'use strict';

const { getEntries, getProjects, getClients } = require('../../db/queries');
const { effBillable } = require('../format');

function getTodayData(date) {
  const entries = getEntries(date, date);
  const projects = getProjects();
  const clients = getClients();
  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));
  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));

  const slots = { am: [], pm: [] };
  for (const e of entries) {
    const project = projectMap[e.projectId];
    const client = project ? clientMap[project.clientId] : null;
    const slot = e.slot === 'am' || e.slot === 'pm' ? e.slot : 'am';
    const isBillable = client && client.billing !== 'none';
    slots[slot].push({
      hours: e.hours,
      billableHours: e.billableHours ?? null,
      project: project?.name || e.projectId,
      client: client?.name || '?',
      isBillable,
      billed: e.billed,
    });
  }

  const amTotal = slots.am.reduce((s, e) => s + e.hours, 0);
  const pmTotal = slots.pm.reduce((s, e) => s + e.hours, 0);
  const amBillable = slots.am.reduce((s, e) => s + (e.isBillable ? effBillable(e) : 0), 0);
  const pmBillable = slots.pm.reduce((s, e) => s + (e.isBillable ? effBillable(e) : 0), 0);

  return {
    date, slots,
    amTotal, pmTotal, total: amTotal + pmTotal,
    amBillable, pmBillable, totalBillable: amBillable + pmBillable,
  };
}

module.exports = { getTodayData };
