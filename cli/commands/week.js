'use strict';

const { getEntries, getProjects, getClients } = require('../../db/queries');
const { getMondayOfWeek, addDays, fmt } = require('../format');

function getWeekData(today, offset = 0) {
  const monday = getMondayOfWeek(today);
  if (offset) monday.setDate(monday.getDate() + offset * 7);
  const friday = addDays(monday, 4);

  const entries = getEntries(fmt(monday), fmt(friday));
  const projects = getProjects();
  const clients = getClients();
  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));
  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));

  const days = [];
  for (let i = 0; i < 5; i++) {
    const day = addDays(monday, i);
    const dateStr = fmt(day);
    const dayEntries = entries
      .filter(e => e.date === dateStr)
      .map(e => {
        const project = projectMap[e.projectId];
        const client = project ? clientMap[project.clientId] : null;
        return {
          hours: e.hours,
          project: project?.name || e.projectId,
          client: client?.name || '?',
          slot: e.slot,
        };
      });
    days.push({
      date: dateStr,
      day,
      entries: dayEntries,
      total: dayEntries.reduce((s, e) => s + e.hours, 0),
    });
  }

  return {
    monday,
    friday,
    days,
    total: days.reduce((s, d) => s + d.total, 0),
  };
}

module.exports = { getWeekData };
