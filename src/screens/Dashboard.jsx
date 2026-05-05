import React, { useState, useEffect } from 'react';
import { TODAY, MONTHS_IT, getMondayOfWeek, fmtH } from '../utils';

export default function Dashboard({ clients, projects, screen }) {
  const [entries, setEntries] = useState([]);
  const [monthOffset, setMonthOffset] = useState(0);

  const selectedDate = new Date(TODAY.getFullYear(), TODAY.getMonth() + monthOffset, 1);
  const selectedYear = selectedDate.getFullYear();
  const selectedMonthIdx = selectedDate.getMonth();
  const monthLabel = `${MONTHS_IT[selectedMonthIdx]} ${selectedYear}`;
  const lastDay = new Date(selectedYear, selectedMonthIdx + 1, 0).getDate();
  const from = `${selectedYear}-${String(selectedMonthIdx + 1).padStart(2, '0')}-01`;
  const to   = `${selectedYear}-${String(selectedMonthIdx + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  useEffect(() => {
    if (screen !== 'dashboard') return;
    window.api.getEntries(from, to).then(setEntries);
  }, [screen, from, to]);

  const startOfWeek  = getMondayOfWeek(TODAY);
  const startOfMonth = new Date(selectedYear, selectedMonthIdx, 1);

  const clientStats = clients.map(client => {
    const pids      = projects.filter(p => p.clientId === client.id).map(p => p.id);
    const all       = entries.filter(e => pids.includes(e.projectId));
    const week      = all.filter(e => new Date(e.date) >= startOfWeek);
    const month     = all.filter(e => new Date(e.date) >= startOfMonth);
    const billedH   = all.filter(e => e.billed).reduce((s, e) => s + e.hours, 0);
    const unbilledH = all.filter(e => !e.billed).reduce((s, e) => s + e.hours, 0);
    const weekH     = week.reduce((s, e) => s + e.hours, 0);
    const monthH    = month.reduce((s, e) => s + e.hours, 0);
    const usedH     = client.limitType === 'weekly' ? weekH : monthH;
    const pct       = Math.min(100, client.limitHours > 0 ? (usedH / client.limitHours) * 100 : 0);
    return { ...client, weekH, monthH, billedH, unbilledH, usedH, pct };
  });

  const billableStats    = clientStats.filter(c => c.billable);
  const totalTracked     = entries.reduce((s, e) => s + e.hours, 0);
  const totalBilledEur   = billableStats.reduce((s, c) => s + (c.billing === 'hourly' && c.rate ? c.billedH * c.rate : 0), 0);
  const totalUnbilledEur = billableStats.reduce((s, c) => s + (c.billing === 'hourly' && c.rate ? c.unbilledH * c.rate : 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <NavBtn onClick={() => setMonthOffset(o => o - 1)}>‹</NavBtn>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tb-text-primary)', minWidth: 110, textAlign: 'center' }}>{monthLabel}</span>
        <NavBtn onClick={() => setMonthOffset(o => o + 1)}>›</NavBtn>
        {monthOffset !== 0 && <NavBtn small onClick={() => setMonthOffset(0)}>Oggi</NavBtn>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>

      {/* Left: area utilization */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SectionLabel>Utilizzo ore per area</SectionLabel>
        {clientStats.map(c => <ClientCard key={c.id} client={c} totalTracked={totalTracked} />)}
      </div>

      {/* Right: billing + stats */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SectionLabel>Billing</SectionLabel>
        <div style={{ background: 'var(--tb-panel-bg)', borderRadius: 8, border: '1px solid var(--tb-panel-border)', overflow: 'hidden' }}>
          {billableStats.length === 0 && (
            <div style={{ padding: '16px', fontSize: 12, color: 'var(--tb-text-faint)', textAlign: 'center' }}>
              Nessuna area fatturabile
            </div>
          )}
          {billableStats.map((c, i) => {
            const bEur  = c.billing === 'hourly' && c.rate ? (c.billedH * c.rate).toFixed(0) : null;
            const ubEur = c.billing === 'hourly' && c.rate ? (c.unbilledH * c.rate).toFixed(0) : null;
            return (
              <div key={c.id} style={{ padding: '12px 16px', borderBottom: i < billableStats.length - 1 ? '1px solid var(--tb-border-soft)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tb-text-primary)', flex: 1 }}>{c.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--tb-text-faint)' }}>{c.billing === 'hourly' ? 'A ore' : 'Fisso'}</span>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <BillingLine label="Fatturate"    hours={c.billedH}   eur={bEur}  positive />
                  <BillingLine label="Da fatturare" hours={c.unbilledH} eur={ubEur} />
                </div>
              </div>
            );
          })}
          <div style={{ padding: '12px 16px', background: 'var(--tb-panel-bg-soft)', display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--tb-text-faint)', marginBottom: 2 }}>Totale fatturato</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#3DB33D' }}>€{totalBilledEur.toFixed(0)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--tb-text-faint)', marginBottom: 2 }}>Da fatturare</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#E07B3A' }}>€{totalUnbilledEur.toFixed(0)}</div>
            </div>
          </div>
        </div>

        <SectionLabel>{monthLabel}</SectionLabel>
        <div style={{ background: 'var(--tb-panel-bg)', borderRadius: 8, border: '1px solid var(--tb-panel-border)', padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <MonthStat label="Ore tracciate"    value={fmtH(clientStats.reduce((s, c) => s + c.monthH, 0))} />
            <MonthStat label="Ore questa sett." value={fmtH(clientStats.reduce((s, c) => s + c.weekH, 0))} />
            <MonthStat label="Aree attive"       value={clientStats.filter(c => c.monthH > 0).length} />
            <MonthStat label="Progetti aperti"  value={projects.length} />
          </div>
        </div>
      </div>
      </div>
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

function ClientCard({ client, totalTracked }) {
  const alertLevel = client.pct >= 90 ? 'high' : client.pct >= 75 ? 'medium' : null;
  const shareOfTotal = totalTracked > 0 ? ((client.weekH / totalTracked) * 100).toFixed(0) : 0;
  return (
    <div style={{ background: 'var(--tb-panel-bg)', borderRadius: 8, padding: 16,
      border: `1px solid ${alertLevel === 'high' ? '#E0525240' : alertLevel === 'medium' ? '#F0A02040' : 'var(--tb-panel-border)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: client.color, flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--tb-text-primary)', flex: 1 }}>{client.name}</span>
        {alertLevel && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
            color: alertLevel === 'high' ? '#E05252' : '#E07B3A',
            background: alertLevel === 'high' ? '#E0525215' : '#F0A02015' }}>
            {alertLevel === 'high' ? '⚠ Vicino al limite' : '↑ Attenzione'}
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--tb-text-faint)', fontWeight: 600 }}>
          {client.billing === 'hourly' ? `€${client.rate}/h` : client.billing}
        </span>
      </div>
      <div style={{ background: 'var(--tb-panel-bg-subtle)', borderRadius: 4, height: 5, marginBottom: 8, overflow: 'hidden' }}>
        <div style={{ height: 5, borderRadius: 4, transition: 'width 0.5s ease',
          background: alertLevel === 'high' ? '#E05252' : alertLevel === 'medium' ? '#E07B3A' : client.color,
          width: `${client.pct}%` }} />
      </div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--tb-text-secondary)' }}>
          {client.limitType === 'weekly' ? 'Sett.' : 'Mese'}:{' '}
          <strong style={{ color: 'var(--tb-text-primary)' }}>{fmtH(client.usedH)}</strong>
          <span style={{ color: 'var(--tb-text-faint)' }}> / {fmtH(client.limitHours)}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--tb-text-secondary)' }}>Settimana: <strong style={{ color: 'var(--tb-text-primary)' }}>{fmtH(client.weekH)}</strong></div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--tb-text-faint)', fontWeight: 600 }}>{shareOfTotal}% del tot.</div>
      </div>
    </div>
  );
}

function BillingLine({ label, hours, eur, positive }) {
  const color = positive ? '#3DB33D' : '#E07B3A';
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--tb-text-faint)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color }}>{fmtH(hours)}{eur ? ` · €${eur}` : ''}</div>
    </div>
  );
}

function MonthStat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--tb-text-faint)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--tb-text-primary)' }}>{value}</div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--tb-text-muted)', marginBottom: 0 }}>
      {children}
    </div>
  );
}
