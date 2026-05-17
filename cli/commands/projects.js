'use strict';

const { getProjects, getClients, getProjectTotals } = require('../../db/queries');

function getProjectsData({ clientFilter, includeArchived } = {}) {
  const projects = getProjects();
  const clients = getClients();
  const totals = getProjectTotals();
  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));

  let filtered = includeArchived ? projects : projects.filter(p => !p.archived);
  if (clientFilter) {
    const search = clientFilter.toLowerCase();
    filtered = filtered.filter(p =>
      (clientMap[p.clientId]?.name.toLowerCase() || '').includes(search)
    );
  }

  return filtered.map(p => ({
    id: p.id,
    client: clientMap[p.clientId]?.name || '?',
    project: p.name,
    budgetHours: p.budgetHours,
    weeklyHours: p.weeklyHours,
    logged: totals[p.id] || 0,
    archived: p.archived,
  }));
}

module.exports = { getProjectsData };
