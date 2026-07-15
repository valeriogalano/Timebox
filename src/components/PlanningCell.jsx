import React, { useState, useEffect, useRef } from 'react';
import { toHHMM, parseHHMM } from '../utils';
import { areaTints } from '../area-colors';
import TodoistTaskTooltip from './TodoistTaskTooltip';
import AreaStatusGlyph from './AreaStatusGlyph';
import { AREA_STATUS_OPTIONS } from '../screens/WeeklyView';

const PX_PER_H = 30;
const PX_PER_H_COMPACT = 18;

const STEPPER_STEP_MIN = 15;

// Bottone −/+/✓ dello stepper inline (REDLINE §4):
// 16×16, radius 4, bg var(--tb-navbtn-bg), glifo 12/800. ✓ usa accento neutro attivo.
function StepperBtn({ label, onClick, check }) {
  const bg = check ? 'var(--tb-tab-active-bg)' : 'var(--tb-navbtn-bg)';
  const color = check ? 'var(--tb-tab-active-text)' : 'var(--tb-text-primary)';
  return (
    <button
      onClick={onClick}
      style={{
        width: 16, height: 16, borderRadius: 4,
        background: bg, color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: check ? 10 : 12, fontWeight: 800, lineHeight: 1,
        border: 'none', cursor: 'pointer', padding: 0,
        fontFamily: "'Open Sans', sans-serif",
      }}>
      {label}
    </button>
  );
}

function Divider() {
  return (
    <div style={{
      height: 2, borderRadius: 1,
      background: 'var(--tb-border-mid)',
      margin: '1px 0',
      flexShrink: 0,
    }} />
  );
}


