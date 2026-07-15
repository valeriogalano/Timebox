import React, { useState, useEffect } from 'react';
import { DAY_SHORT, fmtH, SLOTS, getToday, getMondayOfWeek, fmt } from '../utils';
import MultiSlotCell from '../components/MultiSlotCell';

const RECURRING_DAYS = DAY_SHORT.length;
const SLOT_ROW_LABELS = { am: 'Mattina', pm: 'Pomeriggio', sera: 'Sera' };

export default function RecurringScreen({ clients, recurring, setRecurring, slotCapacityHours }) {
  const [dragging, setDragging] = useState(null); // { blockId, fromDay, fromSlot, clientId, hours }
  const [dragOver, setDragOver] = useState(null); // { day, slot }

  // Stato A/M/C dell'area — contestuale (settimana corrente), il template è week-agnostic.
  const [statuses, setStatuses] = useState({});
  useEffect(() => {
    const weekKey = fmt(getMondayOfWeek(getToday()));
    window.api.getWeekAreaStatuses(weekKey).then(rows => {
      setStatuses(Object.fromEntries(rows.map(row => [row.areaId, row.status])));
    });
  }, []);
  const clientsWithStatus = clients.map(c => ({ ...c, areaStatus: statuses[c.id] ?? 'active' }));

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
        Il template settimanale con il nuovo sistema di segnali (colore = area;
        A/M/C con forma; <span className="tb-delta">Δ</span> dove correggi spesso lo
        stesso slot). Le modifiche qui si applicano a tutte le settimane future; puoi
        sovrascrivere singole settimane dalla vista <strong>Settimana</strong>.
      </p>

      {/* Override ripetuti — drill-down (redesign #5a).
          Richiede la storicizzazione del pianificato per settimana (precondizione
          del handoff, NON design, ancora assente): qui mostriamo il contenitore
          disabilitato che diverrà operativo quando i dati saranno disponibili. */}
      <div style={{ border: '1px solid var(--tb-border)', borderStyle: 'dashed', borderRadius: 10, background: 'var(--tb-panel-bg)', padding: '12px 14px', marginBottom: 16, opacity: 0.7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
          <span className="tb-delta">Δ</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--tb-text-primary)' }}>Override ripetuti</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tb-text-muted)' }}>slot che correggi a mano di continuo — il template non riflette come lavori</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--tb-text-muted)', lineHeight: 1.5 }}>
          Richiede la conservazione del piano effettivo di ogni settimana passata
          (precondizione dati del handoff). Una volta disponibile, ogni divergenza
          ricorrente apparirà qui con giorno·slot, area, delta medio, frequenza e le
          azioni <em>Applica al template</em> / <em>Ignora</em> — target degli insight
          della lente «Nel tempo» di Andamento.
        </div>
      </div>

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

          {/* One row per slot (AM / PM / Sera) */}
          {SLOTS.map((slot, si) => {
            const isLast = si === SLOTS.length - 1;
            const rowBottom = isLast ? {} : { borderBottom: '2px solid var(--tb-border)' };
            return (
              <React.Fragment key={slot}>
                <div style={{ padding: '14px 14px 12px', display: 'flex', alignItems: 'flex-start', ...rowBottom }}>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--tb-text-faint)', paddingTop: 4 }}>{SLOT_ROW_LABELS[slot]}</div>
                </div>
                {Array.from({ length: RECURRING_DAYS }, (_, i) => {
                  const blocks = recurring.filter(r => r.day === i && r.slot === slot).sort((a, b) => a.position - b.position);
                  const isDropTarget = dragOver?.day === i && dragOver?.slot === slot;
                  return (
                    <MultiSlotCell
                      key={i}
                      blocks={blocks}
                      clients={clientsWithStatus}
                      onAdd={(cid, h) => addBlock(i, slot, cid, h)}
                      onUpdate={updateBlock}
                      onRemove={removeBlock}
                      onDuplicate={duplicateBlock}
                      onReorder={reorderBlocks}
                      onDragStart={(blockId, cid, h) => setDragging({ blockId, fromDay: i, fromSlot: slot, clientId: cid, hours: h })}
                      draggingId={dragging?.blockId}
                      isDropTarget={isDropTarget}
                      onDragOver={() => setDragOver({ day: i, slot })}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={() => handleDrop(i, slot)}
                      capacityHours={slotCapacityHours}
                      style={{ borderLeft: '1px solid var(--tb-border-soft)', ...rowBottom }}
                    />
                  );
                })}
              </React.Fragment>
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
