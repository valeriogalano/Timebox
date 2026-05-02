import React, { useState, useEffect, useRef } from 'react';

export default function RecurringBlockRow({ block, client, onUpdate, onRemove }) {
  const [editingH, setEditingH] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef();

  useEffect(() => {
    if (editingH && inputRef.current) inputRef.current.select();
  }, [editingH]);

  function startEdit() { setDraft(String(block.hours)); setEditingH(true); }
  function commit() {
    const v = parseFloat(draft);
    if (!isNaN(v) && v > 0) onUpdate(v);
    setEditingH(false);
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      background: client.color + '18',
      borderLeft: `3px solid ${client.color}`,
      borderRadius: 4, padding: '4px 6px', minHeight: 28,
    }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: client.color, flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: client.color, flex: 1,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {client.name}
      </span>
      {editingH ? (
        <input ref={inputRef} value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditingH(false); }}
          style={{
            width: 38, padding: '1px 4px', borderRadius: 3, border: `1px solid ${client.color}`,
            fontSize: 11, fontWeight: 800, color: client.color, textAlign: 'right',
            fontFamily: "'Open Sans', sans-serif", outline: 'none',
            background: 'var(--tb-input-bg)',
          }} />
      ) : (
        <span onClick={startEdit}
          style={{ fontSize: 11, fontWeight: 800, color: client.color, cursor: 'text',
            borderBottom: `1px dashed ${client.color}66`, lineHeight: 1.4, flexShrink: 0 }}>
          {block.hours}h
        </span>
      )}
      <button onClick={onRemove}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: client.color + '66',
          fontSize: 12, padding: 0, lineHeight: 1, flexShrink: 0, fontWeight: 700 }}>
        ×
      </button>
    </div>
  );
}
