import React, { useState, useEffect, useRef } from 'react';
import { getToday, DAY_SHORT, MONTHS_IT, addDays, getMondayOfWeek, fmt, fmtH, toHHMM, parseHHMM, effBillable, SLOTS } from '../utils';
import PlanningCell from '../components/PlanningCell';
import ExtraCell from '../components/ExtraCell';
import TimeCell from '../components/TimeCell';
import DivergenceDot from '../components/DivergenceDot';
import SlotCapacityBar from '../components/SlotCapacityBar';
import AreaStatusGlyph from '../components/AreaStatusGlyph';
import { getEffectiveBlocks, computeDayPlanning, mergeProjectDayEntries } from '../dayPlanning';

const PLANNING_MODES = ['full', 'compact', 'hidden'];
const SLOT_ROW_META = {
  am: { label: 'Mattina', timeLabel: 'fino alle 13:00' },
  pm: { label: 'Pomeriggio', timeLabel: '13:00 – 18:00' },
  sera: { label: 'Sera', timeLabel: 'dalle 18:00' },
};
export const AREA_STATUS_OPTIONS = [
  { key: 'active', label: 'Attiva', title: 'Area attiva questa settimana' },
  { key: 'minimal', label: 'Minima', title: 'Area da mantenere al minimo questa settimana' },
  { key: 'closed', label: 'Chiusa', title: 'Area chiusa questa settimana' },
];

function getWeekKey(monday) { return fmt(monday); }

