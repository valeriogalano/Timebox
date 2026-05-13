import React, { useState, useEffect, useRef } from 'react';

const PX_PER_H = 40;

export default function RecurringBlockRow({ block, client, onUpdate, onRemove, onDuplicate, onDragStart, isDragging }) {
  const [hover, setHover] = useState(false);
  const [editingH, setEditingH] = useState(false);
  const [draft, setDraft] = useState('');
  const [liveHours, setLiveHours] = useState(null);
  const [resizing, setResizing] = useState(false);
  const [blockDraggable, setBlockDraggable] = useState(true);
  const inputRef = useRef();

  useEffect(() => {
    if (editingH && inputRef.current) inputRef.current.select();
  }, [editingH]);

  const displayHours = liveHours ?? block.hours;
  const blockH = Math.max(36, displayHours * PX_PER_H);

  function startEdit(e) {
    e.stopPropagation();
    setDraft(String(block.hours));
    setEditingH(true);
  }

  function commit() {
    const v = parseFloat(draft.replace(',', '.'));
    if (!isNaN(v) && v > 0) onUpdate(v);
    setEditingH(false);
  }

  function onResizeMouseDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startH = block.hours;
    let currentH = startH;
    setResizing(true);
    setBlockDraggable(false);

    function onMove(me) {
      const dy = me.clientY - startY;
      const rawH = startH + dy / PX_PER_H;
      currentH = Math.max(0.5, Math.round(rawH * 2) / 2);
      setLiveHours(currentH);
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setResizing(false);
      setBlockDraggable(true);
      setLiveHours(null);
      if (currentH !== startH) onUpdate(currentH);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return (
    <div
      draggable={blockDraggable && !editingH}
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', block.id);
        onDragStart?.(block.id, block.clientId, block.hours);
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { if (!resizing) setHover(false); }}
      style={{
        position: 'relative',
        height: blockH,
        background: client.color + '66',
        border: `1px solid ${client.color}88`,
        borderLeft: `3px solid ${client.color}`,
        borderRadius: 4,
        cursor: resizing ? 'ns-resize' : (isDragging ? 'grabbing' : 'grab'),
        opacity: isDragging ? 0.35 : 1,
        transition: 'opacity 0.15s',
        flexShrink: 0,
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Content area */}
      <div style={{
        position: 'absolute', inset: '0 0 8px 0', padding: '4px 7px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        overflow: 'hidden',
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: client.color + 'bb',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          flex: 1, paddingRight: 4,
        }}>
          {client.name}
        </span>
        <div style={{ flexShrink: 0 }}>
          {editingH ? (
            <input ref={inputRef} value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditingH(false); }}
              onClick={e => e.stopPropagation()}
              style={{
                width: 38, padding: '1px 3px', borderRadius: 3, border: `1px solid ${client.color}`,
                fontSize: 10, fontWeight: 800, color: client.color, textAlign: 'right',
                fontFamily: "'Open Sans', sans-serif", outline: 'none', background: 'var(--tb-input-bg)',
              }} />
          ) : (
            <span onClick={startEdit} style={{
              fontSize: 9, color: client.color + '88', cursor: 'text',
              borderBottom: `1px dashed ${client.color}44`,
            }}>
              {displayHours}h
            </span>
          )}
        </div>
      </div>

      {/* Action buttons — shown on hover, disable drag to prevent accidental drag */}
      <div
        onMouseEnter={() => setBlockDraggable(false)}
        onMouseLeave={() => { if (!resizing) setBlockDraggable(true); }}
        style={{
          position: 'absolute', top: 2, right: 2,
          display: 'flex', gap: 1, zIndex: 2,
          opacity: hover && !resizing ? 1 : 0,
          transition: 'opacity 0.1s',
          pointerEvents: hover && !resizing ? 'auto' : 'none',
        }}
      >
        <button
          onClick={e => { e.stopPropagation(); onDuplicate?.(); }}
          title="Duplica"
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px',
            color: client.color + '88', lineHeight: 1,
          }}
        >
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
            <rect x="3.5" y="3.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M1 6.5V2a1 1 0 011-1h4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '1px 2px',
            color: client.color + '66', fontSize: 11, lineHeight: 1, fontWeight: 700,
          }}
        >×</button>
      </div>

      {/* Resize handle */}
      <div
        onMouseEnter={() => setBlockDraggable(false)}
        onMouseLeave={() => { if (!resizing) setBlockDraggable(true); }}
        onMouseDown={onResizeMouseDown}
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 8,
          cursor: 'ns-resize',
          background: (hover || resizing) ? client.color + '44' : 'transparent',
          borderBottomLeftRadius: 3, borderBottomRightRadius: 3,
          transition: 'background 0.15s',
          zIndex: 3,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {(hover || resizing) && (
          <div style={{
            width: 20, height: 2, borderRadius: 1,
            background: client.color + '99',
          }} />
        )}
      </div>
    </div>
  );
}
