'use strict';

const { getEntries, getProjects, getClients, getProjectTotals } = require('../../db/queries');
const { getMondayOfWeek, addDays, fmt, effBillable } = require('../format');

function billableSum(entries, projectMap, clientMap) {
  return entries.reduce((s, e) => {
    const p = projectMap[e.projectId];
    const c = p ? clientMap[p.clientId] : null;
    if (!c || c.billing === 'none') return s;
    return s + effBillable(e);
  }, 0);
}

function getStatusData(today) {
  const projects = getProjects();
  const clients = getClients();
  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));
  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));

  const todayEntries = getEntries(today, today);
  const todayTotal = todayEntries.reduce((s, e) => s + e.hours, 0);
  const todayBillable = billableSum(todayEntries, projectMap, clientMap);

  const monday = getMondayOfWeek(new Date(today + 'T00:00:00'));
  const friday = addDays(monday, 4);
  const weekEntries = getEntries(fmt(monday), fmt(friday));
  const weekTotal = weekEntries.reduce((s, e) => s + e.hours, 0);
  const weekBillable = billableSum(weekEntries, projectMap, clientMap);

  const totals = getProjectTotals();

  const alerts = projects
    .filter(p => !p.archived && p.budgetHours)
    .map(p => {
      const logged = totals[p.id] || 0;
      const pct = logged / p.budgetHours;
      return {
        client: clientMap[p.clientId]?.name || '?',
        area: clientMap[p.clientId]?.name || '?',
        project: p.name,
        logged,
        budget: p.budgetHours,
        pct,
      };
    })
    .filter(a => a.pct >= 0.8)
    .sort((a, b) => b.pct - a.pct);

  return { today, todayTotal, weekTotal, todayBillable, weekBillable, alerts };
}

module.exports = { getStatusData };
