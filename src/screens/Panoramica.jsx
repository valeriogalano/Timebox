import React, { useState, useEffect } from 'react';
import { getToday, MONTHS_IT, getMondayOfWeek, fmtH } from '../utils';

export default function Panoramica({ clients, projects, screen }) {
  const [entries, setEntries] = useState([]);
  const [projectTotals, setProjectTotals] = useState({});
  const [monthOffset, setMonthOffset] = useState(0);

  const selectedDate = new Date(getToday().getFullYear(), getToday().getMonth() + monthOffset, 1);
  const selectedYear = selectedDate.getFullYear();
  const selectedMonthIdx = selectedDate.getMonth();
  const monthLabel = `${MONTHS_IT[selectedMonthIdx]} ${selectedYear}`;
  const lastDay = new Date(selectedYear, selectedMonthIdx + 1, 0).getDate();
  const from = `${selectedYear}-${String(selectedMonthIdx + 1).padStart(2, '0')}-01`;
  const to   = `${selectedYear}-${String(selectedMonthIdx + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  useEffect(() => {
    if (screen !== 'panoramica') return;
    window.api.getEntries(from, to).then(setEntries);
    window.api.getProjectTotals().then(setProjectTotals);
  }, [screen, from, to]);

  const startOfWeek = getMondayOfWeek(getToday());

  function clientPids(client) {
    return projects.filter(p => p.clientId === client.id).map(p => p.id);
  }

  function weeksElapsedInMonth(pids) {
    const weeks = new Set(
      entries
        .filter(e => pids.includes(e.projectId))
        .map(e => {
          const d = new Date(e.date + 'T00:00:00');
          const dow = d.getDay();
          d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
          return d.toISOString().slice(0, 10);
        })
    );
    return Math.max(1, weeks.size);
  }

  const clientStats = clients.map(client => {
    const pids    = clientPids(client);
    const all     = entries.filter(e => pids.includes(e.projectId));
    const week    = all.filter(e => new Date(e.date + 'T00:00:00') >= startOfWeek);
    const weekH   = week.reduce((s, e) => s + e.hours, 0);
    const monthH  = all.reduce((s, e) => s + e.hours, 0);
    const weeksEl = weeksElapsedInMonth(pids);
    const avgWeekH = monthH / weeksEl;
    return { ...client, weekH, monthH, avgWeekH, weeksEl };
  });

  const billableClients = clientStats.filter(c => c.billable && c.billing === 'hourly' && c.rate);
  const totalBillable = billableClients.reduce((s, c) => s + c.monthH * c.rate, 0);

  const activeProjects = projects.filter(p => !p.archived && p.budgetHours > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <NavBtn onClick={() => setMonthOffset(o => o - 1)}>‹</NavBtn>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tb-text-primary)', minWidth: 110, textAlign: 'center' }}>{monthLabel}</span>
        <NavBtn onClick={() => setMonthOffset(o => o + 1)}>›</NavBtn>
        {monthOffset !== 0 && <NavBtn small onClick={() => setMonthOffset(0)}>Oggi</NavBtn>}
      </div>

      {/* Section 1: Fatturabile del mese */}
      {billableClients.length > 0 && (
        <Section label="Fatturabile del mese">
          <div style={{ background: 'var(--tb-panel-bg)', borderRadius: 8, border: '1px solid var(--tb-panel-border)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'baseline', gap: 12, borderBottom: '1px solid var(--tb-border-soft)' }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#3DB33D' }}>€{totalBillable.toFixed(0)}</span>
              <span style={{ fontSize: 11, color: 'var(--tb-text-faint)' }}>{fmtH(billableClients.reduce((s, c) => s + c.monthH, 0))} fatturabili</span>
            </div>
            {billableClients.map((c, i) => (
              <div key={c.id} style={{
                padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
                borderBottom: i < billableClients.length - 1 ? '1px solid var(--tb-border-soft)' : 'none',
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tb-text-primary)', flex: 1 }}>{c.name}</span>
                <span style={{ fontSize: 11, color: 'var(--tb-text-secondary)' }}>{fmtH(c.monthH)}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#3DB33D' }}>€{(c.monthH * c.rate).toFixed(0)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Section 2: Stato aree */}
      <Section label="Stato aree">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {clientStats.map(c => <AreaCard key={c.id} client={c} />)}
        </div>
      </Section>

      {/* Section 3: Budget progetti */}
      {activeProjects.length > 0 && (
        <Section label="Budget progetti">
          <div style={{ background: 'var(--tb-panel-bg)', borderRadius: 8, border: '1px solid var(--tb-panel-border)', overflow: 'hidden' }}>
            {clients.map(client => {
              const cProjects = activeProjects.filter(p => p.clientId === client.id);
              if (!cProjects.length) return null;
              return (
                <div key={client.id}>
                  <div style={{ padding: '10px 16px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: client.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: client.color }}>{client.name}</span>
                  </div>
                  {cProjects.map((p, i) => {
                    const logged = projectTotals[p.id] ?? 0;
                    const pct = Math.min(1, logged / p.budgetHours);
                    const pctNum = Math.round(pct * 100);
                    const alertLevel = pct >= 1 ? 3 : pct >= 0.8 ? 2 : pct >= 0.5 ? 1 : 0;
                    const barColor = alertLevel === 3 ? '#E05252' : alertLevel === 2 ? '#E07B3A' : alertLevel === 1 ? '#E0C020' : client.color;
                    const isLast = i === cProjects.length - 1;
                    return (
                      <div key={p.id} style={{
                        padding: '8px 16px 10px 28px',
                        borderBottom: isLast ? '1px solid var(--tb-border-soft)' : 'none',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                          <span style={{ fontSize: 12, color: 'var(--tb-text-primary)', flex: 1 }}>{p.name}</span>
                          {alertLevel > 0 && (
                            <span style={{
                              fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 100,
                              color: barColor, background: barColor + '18',
                            }}>
                              {alertLevel === 3 ? 'Esaurito' : alertLevel === 2 ? 'Attenzione' : 'Metà budget'}
                            </span>
                          )}
                          <span style={{ fontSize: 11, color: 'var(--tb-text-secondary)', whiteSpace: 'nowrap' }}>
                            {fmtH(logged)} / {fmtH(p.budgetHours)}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--tb-text-faint)', minWidth: 28, textAlign: 'right' }}>{pctNum}%</span>
                        </div>
                        <div style={{ background: client.color + '1f', borderRadius: 3, height: 4, overflow: 'hidden' }}>
                          <div style={{
                            height: 4, borderRadius: 3, background: barColor,
                            width: `${pctNum}%`, transition: 'width 0.5s ease',
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}

function AreaCard({ client }) {
  const weekPct = client.limitHours > 0 ? Math.min(100, (client.weekH / client.limitHours) * 100) : null;
  const avgPct  = client.limitHours > 0 ? Math.min(100, (client.avgWeekH / client.limitHours) * 100) : null;

  function alertColor(pct) {
    if (pct == null) return client.color;
    if (pct >= 100) return '#E05252';
    if (pct >= 80)  return '#E07B3A';
    if (pct >= 50)  return '#E0C020';
    return client.color;
  }

  return (
    <div style={{
      background: 'var(--tb-panel-bg)', borderRadius: 8, padding: '12px 16px',
      border: `1px solid ${weekPct >= 100 ? '#E0525240' : weekPct >= 80 ? '#E07B3A40' : 'var(--tb-panel-border)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: client.limitHours > 0 ? 10 : 0 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: client.color, flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--tb-text-primary)', flex: 1 }}>{client.name}</span>
        <span style={{ fontSize: 11, color: 'var(--tb-text-faint)' }}>
          {client.monthH > 0 ? `${fmtH(client.monthH)} questo mese` : 'Nessuna ora'}
        </span>
      </div>

      {client.limitHours > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <BarRow
            label="Questa settimana"
            hours={client.weekH}
            limit={client.limitHours}
            pct={weekPct}
            color={alertColor(weekPct)}
          />
          <BarRow
            label={`Media settimanale (${client.weeksEl} sett.)`}
            hours={client.avgWeekH}
            limit={client.limitHours}
            pct={avgPct}
            color={alertColor(avgPct)}
          />
        </div>
      )}
    </div>
  );
}

function BarRow({ label, hours, limit, pct, color }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: 'var(--tb-text-faint)', flex: 1 }}>{label}</span>
        <span style={{ fontSize: 11, color: 'var(--tb-text-secondary)' }}>
          <strong style={{ color: 'var(--tb-text-primary)' }}>{fmtH(hours)}</strong>
          <span style={{ color: 'var(--tb-text-faint)' }}> / {fmtH(limit)}</span>
        </span>
        <span style={{ fontSize: 10, color, fontWeight: 700, minWidth: 30, textAlign: 'right' }}>{Math.round(pct)}%</span>
      </div>
      <div style={{ background: 'var(--tb-panel-bg-subtle)', borderRadius: 3, height: 4, overflow: 'hidden' }}>
        <div style={{ height: 4, borderRadius: 3, background: color, width: `${pct}%`, transition: 'width 0.5s ease' }} />
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

function Section({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--tb-text-muted)' }}>
        {label}
      </div>
      {children}
    </div>
  );
}
