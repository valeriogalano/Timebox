import React, { useState, useEffect } from 'react';
import { DAY_SHORT, fmtH } from '../utils';
import MultiSlotCell from '../components/MultiSlotCell';

const RECURRING_DAYS = DAY_SHORT.length;

export default function RecurringScreen({ clients, recurring, setRecurring, slotCapacityHours }) {
  const [dragging, setDragging] = useState(null); // { blockId, fromDay, fromSlot, clientId, hours }
  const [dragOver, setDragOver] = useState(null); // { day, slot }

  useEffect(() => {
    function onDragEnd() { setDragging(null); setDragOver(null); }
    document.addEventListener('dragend', onDragEnd);
    return () => document.removeEventListener('dragend', onDragEnd);
  }, []);

  async function addBlock(day, slot, clientId, hours) {
    if (!clientId) return;
    await window.api.freezeWeeksBeforeRecurringChange(recurring);
    const position = recurring.filter(r => r.day === day && r.slot === slot).length;
    const r = { id: `r-${crypto.randomUUID()}`, clientId, slot, day, hours, position };
    window.api.saveRecurring(r);
    setRecurring(prev => [...prev, r]);
  }

  async function updateBlock(id, hours) {
    await window.api.freezeWeeksBeforeRecurringChange(recurring);
    setRecurring(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, hours };
      window.api.saveRecurring(updated);
      return updated;
    }));
  }

  async function removeBlock(id) {
    if (!window.confirm('Eliminare questo blocco ricorrente?')) return;
    await window.api.freezeWeeksBeforeRecurringChange(recurring);
    window.api.deleteRecurring(id);
    setRecurring(prev => prev.filter(r => r.id !== id));
  }

  async function duplicateBlock(sourceId) {
    const src = recurring.find(r => r.id === sourceId);
    if (!src) return;
    await window.api.freezeWeeksBeforeRecurringChange(recurring);
    const position = recurring.filter(r => r.day === src.day && r.slot === src.slot).length;
    const newBlock = { id: `r-${crypto.randomUUID()}`, clientId: src.clientId, slot: src.slot, day: src.day, hours: src.hours, position };
    window.api.saveRecurring(newBlock);
    setRecurring(prev => [...prev, newBlock]);
  }

  // Called by MultiSlotCell when blocks are reordered within the same slot/day
  async function reorderBlocks(reorderedBlocks) {
    await window.api.freezeWeeksBeforeRecurringChange(recurring);
    const withPositions = reorderedBlocks.map((b, i) => ({ ...b, position: i }));
    setRecurring(prev => {
      const map = new Map(withPositions.map(b => [b.id, b]));
      return prev.map(r => map.get(r.id) ?? r);
    });
    withPositions.forEach(b => window.api.saveRecurring(b));
  }

  // Called when a block is dropped onto a different slot/day
  async function handleDrop(toDay, toSlot) {
    if (!dragging) return;
    const { blockId, fromDay, fromSlot, clientId, hours } = dragging;
    if (fromDay === toDay && fromSlot === toSlot) { setDragging(null); setDragOver(null); return; }
    await window.api.freezeWeeksBeforeRecurringChange(recurring);
    window.api.deleteRecurring(blockId);
    const position = recurring.filter(r => r.day === toDay && r.slot === toSlot).length;
    const newBlock = { id: `r-${crypto.randomUUID()}`, clientId, slot: toSlot, day: toDay, hours, position };
    window.api.saveRecurring(newBlock);
    setRecurring(prev => [...prev.filter(r => r.id !== blockId), newBlock]);
    setDragging(null);
    setDragOver(null);
  }

  const totalPerDay = Array.from({ length: RECURRING_DAYS }, (_, i) =>
    recurring.filter(r => r.day === i).reduce((s, r) => s + r.hours, 0)
  );
  const weekTotal = totalPerDay.reduce((s, h) => s + h, 0);

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--tb-text-secondary)', marginBottom: 20, maxWidth: 560, lineHeight: 1.6 }}>
        Il template settimanale definisce i blocchi ricorrenti. Ogni slot può contenere più aree.
        Le modifiche qui si applicano a tutte le settimane future; puoi sovrascrivere singole settimane dalla vista <strong>Settimana</strong>.
      </p>

      <div style={{ background: 'var(--tb-panel-bg)', borderRadius: 8, border: '1px solid var(--tb-panel-border)', overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `80px repeat(${RECURRING_DAYS}, 1fr)` }}>

          {/* Header */}
          <div style={{ background: 'var(--tb-panel-bg-soft)', borderBottom: '1px solid var(--tb-border)', padding: '10px 14px',
            fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--tb-text-faint)' }} />
          {DAY_SHORT.map((d, i) => (
            <div key={i} style={{ background: 'var(--tb-panel-bg-soft)', borderBottom: '1px solid var(--tb-border)',
              borderLeft: '1px solid var(--tb-border-soft)', padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--tb-text-muted)' }}>{d}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tb-text-primary)', marginTop: 2 }}>{fmtH(totalPerDay[i])}</div>
            </div>
          ))}

          {/* AM row */}
          <div style={{ padding: '14px 14px 12px', borderBottom: '2px solid var(--tb-border)', display: 'flex', alignItems: 'flex-start' }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--tb-text-faint)', paddingTop: 4 }}>Mattina</div>
          </div>
          {Array.from({ length: RECURRING_DAYS }, (_, i) => {
            const blocks = recurring.filter(r => r.day === i && r.slot === 'am').sort((a, b) => a.position - b.position);
            const isDropTarget = dragOver?.day === i && dragOver?.slot === 'am';
            return (
              <MultiSlotCell
                key={i}
                blocks={blocks}
                clients={clients}
                onAdd={(cid, h) => addBlock(i, 'am', cid, h)}
                onUpdate={updateBlock}
                onRemove={removeBlock}
                onDuplicate={duplicateBlock}
                onReorder={reorderBlocks}
                onDragStart={(blockId, cid, h) => setDragging({ blockId, fromDay: i, fromSlot: 'am', clientId: cid, hours: h })}
                draggingId={dragging?.blockId}
                isDropTarget={isDropTarget}
                onDragOver={() => setDragOver({ day: i, slot: 'am' })}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => handleDrop(i, 'am')}
                capacityHours={slotCapacityHours}
                style={{ borderLeft: '1px solid var(--tb-border-soft)', borderBottom: '2px solid var(--tb-border)' }}
              />
            );
          })}

          {/* PM row */}
          <div style={{ padding: '14px 14px 12px', display: 'flex', alignItems: 'flex-start' }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--tb-text-faint)', paddingTop: 4 }}>Pomeriggio</div>
          </div>
          {Array.from({ length: RECURRING_DAYS }, (_, i) => {
            const blocks = recurring.filter(r => r.day === i && r.slot === 'pm').sort((a, b) => a.position - b.position);
            const isDropTarget = dragOver?.day === i && dragOver?.slot === 'pm';
            return (
              <MultiSlotCell
                key={i}
                blocks={blocks}
                clients={clients}
                onAdd={(cid, h) => addBlock(i, 'pm', cid, h)}
                onUpdate={updateBlock}
                onRemove={removeBlock}
                onDuplicate={duplicateBlock}
                onReorder={reorderBlocks}
                onDragStart={(blockId, cid, h) => setDragging({ blockId, fromDay: i, fromSlot: 'pm', clientId: cid, hours: h })}
                draggingId={dragging?.blockId}
                isDropTarget={isDropTarget}
                onDragOver={() => setDragOver({ day: i, slot: 'pm' })}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => handleDrop(i, 'pm')}
                capacityHours={slotCapacityHours}
                style={{ borderLeft: '1px solid var(--tb-border-soft)' }}
              />
            );
          })}
        </div>
      </div>

      {/* Weekly summary */}
      <div style={{ background: 'var(--tb-panel-bg)', borderRadius: 8, border: '1px solid var(--tb-panel-border)', padding: 16,
        display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--tb-text-faint)', marginBottom: 2 }}>Totale settimana</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--tb-text-primary)' }}>{fmtH(weekTotal)}</div>
        </div>
        {clients.map(c => {
          const h = recurring.filter(r => r.clientId === c.id).reduce((s, r) => s + r.hours, 0);
          if (!h) return null;
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />
              <span style={{ fontSize: 12, color: 'var(--tb-text-secondary)', fontWeight: 600 }}>{c.name}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tb-text-primary)' }}>{fmtH(h)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
