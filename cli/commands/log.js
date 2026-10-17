'use strict';

const { randomUUID } = require('crypto');
const { getProjects, getClients, getEntries, saveEntry, deleteEntry } = require('../../db/queries');
const { SLOTS, currentSlot, defaultEntrySlot, fmt, getToday } = require('../../lib/domain');
const { getDaySummaryData } = require('./day-summary');
const { parseHours, isHourly } = require('../format');

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

// Fascia di una registrazione senza fascia indicata. Se il progetto quel giorno ha
// ore su più fasce non si indovina: si chiede. Oggi, aggiungendo ore, vale la fascia
// dell'ora corrente; altrimenti quella dell'entry che c'è già, e per un'entry nuova
// la regola di defaultEntrySlot.
function resolveLogSlot({ project, dayEntries, date, add }) {
  const slots = [...new Set(dayEntries.map(e => e.slot))];
  if (slots.length > 1) {
    throw new Error(`Ambiguous slot: "${project.name}" has hours in ${slots.join(', ')} on ${date}. Pass slot (am, pm or sera).`);
  }
  const isToday = date === fmt(getToday());
  if (add && isToday) return currentSlot();
  if (slots.length === 1) return slots[0];
  const summary = getDaySummaryData(date);
  return defaultEntrySlot({ isToday, clientId: project.clientId, blocksForSlot: s => summary.slots[s].plannedBlocks });
}

function logHours({ projectName, hoursStr, billableHoursStr, slot, date, add }) {
  const { project, client, area } = findProject(projectName);
  if (slot && !SLOTS.includes(slot)) throw new Error(`Invalid slot "${slot}": use am, pm or sera`);
  const parsed = parseHours(hoursStr);
  const isBillable = isHourly(client);
  const dayEntries = getEntries(date, date).filter(e => e.projectId === project.id);
  const resolvedSlot = slot || resolveLogSlot({ project, dayEntries, date, add });

  // Una entry per progetto, giorno e fascia: le altre fasce non si toccano.
  const existing = dayEntries.find(e => e.slot === resolvedSlot) ?? null;
  const newHours = add && existing ? existing.hours + parsed : parsed;

  if (newHours === 0) {
    if (existing) {
      deleteEntry(existing.id);
      return { action: 'deleted', client: client.name, area: area.name, project: project.name, date, slot: resolvedSlot };
    }
    return { action: 'noop', client: client.name, area: area.name, project: project.name, date };
  }

  // Fuori dalle aree a ore le ore fatturabili non si impostano, ma quelle già salvate
  // restano: sono nascoste, mai cancellate (vedi billingOnSave in src/utils.js).
  let billableHours = existing?.billableHours ?? null;
  if (isBillable && billableHoursStr != null) {
    const parsedB = parseHours(billableHoursStr);
    billableHours = Math.abs(parsedB - newHours) < 0.001 ? null : parsedB;
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
