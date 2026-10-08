'use strict';

// Dati e scrittura della pagina mobile (lib/mobile-server.js). Lavorano per
// identificativo di progetto: `POST /log` cerca il progetto per testo e può
// rispondere "ambiguo", e `GET /today` restituisce righe senza identificativi.

const { randomUUID } = require('node:crypto');
const { getEntries, getProjects, getClients, saveEntry, deleteEntry } = require('../../db/queries');
const { getDaySummaryData } = require('./day-summary');
const { SLOTS, toHHMM, currentSlot, resolveEntrySlot, planDayEntrySave } = require('../../lib/domain');

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = value => typeof value === 'string' && DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`));

// "1:30" → 1.5. Solo la forma con i due punti, che è quella di <input type="time">:
// così non serve la soglia ore/minuti dei campi liberi. Stringa vuota = zero ore.
function parseClock(value) {
  if (value === '' || value == null) return 0;
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(String(value));
  if (!m) return null;
  const hours = Number(m[1]) + Number(m[2]) / 60;
  return hours <= 24 ? hours : null;
}

// Una riga per progetto, con le ore del giorno già sommate sulle fasce. Prima le
// aree pianificate quel giorno, poi le altre, nell'ordine dell'app.
function getMobileDayData(date) {
  const clients = getClients();
  const projects = getProjects();
  const hoursByProject = {};
  for (const e of getEntries(date, date)) hoursByProject[e.projectId] = (hoursByProject[e.projectId] || 0) + e.hours;

  const summary = getDaySummaryData(date);
  const plannedByArea = {};
  for (const slot of SLOTS) {
    for (const block of summary.slots[slot].plannedBlocks) {
      plannedByArea[block.clientId] = (plannedByArea[block.clientId] || 0) + block.hours;
    }
  }

  const areas = clients
    .map(client => ({
      id: client.id,
      name: client.name,
      color: client.color,
      plannedHours: plannedByArea[client.id] || 0,
      // Un progetto archiviato compare solo se quel giorno ha già delle ore.
      projects: projects
        .filter(p => p.clientId === client.id && (!p.archived || hoursByProject[p.id] > 0))
        .map(p => ({ id: p.id, name: p.name, hours: hoursByProject[p.id] || 0, clock: toHHMM(hoursByProject[p.id] || 0) })),
    }))
    .filter(area => area.projects.length > 0)
    .sort((a, b) => (b.plannedHours > 0) - (a.plannedHours > 0));

  return {
    date,
    plannedHours: summary.plannedCapacity,
    trackedHours: summary.trackedHours,
    areas,
  };
}

// Imposta le ore lavorate di un progetto in un giorno, con la stessa regola di Giorno
// (planDayEntrySave): una entry per progetto+giorno, zero ore la cancella. Ore
// fatturabili e stato "fatturato" già salvati non si toccano.
function saveMobileHours({ projectId, date, clock, today }) {
  if (!isDate(date)) return { error: 'date must be YYYY-MM-DD' };
  const hours = parseClock(clock);
  if (hours == null) return { error: 'hours must be H:MM, at most 24:00' };
  const project = getProjects().find(p => p.id === projectId);
  if (!project) return { error: 'unknown project', status: 404 };

  const existingList = getEntries(date, date).filter(e => e.projectId === projectId);
  const summary = getDaySummaryData(date);
  const slot = resolveEntrySlot({
    existingSlot: existingList[0]?.slot,
    clientId: project.clientId,
    blocksForSlot: s => summary.slots[s].plannedBlocks,
    fallback: date === today ? currentSlot() : 'am',
  });
  const { save, deleteIds } = planDayEntrySave({
    existingList, projectId, date, hours,
    billableHours: existingList[0]?.billableHours ?? null,
    slot, newId: randomUUID(),
  });
  if (save) saveEntry(save);
  for (const id of deleteIds) deleteEntry(id);
  return { projectId, date, hours, clock: toHHMM(hours) };
}

module.exports = { getMobileDayData, saveMobileHours, parseClock, isDate };