function budgetLevel(pct) {
  if (pct == null) return 0;
  if (pct >= 1) return 3;
  if (pct >= 0.8) return 2;
  if (pct > 0) return 1;
  return 0;
}
function BudgetMeter({ level }) {
  if (!level) return null;
  return (
    <span className="tb-meter" data-level={level} title="Alert budget">
      <i /><i /><i />
    </span>
  );
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

export default function WeeklyView({ clients, projects, recurring, weekOffset, setWeekOffset, onEntryChange, externalRefreshTick, autoFocusProject, slotCapacityHours, onAutoFocusConsumed, onNavigateToAndamento }) {
  const monday = addDays(getMondayOfWeek(getToday()), weekOffset * 7);
  const weekKey = getWeekKey(monday);

  const [weekEntries, setWeekEntries] = useState([]);
  const [weekOverrides, setWeekOverrides] = useState({});
  const [weekAreaStatuses, setWeekAreaStatuses] = useState({});
  const [projectTotals, setProjectTotals] = useState({});
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [todoistTasks, setTodoistTasks] = useState({});
  const [todoistSync, setTodoistSync] = useState({});
  const [editingProject, setEditingProject] = useState(null);
  const [revealedProject, setRevealedProject] = useState(null);
  const [hideEmpty, setHideEmpty] = useState(() => localStorage.getItem('timebox-hide-empty-projects') === 'true');
  const [summaryOpen, setSummaryOpen] = useState(() => localStorage.getItem('timebox-week-summary-collapsed') !== 'true');
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
    window.api.getWeekAreaStatuses(weekKey).then(rows => {
      setWeekAreaStatuses(prev => ({
        ...prev,
        [weekKey]: Object.fromEntries(rows.map(row => [row.areaId, row.status])),
      }));
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
  const currentAreaStatuses = weekAreaStatuses[weekKey] ?? {};

  function areaStatus(areaId) {
    return currentAreaStatuses[areaId] ?? 'active';
  }

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
      for (const slot of SLOTS) {
        window.api.deleteWeekOverride(weekKey, d, slot);
      }
    }
  }

  async function saveEntry(projectId, dateStr, payload, slot) {
    const hours = typeof payload === 'object' ? payload.hours : payload;
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
    const matches = weekEntries.filter(e => (
      e.projectId === projectId && e.date === dateStr && e.slot === resolvedSlot
    ));
    const existing = matches[0] ?? null;
    const displayExisting = displayWeekEntries.find(e => e.projectId === projectId && e.date === dateStr);
    const billableHours = typeof payload === 'object' ? (payload.billableHours ?? null) : (existing?.billableHours ?? displayExisting?.billableHours ?? null);
    if (hours === 0) {
      setWeekEntries(prev => prev.filter(e => !(e.projectId === projectId && e.date === dateStr && e.slot === resolvedSlot)));
      if (matches.length > 0) {
        for (const match of matches) await window.api.deleteEntry(match.id);
        window.api.getProjectTotals().then(setProjectTotals);
      }
    } else {
      const entry = existing
        ? { ...existing, hours, billableHours }
        : { id: crypto.randomUUID(), projectId, date: dateStr, hours, billableHours, slot: resolvedSlot, billed: false };
      setWeekEntries(prev => [
        ...prev.filter(e => !(e.projectId === projectId && e.date === dateStr && e.slot === resolvedSlot)),
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

  async function resetBillable(projectId, dateStr, slot) {
    const matches = weekEntries.filter(e => (
      e.projectId === projectId && e.date === dateStr && e.slot === slot
    ));
    const existing = matches[0] ?? displayWeekEntries.find(e => e.projectId === projectId && e.date === dateStr && e.slot === slot);
    if (!existing) return;
    const entry = { ...existing, billableHours: null };
    setWeekEntries(prev => [
      ...prev.filter(e => !(e.projectId === projectId && e.date === dateStr && e.slot === slot)),
      entry,
    ]);
    await window.api.saveEntry(entry);
    for (const match of matches) {
      if (match.id === entry.id) continue;
      await window.api.deleteEntry(match.id);
    }
    onEntryChange?.();
  }

  async function toggleBilled(projectId, dateStr, slot) {
    const project = projects.find(p => p.id === projectId);
    const client = project ? clients.find(c => c.id === project.clientId) : null;
    if (!client || client.billing === 'none') return;
    const matches = weekEntries.filter(e => (
      e.projectId === projectId && e.date === dateStr && e.slot === slot
    ));
    const existing = matches[0] ?? displayWeekEntries.find(e => e.projectId === projectId && e.date === dateStr && e.slot === slot);
    if (!existing) return;
    const updated = { ...existing, billed: !existing.billed };
    setWeekEntries(prev => [
      ...prev.filter(e => !(e.projectId === projectId && e.date === dateStr && e.slot === slot)),
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
    const rawDayEntries = weekEntries.filter(e => e.date === dateStr);
    const dayEntries = displayWeekEntries.filter(e => e.date === dateStr);
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
    const lastSync = todoistSync[dateStr] ?? null;
    const planning = computeDayPlanning({
      dayIndex: i, isToday, isFuture,
      recurring, weekOverrides, weekKey,
      rawDayEntries, dayEntries,
      clients, projects,
      todoistTasks: todoistTasks[dateStr] ?? [],
    });

    return { date, dateStr, isToday, isFuture, isWeekend, isDayOverridden, dayBillable, dayDivergent, dayEntries, lastSync, ...planning };
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
    for (const slot of SLOTS) {
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
  }, { deltaHours: 0, divergentSlots: 0, totalSlots: SLOTS.length * 7, details: [] });

  const weekDateStrs = days.map(d => d.dateStr);
  const clientsWithProjects = clients.map(c => ({
    ...c,
    areaStatus: areaStatus(c.id),
    projects: projects.filter(p => p.clientId === c.id && !p.archived),
  })).filter(c => c.projects.length > 0);

  // Weekly summaries per client (unified AM + PM + Extra)
  const weekTotalSummary = {};

  days.forEach(d => {
    // Planned: blocks across all slots
    SLOTS.flatMap(slot => d.slotBlocks[slot])
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
  const todayBorderLeft = d => `1px solid var(--tb-border-soft)`;
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
          background: 'var(--tb-panel-bg-soft)', border: '1px solid var(--tb-border)',
        }}>
          <span className="tb-hatch" style={{ width: 12, height: 12, borderRadius: 3, flexShrink: 0 }} title="Oltre soglia" />
          <span style={{ fontSize: 12, color: 'var(--tb-text-primary)', flex: 1 }}>
            <strong>Limite settimanale superato:</strong>{' '}
            {weeklyOverProjects.map(p => {
              const h = weekProjectHours[p.id] ?? 0;
              return `${p.name} (${fmtH(h)} / ${fmtH(p.weeklyHours)})`;
            }).join(' · ')}
          </span>
          <button onClick={() => setAlertDismissed(true)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--tb-text-muted)', fontSize: 14, lineHeight: 1, padding: '0 2px',
              fontFamily: "'Open Sans', sans-serif", fontWeight: 700,
            }}>×</button>
        </div>
      )}

      {/* Budget exceeded alert banner */}
      {!alertDismissed && budgetOverProjects.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px', borderRadius: 7,
          background: 'var(--tb-panel-bg-soft)', border: '1px solid var(--tb-border)',
        }}>
          <BudgetMeter level={3} />
          <span style={{ fontSize: 12, color: 'var(--tb-text-primary)', flex: 1 }}>
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
          background: 'var(--tb-panel-bg-soft)', border: '1px solid var(--tb-border)',
        }}>
          <span className="tb-hatch" style={{ width: 12, height: 12, borderRadius: 3, flexShrink: 0 }} title="Oltre soglia" />
          <span style={{ fontSize: 12, color: 'var(--tb-text-primary)', flex: 1 }}>
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
          background: 'var(--tb-panel-bg-soft)', border: '1px solid var(--tb-border)',
        }}>
          <BudgetMeter level={3} />
          <span style={{ fontSize: 12, color: 'var(--tb-text-primary)', flex: 1 }}>
            <strong>Limite totale area superato:</strong>{' '}
            {globalOverClients.map(c => `${c.name} (${fmtH(clientTotals[c.id] ?? 0)} / ${fmtH(c.limitHours)})`).join(' · ')}
          </span>
        </div>
      )}

      {/* Riga 1: nav settimana + divergenze/ripristina  |  specchietto capacità */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
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
                  background: 'var(--tb-navbtn-bg)', border: '1px solid var(--tb-navbtn-border)', color: 'var(--tb-navbtn-text)',
                  cursor: 'pointer', fontFamily: "'Open Sans', sans-serif",
                }}>
                ↩ Ripristina template
              </button>
            </>
          )}
        </div>
        <CapacityMirror
          actual={weekActual} planned={weekPlanned} billable={weekBillable} extra={weekExtra}
          onNavigate={onNavigateToAndamento}
        />
      </div>

      {/* Riga 2: controllo Todoist  |  toggle progetti + ore */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{
          display: 'flex', alignItems: 'stretch', border: '1px solid var(--tb-border)',
          borderRadius: 6, background: 'var(--tb-panel-bg-soft)', overflow: 'hidden',
        }}>
          <span style={{
            display: 'flex', alignItems: 'center', padding: '0 10px',
            fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--tb-text-faint)',
          }}>Todoist</span>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <ProjectVisibilityToggle value={hideEmpty ? 'worked' : 'all'} onChange={(next) => {
            const nextHideEmpty = next === 'worked';
            setHideEmpty(nextHideEmpty);
            localStorage.setItem('timebox-hide-empty-projects', String(nextHideEmpty));
          }} />
          <ViewModeToggle value={viewMode} onChange={changeViewMode} />
        </div>
      </div>

      {/* Riga 3: toggle pianificazione (Completa/Compatta/Nascosta), da sola */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <PlanningModeToggle value={planningMode} onChange={setPlanningModePersisted} />
      </div>

      <WeeklySummaryStrip
        summary={weekTotalSummary} clients={clients}
        open={summaryOpen}
        onToggle={() => {
          const next = !summaryOpen;
          setSummaryOpen(next);
          localStorage.setItem('timebox-week-summary-collapsed', String(!next));
        }}
      />

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
                  borderLeft: `1px solid var(--tb-border-soft)`,
                  padding: planningCompact ? '5px 4px' : '8px 4px', textAlign: 'center', opacity: d.isWeekend ? 0.7 : 1,
                  position: 'relative',
                }}>
                  {d.isToday && <span style={{ position: 'absolute', top: 0, left: 8, right: 8, height: 3, background: 'var(--tb-tab-active-bg)', borderRadius: '0 0 2px 2px' }} />}
                  <div style={{ fontSize: planningCompact ? 9 : 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: 'var(--tb-text-faint)' }}>{DAY_SHORT[i]}</div>
                  <div style={{ fontSize: planningCompact ? 11 : 12, fontWeight: 700, color: d.isToday ? 'var(--tb-text-primary)' : 'var(--tb-text-secondary)', lineHeight: 1.1 }}>
                    {d.date.getDate()}
                  </div>
                  {(d.isToday || d.isDayOverridden) && (
                    <div style={{ display: 'flex', gap: 5, justifyContent: 'center', alignItems: 'center', margin: planningCompact ? '2px 0 0' : '3px 0 0', height: 12 }}>
                      {d.isToday && <span title="Oggi" style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.08em', color: 'var(--tb-text-secondary)', border: '1px solid var(--tb-border-mid)', borderRadius: 4, padding: '0 4px', lineHeight: 1.5 }}>OGGI</span>}
                      {d.isDayOverridden && <span title="Giorno modificato rispetto al template" className="tb-glyph" style={{ fontSize: 11 }}>Δ</span>}
                    </div>
                  )}
                </div>
              ))}
              <div style={{
                background: 'var(--tb-panel-bg-soft)', borderBottom: '1px solid var(--tb-border)', borderLeft: '1px solid var(--tb-border-mid)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--tb-text-faint)',
              }}>Tot</div>

              {/* One row per slot (AM / PM / Sera) */}
              {SLOTS.map((slot, si) => (
                <React.Fragment key={slot}>
                  <GridLabel border compact={planningCompact} timeLabel={SLOT_ROW_META[slot].timeLabel}>{SLOT_ROW_META[slot].label}</GridLabel>
                  {days.map((d, i) => {
                    const isDropTarget = dragOver?.day === i && dragOver?.slot === slot;
                    const plannedTotal = d.slotBlocks[slot].filter(b => clients.some(c => c.id === b.clientId)).reduce((s, b) => s + b.hours, 0);
                    return (
                      <div key={i}
                        onDragOver={e => { e.preventDefault(); setDragOver({ day: i, slot }); }}
                        onDragLeave={() => setDragOver(null)}
                        onDrop={() => handleDrop(i, slot)}
                        style={{
                          borderLeft: todayBorderLeft(d), borderBottom: '1px solid var(--tb-border-soft)',
                          background: isDropTarget ? 'var(--tb-drag-over-bg)' : todayBg(d), padding: planningCompact ? 3 : 4,
                          transition: 'background 0.1s',
                          outline: isDropTarget ? '2px dashed var(--tb-tick)' : 'none', outlineOffset: -2,
                          display: 'flex', flexDirection: 'column', gap: 3,
                        }}>
                        <PlanningCell slot={slot} dayIndex={i} blocks={d.slotBlocks[slot]}
                          compact={planningCompact}
                          clients={clients} projects={projects} projectTotals={projectTotals} weekProjectHours={weekProjectHours}
                          blockFill={d.blockFill}
                          todoistByClient={d.todoistByCS[slot]} todoistTasksByClient={d.todoistTasksByCS[slot]} hasTodoistSync={!!d.lastSync}
                          isToday={d.isToday} isFuture={d.isFuture} isWeekend={false} editable
                          onAddBlock={(cid, h) => addBlockToSlot(i, slot, cid, h)}
                          onUpdateBlock={(bid, h) => updateBlockInSlot(i, slot, bid, h)}
                          onRemoveBlock={bid => removeBlockFromSlot(i, slot, bid)}
                          onReorder={newBlocks => setSlotOverride(i, slot, newBlocks)}
                          onDragStart={(bid, cid, h) => handleDragStart(bid, i, slot, cid, h)}
                          draggingId={dragging?.blockId} />
                        <SlotCapacityBar
                          plannedHours={plannedTotal}
                          loggedHours={d.slotLogged[slot]}
                          capacityHours={slotCapacityHours}
                          compact={planningCompact}
                        />
                      </div>
                    );
                  })}
                  {si === 0 && (
                    <div style={{
                      borderLeft: '1px solid var(--tb-border-mid)', borderBottom: '1px solid var(--tb-border-soft)',
                      background: 'var(--tb-panel-bg-soft)', gridRow: `span ${SLOTS.length + 1}`,
                    }}>
                      <SlotSummary summary={weekTotalSummary} clients={clients} compact={planningCompact} />
                    </div>
                  )}
                </React.Fragment>
              ))}

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
                          <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--tb-text-primary)', border: '1px solid var(--tb-border-mid)', borderRadius: 3, padding: '0 4px' }} title="Ore extra / oltre piano">+{toHHMM(d.bilancioExtra)} extra</span>
                        )}
                        {d.pianificazioneExtra > 0 && (
                          <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--tb-text-muted)', border: '1px dashed var(--tb-border-mid)', borderRadius: 3, padding: '0 4px' }} title="Pianificazione aggiuntiva">+{toHHMM(d.pianificazioneExtra)} pianif.</span>
                        )}
                      </div>
                    ) : d.isFuture && d.plannedTotal > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tb-text-muted)' }}>{toHHMM(d.plannedTotal)}</span>
                        {d.pianificazioneExtra > 0 && (
                          <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--tb-text-muted)', border: '1px dashed var(--tb-border-mid)', borderRadius: 3, padding: '0 4px' }} title="Pianificazione aggiuntiva">+{toHHMM(d.pianificazioneExtra)} pianif.</span>
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
              borderLeft: '1px solid var(--tb-border-soft)',
              borderBottom: '1px solid var(--tb-border)', opacity: d.isWeekend ? 0.7 : 1,
              position: 'relative',
            }}>
              {d.isToday && <span style={{ position: 'absolute', top: 0, left: 8, right: 8, height: 3, background: 'var(--tb-tab-active-bg)', borderRadius: '0 0 2px 2px' }} />}
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--tb-text-faint)' }}>{DAY_SHORT[i]}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: d.isToday ? 'var(--tb-text-primary)' : 'var(--tb-text-secondary)' }}>{d.date.getDate()}</div>
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
              const alertLevel = (weeklyOver || budgetOver) ? 3 : (weeklyWarn || budgetWarn) ? 2 : 0;

              const rowActive = editingProject === project.id;
              return (
                <React.Fragment key={project.id}>
                  <ProjectLabel
                    project={project} client={client} alertLevel={alertLevel}
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
                          onResetBillable={() => resetBillable(project.id, d.dateStr, entry?.slot)}
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
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: rowHasValueInMode ? 'var(--tb-text-primary)' : 'var(--tb-text-faint)' }}>
                      {alertLevel > 0 && <BudgetMeter level={alertLevel} />}
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
                borderLeft: '1px solid var(--tb-border)',
                borderTop: '2px solid var(--tb-border-mid)', opacity: d.isWeekend ? 0.7 : 1,
                position: 'relative',
              }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: dayTotal > 0 ? 'var(--tb-text-primary)' : 'var(--tb-text-faint)' }}>
                  {dayTotal > 0 ? fmtH(dayTotal) : '—'}
                </div>
                {d.plannedTotal > 0 && !d.isFuture && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: 'var(--tb-text-muted)' }}
                    title={d.delta >= 0 ? 'Sopra il piano' : 'Sotto il piano'}>
                    <span className="tb-glyph">{d.delta >= 0 ? '▸' : '▾'}</span>
                    <span>{d.delta >= 0 ? '+' : ''}{fmtH(d.delta)}</span>
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

