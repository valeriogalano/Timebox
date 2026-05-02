import React, { useState, useEffect } from 'react';
import { TODAY, getMondayOfWeek, fmt, fmtH } from '../utils';

export default function Dashboard({ clients, projects, screen }) {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    if (screen !== 'dashboard') return;
    const year = TODAY.getFullYear();
    const from = `${year}-01-01`;
    const to = fmt(TODAY);
    window.api.getEntries(from, to).then(setEntries);
  }, [screen]);

  const startOfWeek  = getMondayOfWeek(TODAY);
  const startOfMonth = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);

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

  const totalTracked     = entries.reduce((s, e) => s + e.hours, 0);
  const totalBilledEur   = clientStats.reduce((s, c) => s + (c.billing === 'hourly' && c.rate ? c.billedH * c.rate : 0), 0);
  const totalUnbilledEur = clientStats.reduce((s, c) => s + (c.billing === 'hourly' && c.rate ? c.unbilledH * c.rate : 0), 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>

      {/* Left: client utilization */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SectionLabel>Utilizzo ore per cliente</SectionLabel>
        {clientStats.map(c => <ClientCard key={c.id} client={c} totalTracked={totalTracked} />)}
      </div>

      {/* Right: billing + stats */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SectionLabel>Billing</SectionLabel>
        <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e8e7e0', overflow: 'hidden' }}>
          {clientStats.map((c, i) => {
            const bEur  = c.billing === 'hourly' && c.rate ? (c.billedH * c.rate).toFixed(0) : null;
            const ubEur = c.billing === 'hourly' && c.rate ? (c.unbilledH * c.rate).toFixed(0) : null;
            return (
              <div key={c.id} style={{ padding: '12px 16px', borderBottom: i < clientStats.length - 1 ? '1px solid #f0efe8' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#383838', flex: 1 }}>{c.name}</span>
                  <span style={{ fontSize: 10, color: '#bbb' }}>{c.billing}</span>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <BillingLine label="Fatturate"    hours={c.billedH}   eur={bEur}  positive />
                  <BillingLine label="Da fatturare" hours={c.unbilledH} eur={ubEur} />
                </div>
              </div>
            );
          })}
          <div style={{ padding: '12px 16px', background: '#f8f7f2', display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#bbb', marginBottom: 2 }}>Totale fatturato</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#3DB33D' }}>€{totalBilledEur.toFixed(0)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#bbb', marginBottom: 2 }}>Da fatturare</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#E07B3A' }}>€{totalUnbilledEur.toFixed(0)}</div>
            </div>
          </div>
        </div>

        <SectionLabel>Questo mese</SectionLabel>
        <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e8e7e0', padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <MonthStat label="Ore tracciate"    value={fmtH(clientStats.reduce((s, c) => s + c.monthH, 0))} />
            <MonthStat label="Ore questa sett." value={fmtH(clientStats.reduce((s, c) => s + c.weekH, 0))} />
            <MonthStat label="Clienti attivi"   value={clientStats.filter(c => c.monthH > 0).length} />
            <MonthStat label="Progetti aperti"  value={projects.length} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ClientCard({ client, totalTracked }) {
  const alertLevel = client.pct >= 90 ? 'high' : client.pct >= 75 ? 'medium' : null;
  const shareOfTotal = totalTracked > 0 ? ((client.weekH / totalTracked) * 100).toFixed(0) : 0;
  return (
    <div style={{ background: 'white', borderRadius: 8, padding: 16,
      border: `1px solid ${alertLevel === 'high' ? '#E0525240' : alertLevel === 'medium' ? '#F0A02040' : '#e8e7e0'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: client.color, flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: 14, color: '#383838', flex: 1 }}>{client.name}</span>
        {alertLevel && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
            color: alertLevel === 'high' ? '#E05252' : '#E07B3A',
            background: alertLevel === 'high' ? '#E0525215' : '#F0A02015' }}>
            {alertLevel === 'high' ? '⚠ Vicino al limite' : '↑ Attenzione'}
          </span>
        )}
        <span style={{ fontSize: 11, color: '#bbb', fontWeight: 600 }}>
          {client.billing === 'hourly' ? `€${client.rate}/h` : client.billing}
        </span>
      </div>
      <div style={{ background: '#f0efe8', borderRadius: 4, height: 5, marginBottom: 8, overflow: 'hidden' }}>
        <div style={{ height: 5, borderRadius: 4, transition: 'width 0.5s ease',
          background: alertLevel === 'high' ? '#E05252' : alertLevel === 'medium' ? '#E07B3A' : client.color,
          width: `${client.pct}%` }} />
      </div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: '#888' }}>
          {client.limitType === 'weekly' ? 'Sett.' : 'Mese'}:{' '}
          <strong style={{ color: '#383838' }}>{fmtH(client.usedH)}</strong>
          <span style={{ color: '#bbb' }}> / {fmtH(client.limitHours)}</span>
        </div>
        <div style={{ fontSize: 11, color: '#888' }}>Settimana: <strong style={{ color: '#383838' }}>{fmtH(client.weekH)}</strong></div>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: '#bbb', fontWeight: 600 }}>{shareOfTotal}% del tot.</div>
      </div>
    </div>
  );
}

function BillingLine({ label, hours, eur, positive }) {
  const color = positive ? '#3DB33D' : '#E07B3A';
  return (
    <div>
      <div style={{ fontSize: 9, color: '#bbb', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color }}>{fmtH(hours)}{eur ? ` · €${eur}` : ''}</div>
    </div>
  );
}

function MonthStat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#bbb', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#383838' }}>{value}</div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#aaa', marginBottom: 0 }}>
      {children}
    </div>
  );
}
