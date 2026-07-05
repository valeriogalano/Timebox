import React, { useState, useEffect, useRef } from 'react';
import { getToday, DAY_SHORT, MONTHS_IT, addDays, getMondayOfWeek, fmt, fmtH, toHHMM, parseHHMM, effBillable } from '../utils';
import PlanningCell from '../components/PlanningCell';
import ExtraCell from '../components/ExtraCell';
import TimeCell from '../components/TimeCell';
import DivergenceDot from '../components/DivergenceDot';

const PLANNING_MODES = ['full', 'compact', 'hidden'];

function getWeekKey(monday) { return fmt(monday); }

function mergeProjectDayEntries(entries) {
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

function getEffectiveBlocks(recurring, weekOverrides, weekKey, dayIndex, slot) {
  const dayOverride = weekOverrides[weekKey]?.[dayIndex];
  if (dayOverride && dayOverride[slot] !== undefined) return dayOverride[slot];
  return recurring
    .filter(r => r.day === dayIndex && r.slot === slot)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(r => ({ id: r.id, clientId: r.clientId, hours: r.hours }));
}

function summarizeBlocksByClient(blocks, validClientIds) {
  const summary = {};
  for (const block of blocks) {
    if (!validClientIds.has(block.clientId)) continue;
    summary[block.clientId] = (summary[block.clientId] ?? 0) + block.hours;
  }
  return summary;
}

function blockSummariesDiffer(a, b) {
  const clientIds = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const clientId of clientIds) {
    if (Math.abs((a[clientId] ?? 0) - (b[clientId] ?? 0)) > 0.001) return true;
  }
  return false;
}

