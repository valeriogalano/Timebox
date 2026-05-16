import React, { useState, useEffect, useRef } from 'react';
import { toHHMM, parseHHMM } from '../utils';

const PX_PER_H = 30;

function Divider() {
  return (
    <div style={{
      height: 2, borderRadius: 1,
      background: '#4A8FE8',
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
}) {
  const [hover, setHover] = useState(false);
  const complete = logged >= block.hours && block.hours > 0;

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

  const barBg = cl.color + '1f';
  const readoutColor = logged === 0 ? cl.color + 'aa' : cl.color;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      draggable={editable && !editing}
      onDragStart={onDragStart}
      style={{
        position: 'relative',
        height: blockH,
        background: cl.color + '10',
        border: `1px solid ${cl.color + '30'}`,
        borderLeft: `3px solid ${cl.color}`,
        borderRadius: 4,
        padding: '5px 8px 7px',
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
          fontSize: 10, fontWeight: 700, color: cl.color,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          letterSpacing: '0.01em', flex: 1, minWidth: 0,
        }}>{cl.name}</span>
        {budgetAlertLevel_combined > 0 && (
          <div
            title={budgetAlertLevel_combined === 3 ? 'Limite superato' : budgetAlertLevel_combined === 2 ? 'Limite all\'80%+' : 'Limite al 50%+'}
            style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: budgetAlertLevel_combined === 3 ? '#E05252' : budgetAlertLevel_combined === 2 ? '#E07B3A' : '#E0C020',
            }}
          />
        )}
      </div>

      {/* Done/planned readout + delta */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', marginBottom: 4 }}>
        {editing ? (
          <input ref={editRef} value={editDraft}
            onChange={e => setEditDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') onCancelEdit(); }}
            onClick={e => e.stopPropagation()}
            style={{
              width: 48, padding: '1px 4px', borderRadius: 3, border: `1px solid ${cl.color}`,
              fontSize: 11, fontWeight: 800, color: cl.color, textAlign: 'right',
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
                <span style={{ fontSize: 11, fontWeight: 400, color: readoutColor }}>
                  {toHHMM(logged)}
                </span>
                <span style={{ fontSize: 9, color: cl.color + '66', fontWeight: 400 }}>/</span>
              </>
            )}
            <span style={{
              fontSize: logged > 0 ? 9 : 11,
              fontWeight: 400,
              color: logged > 0 ? cl.color + 'bb' : cl.color,
            }}>{toHHMM(block.hours)}</span>
          </div>
        )}

      </div>

      {/* Todoist task tooltip */}
      {hasTodoistSync && todoistH > 0 && hover && (isToday || isFuture) && todoistTasks && todoistTasks.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: 0,
          background: 'var(--tb-panel-bg)',
          border: '1px solid var(--tb-border-mid)',
          borderRadius: 6, padding: '6px 8px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
          zIndex: 100, minWidth: 160, maxWidth: 240,
          display: 'flex', flexDirection: 'column', gap: 5,
          pointerEvents: 'none',
        }}>
          {todoistTasks.map(t => (
            <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tb-text)', lineHeight: 1.3, wordBreak: 'break-word' }}>
                {t.content || '(senza titolo)'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 9, color: cl.color, fontWeight: 600 }}>{toHHMM(t.hours)}</span>
                <span style={{ fontSize: 9, color: 'var(--tb-text-faint)' }}>{t.projectName}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Progress bar + extra warning triangle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <div style={{
          flex: 1, height: 5, borderRadius: 3,
          background: barBg,
          overflow: 'hidden', position: 'relative',
        }}>
          {hasTodoistSync && todoistH > 0 && (
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${Math.min(100, (todoistH / block.hours) * 100)}%`,
              backgroundImage: `repeating-linear-gradient(135deg, ${cl.color}80 0 3px, transparent 3px 6px)`,
              backgroundColor: cl.color + '14',
            }} />
          )}
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${Math.min(100, fillPct * 100)}%`,
            background: complete ? cl.color : (partial ? cl.color + 'aa' : 'transparent'),
            transition: 'width 0.4s ease, background 0.2s',
          }} />
        </div>
        {overflow && (
          <div style={{
            width: 0, height: 0, flexShrink: 0,
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            borderBottom: '7px solid #E05252',
          }} />
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
            color: cl.color, fontSize: 11, lineHeight: 1, padding: 0,
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
  isToday, isFuture, isWeekend, editable,
  onAddBlock, onUpdateBlock, onRemoveBlock, onDragStart, onReorder, draggingId,
}) {
  const seenTodoistClients = new Set();
  const visualBlocks = blocks.map(block => {
    const cl = clients.find(c => c.id === block.clientId);
    if (!cl) return null;
    const fill    = blockFill?.[block.id] ?? { logged: 0, hasExtra: false };
    const logged  = fill.logged;
    const blockH  = Math.max(46, Math.round(block.hours * PX_PER_H));
    const fillPct = block.hours > 0 ? Math.min(1, logged / block.hours) : 0;
    const delta   = logged - block.hours;
    const overflow = fill.hasExtra;
    const firstOccurrence = !seenTodoistClients.has(block.clientId);
    seenTodoistClients.add(block.clientId);
    const todoistH = (firstOccurrence && todoistByClient) ? (todoistByClient[block.clientId] ?? 0) : 0;
    const todoistTasks = (firstOccurrence && todoistTasksByClient) ? (todoistTasksByClient[block.clientId] ?? []) : [];
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
        borderRadius: 6, padding: 5,
        background: isWeekend ? 'var(--tb-cell-weekend)' : 'var(--tb-cell-bg)',
        border: `1px solid ${isToday ? '#3DB33D44' : 'var(--tb-border)'}`,
        opacity: isWeekend ? 0.5 : 1,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
      {visualBlocks.map(({ block, cl, blockH, fillPct, delta, logged, overflow, todoistH, todoistTasks }, i) => (
        <React.Fragment key={block.id}>
          {isInternalDrag && insertIndex === i && <Divider />}
          <div ref={el => { blockRefs.current[i] = el; }}>
            <PlanningBlock
              block={block} cl={cl} blockH={blockH}
              fillPct={fillPct} delta={delta} logged={logged} overflow={overflow}
              todoistH={todoistH} todoistTasks={todoistTasks} hasTodoistSync={hasTodoistSync}
              isFuture={isFuture} isToday={isToday} editable={editable}
              isDragging={draggingId === block.id}
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
            />
          </div>
        </React.Fragment>
      ))}
      {isInternalDrag && insertIndex === visualBlocks.length && <Divider />}

      {visualBlocks.length === 0 && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--tb-border-mid)', fontSize: 11, minHeight: 40 }}>—</div>
      )}

      <div style={{ marginTop: 'auto', flexShrink: 0 }}>
      {editable && (
        <div ref={addRef} style={{ position: 'relative', flexShrink: 0 }}>
          {!addOpen ? (
            <button onClick={() => setAddOpen(true)}
              style={{
                width: '100%', padding: '3px 0', borderRadius: 4,
                border: '1px dashed var(--tb-border-mid)', background: 'transparent',
                color: 'var(--tb-text-faint)', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                fontFamily: "'Open Sans', sans-serif",
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
              }}>
              +
            </button>
          ) : (
            <div style={{
              background: 'var(--tb-panel-bg)', border: '1px solid var(--tb-border-mid)', borderRadius: 6,
              padding: 8, display: 'flex', flexDirection: 'column', gap: 5,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 10,
            }}>
              <select value={addClientId} onChange={e => setAddClientId(e.target.value)}
                style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--tb-input-border)',
                  fontFamily: "'Open Sans', sans-serif", fontSize: 11, color: 'var(--tb-input-text)',
                  background: 'var(--tb-input-bg)', outline: 'none' }}>
                <option value="">Cliente…</option>
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
