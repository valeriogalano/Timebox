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

function SlotSummary({ planned, done, extra }) {
  const hasExtra = extra > 0.01;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '3px 6px',
      borderTop: '1px dashed var(--tb-border-soft)',
      marginTop: 1,
      fontFamily: "'Open Sans', sans-serif",
      fontSize: 9, fontWeight: 700, letterSpacing: '0.02em',
      color: 'var(--tb-text-muted)',
      flexWrap: 'wrap',
    }}>
      {planned > 0 && (
        <span title="Pianificato">
          <span style={{ color: 'var(--tb-text-secondary)', fontWeight: 800 }}>{done > 0 ? toHHMM(done) : '0:00'}</span>
          <span style={{ opacity: 0.6 }}> / {toHHMM(planned)}</span>
        </span>
      )}
      {hasExtra && (
        <span style={{
          padding: '1px 5px', borderRadius: 3,
          background: '#E07B3A18', color: '#E07B3A',
          fontWeight: 800, marginLeft: 'auto',
        }}>
          + {toHHMM(extra)} extra
        </span>
      )}
    </div>
  );
}

function PlanningBlock({
  block, cl, blockH, fillPct, delta, logged, overflow,
  isFuture, editable, isDragging,
  editing, editDraft, setEditDraft, editRef, commitEdit, onStartEdit, onCancelEdit,
  onRemove, onDragStart,
}) {
  const [hover, setHover] = useState(false);
  const complete = !overflow && logged >= block.hours && block.hours > 0;
  const partial  = !overflow && !complete && logged > 0;

  const barColor = overflow ? '#E05252' : cl.color;
  const barBg    = cl.color + '1f';
  const readoutColor = logged === 0 ? cl.color + 'aa' : (overflow ? '#E05252' : cl.color);

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
        border: `1px solid ${overflow ? '#E0525244' : cl.color + '30'}`,
        borderLeft: `3px solid ${cl.color}`,
        borderRadius: 4,
        padding: '5px 8px 7px',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        cursor: editable && !editing ? 'grab' : 'default',
        opacity: isDragging ? 0.35 : 1,
        transition: 'opacity 0.15s, border-color 0.15s',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Header: client name only */}
      <div style={{ display: 'flex', alignItems: 'flex-start', minWidth: 0 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: cl.color,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          letterSpacing: '0.01em', flex: 1, minWidth: 0,
        }}>{cl.name}</span>
      </div>

      {/* Progress bar */}
      <div style={{
        height: 5, borderRadius: 3,
        background: barBg,
        overflow: 'hidden', position: 'relative', marginTop: 4,
      }}>
        {overflow ? (
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, right: 0,
            background: `linear-gradient(90deg, ${cl.color} 0%, ${cl.color} 70%, #E05252 70%, #E05252 100%)`,
          }} />
        ) : (
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${Math.min(100, fillPct * 100)}%`,
            background: complete ? cl.color : (partial ? cl.color + 'aa' : 'transparent'),
            transition: 'width 0.4s ease, background 0.2s',
          }} />
        )}
      </div>

      {/* Done/planned readout + delta */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 2 }}>
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
                <span style={{ fontSize: 11, fontWeight: 800, color: readoutColor }}>
                  {toHHMM(logged)}
                </span>
                <span style={{ fontSize: 9, color: cl.color + '66', fontWeight: 600 }}>/</span>
              </>
            )}
            <span style={{
              fontSize: logged > 0 ? 9 : 11,
              fontWeight: logged > 0 ? 600 : 800,
              color: logged > 0 ? cl.color + '88' : cl.color,
            }}>{toHHMM(block.hours)}</span>
          </div>
        )}

        {!isFuture && (overflow || (partial && delta < 0)) && (
          <span style={{
            fontSize: 9, fontWeight: 700,
            color: overflow ? '#E05252' : 'var(--tb-text-muted)',
            letterSpacing: '0.02em',
          }}>
            {overflow ? `+${toHHMM(delta)} oltre` : `${toHHMM(delta)}`}
          </span>
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
  slot, dayIndex, blocks, clients, projects, slotEntries,
  isToday, isFuture, isWeekend, editable,
  onAddBlock, onUpdateBlock, onRemoveBlock, onDragStart, onReorder, draggingId,
}) {
  const loggedByClient = {};
  slotEntries.forEach(e => {
    const p = projects.find(p2 => p2.id === e.projectId);
    if (!p) return;
    loggedByClient[p.clientId] = (loggedByClient[p.clientId] ?? 0) + e.hours;
  });

  const visualBlocks = blocks.map(block => {
    const cl = clients.find(c => c.id === block.clientId);
    if (!cl) return null;
    const logged  = loggedByClient[block.clientId] ?? 0;
    const blockH  = Math.max(46, Math.round(block.hours * PX_PER_H));
    const fillPct = block.hours > 0 ? Math.min(1, logged / block.hours) : 0;
    const delta   = logged - block.hours;
    const overflow = delta > 0;
    return { block, cl, blockH, fillPct, delta, logged, overflow };
  }).filter(Boolean);

  // Slot summary data
  const plannedClientIds = new Set(blocks.map(b => b.clientId));
  const slotPlanned = blocks.reduce((s, b) => s + b.hours, 0);
  const slotDone = visualBlocks.reduce((s, vb) => s + Math.min(vb.logged, vb.block.hours), 0);
  const slotExtraOnPlanned = visualBlocks.reduce((s, vb) => s + (vb.overflow ? vb.delta : 0), 0);
  const slotExtraUnplanned = slotEntries.reduce((s, e) => {
    const p = projects.find(p2 => p2.id === e.projectId);
    if (!p) return s;
    return plannedClientIds.has(p.clientId) ? s : s + e.hours;
  }, 0);
  const slotExtra = slotExtraOnPlanned + slotExtraUnplanned;

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
    const h = parseFloat(addHoursStr.replace(',', '.'));
    if (!addClientId || isNaN(h) || h <= 0) return;
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
    const h = parseFloat(editDraft.replace(',', '.'));
    if (!isNaN(h) && h > 0) onUpdateBlock(editId, h);
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
      {visualBlocks.map(({ block, cl, blockH, fillPct, delta, logged, overflow }, i) => (
        <React.Fragment key={block.id}>
          {isInternalDrag && insertIndex === i && <Divider />}
          <div ref={el => { blockRefs.current[i] = el; }}>
            <PlanningBlock
              block={block} cl={cl} blockH={blockH}
              fillPct={fillPct} delta={delta} logged={logged} overflow={overflow}
              isFuture={isFuture} editable={editable}
              isDragging={draggingId === block.id}
              editing={editId === block.id} editDraft={editDraft}
              setEditDraft={setEditDraft} editRef={editRef} commitEdit={commitEdit}
              onStartEdit={() => { setEditId(block.id); setEditDraft(String(block.hours)); }}
              onCancelEdit={() => setEditId(null)}
              onRemove={() => onRemoveBlock(block.id)}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', block.id);
                onDragStart && onDragStart(block.id, block.clientId, block.hours);
              }}
            />
          </div>
        </React.Fragment>
      ))}
      {isInternalDrag && insertIndex === visualBlocks.length && <Divider />}

      {visualBlocks.length === 0 && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--tb-border-mid)', fontSize: 11, minHeight: 40 }}>—</div>
      )}

      <div style={{ marginTop: 'auto', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Slot summary footer */}
        {(slotPlanned > 0 || slotExtra > 0) && !isFuture && (
          <SlotSummary planned={slotPlanned} done={slotDone + slotExtraOnPlanned} extra={slotExtra} />
        )}

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
                    background: addClientId ? (clients.find(c => c.id === addClientId)?.color ?? '#3DB33D') : 'var(--tb-border)',
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
