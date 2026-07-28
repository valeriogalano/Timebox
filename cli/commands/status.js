'use strict';

const { getEntries, getProjects, getClients, getProjectTotals } = require('../../db/queries');
const { getMondayOfWeek, addDays, fmt, effBillable, fmtH } = require('../format');

const ALERT_THRESHOLD = 0.8;

function sumByArea(byProject, projectMap) {
  return Object.entries(byProject).reduce((acc, [projectId, h]) => {
    const p = projectMap[projectId];
    if (p) acc[p.clientId] = (acc[p.clientId] ?? 0) + h;
    return acc;
  }, {});
}

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
  const sunday = addDays(monday, 6);
  const weekEntries = getEntries(fmt(monday), fmt(sunday));
  const weekTotal = weekEntries.reduce((s, e) => s + e.hours, 0);
  const weekBillable = billableSum(weekEntries, projectMap, clientMap);

  const totals = getProjectTotals();

  const weekByProject = weekEntries.reduce((acc, e) => {
    acc[e.projectId] = (acc[e.projectId] ?? 0) + e.hours;
    return acc;
  }, {});
  const weekByArea = sumByArea(weekByProject, projectMap);
  const areaTotals = sumByArea(totals, projectMap);

  // Un alert per ogni tetto configurato che è all'80% o oltre: budget di progetto,
  // limite settimanale di progetto, limite d'area (settimanale o globale).
  const alerts = [];
  const addAlert = ({ kind, area, project, logged, limit, scope }) => {
    if (!(limit > 0)) return;
    const pct = logged / limit;
    if (pct < ALERT_THRESHOLD) return;
    alerts.push({
      kind, area, client: area, project: project ?? null,
      logged, limit, budget: limit, pct,
      label: `${area}${project ? ` › ${project}` : ''} — ${fmtH(logged)} / ${fmtH(limit)} ${scope} (${Math.round(pct * 100)}%)`,
    });
  };

  for (const p of projects.filter(p => !p.archived)) {
    const area = clientMap[p.clientId]?.name || '?';
    addAlert({ kind: 'project-budget', area, project: p.name, logged: totals[p.id] || 0, limit: p.budgetHours, scope: 'budget' });
    addAlert({ kind: 'project-weekly', area, project: p.name, logged: weekByProject[p.id] || 0, limit: p.weeklyHours, scope: 'sett.' });
  }
  for (const c of clients) {
    if (c.limitType === 'weekly') {
      addAlert({ kind: 'area-weekly', area: c.name, logged: weekByArea[c.id] || 0, limit: c.limitHours, scope: 'sett.' });
    } else if (c.limitType === 'global') {
      addAlert({ kind: 'area-total', area: c.name, logged: areaTotals[c.id] || 0, limit: c.limitHours, scope: 'tot.' });
    }
  }
  alerts.sort((a, b) => b.pct - a.pct);

  return { today, todayTotal, weekTotal, todayBillable, weekBillable, alerts };
}

module.exports = { getStatusData };
