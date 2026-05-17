'use strict';

const { getProjects, getClients, getProjectTotals } = require('../../db/queries');

function getProjectsData({ clientFilter, includeArchived, nameSearch } = {}) {
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
  if (nameSearch) {
    const s = nameSearch.toLowerCase();
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(s) ||
      (p.description?.toLowerCase() || '').includes(s)
    );
  }

  return filtered.map(p => ({
    id: p.id,
    client: clientMap[p.clientId]?.name || '?',
    project: p.name,
    description: p.description || null,
    budgetHours: p.budgetHours,
    weeklyHours: p.weeklyHours,
    logged: totals[p.id] || 0,
    archived: p.archived,
  }));
}

module.exports = { getProjectsData };
