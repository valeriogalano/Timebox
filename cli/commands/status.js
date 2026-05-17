'use strict';

const { getEntries, getProjects, getClients, getProjectTotals } = require('../../db/queries');
const { getMondayOfWeek, addDays, fmt } = require('../format');

function getStatusData(today) {
  const todayEntries = getEntries(today, today);
  const todayTotal = todayEntries.reduce((s, e) => s + e.hours, 0);

  const monday = getMondayOfWeek(new Date(today + 'T00:00:00'));
  const friday = addDays(monday, 4);
  const weekEntries = getEntries(fmt(monday), fmt(friday));
  const weekTotal = weekEntries.reduce((s, e) => s + e.hours, 0);

  const projects = getProjects();
  const clients = getClients();
  const totals = getProjectTotals();
  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));

  const alerts = projects
    .filter(p => !p.archived && p.budgetHours)
    .map(p => {
      const logged = totals[p.id] || 0;
      const pct = logged / p.budgetHours;
      return {
        client: clientMap[p.clientId]?.name || '?',
        project: p.name,
        logged,
        budget: p.budgetHours,
        pct,
      };
    })
    .filter(a => a.pct >= 0.8)
    .sort((a, b) => b.pct - a.pct);

  return { today, todayTotal, weekTotal, alerts };
}

module.exports = { getStatusData };