function ProjectLabel({ project, client, alertLevel, rowActive, topBorder, projectTotals, weekProjectHours }) {
  const [tooltipPos, setTooltipPos] = useState(null);
  const labelRef = useRef();
  const weekH = weekProjectHours[project.id] ?? 0;
  const totalH = projectTotals[project.id] ?? 0;
  const statusInfo = AREA_STATUS_OPTIONS.find(option => option.key === client.areaStatus) ?? AREA_STATUS_OPTIONS[0];

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          <span style={{ fontSize: 9, color: 'var(--tb-text-faint)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</span>
          {client.areaStatus !== 'active' && (
            <span title={statusInfo.title}>
              <AreaStatusGlyph status={client.areaStatus} size={10} color="var(--tb-state-glyph)" />
            </span>
          )}
        </div>
      </div>
      {alertLevel > 0 && <BudgetMeter level={alertLevel} />}
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
                <div style={{ fontSize: 9, color: 'var(--tb-text-faint)', display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span>Budget totale</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, color: 'var(--tb-text-secondary)' }}>
                    <BudgetMeter level={budgetLevel(totalH / project.budgetHours)} />
                    {fmtH(totalH)} / {fmtH(project.budgetHours)}
                  </span>
                </div>
              )}
              {project.weeklyHours > 0 && (
                <div style={{ fontSize: 9, color: 'var(--tb-text-faint)', display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span>Limite sett.</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, color: 'var(--tb-text-secondary)' }}>
                    <BudgetMeter level={budgetLevel(weekH / project.weeklyHours)} />
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

// Sidebar "Stato aree" — righe piatte, nessuna card/bordo per riga (REDLINE §1):
// dot colore-area + nome, poi i 3 glifi A/M/C sempre visibili, quello attivo più
// chiaro/marcato, gli altri appena percepibili. Nessun riempimento dietro il glifo.
export function AreaStatusPanel({ clients, statuses, onChange, compact }) {
  if (!clients.length) return null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: compact ? 'column' : 'row',
      alignItems: compact ? 'stretch' : 'center',
      gap: compact ? 7 : 14,
      flexWrap: compact ? 'nowrap' : 'wrap',
      width: compact ? '100%' : 'auto',
    }}>
      {clients.map(client => {
        const current = statuses[client.id] ?? 'active';
        return (
          <div
            key={client.id}
            title={`Stato settimanale area: ${client.name}`}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
          >
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              minWidth: 0, flex: compact ? 1 : undefined,
              fontSize: 11, fontWeight: 600, color: 'var(--tb-sidebar-text)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: client.color, flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{client.name}</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              {AREA_STATUS_OPTIONS.map(option => {
                const active = current === option.key;
                return (
                  <button
                    key={option.key}
                    onClick={() => onChange(client.id, option.key)}
                    title={option.title}
                    style={{
                      padding: 2, border: 'none', background: 'transparent', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <AreaStatusGlyph status={option.key} size={11}
                      color={active ? 'var(--tb-sidebar-text)' : 'var(--tb-sidebar-faint)'} />
                  </button>
                );
              })}
            </span>
          </div>
        );
      })}
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
        border: '1px solid var(--tb-border-mid)',
        background: 'var(--tb-panel-bg-soft)',
        color: 'var(--tb-text-secondary)',
        fontSize: 10,
        fontWeight: 800,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      <span className="tb-delta">Δ</span>
      <span>template {deltaLabel} · {summary.divergentSlots}/{summary.totalSlots}</span>
    </span>
  );
}

