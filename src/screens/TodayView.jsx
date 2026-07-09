import React, { useEffect, useState } from 'react';
import { fmt, fmtH, getToday, getMondayOfWeek } from '../utils';
import { computeDayPlanning, mergeProjectDayEntries, getEffectiveBlocks } from '../dayPlanning';
import PlanningCell from '../components/PlanningCell';
import SlotCapacityBar from '../components/SlotCapacityBar';
import ExtraCell from '../components/ExtraCell';

function formatSyncDate(value) {
  if (!value) return 'Mai sincronizzato';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function mismatchTotal(counts = {}) {
  return (counts.tasksWithoutTimeboxProject || 0)
    + (counts.tasksOutsidePlannedArea || 0)
    + (counts.tasksOverBlockCapacity || 0)
    + (counts.blocksWithoutReadyTasks || 0)
    + (counts.estimatedBeyondResidualCapacity || 0);
}

export default function TodayView({ externalRefreshTick, projects, onSynced, clients = [], recurring = [], slotCapacityHours, onEntryChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const today = fmt(getToday());
  const weekKey = fmt(getMondayOfWeek(getToday()));
  const dayIndex = (getToday().getDay() + 6) % 7; // Monday = 0, matching recurring.day

  // Single-day planning data (blocks, tracked hours, Todoist coverage, extra)
  const [rawEntries, setRawEntries] = useState([]);
  const [weekOverrides, setWeekOverrides] = useState({});
  const [todoistTasks, setTodoistTasks] = useState([]);
  const [syncedAt, setSyncedAt] = useState(null);
  const [projectTotals, setProjectTotals] = useState({});
  const [dragging, setDragging] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [insights, entries, overrides, todoistRows, totals] = await Promise.all([
        window.api.getDayInsights(today),
        window.api.getEntries(today, today),
        window.api.getWeekOverrides(weekKey),
        window.api.getTodoistCache([today]),
        window.api.getProjectTotals(),
      ]);
      setData(insights);
      setRawEntries(entries);
      const map = {};
      overrides.forEach(r => {
        if (!map[r.dayIndex]) map[r.dayIndex] = {};
        map[r.dayIndex][r.slot] = r.blocks;
      });
      setWeekOverrides({ [weekKey]: map });
      const todayRow = todoistRows.find(r => r.dateStr === today);
      setTodoistTasks(todayRow?.tasks ?? []);
      setSyncedAt(todayRow?.syncedAt ?? null);
      setProjectTotals(totals);
    } catch (err) {
      setError(err.message || 'Errore caricamento');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [today, externalRefreshTick]); // eslint-disable-line react-hooks/exhaustive-deps

  async function syncFromTodoist() {
    setSyncing(true);
    try {
      const debug = localStorage.getItem('timebox-todoist-debug') === 'true';
      const result = await window.api.syncTodoist(projects, [today], debug);
      if (result.error === 'no_token') {
        alert('Token Todoist non configurato. Vai in Impostazioni → Todoist per inserirlo.');
        return;
      }
      const now = new Date().toISOString();
      const tasks = result.byDate[today] ?? [];
      await window.api.setTodoistCache(today, tasks, now);
      await load();
      onSynced?.();
    } catch (err) {
      alert(`Errore sincronizzazione Todoist: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }

  // --- Today's block overrides (same mechanism as WeeklyView, one day) ---
  function effectiveBlocks(slot) {
    return getEffectiveBlocks(recurring, weekOverrides, weekKey, dayIndex, slot);
  }

  function setSlotOverride(slot, newBlocks) {
    setWeekOverrides(prev => {
      const weekData = prev[weekKey] ?? {};
      const dayData = weekData[dayIndex] ?? {};
      return { ...prev, [weekKey]: { ...weekData, [dayIndex]: { ...dayData, [slot]: newBlocks } } };
    });
    window.api.saveWeekOverride({ weekKey, dayIndex, slot, blocks: newBlocks });
    window.api.getDayInsights(today).then(setData);
    onEntryChange?.();
  }

  function addBlockToSlot(slot, clientId, hours) {
    setSlotOverride(slot, [...effectiveBlocks(slot), { id: `ov-${crypto.randomUUID()}`, clientId, hours }]);
  }
  function updateBlockInSlot(slot, blockId, hours) {
    setSlotOverride(slot, effectiveBlocks(slot).map(b => b.id === blockId ? { ...b, hours } : b));
  }
  function removeBlockFromSlot(slot, blockId) {
    setSlotOverride(slot, effectiveBlocks(slot).filter(b => b.id !== blockId));
  }
  function handleDrop(toSlot) {
    if (!dragging) return;
    const { blockId, fromSlot, clientId, hours } = dragging;
    if (fromSlot === toSlot) { setDragging(null); return; }
    const src = effectiveBlocks(fromSlot).filter(b => b.id !== blockId);
    const dst = [...effectiveBlocks(toSlot), { id: blockId, clientId, hours }];
    setWeekOverrides(prev => {
      const weekData = prev[weekKey] ?? {};
      const day = weekData[dayIndex] ?? {};
      return { ...prev, [weekKey]: { ...weekData, [dayIndex]: { ...day, [fromSlot]: src, [toSlot]: dst } } };
    });
    window.api.saveWeekOverride({ weekKey, dayIndex, slot: fromSlot, blocks: src });
    window.api.saveWeekOverride({ weekKey, dayIndex, slot: toSlot, blocks: dst });
    window.api.getDayInsights(today).then(setData);
    onEntryChange?.();
    setDragging(null);
  }

  const dayEntries = mergeProjectDayEntries(rawEntries);
  const planning = computeDayPlanning({
    dayIndex, isToday: true, isFuture: false,
    recurring, weekOverrides, weekKey,
    rawDayEntries: rawEntries, dayEntries,
    clients, projects,
    todoistTasks,
  });
  const validClientIds = new Set(clients.map(c => c.id));
  const amTotal = planning.amBlocks.filter(b => validClientIds.has(b.clientId)).reduce((s, b) => s + b.hours, 0);
  const pmTotal = planning.pmBlocks.filter(b => validClientIds.has(b.clientId)).reduce((s, b) => s + b.hours, 0);

  const totals = data?.freeCapacity?.totals ?? {};
  const readyGroups = data?.readyBlocks?.groups ?? [];
  const counts = data?.mismatches?.counts ?? {};
  const mismatches = data?.mismatches?.mismatches ?? {};
  const totalMismatches = mismatchTotal(counts);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 850, color: 'var(--tb-text-primary)', lineHeight: 1.1 }}>Oggi</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tb-text-muted)', marginTop: 4 }}>
            {new Date(`${today}T00:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
            {data?.syncedAt ? ` · Todoist ${formatSyncDate(data.syncedAt)}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <TodoistSyncButton onClick={syncFromTodoist} busy={syncing} />
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 12px', border: '1px solid #E0525240', background: '#E0525210', color: '#E05252', borderRadius: 7, fontSize: 12, fontWeight: 700 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <DayPlanningPanel
          loading={loading}
          clients={clients} projects={projects} projectTotals={projectTotals}
          planning={planning} amTotal={amTotal} pmTotal={pmTotal}
          slotCapacityHours={slotCapacityHours} hasTodoistSync={!!syncedAt}
          addBlockToSlot={addBlockToSlot} updateBlockInSlot={updateBlockInSlot}
          removeBlockFromSlot={removeBlockFromSlot} setSlotOverride={setSlotOverride}
          dragging={dragging} setDragging={setDragging} handleDrop={handleDrop}
        />

        <div style={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <MetricCard
              label="Capacità libera"
              value={loading ? '...' : fmtH(totals.freeUnallocatedHours || 0)}
              sub={`${fmtH(totals.availableAfterTrackedAndTasks || 0)} dopo tracciate + Todoist`}
              tone={(totals.freeUnallocatedHours || 0) > 0 ? 'green' : 'muted'}
            />
            <MetricCard
              label="Blocchi senza azione"
              value={loading ? '...' : String(readyGroups.length)}
              sub={`${fmtH(totals.reservedWithoutTasksHours || 0)} ancora riservate`}
              tone={readyGroups.length ? 'orange' : 'green'}
            />
            <MetricCard
              label="Mismatch"
              value={loading ? '...' : String(totalMismatches)}
              sub={`${fmtH(totals.estimatedHours || 0)} stimate in Todoist`}
              tone={totalMismatches ? 'orange' : 'green'}
            />
          </div>

          <Panel title="Blocchi senza prossima azione" empty={!loading && readyGroups.length === 0 ? 'Coperti' : null}>
            {loading ? <SkeletonRows /> : readyGroups.slice(0, 8).map((group, index) => (
              <InsightRow
                key={`${group.slot}-${group.areaId}-${index}`}
                title={`${group.area} · ${group.slot.toUpperCase()}`}
                value={fmtH(group.missingHours)}
                meta={`${fmtH(group.estimatedHours)} Todoist su ${fmtH(group.availableHours)} disponibili`}
                color="#E07B3A"
              />
            ))}
          </Panel>

          <Panel title="Mismatch dopo sync" empty={!loading && totalMismatches === 0 ? 'Pulito' : null}>
            {loading ? <SkeletonRows /> : (
              <>
                <MismatchGroup label="Non mappati" count={counts.tasksWithoutTimeboxProject} items={mismatches.tasksWithoutTimeboxProject} itemLabel={item => item.title} />
                <MismatchGroup label="Fuori pianificazione" count={counts.tasksOutsidePlannedArea} items={mismatches.tasksOutsidePlannedArea} itemLabel={item => `${item.title} · ${item.area}`} />
                <MismatchGroup label="Oltre blocco" count={counts.tasksOverBlockCapacity} items={mismatches.tasksOverBlockCapacity} itemLabel={item => `${item.title} · +${fmtH(item.overflowHours)}`} />
                <MismatchGroup label="Capacità oltre residuo" count={counts.estimatedBeyondResidualCapacity} items={mismatches.estimatedBeyondResidualCapacity ? [mismatches.estimatedBeyondResidualCapacity] : []} itemLabel={item => `+${fmtH(item.overflowHours)} oltre residuo`} />
              </>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function TodoistSyncButton({ onClick, busy }) {
  return (
    <button onClick={onClick} disabled={busy}
      title="Aggiorna i task da Todoist per oggi"
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
      <style>{`@keyframes tbspin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}

function DayPlanningPanel({
  loading, clients, projects, projectTotals, planning, amTotal, pmTotal,
  slotCapacityHours, hasTodoistSync,
  addBlockToSlot, updateBlockInSlot, removeBlockFromSlot, setSlotOverride,
  dragging, setDragging, handleDrop,
}) {
  const slots = [
    { key: 'am', label: 'Mattina', timeLabel: 'fino alle 13:00', blocks: planning.amBlocks, planned: amTotal, logged: planning.amLogged },
    { key: 'pm', label: 'Pomeriggio', timeLabel: null, blocks: planning.pmBlocks, planned: pmTotal, logged: planning.pmLogged },
  ];

  return (
    <section style={{ width: 300, flexShrink: 0, border: '1px solid var(--tb-border)', borderRadius: 8, background: 'var(--tb-panel-bg)', overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--tb-border)', background: 'var(--tb-panel-bg-soft)' }}>
        <h2 style={{ fontSize: 12, fontWeight: 850, color: 'var(--tb-text-primary)' }}>Blocchi di oggi</h2>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tb-text-faint)' }}>trascina tra Mattina e Pomeriggio · override solo per oggi</span>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {slots.map(slot => {
          const isDropTarget = dragging && dragging.fromSlot !== slot.key;
          return (
            <div key={slot.key}
              onDragOver={e => { if (dragging) e.preventDefault(); }}
              onDrop={() => handleDrop(slot.key)}
              style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 850, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--tb-text-faint)' }}>{slot.label}</span>
                {slot.timeLabel && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--tb-text-faint)', opacity: 0.7 }}>{slot.timeLabel}</span>}
              </div>
              <div style={{ outline: isDropTarget ? '2px dashed #4A8FE8' : 'none', outlineOffset: 2, borderRadius: 8 }}>
                {loading ? (
                  <div style={{ height: 120, borderRadius: 6, background: 'var(--tb-panel-bg-subtle)', opacity: 0.7 }} />
                ) : (
                  <PlanningCell
                    slot={slot.key} dayIndex={0} blocks={slot.blocks}
                    clients={clients} projects={projects} projectTotals={projectTotals} weekProjectHours={{}}
                    blockFill={planning.blockFill}
                    todoistByClient={planning.todoistByCS[slot.key]} todoistTasksByClient={planning.todoistTasksByCS[slot.key]}
                    hasTodoistSync={hasTodoistSync}
                    isToday isFuture={false} isWeekend={false} editable
                    onAddBlock={(cid, h) => addBlockToSlot(slot.key, cid, h)}
                    onUpdateBlock={(bid, h) => updateBlockInSlot(slot.key, bid, h)}
                    onRemoveBlock={bid => removeBlockFromSlot(slot.key, bid)}
                    onReorder={newBlocks => setSlotOverride(slot.key, newBlocks)}
                    onDragStart={(bid, cid, h) => setDragging({ blockId: bid, fromSlot: slot.key, clientId: cid, hours: h })}
                    draggingId={dragging?.blockId} />
                )}
              </div>
              <SlotCapacityBar plannedHours={slot.planned} loggedHours={slot.logged} capacityHours={slotCapacityHours} />
            </div>
          );
        })}
      </div>
      {!loading && (planning.extraBlocks.length > 0 || planning.orphanTodoist.length > 0) && (
        <div style={{ padding: '0 12px 12px' }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--tb-text-faint)', textTransform: 'uppercase', marginBottom: 5 }}>Extra / fuori piano</div>
          <ExtraCell blocks={planning.extraBlocks} orphanTodoist={planning.orphanTodoist} clients={clients} isToday isFuture={false} />
        </div>
      )}
    </section>
  );
}

function MetricCard({ label, value, sub, tone }) {
  const color = tone === 'orange' ? '#E07B3A' : tone === 'green' ? '#3DB33D' : 'var(--tb-text-muted)';
  return (
    <div style={{ border: '1px solid var(--tb-border)', borderRadius: 8, background: 'var(--tb-panel-bg)', padding: '14px 16px', minHeight: 104 }}>
      <div style={{ fontSize: 9, fontWeight: 850, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--tb-text-faint)' }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 850, color, lineHeight: 1.1, marginTop: 8 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tb-text-muted)', marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function Panel({ title, empty, children }) {
  return (
    <section style={{ border: '1px solid var(--tb-border)', borderRadius: 8, background: 'var(--tb-panel-bg)', overflow: 'hidden', minHeight: 260 }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--tb-border)', background: 'var(--tb-panel-bg-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 12, fontWeight: 850, color: 'var(--tb-text-primary)' }}>{title}</h2>
        {empty && <span style={{ fontSize: 10, fontWeight: 800, color: '#3DB33D' }}>{empty}</span>}
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </section>
  );
}

function InsightRow({ title, value, meta, color }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'center', padding: '8px 9px', borderRadius: 6, background: 'var(--tb-panel-bg-subtle)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--tb-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        <div style={{ fontSize: 10, fontWeight: 650, color: 'var(--tb-text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 850, color }}>{value}</div>
    </div>
  );
}

function MismatchGroup({ label, count = 0, items = [], itemLabel }) {
  if (!count) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ fontSize: 10, fontWeight: 850, color: 'var(--tb-text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label} · {count}
      </div>
      {items.slice(0, 4).map((item, index) => (
        <InsightRow
          key={`${label}-${index}`}
          title={itemLabel(item)}
          value={item.slot?.toUpperCase?.() || ''}
          meta={item.project || item.todoistProject || ''}
          color="#E07B3A"
        />
      ))}
    </div>
  );
}

function SkeletonRows() {
  return Array.from({ length: 3 }, (_, index) => (
    <div key={index} style={{ height: 47, borderRadius: 6, background: 'var(--tb-panel-bg-subtle)', opacity: 0.7 }} />
  ));
}
