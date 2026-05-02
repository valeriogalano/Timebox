import React, { useState, useEffect, useRef } from 'react';
import RecurringBlockRow from './RecurringBlockRow';

export default function MultiSlotCell({ blocks, clients, onAdd, onUpdate, onRemove, style }) {
  const [addOpen, setAddOpen] = useState(false);
  const [addClientId, setAddClientId] = useState('');
  const [addHours, setAddHours] = useState(2);
  const addRef = useRef();

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

  return (
    <div style={{ padding: 8, minHeight: 80, display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      {blocks.map(block => {
        const cl = clients.find(c => c.id === block.clientId);
        if (!cl) return null;
        return (
          <RecurringBlockRow key={block.id} block={block} client={cl}
            onUpdate={h => onUpdate(block.id, h)} onRemove={() => onRemove(block.id)} />
        );
      })}

      <div ref={addRef} style={{ marginTop: 'auto' }}>
        {!addOpen ? (
          <button onClick={() => setAddOpen(true)}
            style={{
              width: '100%', padding: '4px 0', borderRadius: 4,
              border: '1px dashed #e0dfd8', background: 'transparent',
              color: '#ccc', fontSize: 10, fontWeight: 700, cursor: 'pointer',
              fontFamily: "'Open Sans', sans-serif",
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
            }}>
            <span style={{ fontSize: 12, lineHeight: 1 }}>+</span> blocco
          </button>
        ) : (
          <div style={{
            background: 'white', border: '1px solid #e0dfd8', borderRadius: 6, padding: 8,
            display: 'flex', flexDirection: 'column', gap: 5,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, position: 'relative',
          }}>
            <select value={addClientId} onChange={e => setAddClientId(e.target.value)}
              style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: '1px solid #ddd',
                fontFamily: "'Open Sans', sans-serif", fontSize: 11, color: '#383838', outline: 'none' }}>
              <option value="">Cliente…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 4 }}>
              <input type="number" value={addHours} min="0.5" step="0.5"
                onChange={e => setAddHours(parseFloat(e.target.value) || 1)}
                style={{ flex: 1, padding: '4px 6px', borderRadius: 4, border: '1px solid #ddd',
                  fontSize: 11, fontFamily: "'Open Sans', sans-serif", outline: 'none' }} />
              <button onClick={confirmAdd} disabled={!addClientId}
                style={{
                  flex: 2, padding: '5px', border: 'none', borderRadius: 5,
                  background: addClientId ? (clients.find(c => c.id === addClientId)?.color ?? '#3DB33D') : '#ddd',
                  cursor: addClientId ? 'pointer' : 'not-allowed',
                  fontSize: 11, fontWeight: 700, color: 'white', fontFamily: "'Open Sans', sans-serif",
                }}>
                Aggiungi
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
