'use strict';

// Dati e scrittura della pagina mobile (lib/mobile-server.js). Lavorano per
// identificativo di progetto: `POST /log` cerca il progetto per testo e può
// rispondere "ambiguo", e `GET /today` restituisce righe senza identificativi.

const { randomUUID } = require('node:crypto');
const { getEntries, getProjects, getClients, saveEntry, deleteEntry, moveEntrySlot } = require('../../db/queries');
const { getDaySummaryData } = require('./day-summary');
const { SLOTS, toHHMM, defaultEntrySlot, planDayEntrySave } = require('../../lib/domain');

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

// Un progetto per area, con le ore del giorno: `hours` è il totale, `entries` le ore di
// ogni fascia (la pagina mostra una riga per fascia) e `defaultSlot` la fascia in cui
// finirebbero ore nuove. Prima le aree pianificate quel giorno, poi le altre, nell'ordine
// dell'app. `today` serve a sapere se la fascia di default è quella dell'ora corrente.
function getMobileDayData(date, today) {
  const clients = getClients();
  const projects = getProjects();
  const hoursByProject = {};
  const entriesByProject = {};
  for (const e of getEntries(date, date)) {
    hoursByProject[e.projectId] = (hoursByProject[e.projectId] || 0) + e.hours;
    (entriesByProject[e.projectId] ||= []).push({ id: e.id, slot: e.slot, hours: e.hours });
  }

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
        .map(p => ({
          id: p.id, name: p.name, hours: hoursByProject[p.id] || 0, clock: toHHMM(hoursByProject[p.id] || 0),
          entries: (entriesByProject[p.id] || []).sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot)),
          defaultSlot: defaultEntrySlot({
            isToday: date === today,
            clientId: client.id,
            blocksForSlot: slot => summary.slots[slot].plannedBlocks,
          }),
        })),
    }))
    .filter(area => area.projects.length > 0)
    .sort((a, b) => (b.plannedHours > 0) - (a.plannedHours > 0));

  return {
    date,
    plannedHours: summary.plannedCapacity,
    trackedHours: summary.trackedHours,
    plan: getMobilePlan(summary, clients),
    areas,
  };
}

// Etichette delle fasce come nell'app (SLOT_META in src/utils.js).
const SLOT_LABELS = { am: 'Mattina', pm: 'Pomeriggio', sera: 'Sera' };

// La pianificazione del giorno, in sola lettura: per fascia, un blocco per area con
// le ore pianificate e quelle già coperte (il riempimento di fillPlannedBlocks).
function getMobilePlan(summary, clients) {
  const colorOf = Object.fromEntries(clients.map(c => [c.id, c.color]));
  return SLOTS
    .map(slot => {
      const byArea = new Map();
      for (const block of summary.slots[slot].plannedBlocks) {
        const area = byArea.get(block.clientId) ?? { area: block.area, color: colorOf[block.clientId] ?? null, hours: 0 };
        area.hours += block.hours;
        byArea.set(block.clientId, area);
      }
      const blocks = [...byArea].map(([clientId, area]) => ({
        ...area,
        trackedHours: summary.slots[slot].trackedByArea[clientId] || 0,
      }));
      return { slot, label: SLOT_LABELS[slot], blocks };
    })
    .filter(slot => slot.blocks.length > 0);
}

const SLOT_ERROR = 'slot must be am, pm or sera';

// Imposta le ore lavorate di un progetto in un giorno, con la stessa regola di Giorno
// (planDayEntrySave); zero ore cancella la entry. Ore fatturabili e stato "fatturato"
// già salvati non si toccano.
// Con `slot` si scrive solo la entry di quella fascia e le altre restano (è ciò che fa la
// pagina: una riga per fascia). Senza `slot` si riscrive il totale del giorno sull'unica
// entry del progetto, o se ne crea una nella fascia di default; se le ore stanno su più
// fasce risponde 409. Quel ramo serve a una pagina rimasta in cache sulla Home.
function saveMobileHours({ projectId, date, clock, today, slot }) {
  if (!isDate(date)) return { error: 'date must be YYYY-MM-DD' };
  const hours = parseClock(clock);
  if (hours == null) return { error: 'hours must be H:MM, at most 24:00' };
  if (slot !== undefined && !SLOTS.includes(slot)) return { error: SLOT_ERROR };
  const project = getProjects().find(p => p.id === projectId);
  if (!project) return { error: 'unknown project', status: 404 };

  const existingList = getEntries(date, date).filter(e => e.projectId === projectId);
  if (slot !== undefined) {
    const { save, deleteIds } = planDayEntrySave({
      existingList, projectId, date, hours,
      billableHours: existingList.find(e => e.slot === slot)?.billableHours ?? null,
      slot, newId: randomUUID(),
    });
    if (save) saveEntry(save);
    for (const id of deleteIds) deleteEntry(id);
    return { projectId, date, slot, hours, clock: toHHMM(hours) };
  }
  if (existingList.length > 1) return { error: 'hours on more than one slot', status: 409 };
  const summary = getDaySummaryData(date);
  const totalSlot = existingList[0]?.slot ?? defaultEntrySlot({
    isToday: date === today,
    clientId: project.clientId,
    blocksForSlot: s => summary.slots[s].plannedBlocks,
  });
  const { save, deleteIds } = planDayEntrySave({
    existingList, projectId, date, hours,
    billableHours: existingList[0]?.billableHours ?? null,
    slot: totalSlot, newId: randomUUID(),
  });
  if (save) saveEntry(save);
  for (const id of deleteIds) deleteEntry(id);
  return { projectId, date, hours, clock: toHHMM(hours) };
}

// Sposta le ore di un progetto da una fascia a un'altra, come il selettore di fascia di
// Giorno (moveEntrySlot): se nella fascia di arrivo ce ne sono già, le due si sommano.
function moveMobileSlot({ projectId, date, from, to }) {
  if (!isDate(date)) return { error: 'date must be YYYY-MM-DD' };
  if (!SLOTS.includes(from) || !SLOTS.includes(to)) return { error: SLOT_ERROR };
  const entry = getEntries(date, date).find(e => e.projectId === projectId && e.slot === from);
  if (!entry) return { error: 'no hours in that slot', status: 404 };
  moveEntrySlot(entry.id, to);
  return { projectId, date, from, to };
}

module.exports = { getMobileDayData, saveMobileHours, moveMobileSlot, parseClock, isDate };
