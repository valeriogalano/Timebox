'use strict';

const { randomUUID } = require('crypto');
const { getProjects, getClients, getEntries, saveEntry, deleteEntry } = require('../../db/queries');
const { currentSlot } = require('../../lib/time-slots');
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
  return { project, client: clientMap[project.clientId], area: clientMap[project.clientId] };
}

function effectiveBillable(entry) {
  return entry.billableHours ?? entry.hours;
}

function mergeEntries(entries) {
  if (entries.length === 0) return null;

  const first = entries[0];
  const hours = entries.reduce((sum, entry) => sum + entry.hours, 0);
  const billableTotal = entries.reduce((sum, entry) => sum + effectiveBillable(entry), 0);

  return {
    ...first,
    hours,
    billableHours: Math.abs(billableTotal - hours) < 0.001 ? null : billableTotal,
    billed: entries.every(entry => entry.billed),
  };
}

function logHours({ projectName, hoursStr, billableHoursStr, slot, date, add }) {
  const { project, client, area } = findProject(projectName);
  const parsed = parseHours(hoursStr);
  const isBillable = client.billing !== 'none';
  const resolvedSlot = slot || currentSlot();

  const entries = getEntries(date, date).filter(e => (
    e.projectId === project.id && e.slot === resolvedSlot
  ));
  const existing = mergeEntries(entries);
  const newHours = add && existing ? existing.hours + parsed : parsed;

  if (newHours === 0) {
    if (entries.length > 0) {
      entries.forEach(entry => deleteEntry(entry.id));
      return { action: 'deleted', client: client.name, area: area.name, project: project.name, date };
    }
    return { action: 'noop', client: client.name, area: area.name, project: project.name, date };
  }

  let billableHours = existing?.billableHours ?? null;
  if (isBillable && billableHoursStr != null) {
    const parsedB = parseHours(billableHoursStr);
    billableHours = Math.abs(parsedB - newHours) < 0.001 ? null : parsedB;
  } else if (!isBillable) {
    billableHours = null;
  }

  const nextEntry = {
    id: existing?.id || randomUUID(),
    projectId: project.id,
    date,
    hours: newHours,
    billableHours,
    slot: resolvedSlot,
    billed: existing?.billed || false,
  };
  saveEntry(nextEntry);
  entries.forEach(entry => {
    if (entry.id !== nextEntry.id) deleteEntry(entry.id);
  });

  return {
    action: existing ? 'updated' : 'created',
    client: client.name,
    area: area.name,
    project: project.name,
    hours: newHours,
    billableHours,
    date,
    slot: resolvedSlot,
  };
}

module.exports = { logHours, findProject };
