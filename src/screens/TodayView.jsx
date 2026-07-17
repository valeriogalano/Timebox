import React, { useEffect, useState } from 'react';
import { fmt, fmtH, getToday, getMondayOfWeek, SLOTS, currentSlot, effBillable } from '../utils';
import { computeDayPlanning, mergeProjectDayEntries, getEffectiveBlocks, resolveEntrySlot } from '../dayPlanning';
import PlanningCell from '../components/PlanningCell';
import TimeCell from '../components/TimeCell';
import SlotCapacityBar from '../components/SlotCapacityBar';
import ExtraCell from '../components/ExtraCell';
import { TodoistControlBar, TodoistSyncButton, TodoistImportButton, TodoistImportDialog } from '../components/TodoistControls';

function formatSyncDate(value) {
  if (!value) return 'Mai sincronizzato';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// "Mismatch" = lavoro fuori posto o in eccesso rispetto al piano.
// Capacità libera senza task pronti (blocksWithoutReadyTasks) non è un mismatch:
// è slack, ha già la sua card/pannello dedicati ("Blocchi senza azione").
function mismatchTotal(counts = {}) {
  return (counts.tasksWithoutTimeboxProject || 0)
    + (counts.tasksOutsidePlannedArea || 0)
    + (counts.tasksOverBlockCapacity || 0)
    + (counts.estimatedBeyondResidualCapacity || 0);
}

export default function TodayView({ externalRefreshTick, projects, onSynced, clients = [], recurring = [], slotCapacityHours, onEntryChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
  const [todoistImportDialog, setTodoistImportDialog] = useState(null);
  const [weekAreaStatuses, setWeekAreaStatuses] = useState({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [insights, entries, overrides, todoistRows, totals, areaStatusRows] = await Promise.all([
        window.api.getDayInsights(today),
        window.api.getEntries(today, today),
        window.api.getWeekOverrides(weekKey),
        window.api.getTodoistCache([today]),
        window.api.getProjectTotals(),
        window.api.getWeekAreaStatuses(weekKey),
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
      setWeekAreaStatuses(Object.fromEntries(areaStatusRows.map(row => [row.areaId, row.status])));
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

  // Timesheet del giorno (tab "Ore"): una entry per progetto+giorno, come il
  // timesheet settimanale. Lo slot è dedotto — quello dell'entry esistente, o
  // la prima fascia (am→pm→sera) in cui l'area ha un blocco oggi, o lo slot
  // dell'ora corrente. Le entry sparse su più slot vengono collassate in una.
  async function saveDayEntry(projectId, payload) {
    const hours = typeof payload === 'object' ? payload.hours : payload;
    const existingList = rawEntries.filter(e => e.projectId === projectId);
    const existing = existingList[0] ?? null;
    const project = projects.find(p => p.id === projectId);
    const resolvedSlot = resolveEntrySlot({
      existingSlot: existing?.slot,
      clientId: project?.clientId,
      blocksForSlot: effectiveBlocks,
      fallback: currentSlot(),
    });
    const billableHours = typeof payload === 'object'
      ? (payload.billableHours ?? null)
      : (existing?.billableHours ?? null);
    if (hours <= 0) {
      for (const e of existingList) await window.api.deleteEntry(e.id);
    } else {
      const entry = existing
        ? { ...existing, slot: resolvedSlot, hours, billableHours }
        : { id: crypto.randomUUID(), projectId, date: today, hours, billableHours, slot: resolvedSlot, billed: false };
      await window.api.saveEntry(entry);
      for (const e of existingList) { if (e.id !== entry.id) await window.api.deleteEntry(e.id); }
    }
    await load();
    window.api.getProjectTotals().then(setProjectTotals);
    onEntryChange?.();
  }

  function resetDayBillable(projectId) {
    const existing = rawEntries.find(e => e.projectId === projectId);
    if (existing) saveDayEntry(projectId, { hours: existing.hours, billableHours: null });
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

  // Stato area (attiva/mantenimento/chiusa) contestuale alla settimana corrente
  // — qui sempre univoco perché "Oggi" ricade sempre in una sola settimana,
  // a differenza di Andamento/Rendiconto dove il periodo può attraversarne più di una.
  const clientsWithStatus = clients.map(c => ({ ...c, areaStatus: weekAreaStatuses[c.id] ?? 'active' }));

  const dayEntries = mergeProjectDayEntries(rawEntries);
  const planning = computeDayPlanning({
    dayIndex, isToday: true, isFuture: false,
    recurring, weekOverrides, weekKey,
    rawDayEntries: rawEntries, dayEntries,
    clients, projects,
    todoistTasks,
  });
  const validClientIds = new Set(clients.map(c => c.id));
  const slotPlannedTotals = Object.fromEntries(SLOTS.map(slot => [
    slot,
    (planning.slotBlocks[slot] || []).filter(b => validClientIds.has(b.clientId)).reduce((s, b) => s + b.hours, 0),
  ]));

  const totals = data?.freeCapacity?.totals ?? {};
  const readyGroups = data?.readyBlocks?.groups ?? [];
  const counts = data?.mismatches?.counts ?? {};
  const mismatches = data?.mismatches?.mismatches ?? {};
  const totalMismatches = mismatchTotal(counts);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tb-text-muted)' }}>
            {new Date(`${today}T00:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
            {data?.syncedAt ? ` · Todoist ${formatSyncDate(data.syncedAt)}` : ''}
          </div>
        </div>
        <TodoistControlBar>
          <TodoistSyncButton
            onRefresh={syncFromTodoist}
            lastSyncLabel={syncedAt ? new Date(syncedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : null}
            title="Aggiorna i task da Todoist per oggi"
          />
          <TodoistImportButton dates={[today]} projects={projects} onOpen={setTodoistImportDialog} />
        </TodoistControlBar>
      </div>

      {error && (
        <div style={{ padding: '10px 12px', border: '1px solid var(--tb-border)', background: 'var(--tb-panel-bg-soft)', color: 'var(--tb-text-primary)', borderRadius: 7, fontSize: 12, fontWeight: 700 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <DayPlanningPanel
          loading={loading}
          clients={clientsWithStatus} projects={projects} projectTotals={projectTotals}
          planning={planning} slotPlannedTotals={slotPlannedTotals}
          slotCapacityHours={slotCapacityHours} hasTodoistSync={!!syncedAt}
          addBlockToSlot={addBlockToSlot} updateBlockInSlot={updateBlockInSlot}
          removeBlockFromSlot={removeBlockFromSlot} setSlotOverride={setSlotOverride}
          dragging={dragging} setDragging={setDragging} handleDrop={handleDrop}
          dayEntries={dayEntries} onSaveDayEntry={saveDayEntry} onResetBillable={resetDayBillable}
        />

        <div style={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!loading && (
            <TodayGauge
              planned={SLOTS.reduce((s, slot) => s + (slotPlannedTotals[slot] || 0), 0)}
              traced={rawEntries.reduce((s, e) => s + e.hours, 0)}
              capacity={slotCapacityHours * SLOTS.length}
            />
          )}
          <FreeCapacityCard loading={loading} totals={totals} capacity={slotCapacityHours * SLOTS.length} />

          <Panel
            title="Blocchi pianificati senza azioni"
            empty={!loading && readyGroups.length === 0 ? 'Coperti' : null}
            meta={!loading ? fmtH(totals.reservedWithoutTasksHours || 0) : null}
          >
            {loading ? <SkeletonRows /> : readyGroups.slice(0, 8).map((group, index) => (
              <InsightRow
                key={`${group.slot}-${group.areaId}-${index}`}
                title={`${group.area} · ${group.slot.toUpperCase()}`}
                value={fmtH(group.missingHours)}
                meta={`${fmtH(group.estimatedHours)} Todoist su ${fmtH(group.availableHours)} disponibili`}
                color="var(--tb-text-primary)"
              />
            ))}
          </Panel>

          <Panel
            title="Mismatch dopo sync"
            empty={!loading && totalMismatches === 0 ? 'Pulito' : null}
            meta={!loading ? `${totalMismatches} · ${fmtH(totals.estimatedHours || 0)} stimate` : null}
          >
            {loading ? <SkeletonRows /> : (
              <>
                <MismatchSection label="Fuori posto" sub="task non collocati correttamente">
                  <MismatchGroup label="Non mappati" count={counts.tasksWithoutTimeboxProject} items={mismatches.tasksWithoutTimeboxProject} itemLabel={item => item.title} />
                  <MismatchGroup label="Fuori pianificazione" count={counts.tasksOutsidePlannedArea} items={mismatches.tasksOutsidePlannedArea} itemLabel={item => `${item.title} · ${item.area}`} />
                </MismatchSection>
                <MismatchSection label="In più" sub="più lavoro stimato di quanto pianificato">
                  <MismatchGroup label="Oltre blocco" count={counts.tasksOverBlockCapacity} items={mismatches.tasksOverBlockCapacity} itemLabel={item => `${item.title} · +${fmtH(item.overflowHours)}`} />
                  <MismatchGroup label="Capacità oltre residuo" count={counts.estimatedBeyondResidualCapacity} items={mismatches.estimatedBeyondResidualCapacity ? [mismatches.estimatedBeyondResidualCapacity] : []} itemLabel={item => `+${fmtH(item.overflowHours)} oltre residuo`} />
                </MismatchSection>
              </>
            )}
          </Panel>
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
            await load();
            window.api.getProjectTotals().then(setProjectTotals);
            onEntryChange?.();
            setTodoistImportDialog(null);
          }}
        />
      )}
    </div>
  );
}

const SLOT_META = {
  am: { label: 'Mattina', timeLabel: 'fino alle 13:00' },
  pm: { label: 'Pomeriggio', timeLabel: '13:00 – 18:00' },
  sera: { label: 'Sera', timeLabel: 'dalle 18:00' },
};

function DayPlanningPanel({
  loading, clients, projects, projectTotals, planning, slotPlannedTotals,
  slotCapacityHours, hasTodoistSync,
  addBlockToSlot, updateBlockInSlot, removeBlockFromSlot, setSlotOverride,
  dragging, setDragging, handleDrop,
  dayEntries, onSaveDayEntry, onResetBillable,
}) {
  const [tab, setTab] = useState('piano');
  const slots = SLOTS.map(key => ({
    key,
    label: SLOT_META[key].label,
    timeLabel: SLOT_META[key].timeLabel,
    blocks: planning.slotBlocks[key],
    planned: slotPlannedTotals[key],
    logged: planning.slotLogged[key],
  }));

  return (
    <section style={{ width: 300, flexShrink: 0, border: '1px solid var(--tb-border)', borderRadius: 8, background: 'var(--tb-panel-bg)', overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--tb-border)', background: 'var(--tb-panel-bg-soft)' }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          <TabBtn active={tab === 'piano'} onClick={() => setTab('piano')}>Piano</TabBtn>
          <TabBtn active={tab === 'ore'} onClick={() => setTab('ore')}>Ore</TabBtn>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tb-text-faint)' }}>
          {tab === 'piano'
            ? 'trascina tra Mattina, Pomeriggio e Sera · override solo per oggi'
            : 'registra le ore di oggi · una riga per progetto tracciato'}
        </span>
      </div>
      {tab === 'piano' ? (
        <>
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
                  <div style={{ outline: isDropTarget ? '2px dashed var(--tb-tick)' : 'none', outlineOffset: 2, borderRadius: 8 }}>
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
        </>
      ) : (
        <DayTimesheet
          loading={loading} dayEntries={dayEntries} clients={clients} projects={projects}
          onSaveDayEntry={onSaveDayEntry} onResetBillable={onResetBillable} />
      )}
    </section>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 11, fontWeight: 800, padding: '3px 12px', borderRadius: 6, cursor: 'pointer',
      border: '1px solid ' + (active ? 'transparent' : 'var(--tb-border-mid)'),
      background: active ? 'var(--tb-tab-active-bg)' : 'transparent',
      color: active ? 'var(--tb-tab-active-text)' : 'var(--tb-text-muted)',
      fontFamily: "'Open Sans', sans-serif",
    }}>{children}</button>
  );
}

// Timesheet del giorno: una riga per progetto tracciato oggi, cella TimeCell
// identica al timesheet settimanale. Per registrare su un progetto non ancora
// presente si usa il QuickLog (⌘L), che poi lo fa comparire qui.
function DayTimesheet({ loading, dayEntries, clients, projects, onSaveDayEntry, onResetBillable }) {
  const [viewMode, setViewMode] = useState('tracked');
  if (loading) return <div style={{ padding: 12 }}><SkeletonRows /></div>;

  const rows = (dayEntries || [])
    .map(entry => {
      const project = projects.find(p => p.id === entry.projectId);
      const client = project ? clients.find(c => c.id === project.clientId) : null;
      return project && client ? { entry, project, client } : null;
    })
    .filter(Boolean)
    .sort((a, b) =>
      (a.client.position ?? 0) - (b.client.position ?? 0)
      || (a.project.position ?? 0) - (b.project.position ?? 0)
      || a.project.name.localeCompare(b.project.name, 'it'));

  const totalTracked = rows.reduce((s, r) => s + r.entry.hours, 0);
  const totalBillable = rows.reduce((s, r) => r.client.billing !== 'none' ? s + effBillable(r.entry) : s, 0);
  const total = viewMode === 'billable' ? totalBillable : totalTracked;

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <DayViewToggle value={viewMode} onChange={setViewMode} />
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '28px 8px', textAlign: 'center', color: 'var(--tb-text-muted)', fontSize: 11, fontWeight: 700, lineHeight: 1.6 }}>
          Nessuna ora tracciata oggi.<br />Usa <kbd style={{ fontFamily: 'monospace', fontSize: 10, border: '1px solid var(--tb-border-mid)', borderRadius: 3, padding: '0 4px' }}>⌘L</kbd> per aggiungere un progetto.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--tb-border)', borderRadius: 6, overflow: 'hidden' }}>
          {rows.map(({ entry, project, client }, i) => (
            <div key={project.id} style={{ display: 'grid', gridTemplateColumns: '1fr 72px', alignItems: 'stretch', borderTop: i ? '1px solid var(--tb-border-soft)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 10px', minWidth: 0 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: client.color, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--tb-text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</div>
                </div>
              </div>
              <TimeCell
                hours={entry.hours}
                billableHours={entry.billableHours ?? null}
                billed={entry.billed ?? false}
                isBillable={client.billing !== 'none'}
                isFuture={false} isToday
                clientColor={client.color}
                colIndex={0}
                projectId={project.id}
                viewMode={viewMode}
                onSave={payload => onSaveDayEntry(project.id, payload)}
                onResetBillable={() => onResetBillable(project.id)} />
            </div>
          ))}
        </div>
      )}
      {rows.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--tb-text-faint)', padding: '0 2px' }}>
          <span>Totale</span>
          <span style={{ color: 'var(--tb-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmtH(total)}</span>
        </div>
      )}
    </div>
  );
}

function DayViewToggle({ value, onChange }) {
  const opts = [{ k: 'tracked', l: 'Tracciate' }, { k: 'billable', l: 'Fatturabili' }];
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--tb-border-mid)', borderRadius: 6, overflow: 'hidden' }}>
      {opts.map(o => (
        <button key={o.k} onClick={() => onChange(o.k)} style={{
          fontSize: 10, fontWeight: 800, padding: '3px 9px', border: 'none', cursor: 'pointer',
          background: value === o.k ? 'var(--tb-tab-active-bg)' : 'transparent',
          color: value === o.k ? 'var(--tb-tab-active-text)' : 'var(--tb-text-muted)',
          fontFamily: "'Open Sans', sans-serif",
        }}>{o.l}</button>
      ))}
    </div>
  );
}

// Capacità libera = quanto tempo della giornata resta ancora disponibile.
// Si parte dalla capacità totale del giorno (non dal piano) e si tolgono le
// ore già tracciate e le stime dei task Todoist ancora da fare. Il "quanto
// del piano è scoperto" vive invece nel blocco "Blocchi senza prossima azione".
function FreeCapacityCard({ loading, totals, capacity }) {
  const tracked = totals.trackedHours || 0;
  const todoist = totals.estimatedHours || 0;
  const free = Math.max(0, (capacity || 0) - tracked - todoist);
  const help = 'Quanto tempo della tua giornata resta ancora libero. Si parte dalla capacità totale del giorno e si tolgono le ore già tracciate (anche quelle fuori piano) e le ore stimate dei task Todoist ancora da fare.\n\nÈ rispetto alla giornata intera, non al piano: quanto del piano è ancora scoperto lo trovi nel blocco qui sotto.';
  const Term = ({ label, value, op }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {op && <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--tb-text-faint)' }}>{op}</span>}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--tb-text-secondary)', lineHeight: 1.1 }}>{loading ? '...' : fmtH(value)}</div>
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--tb-text-faint)', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
  return (
    <div style={{ border: '1px solid var(--tb-border)', borderRadius: 9, background: 'var(--tb-panel-bg)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 850, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--tb-text-faint)' }}>
          Capacità libera della giornata
          <span
            title={help}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 13, height: 13, borderRadius: '50%', border: '1px solid var(--tb-border-mid)', color: 'var(--tb-text-muted)', fontSize: 9, cursor: 'help', letterSpacing: 0 }}
          >?</span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tb-text-muted)', marginTop: 8, whiteSpace: 'nowrap' }}>Tempo della giornata ancora disponibile</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Term label="Giornata" value={capacity || 0} />
        <Term label="Tracciate" value={tracked} op="−" />
        <Term label="Todoist" value={todoist} op="−" />
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--tb-text-faint)' }}>=</span>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 34, fontWeight: 850, color: 'var(--tb-text-primary)', lineHeight: 1.05 }}>{loading ? '...' : fmtH(free)}</div>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--tb-text-muted)', marginTop: 2 }}>Libera</div>
        </div>
      </div>
    </div>
  );
}

// Live gauge "Carico di oggi · adesso": barra neutra con tre marcatori.
//  - fill neutro       = ore tracciate
//  - hatch             = oltre capacità
//  - tick bianco pieno = ritmo atteso ora (time-of-day)
//  - tick grigio       = piano del giorno
//  - tick tratteggiato = capacità
// Verdetto via glyph ▸/▾/▪ (sopra/sotto/in pari col ritmo).
function TodayGauge({ planned, traced, capacity }) {
  const scale = Math.max(capacity, planned, traced, 0.001);
  const pct = v => `${Math.max(0, Math.min(100, (v / scale) * 100))}%`;
  const over = traced > capacity;
  const now = new Date();
  // workday window 9:00–18:00 → fraction elapsed
  const dayStart = 9 * 60, dayEnd = 18 * 60;
  const mins = now.getHours() * 60 + now.getMinutes();
  const frac = Math.max(0, Math.min(1, (mins - dayStart) / (dayEnd - dayStart)));
  const pace = planned * frac; // dove dovresti essere ora
  const diff = traced - pace;
  const verdict = Math.abs(diff) < 0.25
    ? { glyph: '▪', label: 'In pari col ritmo', sub: `${fmtH(Math.abs(diff))} di scarto` }
    : diff > 0
      ? { glyph: '▸', label: 'Sopra il ritmo', sub: `${fmtH(diff)} in avanti` }
      : { glyph: '▾', label: 'Sotto il ritmo', sub: `${fmtH(-diff)} indietro` };
  return (
    <div style={{ border: '1px solid var(--tb-border)', borderRadius: 10, background: 'var(--tb-panel-bg)', padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--tb-text-faint)' }}>
            Carico di oggi · adesso
            <span
              title={'Il piano di oggi viene distribuito in modo uniforme sulla giornata lavorativa (9:00–18:00). In base all\'ora attuale si calcola quante ore dovresti aver già tracciato a questo punto: quello è il ritmo atteso.\n\nIl verdetto confronta le ore che hai davvero tracciato con quel ritmo: più avanti = sopra il ritmo, meno = sotto.'}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 13, height: 13, borderRadius: '50%', border: '1px solid var(--tb-border-mid)', color: 'var(--tb-text-muted)', fontSize: 9, cursor: 'help', letterSpacing: 0 }}
            >?</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
            <span style={{ fontSize: 30, fontWeight: 800, color: 'var(--tb-text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>{fmtH(traced)}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tb-text-muted)' }}>tracciate su {fmtH(planned)} piano</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 7, border: '1px solid var(--tb-border-mid)', background: 'var(--tb-panel-bg-soft)' }}>
          <span className="tb-glyph" style={{ fontSize: 15 }}>{verdict.glyph}</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--tb-text-primary)', lineHeight: 1.1 }}>{verdict.label}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--tb-text-muted)', marginTop: 1 }}>{verdict.sub}</div>
          </div>
        </div>
      </div>
      <div style={{ position: 'relative', height: 16, borderRadius: 8, background: 'var(--tb-bar-track)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pct(traced), background: 'var(--tb-bar-tracked)' }} />
        {over && <span className="tb-hatch" style={{ position: 'absolute', top: 0, bottom: 0, left: pct(capacity), width: `calc(${pct(traced)} - ${pct(capacity)})` }} />}
        <span title="Dove dovresti essere ora" style={{ position: 'absolute', left: pct(pace), top: -2, bottom: -2, width: 2, background: 'var(--tb-text-primary)' }} />
        <span className="tb-tick" title="Piano del giorno" style={{ left: pct(planned) }} />
        <span title="Capacità" style={{ position: 'absolute', left: pct(capacity), top: -2, bottom: -2, width: 0, borderLeft: '2px dashed var(--tb-tick)' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10, fontSize: 10, fontWeight: 600, color: 'var(--tb-text-muted)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 2, height: 10, background: 'var(--tb-text-primary)', display: 'inline-block' }} />ritmo atteso ora</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 2, height: 10, background: 'var(--tb-tick)', display: 'inline-block' }} />piano {fmtH(planned)}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 0, height: 10, borderLeft: '2px dashed var(--tb-tick)', display: 'inline-block' }} />capacità {fmtH(capacity)}</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--tb-text-secondary)' }}>restano <strong style={{ color: 'var(--tb-text-primary)' }}>{fmtH(Math.max(0, planned - traced))}</strong> a piano</span>
      </div>
    </div>
  );
}

function Panel({ title, empty, meta, children }) {
  return (
    <section style={{ border: '1px solid var(--tb-border)', borderRadius: 8, background: 'var(--tb-panel-bg)', overflow: 'hidden', minHeight: 260 }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--tb-border)', background: 'var(--tb-panel-bg-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 12, fontWeight: 850, color: 'var(--tb-text-primary)' }}>{title}</h2>
        {empty
          ? <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--tb-text-muted)' }}>{empty}</span>
          : meta && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--tb-text-muted)' }}>{meta}</span>}
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

function MismatchSection({ label, sub, children }) {
  const hasContent = React.Children.toArray(children).some(Boolean);
  if (!hasContent) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 850, color: 'var(--tb-text-primary)' }}>{label}</div>
        <div style={{ fontSize: 9, fontWeight: 650, color: 'var(--tb-text-faint)' }}>{sub}</div>
      </div>
      {children}
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
          color="var(--tb-text-muted)"
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