function PlanningBlock({
  block, cl, blockH, fillPct, delta, logged, overflow, todoistH, todoistTasks, hasTodoistSync,
  isFuture, isToday, editable, isDragging,
  editing, editDraft, setEditDraft, editRef, commitEdit, onStartEdit, onCancelEdit,
  onRemove, onDragStart,
  projects, projectTotals, weekProjectHours,
  compact,
  stepper, onStepperDone,
}) {
  const [hover, setHover] = useState(false);
  const [stepperOpen, setStepperOpen] = useState(false);
  const [stepperDraftMin, setStepperDraftMin] = useState(0);
  const blockRef = useRef(null);
  const complete = logged >= block.hours && block.hours > 0;

  // Stepper ±15min sulle ore tracciate: stato locale al blocco, committed on
  // ✓ via onStepperDone(hours). Nessuna mappa tsEdits condivisa: il valore
  // "live" prima del commit è solo di questo blocco.
  const stepperLiveH = stepperDraftMin / 60;
  const stepperDirty = stepperOpen && Math.round(stepperDraftMin / STEPPER_STEP_MIN) !== Math.round((logged || 0) * 60 / STEPPER_STEP_MIN);

  function openStepper() {
    setStepperDraftMin(Math.round((logged || 0) * 60));
    setStepperOpen(true);
  }

  function stepperStep(minutesDelta) {
    setStepperDraftMin(m => Math.max(0, m + minutesDelta));
  }

  function commitStepper() {
    onStepperDone?.(stepperDraftMin / 60);
    setStepperOpen(false);
  }

  const clientProjects = (projects || []).filter(p => p.clientId === block.clientId && !p.archived);

  const budgetAlertLevel = clientProjects.reduce((maxLevel, p) => {
    if (!p.budgetHours) return maxLevel;
    const pct = ((projectTotals || {})[p.id] ?? 0) / p.budgetHours;
    return Math.max(maxLevel, pct >= 1 ? 3 : pct >= 0.8 ? 2 : pct >= 0.5 ? 1 : 0);
  }, 0);

  const weeklyAlertLevel = clientProjects.reduce((maxLevel, p) => {
    if (!p.weeklyHours) return maxLevel;
    const pct = ((weekProjectHours || {})[p.id] ?? 0) / p.weeklyHours;
    return Math.max(maxLevel, pct >= 1 ? 3 : pct >= 0.8 ? 2 : pct >= 0.5 ? 1 : 0);
  }, 0);

  const budgetAlertLevel_combined = Math.max(budgetAlertLevel, weeklyAlertLevel);
  const partial = !complete && logged > 0;

  const tints = areaTints(cl.color);
  const barBg = tints.soft;
  const readoutColor = logged === 0 ? `color-mix(in srgb, ${cl.color} 70%, transparent)` : cl.color;

  return (
    <div
      ref={blockRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      draggable={editable && !editing}
      onDragStart={onDragStart}
      style={{
        position: 'relative',
        height: blockH,
        background: tints.bg,
        border: `1px solid ${tints.border}`,
        borderLeft: `3px solid ${cl.color}`,
        borderRadius: 5,
        padding: compact ? '5px 6px 6px' : '5px 7px 6px',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        cursor: editable && !editing ? 'grab' : 'default',
        opacity: isDragging ? 0.35 : 1,
        transition: 'opacity 0.15s, border-color 0.15s',
        flexShrink: 0,
      }}
    >
      {/* Header: client name + budget alert dot */}
      <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, gap: 3 }}>
        <span style={{
          fontSize: compact ? 9 : 10, fontWeight: 700, color: cl.color,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          letterSpacing: '0.01em', flex: 1, minWidth: 0,
        }}>{cl.name}</span>
        {cl.areaStatus && cl.areaStatus !== 'active' && (
          <span title={(AREA_STATUS_OPTIONS.find(o => o.key === cl.areaStatus) ?? AREA_STATUS_OPTIONS[0]).title} style={{ flexShrink: 0, display: 'flex' }}>
            <AreaStatusGlyph status={cl.areaStatus} size={compact ? 8 : 9} color="var(--tb-state-glyph)" />
          </span>
        )}
        {budgetAlertLevel_combined > 0 && (
          <span
            className="tb-meter"
            data-level={budgetAlertLevel_combined}
            title={budgetAlertLevel_combined === 3 ? 'Limite superato' : budgetAlertLevel_combined === 2 ? 'Limite all\'80%+' : 'Limite al 50%+'}
            style={{ flexShrink: 0 }}
          >
            <i /><i /><i />
          </span>
        )}
      </div>

      {/* Done/planned readout + delta (stepper o text-edit quando editabile) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', marginBottom: 4 }}>
        {stepper && editable ? (
          stepperOpen ? (
            <span
              onClick={e => e.stopPropagation()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: 'var(--tb-topbar-bg)', border: '1px solid var(--tb-navbtn-border)',
                borderRadius: 6, padding: '2px 4px',
              }}>
              <StepperBtn label="−" onClick={() => stepperStep(-STEPPER_STEP_MIN)} />
              <span style={{ minWidth: 34, textAlign: 'center', fontSize: 12, fontWeight: 800, color: 'var(--tb-text-primary)' }}>
                {toHHMM(stepperLiveH)}
              </span>
              {stepperDirty && (
                <span title="Modificato" style={{
                  width: 4, height: 4, borderRadius: '50%',
                  background: 'var(--tb-bar-tracked)', alignSelf: 'center',
                }} />
              )}
              <StepperBtn label="+" onClick={() => stepperStep(STEPPER_STEP_MIN)} />
              <StepperBtn label="✓" check onClick={commitStepper} />
              <span style={{ fontSize: 9, color: 'var(--tb-text-muted)' }}>/</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--tb-text-secondary)' }}>{toHHMM(block.hours)}</span>
            </span>
          ) : (
            <div
              onClick={(e) => { e.stopPropagation(); openStepper(); }}
              title="Modifica ore tracciate"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                cursor: 'pointer', lineHeight: 1, fontFamily: "'Open Sans', sans-serif",
              }}>
              {logged > 0 ? (
                <>
                  <span style={{
                    fontSize: 12, fontWeight: 800, color: 'var(--tb-text-primary)',
                    borderBottom: '1px dotted var(--tb-border-mid)',
                  }}>{toHHMM(logged)}</span>
                  <span style={{ fontSize: 9, color: 'var(--tb-text-muted)' }}>/</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--tb-text-secondary)' }}>{toHHMM(block.hours)}</span>
                </>
              ) : (
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tb-text-muted)', marginRight: 2 }}>＋ traccia</span>
              )}
            </div>
          )
        ) : editing ? (
          <input ref={editRef} value={editDraft}
            onChange={e => setEditDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') onCancelEdit(); }}
            onClick={e => e.stopPropagation()}
            style={{
              width: 48, padding: '1px 4px', borderRadius: 3, border: `1px solid ${cl.color}`,
              fontSize: compact ? 10 : 11, fontWeight: 800, color: cl.color, textAlign: 'right',
              fontFamily: "'Open Sans', sans-serif", outline: 'none',
              background: 'var(--tb-input-bg)',
            }} />
        ) : (
          <div
            onClick={editable ? (e) => { e.stopPropagation(); onStartEdit(); } : undefined}
            title={editable ? 'Modifica durata pianificata' : undefined}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 2,
              fontFamily: "'Open Sans', sans-serif", lineHeight: 1,
              cursor: editable ? 'text' : 'default',
            }}>
            {logged > 0 && (
              <>
                <span style={{ fontSize: compact ? 10 : 11, fontWeight: 400, color: readoutColor }}>
                  {toHHMM(logged)}
                </span>
                <span style={{ fontSize: compact ? 8 : 9, color: tints.border, fontWeight: 400 }}>/</span>
              </>
            )}
            <span style={{
              fontSize: logged > 0 ? (compact ? 8 : 9) : (compact ? 10 : 11),
              fontWeight: 400,
              color: logged > 0 ? `color-mix(in srgb, ${cl.color} 75%, transparent)` : cl.color,
            }}>{toHHMM(block.hours)}</span>
          </div>
        )}

      </div>

      {/* Todoist task tooltip — hidden once any hours are tracked in this block */}
      {hasTodoistSync && todoistH > 0 && hover && (isToday || isFuture) && logged === 0 && todoistTasks && todoistTasks.length > 0 && (
        <TodoistTaskTooltip anchorRef={blockRef} tasks={todoistTasks} color={cl.color} />
      )}

      {/* Progress bar + extra warning triangle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <div style={{
          flex: 1, height: compact ? 4 : 5, borderRadius: 3,
          background: barBg,
          overflow: 'hidden', position: 'relative',
        }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${Math.min(100, fillPct * 100)}%`,
            background: complete ? cl.color : (partial ? `color-mix(in srgb, ${cl.color} 70%, transparent)` : 'transparent'),
            transition: 'width 0.4s ease, background 0.2s',
          }} />
          {hasTodoistSync && todoistH > 0 && (isToday || isFuture) && fillPct < 1 && (
            <div style={{
              position: 'absolute', left: `${fillPct * 100}%`, top: 0, bottom: 0,
              width: `${Math.min(100 - fillPct * 100, (todoistH / block.hours) * 100)}%`,
              backgroundImage: `repeating-linear-gradient(135deg, color-mix(in srgb, ${cl.color} 50%, transparent) 0 3px, transparent 3px 6px)`,
              backgroundColor: tints.bg,
            }} />
          )}
        </div>
        {overflow && (
          <span title="Slot oltre capacità" className="tb-hatch" style={{ width: 9, height: 9, borderRadius: 2, flexShrink: 0 }} />
        )}
      </div>

      {/* Delete — hover-only */}
      {editable && hover && !editing && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }}
          title="Rimuovi blocco"
          style={{
            position: 'absolute', top: 3, right: 3, zIndex: 3,
            width: 16, height: 16, borderRadius: 3,
            background: 'var(--tb-panel-bg)',
            border: `1px solid ${cl.color}44`,
            cursor: 'pointer',
            color: cl.color, fontSize: compact ? 10 : 11, lineHeight: 1, padding: 0,
            fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
      )}
    </div>
  );
}

