import React, { useState } from 'react';

const BILLING_OPTIONS = ['hourly', 'fixed', 'budget'];
const COLORS = ['#4A8FE8', '#E07B3A', '#3DB33D', '#9B59B6', '#E05252', '#1AB8A0', '#E8A834'];

const formLabel = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--tb-text-secondary)',
  letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4,
};
const formInput = {
  width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--tb-input-border)',
  fontFamily: "'Open Sans', sans-serif", fontSize: 13, color: 'var(--tb-input-text)',
  background: 'var(--tb-input-bg)', outline: 'none',
};

export default function ClientsScreen({ clients, projects, setClients, setProjects }) {
  const [selectedId, setSelectedId] = useState(clients[0]?.id);
  const sel = clients.find(c => c.id === selectedId);
  const selProjects = projects.filter(p => p.clientId === selectedId);

  function updateClient(field, value) {
    setClients(prev => prev.map(c => {
      if (c.id !== selectedId) return c;
      const updated = { ...c, [field]: value };
      window.api.saveClient(updated);
      return updated;
    }));
  }

  function addClient() {
    const id = crypto.randomUUID();
    const newClient = {
      id, name: 'Nuovo cliente', color: COLORS[clients.length % COLORS.length],
      billing: 'hourly', rate: null, limitType: 'monthly', limitHours: 40, carryover: false,
    };
    window.api.saveClient(newClient);
    setClients(prev => [...prev, newClient]);
    setSelectedId(id);
  }

  function addProject() {
    if (!selectedId) return;
    const newProject = {
      id: crypto.randomUUID(), clientId: selectedId,
      name: 'Nuovo progetto', budgetHours: null,
    };
    window.api.saveProject(newProject);
    setProjects(prev => [...prev, newProject]);
  }

  function updateProject(projectId, field, value) {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      const updated = { ...p, [field]: value };
      window.api.saveProject(updated);
      return updated;
    }));
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, height: 'calc(100vh - 140px)' }}>

      {/* Client list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <SectionLabel>Clienti ({clients.length})</SectionLabel>
        {clients.map(c => (
          <button key={c.id} onClick={() => setSelectedId(c.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 6,
              background: selectedId === c.id ? 'var(--tb-panel-bg)' : 'transparent',
              border: selectedId === c.id ? '1px solid var(--tb-border)' : '1px solid transparent',
              cursor: 'pointer', textAlign: 'left', transition: 'all 0.1s',
            }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: selectedId === c.id ? 700 : 400, color: 'var(--tb-text-primary)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
              <div style={{ fontSize: 10, color: 'var(--tb-text-faint)' }}>{c.billing} · {c.limitHours}h/{c.limitType === 'weekly' ? 'sett' : 'mese'}</div>
            </div>
          </button>
        ))}
        <button onClick={addClient}
          style={{
            marginTop: 8, padding: '8px 12px', borderRadius: 6, border: '1px dashed var(--tb-input-border)',
            background: 'transparent', color: 'var(--tb-text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            fontFamily: "'Open Sans', sans-serif",
          }}>
          + Nuovo cliente
        </button>
      </div>

      {/* Config panel */}
      {sel && (
        <div style={{ background: 'var(--tb-panel-bg)', borderRadius: 8, border: '1px solid var(--tb-panel-border)', padding: 24, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--tb-border-soft)' }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: sel.color }} />
            <input
              value={sel.name}
              onChange={e => updateClient('name', e.target.value)}
              style={{ ...formInput, fontSize: 18, fontWeight: 800, border: 'none', padding: 0, flex: 1, background: 'transparent' }} />
          </div>

          <SectionLabel>Configurazione</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 8, marginBottom: 24 }}>

            <div>
              <label style={formLabel}>Tipo billing</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {BILLING_OPTIONS.map(b => (
                  <button key={b} onClick={() => updateClient('billing', b)}
                    style={{
                      flex: 1, padding: '5px 4px', borderRadius: 5, fontSize: 10, fontWeight: 700,
                      border: sel.billing === b ? `2px solid ${sel.color}` : '1px solid var(--tb-border-mid)',
                      background: sel.billing === b ? sel.color + '15' : 'transparent',
                      color: sel.billing === b ? sel.color : 'var(--tb-text-secondary)', cursor: 'pointer',
                      fontFamily: "'Open Sans', sans-serif",
                    }}>
                    {b}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={formLabel}>Tariffa oraria (€)</label>
              <input type="number" style={formInput} value={sel.rate ?? ''} placeholder="—"
                onChange={e => updateClient('rate', e.target.value ? Number(e.target.value) : null)} />
            </div>

            <div>
              <label style={formLabel}>Colore</label>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {COLORS.map(col => (
                  <button key={col} onClick={() => updateClient('color', col)}
                    style={{
                      width: 22, height: 22, borderRadius: '50%', background: col,
                      border: sel.color === col ? '2px solid var(--tb-text-primary)' : '2px solid transparent',
                      cursor: 'pointer',
                    }} />
                ))}
              </div>
            </div>

            <div>
              <label style={formLabel}>Limite ore</label>
              <input type="number" style={formInput} value={sel.limitHours}
                onChange={e => updateClient('limitHours', Number(e.target.value))} />
            </div>

            <div>
              <label style={formLabel}>Periodo limite</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {['weekly', 'monthly'].map(t => (
                  <button key={t} onClick={() => updateClient('limitType', t)}
                    style={{
                      flex: 1, padding: '5px 4px', borderRadius: 5, fontSize: 10, fontWeight: 700,
                      border: sel.limitType === t ? `2px solid ${sel.color}` : '1px solid var(--tb-border-mid)',
                      background: sel.limitType === t ? sel.color + '15' : 'transparent',
                      color: sel.limitType === t ? sel.color : 'var(--tb-text-secondary)', cursor: 'pointer',
                      fontFamily: "'Open Sans', sans-serif",
                    }}>
                    {t === 'weekly' ? 'Sett.' : 'Mese'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={formLabel}>Carry-over ore</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {[true, false].map(v => (
                  <button key={String(v)} onClick={() => updateClient('carryover', v)}
                    style={{
                      flex: 1, padding: '5px 4px', borderRadius: 5, fontSize: 10, fontWeight: 700,
                      border: sel.carryover === v ? `2px solid ${sel.color}` : '1px solid var(--tb-border-mid)',
                      background: sel.carryover === v ? sel.color + '15' : 'transparent',
                      color: sel.carryover === v ? sel.color : 'var(--tb-text-secondary)', cursor: 'pointer',
                      fontFamily: "'Open Sans', sans-serif",
                    }}>
                    {v ? 'Sì' : 'No'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--tb-border-soft)', paddingTop: 20 }}>
            <SectionLabel>Progetti ({selProjects.length})</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {selProjects.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  background: 'var(--tb-panel-bg-soft)', borderRadius: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: sel.color }} />
                  <input
                    value={p.name}
                    onChange={e => updateProject(p.id, 'name', e.target.value)}
                    style={{ flex: 1, fontSize: 13, color: 'var(--tb-text-primary)', fontWeight: 600,
                      border: 'none', background: 'transparent', outline: 'none',
                      fontFamily: "'Open Sans', sans-serif" }} />
                  <input
                    type="number"
                    value={p.budgetHours ?? ''}
                    placeholder="budget h"
                    onChange={e => updateProject(p.id, 'budgetHours', e.target.value ? Number(e.target.value) : null)}
                    style={{ width: 80, fontSize: 11, color: 'var(--tb-text-faint)', textAlign: 'right',
                      border: 'none', background: 'transparent', outline: 'none',
                      fontFamily: "'Open Sans', sans-serif" }} />
                  {p.budgetHours && <span style={{ fontSize: 11, color: 'var(--tb-text-faint)' }}>h</span>}
                </div>
              ))}
              <button onClick={addProject}
                style={{
                  padding: '8px 14px', borderRadius: 6, border: '1px dashed var(--tb-input-border)',
                  background: 'transparent', color: 'var(--tb-text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'Open Sans', sans-serif", textAlign: 'left', marginTop: 2,
                }}>
                + Nuovo progetto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
      color: 'var(--tb-text-muted)', marginBottom: 8 }}>
      {children}
    </div>
  );
}