function ViewModeToggle({ value, onChange }) {
  const opts = [
    { key: 'tracked',  label: 'Ore tracciate' },
    { key: 'billable', label: 'Ore fatturabili' },
  ];
  return (
    <div className="tb-seg">
      {opts.map((o, idx) => {
        const active = value === o.key;
        return (
          <span
            key={o.key}
            data-on={active ? 'true' : 'false'}
            onClick={() => onChange(o.key)}
            title="Alterna tra Ore tracciate e Ore fatturabili · ⌘⇧V"
            style={idx > 0 ? { borderLeft: '1px solid var(--tb-border-mid)' } : undefined}
          >
            {o.label}
          </span>
        );
      })}
    </div>
  );
}

function ProjectVisibilityToggle({ value, onChange }) {
  const opts = [
    { key: 'worked', label: 'Progetti lavorati' },
    { key: 'all', label: 'Tutti i progetti' },
  ];
  return (
    <div className="tb-seg">
      {opts.map((o, idx) => {
        const active = value === o.key;
        return (
          <span
            key={o.key}
            data-on={active ? 'true' : 'false'}
            onClick={() => onChange(o.key)}
            title="Alterna tra Progetti lavorati e Tutti i progetti · ⌘⇧H"
            style={idx > 0 ? { borderLeft: '1px solid var(--tb-border-mid)' } : undefined}
          >
            {o.label}
          </span>
        );
      })}
    </div>
  );
}

