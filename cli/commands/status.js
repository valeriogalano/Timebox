'use strict';

const { getEntries, getProjects, getClients, getProjectTotals, getProjectBillableTotals } = require('../../db/queries');
const { getMondayOfWeek, addDays, fmt, effBillable, isHourly, capUsage, fmtH } = require('../format');

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
    if (!isHourly(c)) return s;
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
  const billableTotals = getProjectBillableTotals();

  const sumWeek = hoursOf => weekEntries.reduce((acc, e) => {
    acc[e.projectId] = (acc[e.projectId] ?? 0) + hoursOf(e);
    return acc;
  }, {});
  const weekByProject = sumWeek(e => e.hours);
  const weekBillableByProject = sumWeek(effBillable);

  // Ogni tetto si misura su ore lavorate e ore fatturabili; nelle aree a ore possono
  // divergere, e l'alert segue il conteggio messo peggio dicendo quale è.
  const projectUsage = (worked, billable, p) => capUsage(worked[p.id] || 0, billable[p.id] ?? worked[p.id] ?? 0, isHourly(clientMap[p.clientId]));
  const areaUsage = (worked, billable, c) => {
    const w = sumByArea(worked, projectMap)[c.id] || 0;
    return capUsage(w, sumByArea(billable, projectMap)[c.id] ?? w, isHourly(c));
  };

  // Un alert per ogni tetto configurato che è all'80% o oltre: budget di progetto,
  // limite settimanale di progetto, limite d'area (settimanale o globale).
  const alerts = [];
  const addAlert = ({ kind, area, project, usage, limit, scope }) => {
    if (!(limit > 0)) return;
    const pct = usage.worst / limit;
    if (pct < ALERT_THRESHOLD) return;
    alerts.push({
      kind, area, client: area, project: project ?? null,
      logged: usage.worked, billable: usage.billable, count: usage.kind,
      limit, budget: limit, pct,
      label: `${area}${project ? ` › ${project}` : ''} — ${fmtH(usage.worst)}${usage.kind ? ` ${usage.kind}` : ''} / ${fmtH(limit)} ${scope} (${Math.round(pct * 100)}%)`,
    });
  };

  for (const p of projects.filter(p => !p.archived)) {
    const area = clientMap[p.clientId]?.name || '?';
    addAlert({ kind: 'project-budget', area, project: p.name, usage: projectUsage(totals, billableTotals, p), limit: p.budgetHours, scope: 'budget' });
    addAlert({ kind: 'project-weekly', area, project: p.name, usage: projectUsage(weekByProject, weekBillableByProject, p), limit: p.weeklyHours, scope: 'sett.' });
  }
  for (const c of clients) {
    if (c.limitType === 'weekly') {
      addAlert({ kind: 'area-weekly', area: c.name, usage: areaUsage(weekByProject, weekBillableByProject, c), limit: c.limitHours, scope: 'sett.' });
    } else if (c.limitType === 'global') {
      addAlert({ kind: 'area-total', area: c.name, usage: areaUsage(totals, billableTotals, c), limit: c.limitHours, scope: 'tot.' });
    }
  }
  alerts.sort((a, b) => b.pct - a.pct);

  return { today, todayTotal, weekTotal, todayBillable, weekBillable, alerts };
}

module.exports = { getStatusData };
