import React, { useEffect, useState } from 'react';
import { fmt, fmtH, getToday, getMondayOfWeek, SLOTS } from '../utils';
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
        <div style={{ padding: '10px 12px', border: '1px solid var(--tb-border)', background: 'var(--tb-panel-bg-soft)', color: 'var(--tb-text-primary)', borderRadius: 7, fontSize: 12, fontWeight: 700 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <DayPlanningPanel
          loading={loading}
          clients={clients} projects={projects} projectTotals={projectTotals}
          planning={planning} slotPlannedTotals={slotPlannedTotals}
          slotCapacityHours={slotCapacityHours} hasTodoistSync={!!syncedAt}
          addBlockToSlot={addBlockToSlot} updateBlockInSlot={updateBlockInSlot}
          removeBlockFromSlot={removeBlockFromSlot} setSlotOverride={setSlotOverride}
          dragging={dragging} setDragging={setDragging} handleDrop={handleDrop}
        />

        <div style={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!loading && (
            <TodayGauge
              planned={SLOTS.reduce((s, slot) => s + (slotPlannedTotals[slot] || 0), 0)}
              traced={rawEntries.reduce((s, e) => s + e.hours, 0)}
              capacity={slotCapacityHours * SLOTS.length}
            />
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <MetricCard
              label="Capacità libera"
              value={loading ? '...' : fmtH(totals.freeUnallocatedHours || 0)}
              sub={`${fmtH(totals.availableAfterTrackedAndTasks || 0)} dopo tracciate + Todoist`}
              glyph={(totals.freeUnallocatedHours || 0) > 0 ? '▪' : null}
            />
            <MetricCard
              label="Blocchi senza azione"
              value={loading ? '...' : String(readyGroups.length)}
              sub={`${fmtH(totals.reservedWithoutTasksHours || 0)} ancora riservate`}
              glyph={readyGroups.length ? '⬦' : null}
            />
            <MetricCard
              label="Mismatch"
              value={loading ? '...' : String(totalMismatches)}
              sub={`${fmtH(totals.estimatedHours || 0)} stimate in Todoist`}
              glyph={totalMismatches ? '▸' : null}
            />
          </div>

          <Panel title="Blocchi senza prossima azione" empty={!loading && readyGroups.length === 0 ? 'Coperti' : null}>
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

          <Panel title="Mismatch dopo sync" empty={!loading && totalMismatches === 0 ? 'Pulito' : null}>
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
}) {
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
        <h2 style={{ fontSize: 12, fontWeight: 850, color: 'var(--tb-text-primary)' }}>Blocchi di oggi</h2>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tb-text-faint)' }}>trascina tra Mattina, Pomeriggio e Sera · override solo per oggi</span>
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
    </section>
  );
}

function MetricCard({ label, value, sub, glyph }) {
  return (
    <div style={{ border: '1px solid var(--tb-border)', borderRadius: 9, background: 'var(--tb-panel-bg)', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 9, fontWeight: 850, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--tb-text-faint)' }}>{label}</div>
        {glyph && <span className="tb-glyph" style={{ fontSize: 13 }}>{glyph}</span>}
      </div>
      <div style={{ fontSize: 30, fontWeight: 850, color: 'var(--tb-text-primary)', lineHeight: 1.1, marginTop: 8 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tb-text-muted)', marginTop: 6 }}>{sub}</div>
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
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--tb-text-faint)' }}>Carico di oggi · adesso</div>
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
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 0, borderTop: '2px solid var(--tb-text-primary)', display: 'inline-block' }} />ritmo atteso ora</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 2, height: 10, background: 'var(--tb-tick)', display: 'inline-block' }} />piano {fmtH(planned)}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 0, borderTop: '2px dashed var(--tb-tick)', display: 'inline-block' }} />capacità {fmtH(capacity)}</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--tb-text-secondary)' }}>restano <strong style={{ color: 'var(--tb-text-primary)' }}>{fmtH(Math.max(0, planned - traced))}</strong> a piano</span>
      </div>
    </div>
  );
}

function Panel({ title, empty, children }) {
  return (
    <section style={{ border: '1px solid var(--tb-border)', borderRadius: 8, background: 'var(--tb-panel-bg)', overflow: 'hidden', minHeight: 260 }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--tb-border)', background: 'var(--tb-panel-bg-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 12, fontWeight: 850, color: 'var(--tb-text-primary)' }}>{title}</h2>
        {empty && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--tb-text-muted)' }}>{empty}</span>}
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
