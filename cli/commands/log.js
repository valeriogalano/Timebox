'use strict';

const { randomUUID } = require('crypto');
const { getProjects, getClients, getEntries, saveEntry, deleteEntry } = require('../../db/queries');
const { parseHours } = require('../format');

function findProject(name) {
  const projects = getProjects();
  const clients = getClients();
  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));
  const search = name.toLowerCase();

  const matches = projects.filter(p =>
    !p.archived && (
      p.name.toLowerCase().includes(search) ||
      (clientMap[p.clientId]?.name.toLowerCase() || '').includes(search) ||
      (p.description?.toLowerCase() || '').includes(search)
    )
  );

  if (matches.length === 0) {
    throw new Error(`No project found matching "${name}"`);
  }
  if (matches.length > 1) {
    const list = matches.map(p => `  • ${clientMap[p.clientId]?.name} › ${p.name}`).join('\n');
    throw new Error(`Ambiguous: ${matches.length} projects match "${name}":\n${list}`);
  }

  const project = matches[0];
  return { project, client: clientMap[project.clientId] };
}

function logHours({ projectName, hoursStr, slot, date, add }) {
  const { project, client } = findProject(projectName);
  const parsed = parseHours(hoursStr);

  const entries = getEntries(date, date);
  const existing = entries.find(e => e.projectId === project.id);
  const newHours = add && existing ? existing.hours + parsed : parsed;

  if (newHours === 0) {
    if (existing) {
      deleteEntry(existing.id);
      return { action: 'deleted', client: client.name, project: project.name, date };
    }
    return { action: 'noop', client: client.name, project: project.name, date };
  }

  const resolvedSlot = slot || (new Date().getHours() < 12 ? 'am' : 'pm');
  saveEntry({
    id: existing?.id || randomUUID(),
    projectId: project.id,
    date,
    hours: newHours,
    billableHours: existing?.billableHours ?? null,
    slot: resolvedSlot,
    billed: existing?.billed || false,
  });

  return {
    action: existing ? 'updated' : 'created',
    client: client.name,
    project: project.name,
    hours: newHours,
    date,
    slot: resolvedSlot,
  };
}

module.exports = { logHours, findProject };