function PlanningModeToggle({ value, onChange }) {
  const opts = [
    { key: 'full', label: 'Completa' },
    { key: 'compact', label: 'Compatta' },
    { key: 'hidden', label: 'Nascosta' },
  ];
  return (
    <div className="tb-seg">
      {opts.map((o, idx) => {
        const active = value === o.key;
        return (
          <span
            key={o.key}
            data-on={active ? 'true' : 'false'}
            onClick={() => onChange(o.key)}
            title="Seleziona pianificazione Completa, Compatta o Nascosta · ⌘⇧P"
            style={idx > 0 ? { borderLeft: '1px solid var(--tb-border-mid)' } : undefined}
          >
            {o.label}
          </span>
        );
      })}
    </div>
  );
}

// Specchietto capacità — sintesi settimana + link ad Andamento (README: "Lo specchietto
// di Settimana apre Andamento"). Sostituisce le 4 pill separate con un'unica lettura
// tracciato/pianificato + barra + breakdown fatturabili/non-fatt/extra.
function CapacityMirror({ actual, planned, billable, extra, onNavigate }) {
  const pct = planned > 0 ? Math.round((actual / planned) * 100) : 0;
  const nonBillable = Math.max(0, actual - billable);
  return (
    <div style={{
      width: 380, flexShrink: 0, background: 'var(--tb-panel-bg)', border: '1px solid var(--tb-border)',
      borderRadius: 9, padding: '14px 18px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <span>
          <span style={{ fontSize: 30, fontWeight: 800, color: 'var(--tb-text-primary)', letterSpacing: '-0.02em' }}>{fmtH(actual)}</span>{' '}
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tb-text-muted)' }}>tracciate / {fmtH(planned)}</span>
        </span>
        {onNavigate ? (
          <button onClick={onNavigate} title="Apri Andamento" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1,
            background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0 0',
            fontFamily: "'Open Sans', sans-serif", flexShrink: 0,
          }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--tb-text-primary)' }}>{pct}%</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tb-text-secondary)' }}>Andamento →</span>
          </button>
        ) : (
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--tb-text-primary)', paddingTop: 2 }}>{pct}%</span>
        )}
      </div>
      <div style={{ position: 'relative', height: 5, borderRadius: 3, background: 'var(--tb-bar-track)', marginTop: 10, overflow: 'visible' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, pct)}%`, background: 'var(--tb-bar-tracked)', borderRadius: 3 }} />
        {pct > 100 && <span className="tb-hatch" style={{ position: 'absolute', top: 0, bottom: 0, left: '100%', width: `${Math.min(30, pct - 100)}%`, borderRadius: '0 3px 3px 0' }} />}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10, fontWeight: 700, color: 'var(--tb-text-faint)' }}>
        <span>Fatturabili {fmtH(billable)}</span>
        <span>Non-fatt. {fmtH(nonBillable)}</span>
        {extra > 0 && <span>Extra {fmtH(extra)}</span>}
      </div>
    </div>
  );
}

// Riepilogo settimana / area — strip collassabile sopra la griglia (mock #2a).
// Colore = solo identità area; sopra/sotto piano si legge dalla barra, non da hue diverso.
function WeeklySummaryStrip({ summary, clients, open, onToggle }) {
  const items = clients
    .map(c => ({ client: c, data: summary[c.id] }))
    .filter(({ data }) => data && ((data.planned || 0) > 0 || (data.actual || 0) > 0));

  if (items.length === 0) return null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: open ? 8 : 0 }}>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--tb-text-faint)' }}>
          Riepilogo settimana / area
        </span>
        <button onClick={onToggle} style={{
          background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
          fontSize: 10, fontWeight: 700, color: 'var(--tb-text-muted)', fontFamily: "'Open Sans', sans-serif",
        }}>
          {open ? 'nascondi ▾' : 'mostra ▸'}
        </button>
      </div>
      {open && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {items.map(({ client, data }) => {
            const planned = data.planned || 0;
            const actual = data.actual || 0;
            const pct = planned > 0 ? Math.min(1, actual / planned) : (actual > 0 ? 1 : 0);
            const over = planned > 0 && actual > planned;
            return (
              <div key={client.id} style={{
                flex: '1 1 140px', minWidth: 140,
                background: 'var(--tb-panel-bg)', border: '1px solid var(--tb-panel-border)',
                borderLeft: `3px solid ${client.color}`, borderRadius: 6, padding: '8px 10px',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: client.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {client.name}
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tb-text-primary)', marginTop: 2 }}>
                  {toHHMM(actual)}
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--tb-text-faint)' }}> / {toHHMM(planned)}</span>
                </div>
                <div style={{ position: 'relative', height: 3, borderRadius: 2, background: 'var(--tb-bar-track)', marginTop: 5, overflow: 'visible' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct * 100}%`, background: client.color, borderRadius: 2 }} />
                  {over && <span className="tb-hatch" style={{ position: 'absolute', top: 0, bottom: 0, left: '100%', width: '18%', borderRadius: '0 2px 2px 0' }} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
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
        fontSize: 10, fontWeight: 700, padding: '0 10px', height: 28,
        background: 'transparent', border: 'none', borderLeft: '1px solid var(--tb-border)',
        color: 'var(--tb-text-secondary)',
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
              border: '1px solid var(--tb-navbtn-border)', background: importable.length > 0 ? 'var(--tb-tab-active-bg)' : 'transparent',
              color: importable.length > 0 ? 'var(--tb-tab-active-text)' : 'var(--tb-text-faint)',
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
        fontSize: 10, fontWeight: 700, padding: '0 10px', height: 28,
        background: 'transparent', border: 'none', borderLeft: '1px solid var(--tb-border)',
        color: 'var(--tb-text-secondary)',
        cursor: busy ? 'wait' : 'pointer', fontFamily: "'Open Sans', sans-serif",
        opacity: busy ? 0.6 : 1, transition: 'opacity 0.15s',
      }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
        style={{ animation: busy ? 'tbspin 0.8s linear infinite' : 'none', flexShrink: 0 }}>
        <path d="M9 5a4 4 0 1 1-1.2-2.8M9 1.5V3.5H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
      <span>Aggiorna</span>
      {lastSyncLabel && <span style={{ color: 'var(--tb-text-faint)', fontWeight: 600 }}>{lastSyncLabel}</span>}
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
                  <span style={{ color: actual > planned ? 'var(--tb-text-primary)' : 'inherit' }} title={actual > planned ? 'Sopra il piano' : undefined}>{toHHMM(actual) || '0:00'}</span>
                  {actual > planned && <span className="tb-hatch" style={{ width: 8, height: 8, borderRadius: 2, display: 'inline-block', verticalAlign: 'middle', marginLeft: 2 }} title="Oltre piano" />}
                  <span style={{ color: 'var(--tb-text-faint)', fontWeight: 400, margin: '0 1px' }}>/</span>
                  <span style={{ color: 'var(--tb-text-muted)', fontWeight: 600 }}>{toHHMM(planned)}</span>
                </>
              ) : (
                <span style={{ color: 'var(--tb-text-primary)' }}>{toHHMM(actual)}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
