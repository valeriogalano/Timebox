import React, { useState, useEffect } from 'react';
import { getToday, MONTHS_IT, fmtH } from '../utils';

export default function BillingScreen({ clients, projects, screen }) {
  const [entries, setEntries] = useState([]);
  const [monthOffset, setMonthOffset] = useState(0);

  const selectedDate = new Date(getToday().getFullYear(), getToday().getMonth() + monthOffset, 1);
  const selectedYear = selectedDate.getFullYear();
  const selectedMonthIdx = selectedDate.getMonth();
  const monthLabel = `${MONTHS_IT[selectedMonthIdx]} ${selectedYear}`;
  const lastDay = new Date(selectedYear, selectedMonthIdx + 1, 0).getDate();
  const from = `${selectedYear}-${String(selectedMonthIdx + 1).padStart(2, '0')}-01`;
  const to   = `${selectedYear}-${String(selectedMonthIdx + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  useEffect(() => {
    if (screen !== 'billing') return;
    window.api.getEntries(from, to).then(setEntries);
  }, [screen, from, to]);

  async function toggleBilled(entry) {
    const updated = { ...entry, billed: !entry.billed };
    await window.api.saveEntry(updated);
    setEntries(prev => prev.map(e => e.id === entry.id ? updated : e));
  }

  const billableClients = clients.filter(c => c.billable);
  const billablePids = new Set(projects.filter(p => billableClients.some(c => c.id === p.clientId)).map(p => p.id));
  const billableEntries = entries.filter(e => billablePids.has(e.projectId));
  const grandTotalH = billableEntries.reduce((s, e) => s + e.hours, 0);
  const grandTotalEur = billableClients.reduce((s, client) => {
    if (client.billing !== 'hourly' || !client.rate) return s;
    const pids = projects.filter(p => p.clientId === client.id).map(p => p.id);
    const h = entries.filter(e => pids.includes(e.projectId)).reduce((a, e) => a + e.hours, 0);
    return s + h * client.rate;
  }, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <NavBtn onClick={() => setMonthOffset(o => o - 1)}>‹</NavBtn>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tb-text-primary)', minWidth: 110, textAlign: 'center' }}>{monthLabel}</span>
        <NavBtn onClick={() => setMonthOffset(o => o + 1)}>›</NavBtn>
        {monthOffset !== 0 && <NavBtn small onClick={() => setMonthOffset(0)}>Oggi</NavBtn>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, color: 'var(--tb-text-faint)' }}>{fmtH(grandTotalH)} totali</span>
          {grandTotalEur > 0 && (
            <span style={{ fontSize: 14, fontWeight: 800, color: '#3DB33D' }}>€{grandTotalEur.toFixed(0)}</span>
          )}
        </div>
      </div>

      {/* Per-client sections */}
      {billableClients.map(client => {
        const pids = projects.filter(p => p.clientId === client.id).map(p => p.id);
        const clientEntries = entries
          .filter(e => pids.includes(e.projectId))
          .sort((a, b) => a.date.localeCompare(b.date));
        if (!clientEntries.length) return null;

        const totalH = clientEntries.reduce((s, e) => s + e.hours, 0);
        const billedH = clientEntries.filter(e => e.billed).reduce((s, e) => s + e.hours, 0);
        const unbilledH = totalH - billedH;
        const hourlyRate = client.billing === 'hourly' && client.rate ? client.rate : null;

        return (
          <div key={client.id} style={{ background: 'var(--tb-panel-bg)', borderRadius: 8, border: '1px solid var(--tb-panel-border)', overflow: 'hidden' }}>
            {/* Client header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--tb-border-soft)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: client.color, flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--tb-text-primary)', flex: 1 }}>{client.name}</span>
              <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
                <span style={{ fontSize: 11, color: 'var(--tb-text-secondary)' }}>
                  <span style={{ color: '#3DB33D', fontWeight: 700 }}>{fmtH(billedH)}</span> fatturate
                </span>
                {unbilledH > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--tb-text-secondary)' }}>
                    <span style={{ color: '#E07B3A', fontWeight: 700 }}>{fmtH(unbilledH)}</span> da fatturare
                  </span>
                )}
                {hourlyRate && (
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#3DB33D' }}>
                    €{(totalH * hourlyRate).toFixed(0)}
                  </span>
                )}
              </div>
            </div>

            {/* Entry rows */}
            {clientEntries.map((entry, i) => {
              const project = projects.find(p => p.id === entry.projectId);
              const isLast = i === clientEntries.length - 1;
              const dateLabel = new Date(entry.date + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
              return (
                <div key={entry.id} style={{
                  padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10,
                  borderBottom: isLast ? 'none' : '1px solid var(--tb-border-soft)',
                  opacity: entry.billed ? 1 : 0.75,
                }}>
                  <span style={{ fontSize: 11, color: 'var(--tb-text-faint)', minWidth: 90 }}>{dateLabel}</span>
                  <span style={{ fontSize: 11, color: 'var(--tb-text-secondary)', flex: 1 }}>
                    {project?.name ?? '—'}
                    <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--tb-text-faint)' }}>{entry.slot?.toUpperCase()}</span>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tb-text-primary)', minWidth: 40, textAlign: 'right' }}>
                    {fmtH(entry.hours)}
                  </span>
                  {hourlyRate && (
                    <span style={{ fontSize: 11, color: 'var(--tb-text-faint)', minWidth: 45, textAlign: 'right' }}>
                      €{(entry.hours * hourlyRate).toFixed(0)}
                    </span>
                  )}
                  <button
                    onClick={() => toggleBilled(entry)}
                    title={entry.billed ? 'Segna come non fatturata' : 'Segna come fatturata'}
                    style={{
                      width: 22, height: 22, borderRadius: 4, border: `1px solid ${entry.billed ? '#3DB33D' : 'var(--tb-border-mid)'}`,
                      background: entry.billed ? '#3DB33D' : 'transparent',
                      color: entry.billed ? 'white' : 'var(--tb-text-faint)',
                      fontSize: 10, fontWeight: 800, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: "'Open Sans', sans-serif", flexShrink: 0,
                      transition: 'all 0.15s',
                    }}>
                    €
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}

      {entries.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--tb-text-faint)', fontSize: 13, padding: 40 }}>
          Nessuna registrazione per {monthLabel}
        </div>
      )}
    </div>
  );
}

function NavBtn({ onClick, children, small }) {
  return (
    <button onClick={onClick} style={{
      background: 'var(--tb-navbtn-bg)', border: '1px solid var(--tb-navbtn-border)', borderRadius: 5,
      padding: small ? '3px 9px' : '3px 8px', cursor: 'pointer',
      fontSize: small ? 10 : 14, fontWeight: 700, color: 'var(--tb-navbtn-text)',
      fontFamily: "'Open Sans', sans-serif", lineHeight: 1.4,
    }}>
      {children}
    </button>
  );
}
