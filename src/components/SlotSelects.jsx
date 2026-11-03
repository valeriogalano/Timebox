import React from 'react';
import { SLOTS, SLOT_LABELS } from '../utils';

// Selettori di fascia di una riga di ore, condivisi da Giorno e dal popover di Settimana.

// Fascia di una entry già salvata: cambiarla la sposta (moveEntrySlot).
export function EntrySlotSelect({ entry, projectName, onMove }) {
  return (
    <select
      aria-label={`Fascia di ${projectName}`}
      title="Fascia in cui hai lavorato: cambiala se è diversa"
      value={entry.slot}
      onChange={e => onMove(entry.id, e.target.value)}
      style={{ fontSize: 11, fontWeight: 700, color: 'var(--tb-text-muted)', background: 'transparent', border: '1px solid var(--tb-border-mid)', borderRadius: 4, padding: '1px 2px', fontFamily: "'Open Sans', sans-serif", flexShrink: 0 }}>
      {SLOTS.map(s => <option key={s} value={s}>{SLOT_LABELS[s]}</option>)}
    </select>
  );
}

// "+" per aggiungere ore in una fascia ancora libera.
export function AddSlotSelect({ freeSlots, projectName, onAdd }) {
  return (
    <select
      aria-label={`Aggiungi ore di ${projectName} in un'altra fascia`}
      title="Aggiungi ore in un'altra fascia"
      value=""
      onChange={e => onAdd(e.target.value)}
      // Un quadrato con il solo "+": con la freccia nativa sembrava un secondo selettore di fascia.
      style={{ appearance: 'none', WebkitAppearance: 'none', width: 24, height: 24, textAlign: 'center', textAlignLast: 'center', fontSize: 14, fontWeight: 700, lineHeight: 1, color: 'var(--tb-text-muted)', background: 'transparent', border: '1px solid var(--tb-border-mid)', borderRadius: 4, padding: 0, cursor: 'pointer', fontFamily: "'Open Sans', sans-serif", flexShrink: 0 }}>
      <option value="">+</option>
      {freeSlots.map(s => <option key={s} value={s}>{SLOT_LABELS[s]}</option>)}
    </select>
  );
}