export default function WeeklyView({ clients, projects, recurring, weekOffset, setWeekOffset, onEntryChange, externalRefreshTick, autoFocusProject, onAutoFocusConsumed }) {
  const monday = addDays(getMondayOfWeek(getToday()), weekOffset * 7);
  const weekKey = getWeekKey(monday);

  const [weekEntries, setWeekEntries] = useState([]);
  const [weekOverrides, setWeekOverrides] = useState({});
  const [projectTotals, setProjectTotals] = useState({});
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [todoistTasks, setTodoistTasks] = useState({});
  const [todoistSync, setTodoistSync] = useState({});
  const [editingProject, setEditingProject] = useState(null);
  const [revealedProject, setRevealedProject] = useState(null);
  const [hideEmpty, setHideEmpty] = useState(() => localStorage.getItem('timebox-hide-empty-projects') === 'true');
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('timebox-timesheet-view') === 'billable' ? 'billable' : 'tracked');
  const [todoistImportDialog, setTodoistImportDialog] = useState(null);
  const [planningMode, setPlanningMode] = useState(() => {
    const saved = localStorage.getItem('timebox-planning-mode');
    if (PLANNING_MODES.includes(saved)) return saved;
    return localStorage.getItem('timebox-planning-collapsed') === 'true' ? 'hidden' : 'full';
  });

  function changeViewMode(next) {
    setViewMode(next);
    localStorage.setItem('timebox-timesheet-view', next);
  }

  function setPlanningModePersisted(next) {
    setPlanningMode(next);
    localStorage.setItem('timebox-planning-mode', next);
    localStorage.setItem('timebox-planning-collapsed', String(next === 'hidden'));
  }

  function cyclePlanningMode() {
    setPlanningMode(current => {
      const currentIndex = PLANNING_MODES.indexOf(current);
      const next = PLANNING_MODES[(currentIndex + 1) % PLANNING_MODES.length];
      localStorage.setItem('timebox-planning-mode', next);
      localStorage.setItem('timebox-planning-collapsed', String(next === 'hidden'));
      return next;
    });
  }

  function startEditingProject(projectId) {
    setEditingProject(projectId);
    setRevealedProject(current => current && current !== projectId ? null : current);
  }

  useEffect(() => {
    function onGlobalTab(e) {
      if (e.key !== 'Tab') return;
      if (document.activeElement?.closest('[data-timecell]')) return;
      if (document.activeElement?.closest('[role="dialog"]')) return;
      e.preventDefault();
      const todayCol = document.querySelector('[data-timecell][data-today]')?.dataset.col;
      if (todayCol == null) return;
      const colCells = Array.from(document.querySelectorAll(`[data-timecell][data-col="${todayCol}"]`));
      const target = e.shiftKey ? colCells[colCells.length - 1] : colCells[0];
      if (target) { target.click(); target.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    }
    document.addEventListener('keydown', onGlobalTab);
    return () => document.removeEventListener('keydown', onGlobalTab);
  }, []);

  useEffect(() => {
    function onHideShortcut(e) {
      if (!e.metaKey || !e.shiftKey || e.key.toLowerCase() !== 'h') return;
      if (document.activeElement?.closest('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      setHideEmpty(v => {
        const next = !v;
        localStorage.setItem('timebox-hide-empty-projects', String(next));
        return next;
      });
    }
    document.addEventListener('keydown', onHideShortcut);
    return () => document.removeEventListener('keydown', onHideShortcut);
  }, []);

  useEffect(() => {
    function onViewModeShortcut(e) {
      if (!e.metaKey || !e.shiftKey || e.key.toLowerCase() !== 'v') return;
      if (document.activeElement?.closest('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      setViewMode(v => {
        const next = v === 'tracked' ? 'billable' : 'tracked';
        localStorage.setItem('timebox-timesheet-view', next);
        return next;
      });
    }
    document.addEventListener('keydown', onViewModeShortcut);
    return () => document.removeEventListener('keydown', onViewModeShortcut);
  }, []);

  useEffect(() => {
    function onPlanningShortcut(e) {
      if (!e.metaKey || !e.shiftKey || e.key.toLowerCase() !== 'p') return;
      if (document.activeElement?.closest('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      setPlanningMode(current => {
        const currentIndex = PLANNING_MODES.indexOf(current);
        const next = PLANNING_MODES[(currentIndex + 1) % PLANNING_MODES.length];
        localStorage.setItem('timebox-planning-mode', next);
        localStorage.setItem('timebox-planning-collapsed', String(next === 'hidden'));
        return next;
      });
    }
    document.addEventListener('keydown', onPlanningShortcut);
    return () => document.removeEventListener('keydown', onPlanningShortcut);
  }, []);

  useEffect(() => {
    if (!autoFocusProject) return;
    setRevealedProject(autoFocusProject);
    requestAnimationFrame(() => {
      const cell = document.querySelector(`[data-timecell][data-today][data-project="${autoFocusProject}"]`);
      if (cell) {
        cell.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        cell.click();
      }
      onAutoFocusConsumed?.();
    });
  }, [autoFocusProject]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset dismiss state when week changes
  useEffect(() => { setAlertDismissed(false); }, [weekKey]);
  useEffect(() => { setRevealedProject(null); }, [weekKey]);

  // Reload entries when an external DB change is pushed from main process
  useEffect(() => {
    if (!externalRefreshTick) return;
    window.api.getProjectTotals().then(setProjectTotals);
    const sunday = addDays(monday, 6);
    window.api.getEntries(fmt(monday), fmt(sunday)).then(setWeekEntries);
  }, [externalRefreshTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load entries, overrides, and project totals when week changes
  useEffect(() => {
    window.api.getProjectTotals().then(setProjectTotals);
    const sunday = addDays(monday, 6);
    window.api.getEntries(fmt(monday), fmt(sunday)).then(setWeekEntries);
    window.api.getWeekOverrides(weekKey).then(rows => {
      const map = {};
      rows.forEach(r => {
        if (!map[r.dayIndex]) map[r.dayIndex] = {};
        map[r.dayIndex][r.slot] = r.blocks;
      });
      setWeekOverrides(prev => ({ ...prev, [weekKey]: map }));
    });

    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(monday, i);
      return fmt(d);
    });
    window.api.getTodoistCache(dates).then(rows => {
      const tasks = {}, sync = {};
      rows.forEach(r => { tasks[r.dateStr] = r.tasks; sync[r.dateStr] = r.syncedAt; });
      setTodoistTasks(tasks);
      setTodoistSync(sync);
    });
  }, [weekKey, recurring]);

  function effectiveBlocks(dayIndex, slot) {
    return getEffectiveBlocks(recurring, weekOverrides, weekKey, dayIndex, slot);
  }

  const displayWeekEntries = mergeProjectDayEntries(weekEntries);
  const validClientIds = new Set(clients.map(client => client.id));

  function setSlotOverride(dayIndex, slot, newBlocks) {
    setWeekOverrides(prev => {
      const weekData = prev[weekKey] ?? {};
      const dayData  = weekData[dayIndex] ?? {};
      return { ...prev, [weekKey]: { ...weekData, [dayIndex]: { ...dayData, [slot]: newBlocks } } };
    });
    window.api.saveWeekOverride({ weekKey, dayIndex, slot, blocks: newBlocks });
  }

  function addBlockToSlot(dayIndex, slot, clientId, hours) {
    const current = effectiveBlocks(dayIndex, slot);
    setSlotOverride(dayIndex, slot, [...current, { id: `ov-${crypto.randomUUID()}`, clientId, hours }]);
  }

  function updateBlockInSlot(dayIndex, slot, blockId, hours) {
    const current = effectiveBlocks(dayIndex, slot);
    setSlotOverride(dayIndex, slot, current.map(b => b.id === blockId ? { ...b, hours } : b));
  }

  function removeBlockFromSlot(dayIndex, slot, blockId) {
    const current = effectiveBlocks(dayIndex, slot);
    const newBlocks = current.filter(b => b.id !== blockId);
    if (newBlocks.length === 0) {
      // Persist an explicit empty override so the recurring template stays suppressed.
      setSlotOverride(dayIndex, slot, []);
    } else {
      setSlotOverride(dayIndex, slot, newBlocks);
    }
  }

  function handleDragStart(blockId, fromDay, fromSlot, clientId, hours) {
    setDragging({ blockId, fromDay, fromSlot, clientId, hours });
  }

  function handleDrop(toDay, toSlot) {
    if (!dragging) return;
    const { blockId, fromDay, fromSlot, hours, clientId } = dragging;
    if (fromDay === toDay && fromSlot === toSlot) { setDragging(null); setDragOver(null); return; }
    const srcBlocks = effectiveBlocks(fromDay, fromSlot).filter(b => b.id !== blockId);
    const dstBlocks = [...effectiveBlocks(toDay, toSlot), { id: blockId, clientId, hours }];
    setWeekOverrides(prev => {
      const weekData = prev[weekKey] ?? {};
      if (fromDay === toDay) {
        const day = weekData[fromDay] ?? {};
        return { ...prev, [weekKey]: { ...weekData, [fromDay]: { ...day, [fromSlot]: srcBlocks, [toSlot]: dstBlocks } } };
      }
      const srcDay = weekData[fromDay] ?? {};
      const dstDay = weekData[toDay]   ?? {};
      return { ...prev, [weekKey]: { ...weekData, [fromDay]: { ...srcDay, [fromSlot]: srcBlocks }, [toDay]: { ...dstDay, [toSlot]: dstBlocks } } };
    });
    window.api.saveWeekOverride({ weekKey, dayIndex: fromDay, slot: fromSlot, blocks: srcBlocks });
    window.api.saveWeekOverride({ weekKey, dayIndex: toDay, slot: toSlot, blocks: dstBlocks });
    setDragging(null);
    setDragOver(null);
  }

  function resetWeekToTemplate() {
    if (!window.confirm("Sei sicuro di voler ripristinare il template per questa settimana? Tutte le modifiche personalizzate andranno perse.")) return;
    setWeekOverrides(prev => {
      const next = { ...prev };
      delete next[weekKey];
      return next;
    });
    for (let d = 0; d < 7; d++) {
      for (const slot of ['am', 'pm']) {
        window.api.deleteWeekOverride(weekKey, d, slot);
      }
    }
  }

  async function saveEntry(projectId, dateStr, payload, slot) {
    const matches = weekEntries.filter(e => e.projectId === projectId && e.date === dateStr);
    const existing = displayWeekEntries.find(e => e.projectId === projectId && e.date === dateStr);
    const hours = typeof payload === 'object' ? payload.hours : payload;
    const billableHours = typeof payload === 'object' ? (payload.billableHours ?? null) : (existing?.billableHours ?? null);
    if (hours === 0) {
      setWeekEntries(prev => prev.filter(e => !(e.projectId === projectId && e.date === dateStr)));
      if (matches.length > 0) {
        for (const match of matches) await window.api.deleteEntry(match.id);
        window.api.getProjectTotals().then(setProjectTotals);
      }
    } else {
      let resolvedSlot = slot;
      if (!resolvedSlot) {
        const project = projects.find(p => p.id === projectId);
        if (project) {
          const clientId = project.clientId;
          const dateIndex = days.findIndex(d => d.dateStr === dateStr);
          if (dateIndex >= 0) {
            const amBlocks = effectiveBlocks(dateIndex, 'am');
            const pmBlocks = effectiveBlocks(dateIndex, 'pm');
            const hasAMBlock = amBlocks.some(b => b.clientId === clientId);
            const hasPMBlock = pmBlocks.some(b => b.clientId === clientId);
            if (!hasAMBlock && hasPMBlock) resolvedSlot = 'pm';
            else resolvedSlot = 'am';
          } else {
            resolvedSlot = 'am';
          }
        } else {
          resolvedSlot = 'am';
        }
      }
      const entry = existing
        ? { ...existing, hours, billableHours }
        : { id: crypto.randomUUID(), projectId, date: dateStr, hours, billableHours, slot: resolvedSlot, billed: false };
      setWeekEntries(prev => [
        ...prev.filter(e => !(e.projectId === projectId && e.date === dateStr)),
        entry,
      ]);
      await window.api.saveEntry(entry);
      for (const match of matches) {
        if (match.id === entry.id) continue;
        await window.api.deleteEntry(match.id);
      }
      window.api.getProjectTotals().then(setProjectTotals);
    }
    onEntryChange?.();
  }

  async function resetBillable(projectId, dateStr) {
    const matches = weekEntries.filter(e => e.projectId === projectId && e.date === dateStr);
    const existing = displayWeekEntries.find(e => e.projectId === projectId && e.date === dateStr);
    if (!existing) return;
    const entry = { ...existing, billableHours: null };
    setWeekEntries(prev => [
      ...prev.filter(e => !(e.projectId === projectId && e.date === dateStr)),
      entry,
    ]);
    await window.api.saveEntry(entry);
    for (const match of matches) {
      if (match.id === entry.id) continue;
      await window.api.deleteEntry(match.id);
    }
    onEntryChange?.();
  }

  async function toggleBilled(projectId, dateStr) {
    const project = projects.find(p => p.id === projectId);
    const client = project ? clients.find(c => c.id === project.clientId) : null;
    if (!client || client.billing === 'none') return;
    const matches = weekEntries.filter(e => e.projectId === projectId && e.date === dateStr);
    const existing = displayWeekEntries.find(e => e.projectId === projectId && e.date === dateStr);
    if (!existing) return;
    const updated = { ...existing, billed: !existing.billed };
    setWeekEntries(prev => [
      ...prev.filter(e => !(e.projectId === projectId && e.date === dateStr)),
      updated,
    ]);
    await window.api.saveEntry(updated);
    for (const match of matches) {
      if (match.id === updated.id) continue;
      await window.api.deleteEntry(match.id);
    }
  }

  const hasOverride = !!weekOverrides[weekKey] && Object.keys(weekOverrides[weekKey]).length > 0;

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const dateStr = fmt(date);
    const isToday = dateStr === fmt(getToday());
    const isFuture = date > getToday();
    const isWeekend = i >= 5;
    const isDayOverridden = !!weekOverrides[weekKey]?.[i];
    const dayEntries = displayWeekEntries.filter(e => e.date === dateStr);
    const dayHours = dayEntries.reduce((s, e) => s + e.hours, 0);
    const dayBillable = dayEntries.reduce((s, e) => {
      const proj = projects.find(p => p.id === e.projectId);
      const cli = proj ? clients.find(c => c.id === proj.clientId) : null;
      if (!cli || cli.billing === 'none') return s;
      return s + effBillable(e);
    }, 0);
    const dayDivergent = dayEntries.some(e => {
      const proj = projects.find(p => p.id === e.projectId);
      const cli = proj ? clients.find(c => c.id === proj.clientId) : null;
      if (!cli || cli.billing === 'none') return false;
      return e.billableHours !== null && e.billableHours !== undefined && Math.abs(e.billableHours - e.hours) > 0.001;
    });
    const amBlocks = effectiveBlocks(i, 'am');
    const pmBlocks = effectiveBlocks(i, 'pm');
    const visibleAmBlocks = amBlocks.filter(block => validClientIds.has(block.clientId));
    const visiblePmBlocks = pmBlocks.filter(block => validClientIds.has(block.clientId));
    const visibleBlocks = [...visibleAmBlocks, ...visiblePmBlocks];
    const plannedTotal = visibleBlocks.reduce((s, b) => s + b.hours, 0);
    const delta = dayHours - plannedTotal;
    const recurringTotal = recurring
      .filter(r => r.day === i && validClientIds.has(r.clientId))
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
    // Also add overflow for planned clients (logged > planned)
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
    const dayTodoist = todoistTasks[dateStr] ?? [];
    const todoistByCS = { am: {}, pm: {} };
    const todoistTasksByCS = { am: {}, pm: {} };
    dayTodoist.forEach(t => {
      const proj = projects.find(p => p.id === t.projectId);
      if (!proj) return;
      const s = t.slot || 'am';
      todoistByCS[s][proj.clientId] = (todoistByCS[s][proj.clientId] ?? 0) + t.hours;
      if (!todoistTasksByCS[s][proj.clientId]) todoistTasksByCS[s][proj.clientId] = [];
      todoistTasksByCS[s][proj.clientId].push({ ...t, projectName: proj.name });
    });
    const lastSync = todoistSync[dateStr] ?? null;

    const amPlanned = {};
    visibleAmBlocks.forEach(b => { amPlanned[b.clientId] = (amPlanned[b.clientId] ?? 0) + b.hours; });
    const pmPlanned = {};
    visiblePmBlocks.forEach(b => { pmPlanned[b.clientId] = (pmPlanned[b.clientId] ?? 0) + b.hours; });
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

    const orphanTodoist = [];
    if (isToday || isFuture) {
      Object.entries(todoistByCS.am).forEach(([cid, h]) => {
        const remaining = h - (amPlanned[cid] ?? 0);
        if (remaining > 0) orphanTodoist.push({ clientId: cid, hours: remaining, slot: 'am', tasks: leftoverTasks(todoistTasksByCS.am[cid] ?? [], amPlanned[cid] ?? 0) });
      });
      Object.entries(todoistByCS.pm).forEach(([cid, h]) => {
        const remaining = h - (pmPlanned[cid] ?? 0);
        if (remaining > 0) orphanTodoist.push({ clientId: cid, hours: remaining, slot: 'pm', tasks: leftoverTasks(todoistTasksByCS.pm[cid] ?? [], pmPlanned[cid] ?? 0) });
      });
    }

    return { date, dateStr, isToday, isFuture, isWeekend, isDayOverridden, dayHours, dayBillable, dayDivergent, plannedTotal, delta, loggedInPlan, bilancioExtra, pianificazioneExtra, amBlocks, pmBlocks, extraBlocks, dayEntries, blockFill, todoistByCS, todoistTasksByCS, lastSync, orphanTodoist };
  });

  const weekPlanned  = days.reduce((s, d) => s + d.plannedTotal, 0);
  const weekActual   = days.reduce((s, d) => s + d.dayHours, 0);
  const weekBillable = days.reduce((s, d) => s + d.dayBillable, 0);
  const weekDivergent = days.some(d => d.dayDivergent);
  const weekDelta    = weekActual - weekPlanned;
  const weekExtra    = days.reduce((s, d) => s + Math.max(0, d.bilancioExtra), 0);
  const endSun = addDays(monday, 6);
  const weekLabel = `${monday.getDate()} ${MONTHS_IT[monday.getMonth()]} – ${endSun.getDate()} ${MONTHS_IT[endSun.getMonth()]} ${endSun.getFullYear()}`;

  const templateDivergence = days.reduce((acc, d, dayIndex) => {
    for (const slot of ['am', 'pm']) {
      const effectiveSummary = summarizeBlocksByClient(d[`${slot}Blocks`], validClientIds);
      const templateBlocks = recurring.filter(r => r.day === dayIndex && r.slot === slot);
      const templateSummary = summarizeBlocksByClient(templateBlocks, validClientIds);
      const effectiveTotal = Object.values(effectiveSummary).reduce((s, h) => s + h, 0);
      const templateTotal = Object.values(templateSummary).reduce((s, h) => s + h, 0);
      const delta = effectiveTotal - templateTotal;
      const differs = blockSummariesDiffer(effectiveSummary, templateSummary);
      if (!differs) continue;
      acc.deltaHours += delta;
      acc.divergentSlots += 1;
      acc.details.push(`${DAY_SHORT[dayIndex]} ${slot.toUpperCase()}: ${delta >= 0 ? '+' : ''}${fmtH(delta)}`);
    }
    return acc;
  }, { deltaHours: 0, divergentSlots: 0, totalSlots: 14, details: [] });

  const weekDateStrs = days.map(d => d.dateStr);
  const clientsWithProjects = clients.map(c => ({
    ...c, projects: projects.filter(p => p.clientId === c.id && !p.archived),
  })).filter(c => c.projects.length > 0);

  // Weekly summaries per client (unified AM + PM + Extra)
  const weekTotalSummary = {};

  days.forEach(d => {
    // Planned: AM + PM blocks
    [...d.amBlocks, ...d.pmBlocks]
      .filter(block => validClientIds.has(block.clientId))
      .forEach(b => {
      if (!weekTotalSummary[b.clientId]) weekTotalSummary[b.clientId] = { planned: 0, actual: 0 };
      weekTotalSummary[b.clientId].planned += b.hours;
      });
    // Actual: All entries (planned + extra)
    d.dayEntries.forEach(e => {
      const p = projects.find(p2 => p2.id === e.projectId);
      if (!p) return;
      if (!weekTotalSummary[p.clientId]) weekTotalSummary[p.clientId] = { planned: 0, actual: 0 };
      weekTotalSummary[p.clientId].actual += e.hours;
    });
  });

  const COL = 'minmax(60px, 1fr) repeat(7, minmax(0, 1fr)) minmax(55px, 0.65fr)';
  const todayBorderLeft = d => `1px solid ${d.isToday ? '#3DB33D28' : 'var(--tb-border-soft)'}`;
  const todayBg = (d, base) => d.isToday ? 'var(--tb-cell-today)' : (base || 'transparent');
  const planningCompact = planningMode === 'compact';
  const planningVisible = planningMode !== 'hidden';

  // Weekly hours per project (for alert dot + banner)
  const weekProjectHours = displayWeekEntries.reduce((acc, e) => {
    acc[e.projectId] = (acc[e.projectId] ?? 0) + e.hours;
    return acc;
  }, {});

  const projectsInView = hideEmpty
    ? clientsWithProjects.map(c => ({
        ...c,
        projects: c.projects.filter(p =>
          (weekProjectHours[p.id] ?? 0) > 0 || p.id === autoFocusProject || p.id === editingProject || p.id === revealedProject
        ),
      })).filter(c => c.projects.length > 0)
    : clientsWithProjects;

  // Projects exceeding weekly limit this week
  const weeklyOverProjects = projects.filter(p =>
    p.weeklyHours > 0 && (weekProjectHours[p.id] ?? 0) > p.weeklyHours
  );

  // Projects exceeding total budget
  const budgetOverProjects = projects.filter(p =>
    p.budgetHours > 0 && (projectTotals[p.id] ?? 0) > p.budgetHours
  );

  // Hours done this week per client
  const weekClientHours = displayWeekEntries.reduce((acc, e) => {
    const proj = projects.find(p => p.id === e.projectId);
    if (proj) acc[proj.clientId] = (acc[proj.clientId] ?? 0) + e.hours;
    return acc;
  }, {});

  // Clients exceeding weekly area limit
  const weeklyOverClients = clients.filter(c =>
    c.limitType === 'weekly' && c.limitHours > 0 && (weekClientHours[c.id] ?? 0) > c.limitHours
  );

  // Clients exceeding global area limit (all-time)
  const clientTotals = Object.entries(projectTotals).reduce((acc, [projectId, h]) => {
    const proj = projects.find(p => p.id === projectId);
    if (proj) acc[proj.clientId] = (acc[proj.clientId] ?? 0) + h;
    return acc;
  }, {});
  const globalOverClients = clients.filter(c =>
    c.limitType === 'global' && c.limitHours > 0 && (clientTotals[c.id] ?? 0) > c.limitHours
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Weekly project limit alert banner */}
      {!alertDismissed && weeklyOverProjects.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px', borderRadius: 7,
          background: '#E07B3A10', border: '1px solid #E07B3A40',
        }}>
          <span style={{ fontSize: 12, color: '#E07B3A', flex: 1 }}>
            <strong>Limite settimanale superato:</strong>{' '}
            {weeklyOverProjects.map(p => {
              const h = weekProjectHours[p.id] ?? 0;
              return `${p.name} (${fmtH(h)} / ${fmtH(p.weeklyHours)})`;
            }).join(' · ')}
          </span>
          <button onClick={() => setAlertDismissed(true)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#E05252', fontSize: 14, lineHeight: 1, padding: '0 2px',
              fontFamily: "'Open Sans', sans-serif", fontWeight: 700,
            }}>×</button>
        </div>
      )}

      {/* Budget exceeded alert banner */}
      {!alertDismissed && budgetOverProjects.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px', borderRadius: 7,
          background: '#E07B3A10', border: '1px solid #E07B3A40',
        }}>
          <span style={{ fontSize: 12, color: '#E07B3A', flex: 1 }}>
            <strong>Budget totale superato:</strong>{' '}
            {budgetOverProjects.map(p => {
              const h = projectTotals[p.id] ?? 0;
              return `${p.name} (${fmtH(h)} / ${fmtH(p.budgetHours)})`;
            }).join(' · ')}
          </span>
        </div>
      )}

      {/* Client weekly limit alert banner */}
      {!alertDismissed && weeklyOverClients.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px', borderRadius: 7,
          background: '#E07B3A10', border: '1px solid #E07B3A40',
        }}>
          <span style={{ fontSize: 12, color: '#E07B3A', flex: 1 }}>
            <strong>Limite settimanale area superato:</strong>{' '}
            {weeklyOverClients.map(c => `${c.name} (${fmtH(weekClientHours[c.id] ?? 0)} / ${fmtH(c.limitHours)})`).join(' · ')}
          </span>
        </div>
      )}

      {/* Client global limit alert banner */}
      {!alertDismissed && globalOverClients.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px', borderRadius: 7,
          background: '#E0525210', border: '1px solid #E0525240',
        }}>
          <span style={{ fontSize: 12, color: '#E05252', flex: 1 }}>
            <strong>Limite totale area superato:</strong>{' '}
            {globalOverClients.map(c => `${c.name} (${fmtH(clientTotals[c.id] ?? 0)} / ${fmtH(c.limitHours)})`).join(' · ')}
          </span>
        </div>
      )}

      {/* Week nav + summary */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <NavBtn onClick={() => setWeekOffset(o => o - 1)}>‹</NavBtn>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tb-text-primary)', minWidth: 210, textAlign: 'center' }}>{weekLabel}</span>
          <NavBtn onClick={() => setWeekOffset(o => o + 1)}>›</NavBtn>
          {weekOffset !== 0 && <NavBtn small onClick={() => setWeekOffset(0)}>Oggi</NavBtn>}
          {hasOverride && (
            <>
              <TemplateDivergenceBadge summary={templateDivergence} />
              <button onClick={resetWeekToTemplate}
                style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 5,
                  background: 'var(--tb-reset-btn-bg)', border: '1px solid #E07B3A55', color: '#E07B3A',
                  cursor: 'pointer', fontFamily: "'Open Sans', sans-serif",
                }}>
                ↩ Ripristina template
              </button>
            </>
          )}
          <TodoistSyncButton
            days={days}
            todoistSync={todoistSync} setTodoistSync={setTodoistSync}
            todoistTasks={todoistTasks} setTodoistTasks={setTodoistTasks}
            projects={projects} />
          <TodoistImportButton
            days={days}
            projects={projects}
            onOpen={setTodoistImportDialog}
          />
        </div>
        <div style={{ display: 'flex', gap: 28 }}>
          <Pill label="Pianificate" value={fmtH(weekPlanned)}  color="var(--tb-text-muted)"   dim />
          <Pill label="Tracciate"   value={fmtH(weekActual)}   color="var(--tb-text-primary)" dim={viewMode !== 'tracked'} />
          <Pill label="Fatturabili" value={fmtH(weekBillable)} color="#3DB33D"                dim={viewMode !== 'billable'} />
          {weekExtra > 0 && (
            <Pill label="Extra" value={fmtH(weekExtra)} color="#E07B3A" />
          )}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <PlanningModeToggle value={planningMode} onChange={setPlanningModePersisted} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <ProjectVisibilityToggle value={hideEmpty ? 'worked' : 'all'} onChange={(next) => {
            const nextHideEmpty = next === 'worked';
            setHideEmpty(nextHideEmpty);
            localStorage.setItem('timebox-hide-empty-projects', String(nextHideEmpty));
          }} />
          <ViewModeToggle value={viewMode} onChange={changeViewMode} />
        </div>
      </div>

      {/* Unified grid */}
      <div style={{ background: 'var(--tb-panel-bg)', borderRadius: 8, border: '1px solid var(--tb-border)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COL }}>

          {planningVisible && (
            <>
              {/* Day header */}
              <GridLabel compact={planningCompact}>Pianificato</GridLabel>
              {days.map((d, i) => (
                <div key={i} style={{
                  background: d.isToday ? 'var(--tb-cell-today-header)' : 'var(--tb-panel-bg-soft)',
                  borderBottom: '1px solid var(--tb-border)',
                  borderLeft: `1px solid ${d.isToday ? '#3DB33D55' : 'var(--tb-border-soft)'}`,
                  padding: planningCompact ? '5px 4px' : '8px 4px', textAlign: 'center', opacity: d.isWeekend ? 0.7 : 1,
                }}>
                  <div style={{ fontSize: planningCompact ? 9 : 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: d.isToday ? '#3DB33D' : 'var(--tb-text-faint)' }}>{DAY_SHORT[i]}</div>
                  <div style={{ fontSize: planningCompact ? 11 : 12, fontWeight: 700, color: d.isToday ? '#3DB33D' : 'var(--tb-text-secondary)', lineHeight: 1.1 }}>
                    {d.date.getDate()}
                  </div>
                  {d.isToday
                    ? <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#3DB33D', margin: planningCompact ? '2px auto 0' : '3px auto 0' }} />
                    : d.isDayOverridden && <div title="Giorno modificato rispetto al template" style={{ width: 5, height: 5, borderRadius: '50%', background: '#E07B3A', margin: planningCompact ? '2px auto 0' : '3px auto 0' }} />
                  }
                </div>
              ))}
              <div style={{
                background: 'var(--tb-panel-bg-soft)', borderBottom: '1px solid var(--tb-border)', borderLeft: '1px solid var(--tb-border-mid)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--tb-text-faint)',
              }}>Tot</div>

              {/* AM row */}
              <GridLabel border compact={planningCompact} timeLabel="fino alle 13:00">Mattina</GridLabel>
              {days.map((d, i) => {
                const isDropTarget = dragOver?.day === i && dragOver?.slot === 'am';
                const amTotal = d.amBlocks.filter(b => clients.some(c => c.id === b.clientId)).reduce((s, b) => s + b.hours, 0);
                return (
                  <div key={i}
                    onDragOver={e => { e.preventDefault(); setDragOver({ day: i, slot: 'am' }); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={() => handleDrop(i, 'am')}
                    style={{
                      borderLeft: todayBorderLeft(d), borderBottom: '1px solid var(--tb-border-soft)',
                      background: isDropTarget ? 'var(--tb-drag-over-bg)' : todayBg(d), padding: planningCompact ? 3 : 4,
                      transition: 'background 0.1s',
                      outline: isDropTarget ? '2px dashed #4A8FE8' : 'none', outlineOffset: -2,
                      display: 'flex', flexDirection: 'column', gap: 3,
                    }}>
                    <PlanningCell slot="am" dayIndex={i} blocks={d.amBlocks}
                      compact={planningCompact}
                      clients={clients} projects={projects} projectTotals={projectTotals} weekProjectHours={weekProjectHours}
                      blockFill={d.blockFill}
                      todoistByClient={d.todoistByCS.am} todoistTasksByClient={d.todoistTasksByCS.am} hasTodoistSync={!!d.lastSync}
                      isToday={d.isToday} isFuture={d.isFuture} isWeekend={false} editable
                      onAddBlock={(cid, h) => addBlockToSlot(i, 'am', cid, h)}
                      onUpdateBlock={(bid, h) => updateBlockInSlot(i, 'am', bid, h)}
                      onRemoveBlock={bid => removeBlockFromSlot(i, 'am', bid)}
                      onReorder={newBlocks => setSlotOverride(i, 'am', newBlocks)}
                      onDragStart={(bid, cid, h) => handleDragStart(bid, i, 'am', cid, h)}
                      draggingId={dragging?.blockId} />
                    <div style={{ textAlign: 'center', fontSize: planningCompact ? 8 : 9, fontWeight: 700, color: 'var(--tb-text-faint)', minHeight: planningCompact ? 10 : 14 }}>
                      {amTotal > 0 ? toHHMM(amTotal) : ''}
                    </div>
                  </div>
                );
              })}
              <div style={{
                borderLeft: '1px solid var(--tb-border-mid)', borderBottom: '1px solid var(--tb-border-soft)',
                background: 'var(--tb-panel-bg-soft)', gridRow: 'span 3',
              }}>
                <SlotSummary summary={weekTotalSummary} clients={clients} compact={planningCompact} />
              </div>

              {/* PM row */}
              <GridLabel border compact={planningCompact}>Pomeriggio</GridLabel>
              {days.map((d, i) => {
                const isDropTarget = dragOver?.day === i && dragOver?.slot === 'pm';
                const pmTotal = d.pmBlocks.filter(b => clients.some(c => c.id === b.clientId)).reduce((s, b) => s + b.hours, 0);
                return (
                  <div key={i}
                    onDragOver={e => { e.preventDefault(); setDragOver({ day: i, slot: 'pm' }); }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={() => handleDrop(i, 'pm')}
                    style={{
                      borderLeft: todayBorderLeft(d), borderBottom: '1px solid var(--tb-border-soft)',
                      background: isDropTarget ? 'var(--tb-drag-over-bg)' : todayBg(d), padding: planningCompact ? 3 : 4,
                      transition: 'background 0.1s',
                      outline: isDropTarget ? '2px dashed #4A8FE8' : 'none', outlineOffset: -2,
                      display: 'flex', flexDirection: 'column', gap: 3,
                    }}>
                    <PlanningCell slot="pm" dayIndex={i} blocks={d.pmBlocks}
                      compact={planningCompact}
                      clients={clients} projects={projects} projectTotals={projectTotals} weekProjectHours={weekProjectHours}
                      blockFill={d.blockFill}
                      todoistByClient={d.todoistByCS.pm} todoistTasksByClient={d.todoistTasksByCS.pm} hasTodoistSync={!!d.lastSync}
                      isToday={d.isToday} isFuture={d.isFuture} isWeekend={false} editable
                      onAddBlock={(cid, h) => addBlockToSlot(i, 'pm', cid, h)}
                      onUpdateBlock={(bid, h) => updateBlockInSlot(i, 'pm', bid, h)}
                      onRemoveBlock={bid => removeBlockFromSlot(i, 'pm', bid)}
                      onReorder={newBlocks => setSlotOverride(i, 'pm', newBlocks)}
                      onDragStart={(bid, cid, h) => handleDragStart(bid, i, 'pm', cid, h)}
                      draggingId={dragging?.blockId} />
                    <div style={{ textAlign: 'center', fontSize: planningCompact ? 8 : 9, fontWeight: 700, color: 'var(--tb-text-faint)', minHeight: planningCompact ? 10 : 14 }}>
                      {pmTotal > 0 ? toHHMM(pmTotal) : ''}
                    </div>
                  </div>
                );
              })}

              {/* Extra row */}
              <div style={{
                padding: '8px 14px', borderBottom: '1px solid var(--tb-border-soft)', display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--tb-text-faint)', textTransform: 'uppercase',
              }}>
                <span>Extra</span>
              </div>
              {days.map((d, i) => (
                <div key={i} style={{ borderLeft: todayBorderLeft(d), borderBottom: '1px solid var(--tb-border-soft)', background: todayBg(d), padding: planningCompact ? 3 : 4 }}>
                  <ExtraCell compact={planningCompact} blocks={d.extraBlocks} orphanTodoist={d.orphanTodoist} clients={clients} isToday={d.isToday} isFuture={d.isFuture} />
                </div>
              ))}

              {/* Day summary row */}
              <div style={{
                padding: '6px 14px', borderBottom: '2px solid var(--tb-border-mid)',
                display: 'flex', alignItems: 'center',
                fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--tb-text-faint)', textTransform: 'uppercase',
              }}>Bilancio</div>
              {days.map((d, i) => {
                if (d.isWeekend) return (
                  <div key={i} style={{ borderLeft: todayBorderLeft(d), borderBottom: '1px solid var(--tb-border)', background: todayBg(d), opacity: 0.4 }} />
                );
                const hasData = d.plannedTotal > 0 || d.dayHours > 0;
                return (
                  <div key={i} style={{
                    borderLeft: todayBorderLeft(d), borderBottom: '2px solid var(--tb-border-mid)',
                    background: todayBg(d), padding: '5px 6px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                  }}>
                    {hasData && !d.isFuture ? (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--tb-text-primary)' }}>{toHHMM(d.loggedInPlan) || '0:00'}</span>
                        {d.plannedTotal > 0 && (
                          <>
                            <span style={{ fontSize: 9, color: 'var(--tb-text-faint)', fontWeight: 600 }}>/</span>
                            <span style={{ fontSize: 9, color: 'var(--tb-text-muted)', fontWeight: 600 }}>{toHHMM(d.plannedTotal)}</span>
                          </>
                        )}
                        {d.bilancioExtra > 0 && (
                          <span style={{ fontSize: 9, fontWeight: 800, color: '#E07B3A', background: '#E07B3A18', padding: '1px 5px', borderRadius: 3 }}>+{toHHMM(d.bilancioExtra)} extra</span>
                        )}
                        {d.pianificazioneExtra > 0 && (
                          <span style={{ fontSize: 9, fontWeight: 800, color: '#5B8DD9', background: '#5B8DD918', padding: '1px 5px', borderRadius: 3, border: '1px dashed #5B8DD966' }}>+{toHHMM(d.pianificazioneExtra)} pianif.</span>
                        )}
                      </div>
                    ) : d.isFuture && d.plannedTotal > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tb-text-muted)' }}>{toHHMM(d.plannedTotal)}</span>
                        {d.pianificazioneExtra > 0 && (
                          <span style={{ fontSize: 9, fontWeight: 800, color: '#5B8DD9', background: '#5B8DD918', padding: '1px 5px', borderRadius: 3, border: '1px dashed #5B8DD966' }}>+{toHHMM(d.pianificazioneExtra)} pianif.</span>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--tb-text-faint)' }}>—</span>
                    )}
                  </div>
                );
              })}
              <div style={{ borderLeft: '1px solid var(--tb-border-mid)', borderBottom: '2px solid var(--tb-border-mid)' }} />
            </>
          )}

          {/* Timesheet header */}
          <GridLabel header>Ore per progetto</GridLabel>
          {days.map((d, i) => (
            <div key={i} style={{
              padding: '9px 4px', textAlign: 'center',
              background: d.isToday ? 'var(--tb-cell-today-header)' : 'var(--tb-panel-bg-soft)',
              borderLeft: `1px solid ${d.isToday ? '#3DB33D55' : 'var(--tb-border-soft)'}`,
              borderBottom: '1px solid var(--tb-border)', opacity: d.isWeekend ? 0.7 : 1,
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: d.isToday ? '#3DB33D' : 'var(--tb-text-faint)' }}>{DAY_SHORT[i]}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: d.isToday ? '#3DB33D' : 'var(--tb-text-secondary)' }}>{d.date.getDate()}</div>
            </div>
          ))}
          <div style={{
            padding: '9px 4px', background: 'var(--tb-panel-bg-soft)',
            borderLeft: '1px solid var(--tb-border-mid)', borderBottom: '1px solid var(--tb-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--tb-text-faint)',
          }}>Tot</div>

          {/* Project rows */}
          {projectsInView.map(client =>
            client.projects.map((project, pi) => {
              const projectEntries = displayWeekEntries.filter(e => e.projectId === project.id);
              const clientBillable = client.billing !== 'none';
              const weekTotalTracked  = projectEntries.reduce((s, e) => s + e.hours, 0);
              const weekTotalBillable = clientBillable
                ? projectEntries.reduce((s, e) => s + effBillable(e), 0)
                : 0;
              const weekTotal = viewMode === 'billable' ? weekTotalBillable : weekTotalTracked;
              const rowDivergent = clientBillable && projectEntries.some(e =>
                e.billableHours !== null && e.billableHours !== undefined && Math.abs(e.billableHours - e.hours) > 0.001
              );
              const rowHasValueInMode = viewMode === 'billable' ? clientBillable && weekTotal > 0 : weekTotal > 0;
              const topBorder = pi === 0 ? '2px solid var(--tb-border)' : 'none';

              const weeklyOver = project.weeklyHours > 0 && weekTotal > project.weeklyHours;
              const weeklyWarn = project.weeklyHours > 0 && !weeklyOver && weekTotal / project.weeklyHours >= 0.8;
              const budgetPct  = project.budgetHours > 0 ? (projectTotals[project.id] ?? 0) / project.budgetHours : null;
              const budgetOver = budgetPct != null && budgetPct >= 1;
              const budgetWarn = budgetPct != null && !budgetOver && budgetPct >= 0.8;
              const alertColor = (weeklyOver || budgetOver) ? '#E05252' : (weeklyWarn || budgetWarn) ? '#E07B3A' : null;

              const rowActive = editingProject === project.id;
              return (
                <React.Fragment key={project.id}>
                  <ProjectLabel
                    project={project} client={client} alertColor={alertColor}
                    rowActive={rowActive} topBorder={topBorder}
                    projectTotals={projectTotals} weekProjectHours={weekProjectHours}
                  />
                  {days.map((d, i) => {
                    const entry = displayWeekEntries.find(e => e.projectId === project.id && e.date === d.dateStr);
                    return (
                      <div key={i} style={{
                        borderLeft: todayBorderLeft(d), borderBottom: '1px solid var(--tb-border-soft)', borderTop: topBorder,
                        background: rowActive && !d.isToday ? 'var(--tb-row-active, rgba(255,255,255,0.04))' : todayBg(d),
                      }}>
                        <TimeCell
                          hours={entry?.hours ?? 0}
                          billableHours={entry?.billableHours ?? null}
                          billed={entry?.billed ?? false}
                          isBillable={client.billing !== 'none'}
                          isFuture={d.isFuture} isToday={d.isToday}
                          clientColor={client.color}
                          colIndex={i}
                          projectId={project.id}
                          viewMode={viewMode}
                          onSave={payload => saveEntry(project.id, d.dateStr, payload, entry?.slot)}
                          onResetBillable={() => resetBillable(project.id, d.dateStr)}
                          onEditStart={() => startEditingProject(project.id)}
                          onEditEnd={() => setEditingProject(null)} />
                      </div>
                    );
                  })}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderLeft: '1px solid var(--tb-border-mid)', borderBottom: '1px solid var(--tb-border-soft)', borderTop: topBorder,
                    padding: '0 8px',
                    background: rowActive ? 'var(--tb-row-active, rgba(255,255,255,0.04))' : 'transparent',
                    transition: 'background 0.1s', position: 'relative',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: alertColor ?? (rowHasValueInMode ? 'var(--tb-text-primary)' : 'var(--tb-text-faint)') }}>
                      {rowHasValueInMode ? fmtH(weekTotal) : '—'}
                    </span>
                    {rowDivergent && (
                      <DivergenceDot
                        tooltip={viewMode === 'billable'
                          ? `Tracciate: ${fmtH(weekTotalTracked)}`
                          : `Fatturabili: ${fmtH(weekTotalBillable)}`}
                      />
                    )}
                  </div>
                </React.Fragment>
              );
            })
          )}

          {/* Day totals */}
          <div style={{
            padding: '10px 14px', background: 'var(--tb-panel-bg-soft)', borderTop: '2px solid var(--tb-border-mid)',
            fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--tb-text-faint)',
            display: 'flex', alignItems: 'center',
          }}>Totale</div>
          {days.map((d, i) => {
            const dayTotal = viewMode === 'billable' ? d.dayBillable : d.dayHours;
            return (
              <div key={i} style={{
                padding: '10px 4px', textAlign: 'center',
                background: d.isToday ? 'var(--tb-cell-today-header)' : 'var(--tb-panel-bg-soft)',
                borderLeft: `1px solid ${d.isToday ? '#3DB33D55' : 'var(--tb-border)'}`,
                borderTop: '2px solid var(--tb-border-mid)', opacity: d.isWeekend ? 0.7 : 1,
                position: 'relative',
              }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: dayTotal > 0 ? 'var(--tb-text-primary)' : 'var(--tb-text-faint)' }}>
                  {dayTotal > 0 ? fmtH(dayTotal) : '—'}
                </div>
                {d.plannedTotal > 0 && !d.isFuture && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: d.delta >= 0 ? '#3DB33D' : '#E05252' }}>
                    {d.delta >= 0 ? '+' : ''}{fmtH(d.delta)}
                  </div>
                )}
                {d.dayDivergent && (
                  <DivergenceDot
                    tooltip={viewMode === 'billable'
                      ? `Tracciate: ${fmtH(d.dayHours)}`
                      : `Fatturabili: ${fmtH(d.dayBillable)}`}
                  />
                )}
              </div>
            );
          })}
          <div style={{
            background: 'var(--tb-panel-bg-soft)', borderLeft: '1px solid var(--tb-border-mid)', borderTop: '2px solid var(--tb-border-mid)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px',
            position: 'relative',
          }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: (viewMode === 'billable' ? weekBillable : weekActual) > 0 ? 'var(--tb-text-primary)' : 'var(--tb-text-faint)' }}>
              {(viewMode === 'billable' ? weekBillable : weekActual) > 0 ? fmtH(viewMode === 'billable' ? weekBillable : weekActual) : '—'}
            </span>
            {weekDivergent && (
              <DivergenceDot
                tooltip={viewMode === 'billable'
                  ? `Tracciate: ${fmtH(weekActual)}`
                  : `Fatturabili: ${fmtH(weekBillable)}`}
              />
            )}
          </div>
        </div>
      </div>
      {todoistImportDialog && (
        <TodoistImportDialog
          dialog={todoistImportDialog}
          clients={clients}
          projects={projects}
          onClose={() => setTodoistImportDialog(null)}
          onImport={async imports => {
            await window.api.importCompletedTodoistTasks(imports.map(item => ({
                todoistTaskId: item.id,
                projectId: item.projectId,
                date: item.date,
                hours: item.hours,
                titleSnapshot: item.content || item.title || null,
                importedAt: new Date().toISOString(),
                slot: item.slot,
              })));
            const sunday = addDays(monday, 6);
            const [entries, totals] = await Promise.all([
              window.api.getEntries(fmt(monday), fmt(sunday)),
              window.api.getProjectTotals(),
            ]);
            setWeekEntries(entries);
            setProjectTotals(totals);
            onEntryChange?.();
            setTodoistImportDialog(null);
          }}
        />
      )}
    </div>
  );
}

