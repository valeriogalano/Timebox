import React, { useState, useEffect } from 'react';
import { TODAY, DAY_SHORT, MONTHS_IT, addDays, getMondayOfWeek, fmt, fmtH, toHHMM } from '../utils';
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
  const monday = addDays(getMondayOfWeek(TODAY), weekOffset * 7);
  const weekKey = getWeekKey(monday);

  const [weekEntries, setWeekEntries] = useState([]);
  const [weekOverrides, setWeekOverrides] = useState({});
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  // Load entries and overrides when week changes
  useEffect(() => {
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
      const srcDay   = weekData[fromDay] ?? {};
      const dstDay   = weekData[toDay]   ?? {};
      return { ...prev, [weekKey]: { ...weekData, [fromDay]: { ...srcDay, [fromSlot]: srcBlocks }, [toDay]: { ...dstDay, [toSlot]: dstBlocks } } };
    });
    window.api.saveWeekOverride({ weekKey, dayIndex: fromDay, slot: fromSlot, blocks: srcBlocks });
    window.api.saveWeekOverride({ weekKey, dayIndex: toDay, slot: toSlot, blocks: dstBlocks });
    setDragging(null);
    setDragOver(null);
  }

  function resetWeekToTemplate() {
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
    const isToday = dateStr === fmt(TODAY);
    const isFuture = date > TODAY;
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
    const extraBlocks = Object.entries(extraByClient).map(([clientId, hours]) => ({ clientId, hours }));

    return { date, dateStr, isToday, isFuture, isWeekend, dayHours, plannedTotal, delta, loggedInPlan, bilancioExtra, amBlocks, pmBlocks, extraBlocks, dayEntries };
  });

  const weekPlanned = days.reduce((s, d) => s + d.plannedTotal, 0);
  const weekActual  = days.reduce((s, d) => s + d.dayHours, 0);
  const weekDelta   = weekActual - weekPlanned;
  const endSun = addDays(monday, 6);
  const weekLabel = `${monday.getDate()} ${MONTHS_IT[monday.getMonth()]} – ${endSun.getDate()} ${MONTHS_IT[endSun.getMonth()]} ${endSun.getFullYear()}`;

  const weekDateStrs = days.map(d => d.dateStr);
  const clientsWithProjects = clients.map(c => ({
    ...c, projects: projects.filter(p => p.clientId === c.id && !p.archived),
  })).filter(c => c.projects.length > 0);

  const COL = '200px repeat(7, 1fr) 72px';
  const todayBorderLeft = d => `1px solid ${d.isToday ? '#3DB33D28' : 'var(--tb-border-soft)'}`;
  const todayBg = (d, base) => d.isToday ? 'var(--tb-cell-today)' : (base || 'transparent');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

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
        </div>
        <div style={{ display: 'flex', gap: 28 }}>
          <Pill label="Pianificate" value={fmtH(weekPlanned)} color="var(--tb-text-muted)" />
          <Pill label="Tracciate"   value={fmtH(weekActual)}  color="var(--tb-text-primary)" />
          <Pill label="Delta"       value={(weekDelta >= 0 ? '+' : '') + fmtH(weekDelta)}
            color={weekDelta === 0 ? 'var(--tb-text-secondary)' : weekDelta > 0 ? '#3DB33D' : '#E05252'} />
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
          <div style={{ background: 'var(--tb-panel-bg-soft)', borderBottom: '1px solid var(--tb-border)', borderLeft: '1px solid var(--tb-border-mid)' }} />

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
                  clients={clients} projects={projects}
                  slotEntries={d.dayEntries.filter(e => (e.slot ?? 'am') === 'am')}
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
          <div style={{ borderLeft: '1px solid var(--tb-border-mid)', borderBottom: '1px solid var(--tb-border-soft)' }} />

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
                  clients={clients} projects={projects}
                  slotEntries={d.dayEntries.filter(e => (e.slot ?? 'pm') === 'pm')}
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
          <div style={{ borderLeft: '1px solid var(--tb-border-mid)', borderBottom: '1px solid var(--tb-border-soft)' }} />

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
              <ExtraCell blocks={d.extraBlocks} clients={clients} isToday={d.isToday} />
            </div>
          ))}
          <div style={{ borderLeft: '1px solid var(--tb-border-mid)', borderBottom: '1px solid var(--tb-border-soft)' }} />

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
              return (
                <React.Fragment key={project.id}>
                  <div style={{
                    padding: '0 14px', display: 'flex', alignItems: 'center', gap: 7,
                    borderRight: '1px solid var(--tb-border-soft)', borderBottom: '1px solid var(--tb-border-soft)',
                    borderTop: topBorder, minHeight: 44,
                  }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: client.color, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tb-text-primary)', lineHeight: 1.2,
                        maxWidth: 155, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {project.name}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--tb-text-faint)', fontWeight: 600 }}>{client.name}</div>
                    </div>
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
                    <span style={{ fontSize: 12, fontWeight: 700, color: weekTotal > 0 ? 'var(--tb-text-primary)' : 'var(--tb-text-faint)' }}>
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