export default function PlanningCell({
  slot, dayIndex, blocks, clients, projects, projectTotals, weekProjectHours, blockFill,
  todoistByClient, todoistTasksByClient, hasTodoistSync,
  compact,
  isToday, isFuture, isWeekend, editable,
  onAddBlock, onUpdateBlock, onRemoveBlock, onDragStart, onReorder, draggingId,
  blockCountByClient, onLogHours,
}) {
  const seenTodoistClients = new Set();
  const todoistRemainder = {};
  const todoistTaskQueue = {};
  const visualBlocks = blocks.map(block => {
    const cl = clients.find(c => c.id === block.clientId);
    if (!cl) return null;
    const fill    = blockFill?.[block.id] ?? { logged: 0, hasExtra: false };
    const logged  = fill.logged;
    const pxPerH = compact ? PX_PER_H_COMPACT : PX_PER_H;
    const minH = compact ? 30 : 46;
    const blockH  = Math.max(minH, Math.round(block.hours * pxPerH));
    const fillPct = block.hours > 0 ? Math.min(1, logged / block.hours) : 0;
    const delta   = logged - block.hours;
    const overflow = fill.hasExtra;
    const firstOccurrence = !seenTodoistClients.has(block.clientId);
    if (firstOccurrence) {
      seenTodoistClients.add(block.clientId);
      todoistRemainder[block.clientId] = todoistByClient?.[block.clientId] ?? 0;
      todoistTaskQueue[block.clientId] = [...(todoistTasksByClient?.[block.clientId] ?? [])];
    }
    const available = todoistRemainder[block.clientId] ?? 0;
    const todoistH = Math.min(available, block.hours);
    todoistRemainder[block.clientId] = Math.max(0, available - block.hours);
    const todoistTasks = [];
    let capacity = block.hours;
    const queue = todoistTaskQueue[block.clientId] ?? [];
    while (queue.length > 0 && capacity > 0) {
      const t = queue[0];
      if (t.hours <= capacity + 0.001) {
        todoistTasks.push(t);
        capacity -= t.hours;
        queue.shift();
      } else {
        todoistTasks.push({ ...t, hours: capacity });
        queue[0] = { ...t, hours: t.hours - capacity };
        capacity = 0;
      }
    }
    return { block, cl, blockH, fillPct, delta, logged, overflow, todoistH, todoistTasks };
  }).filter(Boolean);

  const blockRefs = useRef([]);
  const [insertIndex, setInsertIndex] = useState(null);

  const isInternalDrag = draggingId != null && visualBlocks.some(vb => vb.block.id === draggingId);

  useEffect(() => { if (!isInternalDrag) setInsertIndex(null); }, [isInternalDrag]);

  function computeInsertIndex(mouseY) {
    for (let i = 0; i < blockRefs.current.length; i++) {
      const el = blockRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (mouseY < rect.top + rect.height / 2) return i;
    }
    return visualBlocks.length;
  }

  function handleContainerDragOver(e) {
    if (isInternalDrag) {
      e.preventDefault();
      e.stopPropagation();
      setInsertIndex(computeInsertIndex(e.clientY));
    }
  }

  function handleContainerDragLeave(e) {
    if (isInternalDrag && !e.currentTarget.contains(e.relatedTarget)) {
      setInsertIndex(null);
    }
  }

  function handleContainerDrop(e) {
    if (isInternalDrag && insertIndex !== null) {
      e.stopPropagation();
      const srcIdx = visualBlocks.findIndex(vb => vb.block.id === draggingId);
      const orderedBlocks = visualBlocks.map(vb => vb.block);
      const draggingBlock = orderedBlocks[srcIdx];
      const filtered = orderedBlocks.filter(b => b.id !== draggingId);
      const adjusted = insertIndex > srcIdx ? insertIndex - 1 : insertIndex;
      const clamped = Math.max(0, Math.min(adjusted, filtered.length));
      const newOrder = [...filtered.slice(0, clamped), draggingBlock, ...filtered.slice(clamped)];
      onReorder?.(newOrder);
      setInsertIndex(null);
    }
  }

  // Add-block UI
  const [addOpen, setAddOpen] = useState(false);
  const [addClientId, setAddClientId] = useState('');
  const [addHoursStr, setAddHoursStr] = useState('2');
  const addRef = useRef();

  useEffect(() => {
    function onOut(e) { if (addRef.current && !addRef.current.contains(e.target)) setAddOpen(false); }
    document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, []);

  function confirmAdd() {
    const h = parseHHMM(addHoursStr);
    if (!addClientId || h <= 0) return;
    onAddBlock(addClientId, h);
    setAddOpen(false);
    setAddClientId('');
    setAddHoursStr('2');
  }

  // Inline edit
  const [editId, setEditId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const editRef = useRef();
  useEffect(() => { if (editId && editRef.current) editRef.current.select(); }, [editId]);

  function commitEdit() {
    const h = parseHHMM(editDraft);
    if (h > 0) onUpdateBlock(editId, h);
    setEditId(null);
  }

  return (
    <div
      onDragOver={handleContainerDragOver}
      onDragLeave={handleContainerDragLeave}
      onDrop={handleContainerDrop}
      style={{
        minHeight: 60,
        flex: 1,
        borderRadius: 6, padding: compact ? 3 : 5,
        background: isWeekend ? 'var(--tb-cell-weekend)' : 'var(--tb-cell-bg)',
        border: `1px solid var(--tb-border)`,
        opacity: isWeekend ? 0.5 : 1,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
      {visualBlocks.map(({ block, cl, blockH, fillPct, delta, logged, overflow, todoistH, todoistTasks }, i) => {
        // Stepper ore tracciate: abilitato solo quando l'area ha un solo progetto
        // attivo e un solo blocco in giornata, altrimenti a quale progetto/slot
        // andrebbero attribuite le ore sarebbe ambiguo (entry sono per progetto+slot).
        const clientProjects = (projects || []).filter(p => p.clientId === block.clientId && !p.archived);
        const stepperProjectId = onLogHours && editable && clientProjects.length === 1
          && (blockCountByClient?.[block.clientId] ?? 0) === 1
          ? clientProjects[0].id
          : null;
        return (
        <React.Fragment key={block.id}>
          {isInternalDrag && insertIndex === i && <Divider />}
          <div ref={el => { blockRefs.current[i] = el; }}>
            <PlanningBlock
              block={block} cl={cl} blockH={blockH}
              fillPct={fillPct} delta={delta} logged={logged} overflow={overflow}
              todoistH={todoistH} todoistTasks={todoistTasks} hasTodoistSync={hasTodoistSync}
              isFuture={isFuture} isToday={isToday} editable={editable}
              isDragging={draggingId === block.id}
              compact={compact}
              editing={editId === block.id} editDraft={editDraft}
              setEditDraft={setEditDraft} editRef={editRef} commitEdit={commitEdit}
              onStartEdit={() => { setEditId(block.id); setEditDraft(toHHMM(block.hours)); }}
              onCancelEdit={() => setEditId(null)}
              onRemove={() => onRemoveBlock(block.id)}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', block.id);
                onDragStart && onDragStart(block.id, block.clientId, block.hours);
              }}
              projects={projects} projectTotals={projectTotals} weekProjectHours={weekProjectHours}
              stepper={!!stepperProjectId}
              onStepperDone={stepperProjectId ? (hours) => onLogHours(stepperProjectId, hours, slot) : undefined}
            />
          </div>
        </React.Fragment>
        );
      })}
      {isInternalDrag && insertIndex === visualBlocks.length && <Divider />}

      {visualBlocks.length === 0 && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--tb-border-mid)', fontSize: compact ? 10 : 11, minHeight: compact ? 28 : 40 }}>—</div>
      )}

      <div style={{ marginTop: 'auto', flexShrink: 0 }}>
      {editable && (
        <div ref={addRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => setAddOpen(v => !v)}
            style={{
              width: '100%', padding: '3px 0', borderRadius: 4,
              border: '1px dashed var(--tb-border-mid)',
              background: addOpen ? 'var(--tb-panel-bg-soft)' : 'transparent',
              color: 'var(--tb-text-faint)', fontSize: compact ? 9 : 10, fontWeight: 700, cursor: 'pointer',
              fontFamily: "'Open Sans', sans-serif",
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
            }}>
            +
          </button>
          {addOpen && (
            <div style={{
              position: 'absolute', bottom: 'calc(100% + 4px)', left: 0, right: 0,
              background: 'var(--tb-panel-bg)', border: '1px solid var(--tb-border-mid)', borderRadius: 6,
              padding: 8, display: 'flex', flexDirection: 'column', gap: 6,
              boxShadow: '0 4px 16px rgba(0,0,0,0.18)', zIndex: 50,
              minWidth: 140,
            }}>
              <select value={addClientId} onChange={e => setAddClientId(e.target.value)}
                style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--tb-input-border)',
                  fontFamily: "'Open Sans', sans-serif", fontSize: 11, color: 'var(--tb-input-text)',
                  background: 'var(--tb-input-bg)', outline: 'none' }}>
                <option value="">Area…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 4 }}>
                <input type="text" value={addHoursStr} onChange={e => setAddHoursStr(e.target.value)}
                  placeholder="ore"
                  style={{ flex: 1, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--tb-input-border)',
                    fontSize: 11, fontFamily: "'Open Sans', sans-serif", outline: 'none',
                    background: 'var(--tb-input-bg)', color: 'var(--tb-input-text)' }} />
                <button onClick={confirmAdd} disabled={!addClientId}
                  style={{
                    flex: 2, padding: '4px 6px', borderRadius: 4, border: 'none',
                    background: addClientId ? (clients.find(c => c.id === addClientId)?.color ?? '#3B82F6') : 'var(--tb-border)',
                    color: 'white', fontSize: 11, fontWeight: 700,
                    cursor: addClientId ? 'pointer' : 'not-allowed',
                    fontFamily: "'Open Sans', sans-serif",
                  }}>
                  Aggiungi
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
