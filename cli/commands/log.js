'use strict';

const { randomUUID } = require('crypto');
const { getProjects, getClients, getEntries, saveEntry, deleteEntry } = require('../../db/queries');
const { parseHoursStrict, isDateString } = require('../../lib/domain');
const { isHourly } = require('../format');

const MAX_DAY_HOURS = 24;

function readHours(str, what) {
  const hours = parseHoursStrict(str);
  if (hours == null || hours < 0 || hours > MAX_DAY_HOURS) {
    throw new Error(`Invalid hours "${str}" for ${what}: use 2, 2.5, 2:30 or 2h 30m, between 0 and ${MAX_DAY_HOURS}`);
  }
  return hours;
}

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

function logHours({ projectName, hoursStr, billableHoursStr, date, add }) {
  if (!isDateString(date)) throw new Error(`Invalid date "${date}": use YYYY-MM-DD`);
  const { project, client, area } = findProject(projectName);
  const parsed = readHours(hoursStr, 'hours');
  const parsedBillable = billableHoursStr != null ? readHours(billableHoursStr, 'billable hours') : null;
  const isBillable = isHourly(client);
  // Una entry per progetto e giorno.
  const existing = getEntries(date, date).find(e => e.projectId === project.id) ?? null;
  const newHours = add && existing ? existing.hours + parsed : parsed;
  if (newHours > MAX_DAY_HOURS) {
    throw new Error(`Invalid hours: ${newHours}h in one day is more than ${MAX_DAY_HOURS}h`);
  }

  if (newHours === 0) {
    if (existing) {
      deleteEntry(existing.id);
      return { action: 'deleted', client: client.name, area: area.name, project: project.name, date };
    }
    return { action: 'noop', client: client.name, area: area.name, project: project.name, date };
  }

  // Fuori dalle aree a ore le ore fatturabili non si impostano, ma quelle già salvate
  // restano: sono nascoste, mai cancellate (vedi billingOnSave in src/utils.js).
  let billableHours = existing?.billableHours ?? null;
  if (isBillable && parsedBillable != null) {
    const parsedB = parsedBillable;
    billableHours = Math.abs(parsedB - newHours) < 0.001 ? null : parsedB;
  }

  const nextEntry = {
    id: existing?.id || randomUUID(),
    projectId: project.id,
    date,
    hours: newHours,
    billableHours,
    billed: existing?.billed || false,
  };
  saveEntry(nextEntry);

  return {
    action: existing ? 'updated' : 'created',
    client: client.name,
    area: area.name,
    project: project.name,
    hours: newHours,
    billableHours,
    date,
  };
}

module.exports = { logHours, findProject };
