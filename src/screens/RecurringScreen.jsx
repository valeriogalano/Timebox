import React from 'react';
import { DAY_SHORT, fmtH } from '../utils';
import MultiSlotCell from '../components/MultiSlotCell';

export default function RecurringScreen({ clients, recurring, setRecurring }) {
  function addBlock(day, slot, clientId, hours) {
    if (!clientId) return;
    const r = { id: `r-${crypto.randomUUID()}`, clientId, slot, day, hours };
    window.api.saveRecurring(r);
    setRecurring(prev => [...prev, r]);
  }

  function updateBlock(id, hours) {
    setRecurring(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, hours };
      window.api.saveRecurring(updated);
      return updated;
    }));
  }

  function removeBlock(id) {
    window.api.deleteRecurring(id);
    setRecurring(prev => prev.filter(r => r.id !== id));
  }

  const totalPerDay = Array.from({ length: 5 }, (_, i) =>
    recurring.filter(r => r.day === i).reduce((s, r) => s + r.hours, 0)
  );
  const weekTotal = totalPerDay.reduce((s, h) => s + h, 0);

  return (
    <div>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 20, maxWidth: 560, lineHeight: 1.6 }}>
        Il template settimanale definisce i blocchi ricorrenti. Ogni slot può contenere più clienti.
        Le modifiche qui si applicano a tutte le settimane future; puoi sovrascrivere singole settimane dalla vista <strong>Settimana</strong>.
      </p>

      <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e8e7e0', overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '80px repeat(5, 1fr)' }}>

          {/* Header */}
          <div style={{ background: '#f8f7f2', borderBottom: '1px solid #e8e7e0', padding: '10px 14px',
            fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#bbb' }} />
          {DAY_SHORT.slice(0, 5).map((d, i) => (
            <div key={i} style={{ background: '#f8f7f2', borderBottom: '1px solid #e8e7e0',
              borderLeft: '1px solid #f0efe8', padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#aaa' }}>{d}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#383838', marginTop: 2 }}>{fmtH(totalPerDay[i])}</div>
            </div>
          ))}

          {/* AM row */}
          <div style={{ padding: '14px 14px 12px', borderBottom: '2px solid #e8e7e0', display: 'flex', alignItems: 'flex-start' }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#bbb', paddingTop: 4 }}>Mattina</div>
          </div>
          {Array.from({ length: 5 }, (_, i) => {
            const blocks = recurring.filter(r => r.day === i && r.slot === 'am');
            return (
              <MultiSlotCell key={i} blocks={blocks} clients={clients}
                onAdd={(cid, h) => addBlock(i, 'am', cid, h)}
                onUpdate={updateBlock} onRemove={removeBlock}
                style={{ borderLeft: '1px solid #f0efe8', borderBottom: '2px solid #e8e7e0' }} />
            );
          })}

          {/* PM row */}
          <div style={{ padding: '14px 14px 12px', display: 'flex', alignItems: 'flex-start' }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#bbb', paddingTop: 4 }}>Pomeriggio</div>
          </div>
          {Array.from({ length: 5 }, (_, i) => {
            const blocks = recurring.filter(r => r.day === i && r.slot === 'pm');
            return (
              <MultiSlotCell key={i} blocks={blocks} clients={clients}
                onAdd={(cid, h) => addBlock(i, 'pm', cid, h)}
                onUpdate={updateBlock} onRemove={removeBlock}
                style={{ borderLeft: '1px solid #f0efe8' }} />
            );
          })}
        </div>
      </div>

      {/* Weekly summary */}
      <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e8e7e0', padding: 16,
        display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: '#bbb', marginBottom: 2 }}>Totale settimana</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#383838' }}>{fmtH(weekTotal)}</div>
        </div>
        {clients.map(c => {
          const h = recurring.filter(r => r.clientId === c.id).reduce((s, r) => s + r.hours, 0);
          if (!h) return null;
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />
              <span style={{ fontSize: 12, color: '#888', fontWeight: 600 }}>{c.name}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#383838' }}>{fmtH(h)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
