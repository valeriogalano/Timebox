// Shared per-day planning computation used by both WeeklyView (7 days) and
// TodayView (single day). Keeps the intricate block-fill / Todoist-coverage /
// orphan logic in one place so the two screens can't drift apart.

import { effBillable, SLOTS, normalizeSlot } from './utils';

// Collapses the AM/PM rows a project may have on the same day into one entry
// with summed hours (used for per-project timesheet + planning fill).
export function mergeProjectDayEntries(entries) {
  const grouped = new Map();

  for (const entry of entries) {
    const key = `${entry.projectId}::${entry.date}`;
    const list = grouped.get(key) ?? [];
    list.push(entry);
    grouped.set(key, list);
  }

  return Array.from(grouped.values()).map(group => {
    const first = group[0];
    const hours = group.reduce((sum, entry) => sum + entry.hours, 0);
    const billableTotal = group.reduce((sum, entry) => sum + effBillable(entry), 0);

    return {
      ...first,
      hours,
      billableHours: Math.abs(billableTotal - hours) < 0.001 ? null : billableTotal,
      billed: group.every(entry => entry.billed),
    };
  });
}

export function getEffectiveBlocks(recurring, weekOverrides, weekKey, dayIndex, slot) {
  const dayOverride = weekOverrides[weekKey]?.[dayIndex];
  if (dayOverride && dayOverride[slot] !== undefined) return dayOverride[slot];
  return recurring
    .filter(r => r.day === dayIndex && r.slot === slot)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(r => ({ id: r.id, clientId: r.clientId, hours: r.hours }));
}

function leftoverTasks(tasks, capacity) {
  let cap = capacity;
  const leftover = [];
  for (const t of tasks) {
    if (cap <= 0) { leftover.push(t); continue; }
    if (t.hours <= cap + 0.001) { cap -= t.hours; }
    else { leftover.push({ ...t, hours: t.hours - cap }); cap = 0; }
  }
  return leftover;
}

