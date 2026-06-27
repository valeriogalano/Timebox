'use strict';

const { getEntries, getProjects, getClients } = require('../../db/queries');
const { getMondayOfWeek, addDays, fmt, effBillable } = require('../format');

function getWeekData(today, offset = 0) {
  const monday = getMondayOfWeek(today);
  if (offset) monday.setDate(monday.getDate() + offset * 7);
  const sunday = addDays(monday, 6);

  const entries = getEntries(fmt(monday), fmt(sunday));
  const projects = getProjects();
  const clients = getClients();
  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));
  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));

  const days = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(monday, i);
    const dateStr = fmt(day);
    const dayEntries = entries
      .filter(e => e.date === dateStr)
      .map(e => {
        const project = projectMap[e.projectId];
        const client = project ? clientMap[project.clientId] : null;
        const isBillable = client && client.billing !== 'none';
        return {
          hours: e.hours,
          billableHours: e.billableHours ?? null,
          project: project?.name || e.projectId,
          client: client?.name || '?',
          area: client?.name || '?',
          isBillable,
          slot: e.slot,
        };
      });
    const total = dayEntries.reduce((s, e) => s + e.hours, 0);
    const totalBillable = dayEntries.reduce((s, e) => s + (e.isBillable ? effBillable(e) : 0), 0);
    days.push({
      date: dateStr,
      day,
      entries: dayEntries,
      total,
      totalBillable,
    });
  }

  return {
    monday,
    sunday,
    days,
    total: days.reduce((s, d) => s + d.total, 0),
    totalBillable: days.reduce((s, d) => s + d.totalBillable, 0),
  };
}

module.exports = { getWeekData };
