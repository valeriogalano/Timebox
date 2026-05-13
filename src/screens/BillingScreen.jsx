import React, { useState, useEffect } from 'react';
import { getToday, MONTHS_IT, fmtH, fmt } from '../utils';

const QUARTER_LABELS = ['Q1 (Gen–Mar)', 'Q2 (Apr–Giu)', 'Q3 (Lug–Set)', 'Q4 (Ott–Dic)'];

function pad(n) { return String(n).padStart(2, '0'); }

function monthRange(year, monthIdx) {
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  return {
    from: `${year}-${pad(monthIdx + 1)}-01`,
    to:   `${year}-${pad(monthIdx + 1)}-${pad(lastDay)}`,
  };
}

function quarterRange(year, q) {
  const startMonth = q * 3;
  const endMonth   = startMonth + 2;
  const lastDay    = new Date(year, endMonth + 1, 0).getDate();
  return {
    from: `${year}-${pad(startMonth + 1)}-01`,
    to:   `${year}-${pad(endMonth + 1)}-${pad(lastDay)}`,
  };
}

export default function BillingScreen({ clients, projects, screen }) {
  const today = getToday();
  const [entries, setEntries] = useState([]);
  const [mode, setMode] = useState('month'); // 'month' | 'quarter' | 'custom'
  const [offset, setOffset] = useState(0);
  const [customFrom, setCustomFrom] = useState(fmt(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [customTo,   setCustomTo]   = useState(fmt(today));

  const currentYear  = today.getFullYear();
  const currentMonth = today.getMonth();
  const currentQ     = Math.floor(currentMonth / 3);

  let from, to, periodLabel;
  if (mode === 'month') {
    const d = new Date(currentYear, currentMonth + offset, 1);
    const r = monthRange(d.getFullYear(), d.getMonth());
    from = r.from; to = r.to;
    periodLabel = `${MONTHS_IT[d.getMonth()]} ${d.getFullYear()}`;
  } else if (mode === 'quarter') {
    const totalQ = currentYear * 4 + currentQ + offset;
    const y = Math.floor(totalQ / 4);
    const q = totalQ % 4;
    const r = quarterRange(y, q);
    from = r.from; to = r.to;
    periodLabel = `${QUARTER_LABELS[q]} ${y}`;
  } else {
    from = customFrom; to = customTo;
    periodLabel = `${customFrom} → ${customTo}`;
  }

  useEffect(() => {
    if (screen !== 'billing') return;
    if (mode === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return;
    window.api.getEntries(from, to).then(setEntries);
  }, [screen, from, to]);

  async function toggleBilled(entry) {
    const updated = { ...entry, billed: !entry.billed };
    await window.api.saveEntry(updated);
    setEntries(prev => prev.map(e => e.id === entry.id ? updated : e));
  }

  async function markAll(entriesToMark, billed) {
    const label = billed ? 'Segnare tutte le entry come fatturate?' : 'Segnare tutte le entry come non fatturate?';
    if (!window.confirm(label)) return;
    const updated = entriesToMark.map(e => ({ ...e, billed }));
    await Promise.all(updated.map(e => window.api.saveEntry(e)));
    setEntries(prev => prev.map(e => {
      const u = updated.find(u2 => u2.id === e.id);
      return u ?? e;
    }));
  }

  const billableClients = clients.filter(c => c.billing !== 'none');
  const billablePids = new Set(projects.filter(p => billableClients.some(c => c.id === p.clientId)).map(p => p.id));
  const billableEntries = entries.filter(e => billablePids.has(e.projectId));
  const grandTotalH = billableEntries.reduce((s, e) => s + e.hours, 0);
  const grandUnbilledH = billableEntries.filter(e => !e.billed).reduce((s, e) => s + e.hours, 0);
  const grandTotalEur = billableClients.reduce((s, client) => {
    if (client.billing !== 'hourly' || !client.rate) return s;
    const pids = projects.filter(p => p.clientId === client.id).map(p => p.id);
    const h = entries.filter(e => pids.includes(e.projectId)).reduce((a, e) => a + e.hours, 0);
    return s + h * client.rate;
  }, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Period navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Left: navigator */}
        {mode !== 'custom' && <NavBtn onClick={() => setOffset(o => o - 1)}>‹</NavBtn>}
        {mode === 'custom' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ fontSize: 12, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--tb-border-mid)',
                background: 'var(--tb-input-bg)', color: 'var(--tb-text-primary)', fontFamily: "'Open Sans', sans-serif" }} />
            <span style={{ fontSize: 11, color: 'var(--tb-text-faint)' }}>→</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ fontSize: 12, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--tb-border-mid)',
                background: 'var(--tb-input-bg)', color: 'var(--tb-text-primary)', fontFamily: "'Open Sans', sans-serif" }} />
          </div>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tb-text-primary)', minWidth: 160, textAlign: 'center' }}>{periodLabel}</span>
        )}
        {mode !== 'custom' && <NavBtn onClick={() => setOffset(o => o + 1)}>›</NavBtn>}
        {mode !== 'custom' && offset !== 0 && <NavBtn small onClick={() => setOffset(0)}>Oggi</NavBtn>}

        {/* Right: mode selector */}
        <div style={{ marginLeft: 'auto' }}>
          <Segmented
            value={mode}
            options={[{ v: 'month', l: 'Mese' }, { v: 'quarter', l: 'Trimestre' }, { v: 'custom', l: 'Personalizzato' }]}
            onChange={m => { setMode(m); setOffset(0); }}
            small
          />
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <Card>
          <CardLabel>Da fatturare</CardLabel>
          <div style={{ fontSize: 30, fontWeight: 800, color: grandUnbilledH > 0 ? '#E07B3A' : 'var(--tb-text-muted)', letterSpacing: '-0.02em', lineHeight: 1 }}>
            {fmtH(grandUnbilledH)}
          </div>
          {grandTotalEur > 0 && grandUnbilledH > 0 && (
            <div style={{ fontSize: 13, fontWeight: 700, color: '#E07B3A', marginTop: 6 }}>
              €{(billableClients.reduce((s, c) => {
                if (c.billing !== 'hourly' || !c.rate) return s;
                const pids = projects.filter(p => p.clientId === c.id).map(p => p.id);
                const h = billableEntries.filter(e => pids.includes(e.projectId) && !e.billed).reduce((a, e) => a + e.hours, 0);
                return s + h * c.rate;
              }, 0)).toFixed(0)}
            </div>
          )}
        </Card>
        <Card>
          <CardLabel>Fatturate</CardLabel>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#3DB33D', letterSpacing: '-0.02em', lineHeight: 1 }}>
            {fmtH(grandTotalH - grandUnbilledH)}
          </div>
          {grandTotalEur > 0 && (grandTotalH - grandUnbilledH) > 0 && (
            <div style={{ fontSize: 13, fontWeight: 700, color: '#3DB33D', marginTop: 6 }}>
              €{(billableClients.reduce((s, c) => {
                if (c.billing !== 'hourly' || !c.rate) return s;
                const pids = projects.filter(p => p.clientId === c.id).map(p => p.id);
                const h = billableEntries.filter(e => pids.includes(e.projectId) && e.billed).reduce((a, e) => a + e.hours, 0);
                return s + h * c.rate;
              }, 0)).toFixed(0)}
            </div>
          )}
        </Card>
        <Card>
          <CardLabel>Totale ore</CardLabel>
          <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--tb-text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
            {fmtH(grandTotalH)}
          </div>
          {grandTotalEur > 0 && (
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tb-text-primary)', marginTop: 6 }}>
              €{grandTotalEur.toFixed(0)}
            </div>
          )}
        </Card>
      </div>

      {/* Per-client sections */}
      {billableClients.map(client => {
        const clientProjects = projects.filter(p => p.clientId === client.id);
        const clientPids = clientProjects.map(p => p.id);
        const clientEntries = entries.filter(e => clientPids.includes(e.projectId));
        if (!clientEntries.length) return null;

        const totalH    = clientEntries.reduce((s, e) => s + e.hours, 0);
        const billedH   = clientEntries.filter(e => e.billed).reduce((s, e) => s + e.hours, 0);
        const unbilledH = totalH - billedH;
        const hourlyRate = client.billing === 'hourly' && client.rate ? client.rate : null;
        const unbilledEntries = clientEntries.filter(e => !e.billed);

        return (
          <div key={client.id} style={{ background: 'var(--tb-panel-bg)', borderRadius: 8, border: '1px solid var(--tb-panel-border)', overflow: 'hidden' }}>

            {/* Client header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--tb-border-soft)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: client.color, flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--tb-text-primary)', flex: 1 }}>{client.name}</span>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
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
                {unbilledEntries.length > 0
                  ? <BulkBtn onClick={() => markAll(unbilledEntries, true)}>Segna tutte fatturate</BulkBtn>
                  : <BulkBtn muted onClick={() => markAll(clientEntries, false)}>Rimuovi fatturazione</BulkBtn>
                }
              </div>
            </div>

            {/* Per-project sub-sections */}
            {clientProjects.map((project, pi) => {
              const projectEntries = clientEntries
                .filter(e => e.projectId === project.id)
                .sort((a, b) => a.date.localeCompare(b.date));
              if (!projectEntries.length) return null;

              const projTotalH    = projectEntries.reduce((s, e) => s + e.hours, 0);
              const projBilledH   = projectEntries.filter(e => e.billed).reduce((s, e) => s + e.hours, 0);
              const projUnbilledH = projTotalH - projBilledH;
              const projUnbilledEntries = projectEntries.filter(e => !e.billed);
              const isLastProject = pi === clientProjects.filter(p => clientEntries.some(e => e.projectId === p.id)).length - 1;

              return (
                <div key={project.id} style={{ borderBottom: isLastProject ? 'none' : '1px solid var(--tb-border-soft)' }}>

                  {/* Project sub-header */}
                  <div style={{
                    padding: '8px 16px 8px 32px', display: 'flex', alignItems: 'center', gap: 10,
                    background: 'var(--tb-sidebar-bg)', borderBottom: '1px solid var(--tb-border-soft)',
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tb-text-secondary)', flex: 1 }}>{project.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--tb-text-secondary)' }}>
                      <span style={{ color: '#3DB33D', fontWeight: 700 }}>{fmtH(projBilledH)}</span> fatt.
                    </span>
                    {projUnbilledH > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--tb-text-secondary)' }}>
                        <span style={{ color: '#E07B3A', fontWeight: 700 }}>{fmtH(projUnbilledH)}</span> da fatt.
                      </span>
                    )}
                    {hourlyRate && (
                      <span style={{ fontSize: 11, color: 'var(--tb-text-faint)', minWidth: 45, textAlign: 'right' }}>
                        €{(projTotalH * hourlyRate).toFixed(0)}
                      </span>
                    )}
                    {projUnbilledEntries.length > 0
                      ? <BulkBtn small onClick={() => markAll(projUnbilledEntries, true)}>Segna tutte fatturate</BulkBtn>
                      : <BulkBtn small muted onClick={() => markAll(projectEntries, false)}>Rimuovi fatturazione</BulkBtn>
                    }
                  </div>

                  {/* Entry rows */}
                  {projectEntries.map((entry, i) => {
                    const isLast = i === projectEntries.length - 1;
                    const dateLabel = new Date(entry.date + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
                    return (
                      <div key={entry.id} style={{
                        padding: '7px 16px 7px 32px', display: 'flex', alignItems: 'center', gap: 10,
                        borderBottom: isLast ? 'none' : '1px solid var(--tb-border-soft)',
                        opacity: entry.billed ? 1 : 0.75,
                      }}>
                        <span style={{ fontSize: 11, color: 'var(--tb-text-faint)', minWidth: 90 }}>{dateLabel}</span>
                        <span style={{ fontSize: 10, color: 'var(--tb-text-faint)', flex: 1 }}>{entry.slot?.toUpperCase()}</span>
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
          </div>
        );
      })}

      {billableEntries.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--tb-text-faint)', fontSize: 13, padding: 40 }}>
          Nessuna registrazione per {periodLabel}
        </div>
      )}
    </div>
  );
}

function BulkBtn({ onClick, children, small, muted }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 10, fontWeight: 700, cursor: 'pointer',
      padding: small ? '2px 7px' : '3px 8px',
      borderRadius: 4, fontFamily: "'Open Sans', sans-serif",
      border: `1px solid ${muted ? 'var(--tb-border-mid)' : '#3DB33D'}`,
      background: 'transparent',
      color: muted ? 'var(--tb-text-faint)' : '#3DB33D',
    }}>{children}</button>
  );
}

function Card({ children }) {
  return (
    <div style={{
      background: 'var(--tb-panel-bg)', border: '1px solid var(--tb-panel-border)',
      borderRadius: 10, padding: 16,
    }}>{children}</div>
  );
}

function CardLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
      color: 'var(--tb-text-muted)', marginBottom: 8,
    }}>{children}</div>
  );
}

function Segmented({ value, options, onChange, small }) {
  return (
    <div style={{
      display: 'inline-flex', padding: 2, borderRadius: 7,
      background: 'var(--tb-panel-bg-subtle)', border: '1px solid var(--tb-border-soft)',
    }}>
      {options.map(o => {
        const active = o.v === value;
        return (
          <button key={o.v} onClick={() => onChange(o.v)} style={{
            padding: small ? '4px 10px' : '5px 14px',
            border: 'none', borderRadius: 5, cursor: 'pointer',
            fontFamily: "'Open Sans',sans-serif",
            fontSize: small ? 11 : 12, fontWeight: active ? 800 : 600,
            background: active ? 'var(--tb-panel-bg)' : 'transparent',
            color: active ? 'var(--tb-text-primary)' : 'var(--tb-text-muted)',
            boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            letterSpacing: '0.01em',
          }}>{o.l}</button>
        );
      })}
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
