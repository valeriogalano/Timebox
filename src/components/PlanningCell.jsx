import React, { useState, useEffect, useRef } from 'react';
import { toHHMM, parseHHMM } from '../utils';

const PX_PER_H = 34;
const MIN_H = 60;

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
    const blockH  = Math.max(28, block.hours * PX_PER_H);
    const fillPct = block.hours > 0 ? Math.min(1, logged / block.hours) : 0;
    const delta   = logged - block.hours;
    const overH   = delta > 0 ? Math.round(delta * PX_PER_H) : 0;
    return { block, cl, blockH, fillPct, delta, logged, overH };
  }).filter(Boolean);

  const cellH = Math.max(
    MIN_H,
    visualBlocks.reduce((s, vb) => s + vb.blockH + (vb.overH > 0 ? vb.overH + 2 : 0) + 4, 0) + (editable ? 28 : 8)
  );

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
        minHeight: cellH,
        borderRadius: 6, padding: 6,
        background: isWeekend ? 'var(--tb-cell-weekend)' : 'var(--tb-cell-bg)',
        border: `1px solid ${isToday ? '#3DB33D44' : 'var(--tb-border)'}`,
        opacity: isWeekend ? 0.5 : 1,
        display: 'flex', flexDirection: 'column', gap: 3,
      }}>
      {visualBlocks.map(({ block, cl, blockH, fillPct, delta, logged, overH }, i) => {
        const isDraggingThis = draggingId === block.id;
        return (
          <React.Fragment key={block.id}>
            {isInternalDrag && insertIndex === i && <Divider />}
          <div ref={el => { blockRefs.current[i] = el; }} style={{ position: 'relative', flexShrink: 0, opacity: isDraggingThis ? 0.35 : 1, transition: 'opacity 0.15s' }}>
            <div
              draggable={editable}
              onDragStart={e => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', block.id);
                onDragStart && onDragStart(block.id, block.clientId, block.hours);
              }}
              style={{
                height: blockH,
                background: cl.color + '14',
                border: `1px solid ${cl.color}28`,
                borderLeft: `3px solid ${cl.color}66`,
                borderRadius: 4, overflow: 'hidden', position: 'relative',
                cursor: editable ? 'grab' : 'default',
              }}>
              {fillPct > 0 && (
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  height: `${fillPct * 100}%`,
                  background: cl.color + (delta > 0 ? '55' : '30'),
                  transition: 'height 0.4s ease',
                }} />
              )}
              <div style={{
                position: 'relative', zIndex: 1,
                padding: '4px 7px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                height: '100%',
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: cl.color + 'bb',
                  maxWidth: 74, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {cl.name}
                </span>
                <div style={{ textAlign: 'right', flexShrink: 0, lineHeight: 1.3, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                  {editable && editId === block.id ? (
                    <input ref={editRef} value={editDraft}
                      onChange={e => setEditDraft(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditId(null); }}
                      style={{
                        width: 38, padding: '1px 3px', borderRadius: 3, border: `1px solid ${cl.color}`,
                        fontSize: 10, fontWeight: 800, color: cl.color, textAlign: 'right',
                        fontFamily: "'Open Sans', sans-serif", outline: 'none', background: 'var(--tb-input-bg)',
                      }} />
                  ) : (
                    <span
                      onClick={editable ? () => { setEditId(block.id); setEditDraft(String(block.hours)); } : undefined}
                      style={{
                        fontSize: 9, color: cl.color + '88',
                        cursor: editable ? 'text' : 'default',
                        borderBottom: editable ? `1px dashed ${cl.color}44` : 'none',
                      }}>
                      {toHHMM(block.hours)}
                    </span>
                  )}
                  {logged > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: cl.color }}>
                      {toHHMM(logged)}
                    </span>
                  )}
                </div>
              </div>
              {!isFuture && logged > 0 && blockH > 40 && (
                <div style={{
                  position: 'absolute', bottom: 3, left: 7, zIndex: 1,
                  fontSize: 9, fontWeight: 800,
                  color: delta >= 0 ? '#3DB33D' : '#E05252',
                }}>
                  {delta >= 0 ? '+' : ''}{toHHMM(Math.abs(delta))}
                </div>
              )}
              {editable && (
                <button onClick={() => onRemoveBlock(block.id)}
                  style={{
                    position: 'absolute', top: 2, right: 2, zIndex: 2,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: cl.color + '55', fontSize: 10, lineHeight: 1, padding: 1,
                    fontWeight: 700, opacity: 0.7,
                  }}>×</button>
              )}
            </div>

            {overH > 0 && (
              <div style={{
                height: overH + 2,
                background: cl.color + '30',
                borderLeft: `3px solid ${cl.color}`,
                borderBottomLeftRadius: 4, borderBottomRightRadius: 4,
                marginTop: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 7,
                overflow: 'hidden',
              }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: cl.color }}>
                  +{toHHMM(delta)} extra
                </span>
              </div>
            )}
          </div>
          </React.Fragment>
        );
      })}
      {isInternalDrag && insertIndex === visualBlocks.length && <Divider />}

      {visualBlocks.length === 0 && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--tb-border-mid)', fontSize: 11, minHeight: 40 }}>—</div>
      )}

      {editable && (
        <div ref={addRef} style={{ position: 'relative', marginTop: 'auto', flexShrink: 0 }}>
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
  );
}