// Computes everything the planning UI (PlanningCell / SlotCapacityBar /
// ExtraCell) needs for a single day. Billing-specific figures (billable hours,
// divergence) stay in the caller since they depend on client billing config.
export function computeDayPlanning({
  dayIndex, isToday, isFuture,
  recurring, weekOverrides, weekKey,
  rawDayEntries, dayEntries,
  clients, projects,
  todoistTasks = [],
}) {
  const validClientIds = new Set(clients.map(c => c.id));
  const slotBlocks = {};
  const visibleSlotBlocks = {};
  for (const slot of SLOTS) {
    slotBlocks[slot] = getEffectiveBlocks(recurring, weekOverrides, weekKey, dayIndex, slot);
    visibleSlotBlocks[slot] = slotBlocks[slot].filter(b => validClientIds.has(b.clientId));
  }
  const { am: amBlocks, pm: pmBlocks, sera: seraBlocks } = slotBlocks;
  const visibleBlocks = SLOTS.flatMap(slot => visibleSlotBlocks[slot]);

  const dayHours = dayEntries.reduce((s, e) => s + e.hours, 0);
  const slotLogged = {};
  for (const slot of SLOTS) {
    slotLogged[slot] = rawDayEntries
      .filter(e => normalizeSlot(e.slot) === slot)
      .reduce((s, e) => s + e.hours, 0);
  }
  const { am: amLogged, pm: pmLogged, sera: seraLogged } = slotLogged;
  const plannedTotal = visibleBlocks.reduce((s, b) => s + b.hours, 0);
  const delta = dayHours - plannedTotal;
  const recurringTotal = recurring
    .filter(r => r.day === dayIndex && validClientIds.has(r.clientId))
    .reduce((s, r) => s + r.hours, 0);
  const pianificazioneExtra = Math.max(0, plannedTotal - recurringTotal);

  const clientPlanned = {};
  for (const b of visibleBlocks) {
    clientPlanned[b.clientId] = (clientPlanned[b.clientId] || 0) + b.hours;
  }
  const clientLogged = {};
  dayEntries.forEach(e => {
    const p = projects.find(p2 => p2.id === e.projectId);
    if (p) clientLogged[p.clientId] = (clientLogged[p.clientId] || 0) + e.hours;
  });
  const loggedInPlan = Object.entries(clientPlanned).reduce((s, [cid, planned]) =>
    s + Math.min(clientLogged[cid] || 0, planned), 0);
  const bilancioExtra = dayHours - loggedInPlan;

  const plannedClientIds = new Set(Object.keys(clientPlanned));
  const extraByClient = {};
  dayEntries.forEach(e => {
    const p = projects.find(p2 => p2.id === e.projectId);
    if (!p) return;
    if (!plannedClientIds.has(p.clientId)) {
      extraByClient[p.clientId] = (extraByClient[p.clientId] ?? 0) + e.hours;
    }
  });
  for (const [cid, planned] of Object.entries(clientPlanned)) {
    const logged = clientLogged[cid] ?? 0;
    if (logged > planned) extraByClient[cid] = (extraByClient[cid] ?? 0) + (logged - planned);
  }
  const extraBlocks = Object.entries(extraByClient).map(([clientId, hours]) => ({ clientId, hours }));

  // Sequential fill: AM blocks first, then PM blocks, per client in order
  const blockFill = {};
  const clientRemainder = { ...clientLogged };
  for (const block of visibleBlocks) {
    const cid = block.clientId;
    const hasExtra = (clientLogged[cid] ?? 0) > (clientPlanned[cid] ?? 0);
    const remaining = clientRemainder[cid] ?? 0;
    const logged = Math.min(remaining, block.hours);
    clientRemainder[cid] = Math.max(0, remaining - block.hours);
    blockFill[block.id] = { logged, hasExtra };
  }

  // Todoist coverage per slot per clientId
  const todoistByCS = Object.fromEntries(SLOTS.map(slot => [slot, {}]));
  const todoistTasksByCS = Object.fromEntries(SLOTS.map(slot => [slot, {}]));
  todoistTasks.forEach(t => {
    const proj = projects.find(p => p.id === t.projectId);
    if (!proj) return;
    const s = normalizeSlot(t.slot);
    todoistByCS[s][proj.clientId] = (todoistByCS[s][proj.clientId] ?? 0) + t.hours;
    if (!todoistTasksByCS[s][proj.clientId]) todoistTasksByCS[s][proj.clientId] = [];
    todoistTasksByCS[s][proj.clientId].push({ ...t, projectName: proj.name });
  });

  const slotPlanned = {};
  for (const slot of SLOTS) {
    slotPlanned[slot] = {};
    visibleSlotBlocks[slot].forEach(b => { slotPlanned[slot][b.clientId] = (slotPlanned[slot][b.clientId] ?? 0) + b.hours; });
  }

  const orphanTodoist = [];
  if (isToday || isFuture) {
    for (const slot of SLOTS) {
      Object.entries(todoistByCS[slot]).forEach(([cid, h]) => {
        const remaining = h - (slotPlanned[slot][cid] ?? 0);
        if (remaining > 0) orphanTodoist.push({ clientId: cid, hours: remaining, slot, tasks: leftoverTasks(todoistTasksByCS[slot][cid] ?? [], slotPlanned[slot][cid] ?? 0) });
      });
    }
  }

  return {
    amBlocks, pmBlocks, seraBlocks, slotBlocks, visibleBlocks,
    dayHours, amLogged, pmLogged, seraLogged, slotLogged, plannedTotal, delta,
    pianificazioneExtra, clientPlanned, clientLogged, loggedInPlan, bilancioExtra,
    extraBlocks, blockFill, todoistByCS, todoistTasksByCS, orphanTodoist,
  };
}