function ProjectLabel({ project, client, alertColor, rowActive, topBorder, projectTotals, weekProjectHours }) {
  const [tooltipPos, setTooltipPos] = useState(null);
  const labelRef = useRef();
  const weekH = weekProjectHours[project.id] ?? 0;
  const totalH = projectTotals[project.id] ?? 0;

  function handleMouseEnter() {
    const rect = labelRef.current?.getBoundingClientRect();
    if (rect) setTooltipPos({ x: rect.right + 8, y: rect.top + rect.height / 2 });
  }

  return (
    <div
      ref={labelRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setTooltipPos(null)}
      style={{
        padding: '0 14px', display: 'flex', alignItems: 'center', gap: 7,
        borderRight: '1px solid var(--tb-border-soft)', borderBottom: '1px solid var(--tb-border-soft)',
        borderTop: topBorder, minHeight: 44,
        background: rowActive ? 'var(--tb-row-active, rgba(255,255,255,0.04))' : 'transparent',
        transition: 'background 0.1s',
      }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: client.color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tb-text-primary)', lineHeight: 1.2,
          maxWidth: 155, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {project.name}
        </div>
        <div style={{ fontSize: 9, color: 'var(--tb-text-faint)', fontWeight: 600 }}>{client.name}</div>
      </div>
      {alertColor && (
        <div style={{
          width: 0, height: 0, flexShrink: 0,
          borderLeft: '5px solid transparent',
          borderRight: '5px solid transparent',
          borderBottom: `9px solid ${alertColor}`,
        }} />
      )}
      {tooltipPos && (
        <div style={{
          position: 'fixed',
          left: tooltipPos.x,
          top: tooltipPos.y,
          transform: 'translateY(-50%)',
          background: 'var(--tb-panel-bg)',
          border: '1px solid var(--tb-border-mid)',
          borderRadius: 6, padding: '8px 10px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
          zIndex: 9999, minWidth: 160, maxWidth: 280,
          pointerEvents: 'none',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tb-text-primary)', wordBreak: 'break-word', lineHeight: 1.3 }}>
            {project.name}
          </span>
          {project.description && (
            <span style={{ fontSize: 10, color: 'var(--tb-text-muted)', lineHeight: 1.4, wordBreak: 'break-word' }}>
              {project.description}
            </span>
          )}
          {(project.budgetHours > 0 || project.weeklyHours > 0) && (
            <div style={{ borderTop: '1px solid var(--tb-border-soft)', paddingTop: 4, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {project.budgetHours > 0 && (
                <div style={{ fontSize: 9, color: 'var(--tb-text-faint)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>Budget totale</span>
                  <span style={{ fontWeight: 700, color: totalH >= project.budgetHours ? '#E05252' : totalH / project.budgetHours >= 0.8 ? '#E07B3A' : 'var(--tb-text-secondary)' }}>
                    {fmtH(totalH)} / {fmtH(project.budgetHours)}
                  </span>
                </div>
              )}
              {project.weeklyHours > 0 && (
                <div style={{ fontSize: 9, color: 'var(--tb-text-faint)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>Limite sett.</span>
                  <span style={{ fontWeight: 700, color: weekH >= project.weeklyHours ? '#E05252' : weekH / project.weeklyHours >= 0.8 ? '#E07B3A' : 'var(--tb-text-secondary)' }}>
                    {fmtH(weekH)} / {fmtH(project.weeklyHours)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GridLabel({ children, border, header, timeLabel, compact }) {
  return (
    <div style={{
      padding: compact && !header ? '6px 12px' : '8px 14px',
      background: header ? 'var(--tb-panel-bg-soft)' : undefined,
      borderBottom: header ? '1px solid var(--tb-border)' : border ? '1px solid var(--tb-border-soft)' : '1px solid var(--tb-border)',
      display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3,
    }}>
      <span style={{ fontSize: compact && !header ? 8 : 9, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--tb-text-faint)', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {children}
      </span>
      {timeLabel && (
        <span style={{ fontSize: compact ? 7 : 8, fontWeight: 600, color: 'var(--tb-text-faint)', opacity: 0.7, letterSpacing: '0.04em', textTransform: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {timeLabel}
        </span>
      )}
    </div>
  );
}

function NavBtn({ children, onClick, small }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? 'var(--tb-navbtn-hover)' : 'var(--tb-navbtn-bg)',
        border: '1px solid var(--tb-navbtn-border)', borderRadius: 6,
        padding: small ? '4px 10px' : '4px 12px', cursor: 'pointer',
        fontSize: small ? 11 : 15, color: 'var(--tb-navbtn-text)',
        fontFamily: "'Open Sans', sans-serif", fontWeight: small ? 600 : 400,
        lineHeight: 1.5, transition: 'background 0.1s',
      }}>
      {children}
    </button>
  );
}

function TemplateDivergenceBadge({ summary }) {
  if (!summary.divergentSlots) return null;
  const deltaLabel = `${summary.deltaHours >= 0 ? '+' : ''}${fmtH(summary.deltaHours)}`;
  const title = [
    `Differenza dal template ricorrente: ${deltaLabel}`,
    `${summary.divergentSlots}/${summary.totalSlots} slot modificati`,
    ...summary.details,
  ].join('\n');

  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        minHeight: 22,
        padding: '3px 8px',
        borderRadius: 5,
        border: '1px solid #E07B3A55',
        background: '#E07B3A12',
        color: '#E07B3A',
        fontSize: 10,
        fontWeight: 800,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#E07B3A' }} />
      <span>Δ template {deltaLabel} · {summary.divergentSlots}/{summary.totalSlots}</span>
    </span>
  );
}

function ViewModeToggle({ value, onChange }) {
  const opts = [
    { key: 'tracked',  label: 'Ore tracciate',   color: '#3DB33D' },
    { key: 'billable', label: 'Ore fatturabili', color: '#3DB33D' },
  ];
  return (
    <div style={{
      display: 'inline-flex',
      border: '1px solid var(--tb-border)', borderRadius: 5,
      overflow: 'hidden', background: 'var(--tb-panel-bg)',
    }}>
      {opts.map((o, idx) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            title="Alterna tra Ore tracciate e Ore fatturabili · ⌘⇧V"
            style={{
              fontSize: 10, fontWeight: 700, padding: '3px 10px',
              background: active ? o.color : 'transparent',
              color: active ? '#fff' : 'var(--tb-text-muted)',
              border: 'none',
              borderLeft: idx > 0 ? '1px solid var(--tb-border)' : 'none',
              cursor: 'pointer', fontFamily: "'Open Sans', sans-serif",
              transition: 'background 0.15s, color 0.15s',
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ProjectVisibilityToggle({ value, onChange }) {
  const opts = [
    { key: 'worked', label: 'Progetti lavorati', color: '#3DB33D' },
    { key: 'all', label: 'Tutti i progetti', color: '#3DB33D' },
  ];
  return (
    <div style={{
        display: 'inline-flex',
        border: '1px solid var(--tb-border)', borderRadius: 5,
        overflow: 'hidden', background: 'var(--tb-panel-bg)',
      }}>
      {opts.map((o, idx) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            title="Alterna tra Progetti lavorati e Tutti i progetti · ⌘⇧H"
            style={{
              fontSize: 10, fontWeight: 700, padding: '3px 10px',
              background: active ? o.color : 'transparent',
              color: active ? '#fff' : 'var(--tb-text-muted)',
              border: 'none',
              borderLeft: idx > 0 ? '1px solid var(--tb-border)' : 'none',
              cursor: 'pointer', fontFamily: "'Open Sans', sans-serif",
              transition: 'background 0.15s, color 0.15s',
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function PlanningModeToggle({ value, onChange }) {
  const opts = [
    { key: 'full', label: 'Completa', color: '#3DB33D' },
    { key: 'compact', label: 'Compatta', color: '#3DB33D' },
    { key: 'hidden', label: 'Nascosta', color: '#3DB33D' },
  ];
  return (
    <div style={{
      display: 'inline-flex',
      border: '1px solid var(--tb-border)', borderRadius: 5,
      overflow: 'hidden', background: 'var(--tb-panel-bg)',
    }}>
      {opts.map((o, idx) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            title="Seleziona pianificazione Completa, Compatta o Nascosta · ⌘⇧P"
            style={{
              fontSize: 10, fontWeight: 700, padding: '3px 10px',
              background: active ? o.color : 'transparent',
              color: active ? '#fff' : 'var(--tb-text-muted)',
              border: 'none',
              borderLeft: idx > 0 ? '1px solid var(--tb-border)' : 'none',
              cursor: 'pointer', fontFamily: "'Open Sans', sans-serif",
              transition: 'background 0.15s, color 0.15s',
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Pill({ label, value, color, dim }) {
  return (
    <div style={{ textAlign: 'center', opacity: dim ? 0.4 : 1, transition: 'opacity 0.15s' }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'var(--tb-text-faint)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function TodoistImportButton({ days, projects, onOpen }) {
  const [busy, setBusy] = useState(false);

  async function openImport() {
    setBusy(true);
    try {
      const debug = localStorage.getItem('timebox-todoist-debug') === 'true';
      const dates = days.map(day => day.dateStr);
      const result = await window.api.getCompletedTodoistTasks(projects, dates, debug);
      if (result.error === 'no_token') {
        alert('Token Todoist non configurato. Vai in Impostazioni → Todoist per inserirlo.');
        return;
      }
      if (result.error) {
        alert(`Errore recupero completati Todoist${result.status ? ` (${result.status})` : ''}.`);
        return;
      }
      if (!result.tasks?.length) {
        alert('Nessun nuovo task Todoist completato da importare in questa settimana.');
        return;
      }
      onOpen({
        tasks: result.tasks.map(task => ({
          ...task,
          draft: task.hours ? toHHMM(task.hours) : '',
        })),
      });
    } catch (err) {
      alert(`Errore recupero completati Todoist: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={openImport}
      disabled={busy}
      title="Importa nel timesheet i task Todoist completati e non ancora importati"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 5,
        background: 'var(--tb-panel-bg)', border: '1px solid var(--tb-border)', color: 'var(--tb-text-secondary)',
        cursor: busy ? 'wait' : 'pointer', fontFamily: "'Open Sans', sans-serif",
        opacity: busy ? 0.6 : 1,
      }}
    >
      <span aria-hidden="true">↓</span>
      <span>{busy ? 'Caricamento…' : 'Importa completati'}</span>
    </button>
  );
}

function TodoistImportTimeInput({ value, onChange, focused, onNavigate }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!focused) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focused]);

  function normalize() {
    const hours = parseHHMM(value);
    onChange(hours > 0 ? toHHMM(hours) : '');
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const current = parseHHMM(value);
      const next = Math.max(0, current + (event.key === 'ArrowUp' ? 0.25 : -0.25));
      onChange(next > 0 ? toHHMM(next) : '');
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      normalize();
      onNavigate(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === 'Enter' && !event.metaKey) {
      event.preventDefault();
      normalize();
    }
  }

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={event => onChange(event.target.value)}
      onBlur={normalize}
      onKeyDown={handleKeyDown}
      placeholder="hh:mm"
      aria-label="Tempo da importare"
      style={{
        width: 58, height: 28, flexShrink: 0,
        borderRadius: 4, border: '1px solid var(--tb-border-mid)',
        background: 'var(--tb-input-bg)', color: 'var(--tb-text-primary)',
        fontFamily: "'Open Sans', sans-serif", fontSize: 11, fontWeight: 700,
        textAlign: 'center', outline: 'none', padding: '0 5px',
      }}
    />
  );
}

function TodoistImportDialog({ dialog, clients, projects, onClose, onImport }) {
  const [tasks, setTasks] = useState(dialog.tasks);
  const [busy, setBusy] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);

  const importable = tasks
    .map(task => ({ ...task, importHours: parseHHMM(task.draft) }))
    .filter(task => task.importHours > 0);
  const totalHours = importable.reduce((sum, task) => sum + task.importHours, 0);

  function updateDraft(taskId, draft) {
    setTasks(current => current.map(task => task.id === taskId ? { ...task, draft } : task));
  }

  async function confirmImport() {
    if (busy || importable.length === 0) return;
    setBusy(true);
    try {
      await onImport(importable.map(task => ({
        ...task,
        date: task.completedDate,
        hours: task.importHours,
      })));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.metaKey && event.key === 'Enter') {
        event.preventDefault();
        confirmImport();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });

  const groups = [];
  for (const task of tasks) {
    const key = `${task.completedDate}::${task.projectId}`;
    let group = groups.find(item => item.key === key);
    if (!group) {
      const project = projects.find(item => item.id === task.projectId);
      const client = project ? clients.find(item => item.id === project.clientId) : null;
      group = { key, date: task.completedDate, project, client, tasks: [] };
      groups.push(group);
    }
    group.tasks.push(task);
  }

  let inputIndex = 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Importa task Todoist completati"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.58)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{
        width: 'min(620px, 100%)', maxHeight: 'min(720px, calc(100vh - 48px))',
        background: 'var(--tb-panel-bg)', border: '1px solid var(--tb-border-mid)',
        borderRadius: 8, boxShadow: '0 18px 55px rgba(0,0,0,0.42)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid var(--tb-border)',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--tb-text-primary)' }}>Importa completati Todoist</div>
            <div style={{ marginTop: 2, fontSize: 10, color: 'var(--tb-text-muted)' }}>
              Le righe senza tempo resteranno disponibili al prossimo import.
            </div>
          </div>
          <button
            onClick={onClose}
            title="Chiudi"
            aria-label="Chiudi"
            style={{
              width: 28, height: 28, borderRadius: 4,
              border: '1px solid var(--tb-border)', background: 'transparent',
              color: 'var(--tb-text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1,
            }}
          >×</button>
        </div>

        <div style={{ overflowY: 'auto', padding: '10px 16px 14px' }}>
          {groups.map(group => (
            <section key={group.key} style={{ padding: '10px 0', borderBottom: '1px solid var(--tb-border-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--tb-text-faint)' }}>
                  {new Date(`${group.date}T00:00:00`).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
                <span style={{ fontSize: 11, fontWeight: 800, color: group.client?.color ?? 'var(--tb-text-primary)' }}>
                  {group.project?.name ?? 'Progetto non disponibile'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.tasks.map(task => {
                  const currentIndex = inputIndex++;
                  return (
                    <div key={task.id} style={{
                      minHeight: 32, display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <TodoistImportTimeInput
                        value={task.draft}
                        onChange={draft => updateDraft(task.id, draft)}
                        focused={focusIndex === currentIndex}
                        onNavigate={direction => setFocusIndex(
                          (currentIndex + direction + tasks.length) % tasks.length
                        )}
                      />
                      <span style={{
                        minWidth: 0, fontSize: 11, fontWeight: 650,
                        color: 'var(--tb-text-primary)', lineHeight: 1.35,
                        overflowWrap: 'anywhere',
                      }}>
                        {task.content || task.title || '(senza titolo)'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '12px 16px', borderTop: '1px solid var(--tb-border)',
          background: 'var(--tb-panel-bg-soft)',
        }}>
          <span style={{ fontSize: 10, color: 'var(--tb-text-muted)' }}>
            ↑/↓ 15 min · Tab cambia campo · ⌘↵ importa
          </span>
          <button
            onClick={confirmImport}
            disabled={busy || importable.length === 0}
            style={{
              minWidth: 154, height: 32, borderRadius: 5,
              border: '1px solid #3DB33D', background: importable.length > 0 ? '#3DB33D' : 'transparent',
              color: importable.length > 0 ? '#fff' : 'var(--tb-text-faint)',
              cursor: busy || importable.length === 0 ? 'default' : 'pointer',
              fontFamily: "'Open Sans', sans-serif", fontSize: 11, fontWeight: 800,
              opacity: busy ? 0.65 : 1,
            }}
          >
            {busy ? 'Importazione…' : `Importa ${fmtH(totalHours)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function TodoistSyncButton({ days, todoistSync, setTodoistSync, todoistTasks, setTodoistTasks, projects }) {
  const [busy, setBusy] = useState(false);

  const refreshable = days.filter(d => d.isToday || d.isFuture);
  const lastSync = refreshable.reduce((acc, d) => {
    const t = todoistSync?.[d.dateStr];
    return t && (!acc || t > acc) ? t : acc;
  }, null);
  const lastSyncLabel = lastSync
    ? new Date(lastSync).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    : null;

  async function refresh() {
    setBusy(true);
    try {
      const debug = localStorage.getItem('timebox-todoist-debug') === 'true';
      const result = await window.api.syncTodoist(projects, refreshable.map(d => d.dateStr), debug);
      if (result.error === 'no_token') {
        alert('Token Todoist non configurato. Vai in Impostazioni → Todoist per inserirlo.');
        setBusy(false);
        return;
      }

      const now = new Date().toISOString();
      const { byDate } = result;
      const newTasks = { ...todoistTasks };
      const newSync = { ...todoistSync };
      for (const d of refreshable) {
        const tasks = byDate[d.dateStr] ?? [];
        newTasks[d.dateStr] = tasks;
        newSync[d.dateStr] = now;
        await window.api.setTodoistCache(d.dateStr, tasks, now);
      }
      setTodoistTasks(newTasks);
      setTodoistSync(newSync);
    } catch (err) {
      alert(`Errore sincronizzazione Todoist: ${err.message}`);
    }
    setBusy(false);
  }

  return (
    <button onClick={refresh} disabled={busy}
      title="Aggiorna i task da Todoist per oggi e i giorni futuri"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 5,
        background: 'var(--tb-panel-bg)', border: '1px solid var(--tb-border)', color: 'var(--tb-text-secondary)',
        cursor: busy ? 'wait' : 'pointer', fontFamily: "'Open Sans', sans-serif",
        opacity: busy ? 0.6 : 1, transition: 'opacity 0.15s',
      }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
        style={{ animation: busy ? 'tbspin 0.8s linear infinite' : 'none', flexShrink: 0 }}>
        <path d="M9 5a4 4 0 1 1-1.2-2.8M9 1.5V3.5H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
      <span>Aggiorna da Todoist</span>
      {lastSyncLabel && <span style={{ color: 'var(--tb-text-faint)', fontWeight: 600 }}>· {lastSyncLabel}</span>}
      <style>{`@keyframes tbspin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}

function SlotSummary({ summary, clients, compact }) {
  const items = Object.entries(summary)
    .filter(([_, data]) => (data.planned || 0) > 0 || (data.actual || 0) > 0)
    .sort((a, b) => (b[1].planned || 0) - (a[1].planned || 0) || (b[1].actual || 0) - (a[1].actual || 0));

  if (items.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 12, padding: compact ? '8px 6px' : '10px 6px' }}>
      {items.map(([clientId, data]) => {
        const cl = clients.find(c => c.id === clientId);
        if (!cl) return null;
        const planned = data.planned || 0;
        const actual = data.actual || 0;
        return (
          <div key={clientId} style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <div style={{ fontSize: compact ? 7 : 8, fontWeight: 700, color: cl.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 77 }}>
              {cl.name}
            </div>
            <div style={{ fontSize: compact ? 9 : 10, fontWeight: 800, color: 'var(--tb-text-primary)' }}>
              {data.planned !== undefined ? (
                <>
                  <span style={{ color: actual > planned ? '#E05252' : 'inherit' }}>{toHHMM(actual) || '0:00'}</span>
                  <span style={{ color: 'var(--tb-text-faint)', fontWeight: 400, margin: '0 1px' }}>/</span>
                  <span style={{ color: 'var(--tb-text-muted)', fontWeight: 600 }}>{toHHMM(planned)}</span>
                </>
              ) : (
                <span style={{ color: '#E07B3A' }}>{toHHMM(actual)}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
