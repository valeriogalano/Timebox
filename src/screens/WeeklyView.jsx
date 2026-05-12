import React, { useState, useEffect } from 'react';
import { getToday, DAY_SHORT, MONTHS_IT, addDays, getMondayOfWeek, fmt, fmtH, toHHMM } from '../utils';
import PlanningCell from '../components/PlanningCell';
import ExtraCell from '../components/ExtraCell';
import TimeCell from '../components/TimeCell';

function getWeekKey(monday) { return fmt(monday); }

function getEffectiveBlocks(recurring, weekOverrides, weekKey, dayIndex, slot) {
  const dayOverride = weekOverrides[weekKey]?.[dayIndex];
  if (dayOverride && dayOverride[slot] !== undefined) return dayOverride[slot];
  return recurring
    .filter(r => r.day === dayIndex && r.slot === slot)
    .map(r => ({ id: r.id, clientId: r.clientId, hours: r.hours }));
}

export default function WeeklyView({ clients, projects, recurring, weekOffset, setWeekOffset, onEntryChange }) {
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

  useEffect(() => {
    function onGlobalTab(e) {
      if (e.key !== 'Tab') return;
      if (document.activeElement?.closest('[data-timecell]')) return;
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

  // Reset dismiss state when week changes
  useEffect(() => { setAlertDismissed(false); }, [weekKey]);

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
      setWeekOverrides(prev => {
        const weekData = { ...(prev[weekKey] ?? {}) };
        const dayData  = { ...(weekData[dayIndex] ?? {}) };
        delete dayData[slot];
        weekData[dayIndex] = dayData;
        return { ...prev, [weekKey]: weekData };
      });
      window.api.deleteWeekOverride(weekKey, dayIndex, slot);
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

  async function saveEntry(projectId, dateStr, hours, slot) {
    const existing = weekEntries.find(e => e.projectId === projectId && e.date === dateStr);
    if (hours === 0) {
      setWeekEntries(prev => prev.filter(e => !(e.projectId === projectId && e.date === dateStr)));
      if (existing) await window.api.deleteEntry(existing.id);
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
        ? { ...existing, hours }
        : { id: crypto.randomUUID(), projectId, date: dateStr, hours, slot: resolvedSlot, billed: false };
      setWeekEntries(prev =>
        existing
          ? prev.map(e => e.projectId === projectId && e.date === dateStr ? entry : e)
          : [...prev, entry]
      );
      await window.api.saveEntry(entry);
      window.api.getProjectTotals().then(setProjectTotals);
    }
    onEntryChange?.();
  }

  function toggleBilled(projectId, dateStr) {
    setWeekEntries(prev => prev.map(e => {
      if (e.projectId !== projectId || e.date !== dateStr) return e;
      const updated = { ...e, billed: !e.billed };
      window.api.saveEntry(updated);
      return updated;
    }));
  }

  const hasOverride = !!weekOverrides[weekKey] && Object.keys(weekOverrides[weekKey]).length > 0;

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const dateStr = fmt(date);
    const isToday = dateStr === fmt(getToday());
    const isFuture = date > getToday();
    const isWeekend = i >= 5;
    const dayEntries = weekEntries.filter(e => e.date === dateStr);
    const dayHours = dayEntries.reduce((s, e) => s + e.hours, 0);
    const amBlocks = effectiveBlocks(i, 'am');
    const pmBlocks = effectiveBlocks(i, 'pm');
    const plannedTotal = [...amBlocks, ...pmBlocks].reduce((s, b) => s + b.hours, 0);
    const delta = dayHours - plannedTotal;

    const clientPlanned = {};
    for (const b of [...amBlocks, ...pmBlocks]) {
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
    for (const block of [...amBlocks, ...pmBlocks]) {
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
    amBlocks.forEach(b => { amPlanned[b.clientId] = (amPlanned[b.clientId] ?? 0) + b.hours; });
    const pmPlanned = {};
    pmBlocks.forEach(b => { pmPlanned[b.clientId] = (pmPlanned[b.clientId] ?? 0) + b.hours; });
    const orphanTodoist = [];
    Object.entries(todoistByCS.am).forEach(([cid, h]) => {
      const remaining = h - (amPlanned[cid] ?? 0);
      if (remaining > 0) orphanTodoist.push({ clientId: cid, hours: remaining, slot: 'am', tasks: todoistTasksByCS.am[cid] ?? [] });
    });
    Object.entries(todoistByCS.pm).forEach(([cid, h]) => {
      const remaining = h - (pmPlanned[cid] ?? 0);
      if (remaining > 0) orphanTodoist.push({ clientId: cid, hours: remaining, slot: 'pm', tasks: todoistTasksByCS.pm[cid] ?? [] });
    });

    return { date, dateStr, isToday, isFuture, isWeekend, dayHours, plannedTotal, delta, loggedInPlan, bilancioExtra, amBlocks, pmBlocks, extraBlocks, dayEntries, blockFill, todoistByCS, todoistTasksByCS, lastSync, orphanTodoist };
  });

  const weekPlanned = days.reduce((s, d) => s + d.plannedTotal, 0);
  const weekActual  = days.reduce((s, d) => s + d.dayHours, 0);
  const weekDelta   = weekActual - weekPlanned;
  const weekExtra   = days.reduce((s, d) => s + Math.max(0, d.bilancioExtra), 0);
  const endSun = addDays(monday, 6);
  const weekLabel = `${monday.getDate()} ${MONTHS_IT[monday.getMonth()]} – ${endSun.getDate()} ${MONTHS_IT[endSun.getMonth()]} ${endSun.getFullYear()}`;

  const weekDateStrs = days.map(d => d.dateStr);
  const clientsWithProjects = clients.map(c => ({
    ...c, projects: projects.filter(p => p.clientId === c.id && !p.archived),
  })).filter(c => c.projects.length > 0);

  // Weekly summaries per client (unified AM + PM + Extra)
  const weekTotalSummary = {};

  days.forEach(d => {
    // Planned: AM + PM blocks
    [...d.amBlocks, ...d.pmBlocks].forEach(b => {
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

  const COL = '200px repeat(7, 1fr) 85px';
  const todayBorderLeft = d => `1px solid ${d.isToday ? '#3DB33D28' : 'var(--tb-border-soft)'}`;
  const todayBg = (d, base) => d.isToday ? 'var(--tb-cell-today)' : (base || 'transparent');

  // Weekly hours per project (for alert dot + banner)
  const weekProjectHours = weekEntries.reduce((acc, e) => {
    acc[e.projectId] = (acc[e.projectId] ?? 0) + e.hours;
    return acc;
  }, {});

  // Projects exceeding weekly limit this week
  const weeklyOverProjects = projects.filter(p =>
    p.weeklyHours > 0 && (weekProjectHours[p.id] ?? 0) > p.weeklyHours
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Weekly project limit alert banner */}
      {!alertDismissed && weeklyOverProjects.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px', borderRadius: 7,
          background: '#E0525210', border: '1px solid #E0525240',
        }}>
          <span style={{ fontSize: 12, color: '#E05252', flex: 1 }}>
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

      {/* Week nav + summary */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <NavBtn onClick={() => setWeekOffset(o => o - 1)}>‹</NavBtn>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tb-text-primary)', minWidth: 210, textAlign: 'center' }}>{weekLabel}</span>
          <NavBtn onClick={() => setWeekOffset(o => o + 1)}>›</NavBtn>
          {weekOffset !== 0 && <NavBtn small onClick={() => setWeekOffset(0)}>Oggi</NavBtn>}
          {hasOverride && (
            <button onClick={resetWeekToTemplate}
              style={{
                fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 5,
                background: 'var(--tb-reset-btn-bg)', border: '1px solid #E07B3A55', color: '#E07B3A',
                cursor: 'pointer', fontFamily: "'Open Sans', sans-serif",
              }}>
              ↩ Ripristina template
            </button>
          )}
          <TodoistSyncButton
            days={days}
            todoistSync={todoistSync} setTodoistSync={setTodoistSync}
            todoistTasks={todoistTasks} setTodoistTasks={setTodoistTasks}
            projects={projects} />
        </div>
        <div style={{ display: 'flex', gap: 28 }}>
          <Pill label="Pianificate" value={fmtH(weekPlanned)} color="var(--tb-text-muted)" />
          <Pill label="Tracciate"   value={fmtH(weekActual)}  color="var(--tb-text-primary)" />
          <Pill label="Delta"       value={(weekDelta >= 0 ? '+' : '') + fmtH(weekDelta)}
            color={weekDelta === 0 ? 'var(--tb-text-secondary)' : weekDelta > 0 ? '#3DB33D' : '#E05252'} />
          {weekExtra > 0 && (
            <Pill label="Extra" value={fmtH(weekExtra)} color="#E07B3A" />
          )}
        </div>
      </div>

      {/* Unified grid */}
      <div style={{ background: 'var(--tb-panel-bg)', borderRadius: 8, border: '1px solid var(--tb-border)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COL }}>

          {/* Day header */}
          <GridLabel>Pianificato</GridLabel>
          {days.map((d, i) => (
            <div key={i} style={{
              background: d.isToday ? 'var(--tb-cell-today-header)' : 'var(--tb-panel-bg-soft)',
              borderBottom: '1px solid var(--tb-border)',
              borderLeft: `1px solid ${d.isToday ? '#3DB33D55' : 'var(--tb-border-soft)'}`,
              padding: '8px 4px', textAlign: 'center', opacity: d.isWeekend ? 0.7 : 1,
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: d.isToday ? '#3DB33D' : 'var(--tb-text-faint)' }}>{DAY_SHORT[i]}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: d.isToday ? '#3DB33D' : 'var(--tb-text-secondary)', lineHeight: 1.1 }}>
                {d.date.getDate()}
              </div>
              {d.isToday && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#3DB33D', margin: '3px auto 0' }} />}
            </div>
          ))}
          <div style={{
            background: 'var(--tb-panel-bg-soft)', borderBottom: '1px solid var(--tb-border)', borderLeft: '1px solid var(--tb-border-mid)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--tb-text-faint)',
          }}>Tot</div>

          {/* AM row */}
          <GridLabel border>Mattina</GridLabel>
          {days.map((d, i) => {
            const isDropTarget = dragOver?.day === i && dragOver?.slot === 'am';
            return (
              <div key={i}
                onDragOver={e => { e.preventDefault(); setDragOver({ day: i, slot: 'am' }); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => handleDrop(i, 'am')}
                style={{
                  borderLeft: todayBorderLeft(d), borderBottom: '1px solid var(--tb-border-soft)',
                  background: isDropTarget ? 'var(--tb-drag-over-bg)' : todayBg(d), padding: 4,
                  transition: 'background 0.1s',
                  outline: isDropTarget ? '2px dashed #4A8FE8' : 'none', outlineOffset: -2,
                  display: 'flex',
                }}>
                <PlanningCell slot="am" dayIndex={i} blocks={d.amBlocks}
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
              </div>
            );
          })}
          <div style={{
            borderLeft: '1px solid var(--tb-border-mid)', borderBottom: '1px solid var(--tb-border-soft)',
            background: 'var(--tb-panel-bg-soft)', gridRow: 'span 3',
          }}>
            <SlotSummary summary={weekTotalSummary} clients={clients} />
          </div>

          {/* PM row */}
          <GridLabel border>Pomeriggio</GridLabel>
          {days.map((d, i) => {
            const isDropTarget = dragOver?.day === i && dragOver?.slot === 'pm';
            return (
              <div key={i}
                onDragOver={e => { e.preventDefault(); setDragOver({ day: i, slot: 'pm' }); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => handleDrop(i, 'pm')}
                style={{
                  borderLeft: todayBorderLeft(d), borderBottom: '1px solid var(--tb-border-soft)',
                  background: isDropTarget ? 'var(--tb-drag-over-bg)' : todayBg(d), padding: 4,
                  transition: 'background 0.1s',
                  outline: isDropTarget ? '2px dashed #4A8FE8' : 'none', outlineOffset: -2,
                  display: 'flex',
                }}>
                <PlanningCell slot="pm" dayIndex={i} blocks={d.pmBlocks}
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
              </div>
            );
          })}

          {/* Extra row */}
          <div style={{
            padding: '8px 14px', borderBottom: '1px solid var(--tb-border-soft)', display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--tb-text-faint)', textTransform: 'uppercase',
          }}>
            <span>Extra</span>
            <span style={{ fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 3,
              background: 'var(--tb-panel-bg-subtle)', color: 'var(--tb-text-faint)', letterSpacing: '0.06em' }}>non pian.</span>
          </div>
          {days.map((d, i) => (
            <div key={i} style={{ borderLeft: todayBorderLeft(d), borderBottom: '1px solid var(--tb-border-soft)', background: todayBg(d), padding: 4 }}>
              <ExtraCell blocks={d.extraBlocks} orphanTodoist={d.isWeekend ? [] : d.orphanTodoist} clients={clients} isToday={d.isToday} isFuture={d.isFuture} />
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
                  </div>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--tb-text-faint)' }}>—</span>
                )}
              </div>
            );
          })}
          <div style={{ borderLeft: '1px solid var(--tb-border-mid)', borderBottom: '2px solid var(--tb-border-mid)' }} />

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
          {clientsWithProjects.map(client =>
            client.projects.map((project, pi) => {
              const weekTotal = days.reduce((s, d) => {
                const e = weekEntries.find(e2 => e2.projectId === project.id && e2.date === d.dateStr);
                return s + (e?.hours ?? 0);
              }, 0);
              const topBorder = pi === 0 ? '2px solid var(--tb-border)' : 'none';

              const weeklyOver = project.weeklyHours > 0 && weekTotal > project.weeklyHours;
              const weeklyWarn = project.weeklyHours > 0 && !weeklyOver && weekTotal / project.weeklyHours >= 0.8;
              const budgetPct  = project.budgetHours > 0 ? (projectTotals[project.id] ?? 0) / project.budgetHours : null;
              const budgetOver = budgetPct != null && budgetPct >= 1;
              const budgetWarn = budgetPct != null && !budgetOver && budgetPct >= 0.8;
              const alertColor = (weeklyOver || budgetOver) ? '#E05252' : (weeklyWarn || budgetWarn) ? '#E07B3A' : null;

              return (
                <React.Fragment key={project.id}>
                  <div style={{
                    padding: '0 14px', display: 'flex', alignItems: 'center', gap: 7,
                    borderRight: '1px solid var(--tb-border-soft)', borderBottom: '1px solid var(--tb-border-soft)',
                    borderTop: topBorder, minHeight: 44,
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
                  </div>
                  {days.map((d, i) => {
                    const entry = weekEntries.find(e => e.projectId === project.id && e.date === d.dateStr);
                    return (
                      <div key={i} style={{
                        borderLeft: todayBorderLeft(d), borderBottom: '1px solid var(--tb-border-soft)', borderTop: topBorder,
                        background: todayBg(d),
                      }}>
                        <TimeCell
                          hours={entry?.hours ?? 0} billed={entry?.billed ?? false}
                          isFuture={d.isFuture} isToday={d.isToday}
                          clientColor={client.color}
                          colIndex={i}
                          onSave={h => saveEntry(project.id, d.dateStr, h, entry?.slot)}
                          onToggleBilled={() => toggleBilled(project.id, d.dateStr)} />
                      </div>
                    );
                  })}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderLeft: '1px solid var(--tb-border-mid)', borderBottom: '1px solid var(--tb-border-soft)', borderTop: topBorder,
                    padding: '0 8px',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: alertColor ?? (weekTotal > 0 ? 'var(--tb-text-primary)' : 'var(--tb-text-faint)') }}>
                      {weekTotal > 0 ? fmtH(weekTotal) : '—'}
                    </span>
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
          {days.map((d, i) => (
            <div key={i} style={{
              padding: '10px 4px', textAlign: 'center',
              background: d.isToday ? 'var(--tb-cell-today-header)' : 'var(--tb-panel-bg-soft)',
              borderLeft: `1px solid ${d.isToday ? '#3DB33D55' : 'var(--tb-border)'}`,
              borderTop: '2px solid var(--tb-border-mid)', opacity: d.isWeekend ? 0.7 : 1,
            }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: d.dayHours > 0 ? 'var(--tb-text-primary)' : 'var(--tb-text-faint)' }}>
                {d.dayHours > 0 ? fmtH(d.dayHours) : '—'}
              </div>
              {d.plannedTotal > 0 && !d.isFuture && (
                <div style={{ fontSize: 10, fontWeight: 700, color: d.delta >= 0 ? '#3DB33D' : '#E05252' }}>
                  {d.delta >= 0 ? '+' : ''}{fmtH(d.delta)}
                </div>
              )}
            </div>
          ))}
          <div style={{
            background: 'var(--tb-panel-bg-soft)', borderLeft: '1px solid var(--tb-border-mid)', borderTop: '2px solid var(--tb-border-mid)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px',
          }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: weekActual > 0 ? 'var(--tb-text-primary)' : 'var(--tb-text-faint)' }}>
              {weekActual > 0 ? fmtH(weekActual) : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function GridLabel({ children, border, header }) {
  return (
    <div style={{
      padding: '8px 14px',
      background: header ? 'var(--tb-panel-bg-soft)' : undefined,
      borderBottom: header ? '1px solid var(--tb-border)' : border ? '1px solid var(--tb-border-soft)' : '1px solid var(--tb-border)',
      display: 'flex', alignItems: 'center',
      fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--tb-text-faint)', textTransform: 'uppercase',
    }}>
      {children}
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

function Pill({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'var(--tb-text-faint)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color }}>{value}</div>
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

function SlotSummary({ summary, clients }) {
  const items = Object.entries(summary)
    .filter(([_, data]) => (data.planned || 0) > 0 || (data.actual || 0) > 0)
    .sort((a, b) => (b[1].planned || 0) - (a[1].planned || 0) || (b[1].actual || 0) - (a[1].actual || 0));

  if (items.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '10px 6px' }}>
      {items.map(([clientId, data]) => {
        const cl = clients.find(c => c.id === clientId);
        if (!cl) return null;
        const planned = data.planned || 0;
        const actual = data.actual || 0;
        return (
          <div key={clientId} style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: cl.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 77 }}>
              {cl.name}
            </div>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--tb-text-primary)' }}>
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
