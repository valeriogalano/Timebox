import React, { useState, useEffect, useRef } from 'react';
import { SLOTS, SLOT_LABELS, isHourly } from '../utils';
import { freeEntrySlots } from '../dayPlanning';
import TimeCell from './TimeCell';
import { EntrySlotSelect, AddSlotSelect } from './SlotSelects';

// Fasce di un progetto in un giorno di Settimana: una riga per fascia, come in Giorno → Ore.
// Qui si sposta una fascia, si scrivono le ore di ognuna e se ne aggiunge una libera.
// `entries` sono le entry salvate del progetto in quel giorno.
export default function SlotPopover({
  project, client, dateLabel, dateStr, entries, anchorRect, viewMode, isFuture, isToday,
  onSave, onMove, onClose,
}) {
  const [added, setAdded] = useState([]);
  const ref = useRef();

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const saved = [...entries].sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
  const rows = [
    ...saved,
    ...added.filter(slot => !saved.some(e => e.slot === slot))
      .map(slot => ({ slot, hours: 0, billableHours: null, billed: false })),
  ].sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
  const free = freeEntrySlots(rows.map(r => ({ ...r, projectId: project.id })), project.id);

  // Sotto la cella, dentro lo schermo.
  const width = 280;
  const left = Math.max(8, Math.min((anchorRect?.left ?? 0), window.innerWidth - width - 8));
  const top = (anchorRect?.bottom ?? 0) + 4;

  return (
    <div ref={ref} role="dialog" aria-label={`Fasce di ${project.name}, ${dateLabel}`}
      style={{
        position: 'fixed', left, top, width, zIndex: 900,
        background: 'var(--tb-panel-bg)', border: '1px solid var(--tb-border)', borderRadius: 8,
        boxShadow: '0 12px 32px rgba(0,0,0,0.35)', padding: 10, display: 'flex', flexDirection: 'column', gap: 6,
      }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--tb-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {dateLabel} · {project.name}
      </div>
      {rows.map(row => (
        <div key={row.slot} style={{ display: 'grid', gridTemplateColumns: '1fr 84px', alignItems: 'center', gap: 8 }}>
          {row.id
            ? <EntrySlotSelect entry={row} projectName={project.name} onMove={onMove} />
            : <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tb-text-muted)' }}>{SLOT_LABELS[row.slot]}</span>}
          <TimeCell
            standalone
            hours={row.hours} billableHours={row.billableHours ?? null} billed={row.billed ?? false}
            isBillable={isHourly(client)}
            isFuture={isFuture} isToday={isToday} clientColor={client.color}
            colIndex={0} projectId={project.id} viewMode={viewMode}
            autoEdit={!row.id} showHint={!row.id}
            onSave={payload => onSave(row.slot, payload)} />
        </div>
      ))}
      {free.length > 0 && (
        <div>
          <AddSlotSelect freeSlots={free} projectName={project.name} onAdd={slot => slot && setAdded(a => [...a, slot])} />
        </div>
      )}
    </div>
  );
}
