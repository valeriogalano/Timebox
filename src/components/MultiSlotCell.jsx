import React, { useState, useEffect, useRef } from 'react';
import RecurringBlockRow from './RecurringBlockRow';
import SlotCapacityBar from './SlotCapacityBar';

export default function MultiSlotCell({
  blocks, clients, onAdd, onUpdate, onRemove, onDuplicate, onReorder,
  onDragStart, draggingId, isDropTarget, onDragOver, onDragLeave, onDrop,
  capacityHours,
  style,
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [addClientId, setAddClientId] = useState('');
  const [addHours, setAddHours] = useState(2);
  const [insertIndex, setInsertIndex] = useState(null);
  const addRef = useRef();
  const blockRefs = useRef([]);

  useEffect(() => {
    function onOut(e) { if (addRef.current && !addRef.current.contains(e.target)) setAddOpen(false); }
    document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, []);

  function confirmAdd() {
    if (!addClientId) return;
    onAdd(addClientId, addHours);
    setAddOpen(false);
    setAddClientId('');
    setAddHours(2);
  }

  // Is the dragged block one that lives in this cell?
  const isInternalDrag = draggingId != null && blocks.some(b => b.id === draggingId);
  const plannedHours = blocks.reduce((sum, block) => sum + block.hours, 0);

  function computeInsertIndex(mouseY) {
    for (let i = 0; i < blockRefs.current.length; i++) {
      const el = blockRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (mouseY < rect.top + rect.height / 2) return i;
    }
    return blocks.length;
  }

  function handleDragOver(e) {
    e.preventDefault();
    if (isInternalDrag) {
      setInsertIndex(computeInsertIndex(e.clientY));
    } else {
      onDragOver?.();
    }
  }

  function handleDragLeave(e) {
    // Only fire if leaving the cell entirely (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setInsertIndex(null);
      if (!isInternalDrag) onDragLeave?.();
    }
  }

  function handleDrop(e) {
    if (isInternalDrag && insertIndex !== null) {
      const srcIdx = blocks.findIndex(b => b.id === draggingId);
      const filtered = blocks.filter(b => b.id !== draggingId);
      const adjusted = insertIndex > srcIdx ? insertIndex - 1 : insertIndex;
      const clamped = Math.max(0, Math.min(adjusted, filtered.length));
      const newOrder = [
        ...filtered.slice(0, clamped),
        blocks[srcIdx],
        ...filtered.slice(clamped),
      ];
      onReorder?.(newOrder);
    } else {
      onDrop?.();
    }
    setInsertIndex(null);
  }

  // Visual divider shown at insertIndex position during internal drag
  const Divider = () => (
    <div style={{
      height: 2, borderRadius: 1,
      background: 'var(--tb-border-mid)',
      margin: '1px 2px',
      flexShrink: 0,
    }} />
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        padding: 8, minHeight: 60,
        display: 'flex', flexDirection: 'column', gap: 4,
        outline: isDropTarget && !isInternalDrag ? '2px dashed var(--tb-tick)' : 'none',
        outlineOffset: -2,
        background: isDropTarget && !isInternalDrag ? 'var(--tb-drag-over-bg)' : 'transparent',
        transition: 'background 0.1s',
        ...style,
      }}
    >
      {blocks.map((block, i) => {
        const cl = clients.find(c => c.id === block.clientId);
        if (!cl) return null;
        return (
          <React.Fragment key={block.id}>
            {isInternalDrag && insertIndex === i && <Divider />}
            <div ref={el => { blockRefs.current[i] = el; }}>
              <RecurringBlockRow
                block={block}
                client={cl}
                onUpdate={h => onUpdate(block.id, h)}
                onRemove={() => onRemove(block.id)}
                onDuplicate={() => onDuplicate?.(block.id)}
                onDragStart={(bid, cid, h) => onDragStart?.(bid, cid, h)}
                isDragging={draggingId === block.id}
              />
            </div>
          </React.Fragment>
        );
      })}
      {isInternalDrag && insertIndex === blocks.length && <Divider />}

      <div ref={addRef}>
        {!addOpen ? (
          <button onClick={() => setAddOpen(true)}
            style={{
              width: '100%', padding: '4px 0', borderRadius: 4,
              border: '1px dashed var(--tb-border-mid)', background: 'transparent',
              color: 'var(--tb-text-faint)', fontSize: 10, fontWeight: 700, cursor: 'pointer',
              fontFamily: "'Open Sans', sans-serif",
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
            }}>
            +
          </button>
        ) : (
          <div style={{
            background: 'var(--tb-panel-bg)', border: '1px solid var(--tb-border-mid)', borderRadius: 6, padding: 8,
            display: 'flex', flexDirection: 'column', gap: 5,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 10, position: 'relative',
          }}>
            <select value={addClientId} onChange={e => setAddClientId(e.target.value)}
              style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--tb-input-border)',
                fontFamily: "'Open Sans', sans-serif", fontSize: 11, color: 'var(--tb-input-text)',
                background: 'var(--tb-input-bg)', outline: 'none' }}>
              <option value="">Area…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 4 }}>
              <input type="number" value={addHours} min="0.5" step="0.5"
                onChange={e => setAddHours(parseFloat(e.target.value) || 1)}
                style={{ flex: 1, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--tb-input-border)',
                  fontSize: 11, fontFamily: "'Open Sans', sans-serif", outline: 'none',
                  background: 'var(--tb-input-bg)', color: 'var(--tb-input-text)' }} />
              <button onClick={confirmAdd} disabled={!addClientId}
                style={{
                  flex: 2, padding: '5px', border: 'none', borderRadius: 5,
                  background: addClientId ? (clients.find(c => c.id === addClientId)?.color ?? '#3B82F6') : 'var(--tb-border)',
                  cursor: addClientId ? 'pointer' : 'not-allowed',
                  fontSize: 11, fontWeight: 700, color: 'white', fontFamily: "'Open Sans', sans-serif",
                }}>
                Aggiungi
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Barra capacità in fondo, coerente con le viste Settimana e Oggi */}
      <div style={{ marginTop: 'auto' }}>
        <SlotCapacityBar plannedHours={plannedHours} capacityHours={capacityHours} compact />
      </div>
    </div>
  );
}
