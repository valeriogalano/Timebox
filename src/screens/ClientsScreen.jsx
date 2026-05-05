import React, { useState } from 'react';

const BILLING_OPTIONS = ['hourly', 'fixed'];
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

function DragHandle() {
  return (
    <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor"
      style={{ flexShrink: 0, color: 'var(--tb-text-faint)', cursor: 'grab' }}>
      <circle cx="2" cy="2" r="1.2"/><circle cx="6" cy="2" r="1.2"/>
      <circle cx="2" cy="6" r="1.2"/><circle cx="6" cy="6" r="1.2"/>
      <circle cx="2" cy="10" r="1.2"/><circle cx="6" cy="10" r="1.2"/>
    </svg>
  );
}

function Divider() {
  return (
    <div style={{
      height: 2, borderRadius: 1,
      background: '#4A8FE8',
      margin: '1px 0',
      flexShrink: 0,
    }} />
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

export default function ClientsScreen({ clients, projects, setClients, setProjects }) {
  const [selectedId, setSelectedId] = useState(clients[0]?.id);
  const sel = clients.find(c => c.id === selectedId);
  const selProjects = projects
    .filter(p => p.clientId === selectedId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  // Area DnD
  const [draggingAreaId, setDraggingAreaId]     = useState(null);
  const [areaInsertIdx, setAreaInsertIdx]       = useState(null);

  // Project DnD
  const [draggingProjectId, setDraggingProjectId] = useState(null);
  const [projectInsertIdx, setProjectInsertIdx]   = useState(null);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function insertReorder(list, fromId, insertAt) {
    const fromIdx = list.findIndex(item => item.id === fromId);
    if (fromIdx === -1) return list;
    let at = insertAt;
    if (fromIdx < at) at--;
    if (at === fromIdx) return list;
    const result = [...list];
    const [removed] = result.splice(fromIdx, 1);
    result.splice(at, 0, removed);
    return result;
  }

  // ── Area handlers ─────────────────────────────────────────────────────────

  function updateClient(field, value) {
    setClients(prev => prev.map(c => {
      if (c.id !== selectedId) return c;
      const updated = { ...c, [field]: value };
      window.api.saveClient(updated);
      return updated;
    }));
  }

  function addClient() {
    const maxPos = clients.reduce((max, c) => Math.max(max, c.position ?? 0), -1);
    const id = crypto.randomUUID();
    const newClient = {
      id, name: 'Nuova area', color: COLORS[clients.length % COLORS.length],
      billable: false, billing: 'hourly', rate: null, limitType: 'monthly', limitHours: null,
      position: maxPos + 1,
    };
    window.api.saveClient(newClient);
    setClients(prev => [...prev, newClient]);
    setSelectedId(id);
  }

  function handleAreaDragStart(e, id) {
    setDraggingAreaId(id);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleAreaDragOver(e, itemIdx, itemId) {
    if (itemId === draggingAreaId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const idx = e.clientY < rect.top + rect.height / 2 ? itemIdx : itemIdx + 1;
    if (idx !== areaInsertIdx) setAreaInsertIdx(idx);
  }

  function handleAreaDrop(e) {
    e.preventDefault();
    if (areaInsertIdx === null || !draggingAreaId) {
      setDraggingAreaId(null);
      setAreaInsertIdx(null);
      return;
    }
    const newOrder = insertReorder(clients, draggingAreaId, areaInsertIdx);
    const updated = newOrder.map((c, i) => ({ ...c, position: i }));
    setClients(updated);
    updated.forEach(c => window.api.saveClient(c));
    setDraggingAreaId(null);
    setAreaInsertIdx(null);
  }

  function handleAreaDragEnd() {
    setDraggingAreaId(null);
    setAreaInsertIdx(null);
  }

  // ── Project handlers ────────────────────────────────────────────────────────

  function addProject() {
    if (!selectedId) return;
    const maxPos = projects
      .filter(p => p.clientId === selectedId)
      .reduce((max, p) => Math.max(max, p.position ?? 0), -1);
    const newProject = {
      id: crypto.randomUUID(), clientId: selectedId,
      name: 'Nuovo progetto', budgetHours: null, position: maxPos + 1,
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

  function moveProject(projectId, newClientId) {
    const maxPos = projects
      .filter(p => p.clientId === newClientId)
      .reduce((max, p) => Math.max(max, p.position ?? 0), -1);
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p;
      const updated = { ...p, clientId: newClientId, position: maxPos + 1 };
      window.api.saveProject(updated);
      return updated;
    }));
  }

  function deleteProject(projectId) {
    window.api.deleteProject(projectId);
    setProjects(prev => prev.filter(p => p.id !== projectId));
  }

  function handleProjectDragStart(e, id) {
    setDraggingProjectId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
  }

  function handleProjectDragOver(e, itemIdx, itemId) {
    if (itemId === draggingProjectId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const idx = e.clientY < rect.top + rect.height / 2 ? itemIdx : itemIdx + 1;
    if (idx !== projectInsertIdx) setProjectInsertIdx(idx);
  }

  function handleProjectDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    if (projectInsertIdx === null || !draggingProjectId) {
      setDraggingProjectId(null);
      setProjectInsertIdx(null);
      return;
    }
    const areaProjects = [...selProjects];
    const otherProjects = projects.filter(p => p.clientId !== selectedId);
    const newOrder = insertReorder(areaProjects, draggingProjectId, projectInsertIdx);
    const updated = newOrder.map((p, i) => ({ ...p, position: i }));
    setProjects([...otherProjects, ...updated]);
    updated.forEach(p => window.api.saveProject(p));
    setDraggingProjectId(null);
    setProjectInsertIdx(null);
  }

  function handleProjectDragEnd() {
    setDraggingProjectId(null);
    setProjectInsertIdx(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, height: 'calc(100vh - 140px)' }}>

      {/* Area list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <SectionLabel>Aree ({clients.length})</SectionLabel>

        {/* Droppable list */}
        <div
          onDrop={handleAreaDrop}
          onDragOver={e => e.preventDefault()}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setAreaInsertIdx(null); }}
          style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          {clients.map((c, i) => (
            <React.Fragment key={c.id}>
              {areaInsertIdx === i && <Divider />}
              <div
                draggable
                onDragStart={e => handleAreaDragStart(e, c.id)}
                onDragOver={e => handleAreaDragOver(e, i, c.id)}
                onDragEnd={handleAreaDragEnd}
                onClick={() => setSelectedId(c.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 6,
                  background: selectedId === c.id ? 'var(--tb-panel-bg)' : 'transparent',
                  border: selectedId === c.id ? '1px solid var(--tb-border)' : '1px solid transparent',
                  cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s, border-color 0.1s',
                  opacity: draggingAreaId === c.id ? 0.35 : 1,
                  userSelect: 'none',
                }}>
                <DragHandle />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: 13, fontWeight: selectedId === c.id ? 700 : 400,
                    color: 'var(--tb-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--tb-text-faint)' }}>
                    {c.billable
                      ? `${c.billing === 'hourly' ? 'A ore' : 'Fisso'} · ${c.limitHours ? `${c.limitHours}h/${c.limitType === 'weekly' ? 'sett' : 'mese'}` : 'no limite'}`
                      : 'non fatturabile'}
                  </div>
                </div>
              </div>
            </React.Fragment>
          ))}
          {areaInsertIdx === clients.length && <Divider />}
        </div>

        <button onClick={addClient}
          style={{
            marginTop: 8, padding: '8px 12px', borderRadius: 6, border: '1px dashed var(--tb-input-border)',
            background: 'transparent', color: 'var(--tb-text-secondary)', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: "'Open Sans', sans-serif",
          }}>
          + Nuova area
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

          {/* Colore + Billable */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
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
              <label style={formLabel}>Fatturazione</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {[true, false].map(v => (
                  <button key={String(v)} onClick={() => updateClient('billable', v)}
                    style={{
                      flex: 1, padding: '7px 4px', borderRadius: 5, fontSize: 11, fontWeight: 700,
                      border: sel.billable === v ? `2px solid ${sel.color}` : '1px solid var(--tb-border-mid)',
                      background: sel.billable === v ? sel.color + '15' : 'transparent',
                      color: sel.billable === v ? sel.color : 'var(--tb-text-secondary)', cursor: 'pointer',
                      fontFamily: "'Open Sans', sans-serif",
                    }}>
                    {v ? 'Fatturabile' : 'Non fatturabile'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Billing config */}
          {sel.billable && (
            <>
              <SectionLabel>Configurazione billing</SectionLabel>
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
                        {b === 'hourly' ? 'A ore' : 'Fisso'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={formLabel}>Tariffa oraria (€)</label>
                  <input type="number" style={formInput} value={sel.rate ?? ''} placeholder="—"
                    onChange={e => updateClient('rate', e.target.value ? Number(e.target.value) : null)}
                    disabled={sel.billing !== 'hourly'} />
                </div>

                <div>
                  <label style={formLabel}>Limite ore</label>
                  <input type="number" style={formInput} value={sel.limitHours ?? ''} placeholder="—"
                    onChange={e => updateClient('limitHours', e.target.value ? Number(e.target.value) : null)} />
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
                        {t === 'weekly' ? 'Settimana' : 'Mese'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Projects */}
          <div style={{ borderTop: '1px solid var(--tb-border-soft)', paddingTop: 20 }}>
            <SectionLabel>Progetti ({selProjects.length})</SectionLabel>

            <div
              onDrop={handleProjectDrop}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setProjectInsertIdx(null); }}
              style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}
            >
              {selProjects.map((p, i) => (
                <React.Fragment key={p.id}>
                  {projectInsertIdx === i && <Divider />}
                  <div
                    draggable
                    onDragStart={e => handleProjectDragStart(e, p.id)}
                    onDragOver={e => handleProjectDragOver(e, i, p.id)}
                    onDragEnd={handleProjectDragEnd}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                      background: 'var(--tb-panel-bg-soft)', borderRadius: 6,
                      border: '1px solid transparent',
                      opacity: draggingProjectId === p.id ? 0.35 : 1,
                      transition: 'opacity 0.1s',
                    }}>
                    <DragHandle />
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: sel.color, flexShrink: 0 }} />
                    <input
                      value={p.name}
                      onChange={e => updateProject(p.id, 'name', e.target.value)}
                      onMouseDown={e => e.stopPropagation()}
                      style={{ flex: 1, fontSize: 13, color: 'var(--tb-text-primary)', fontWeight: 600,
                        border: 'none', background: 'transparent', outline: 'none',
                        fontFamily: "'Open Sans', sans-serif" }} />
                    <input
                      type="number"
                      value={p.budgetHours ?? ''}
                      placeholder="budget h"
                      onChange={e => updateProject(p.id, 'budgetHours', e.target.value ? Number(e.target.value) : null)}
                      onMouseDown={e => e.stopPropagation()}
                      style={{ width: 72, fontSize: 11, color: 'var(--tb-text-faint)', textAlign: 'right',
                        border: 'none', background: 'transparent', outline: 'none',
                        fontFamily: "'Open Sans', sans-serif" }} />
                    {p.budgetHours && <span style={{ fontSize: 11, color: 'var(--tb-text-faint)' }}>h</span>}

                    <select
                      value={p.clientId}
                      onChange={e => moveProject(p.id, e.target.value)}
                      onMouseDown={e => e.stopPropagation()}
                      title="Sposta in un'altra area"
                      style={{
                        fontSize: 10, color: 'var(--tb-text-faint)',
                        border: '1px solid var(--tb-border-mid)', borderRadius: 4,
                        background: 'var(--tb-input-bg)', padding: '3px 5px', cursor: 'pointer',
                        fontFamily: "'Open Sans', sans-serif", maxWidth: 90,
                      }}>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>

                    <button onClick={() => deleteProject(p.id)}
                      style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--tb-border-mid)',
                        background: 'transparent', color: 'var(--tb-text-secondary)', fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', fontFamily: "'Open Sans', sans-serif", transition: 'all 0.2s' }}
                      onMouseEnter={e => { e.target.style.color = '#d97070'; e.target.style.borderColor = '#d97070'; }}
                      onMouseLeave={e => { e.target.style.color = 'var(--tb-text-secondary)'; e.target.style.borderColor = 'var(--tb-border-mid)'; }}>
                      ✕
                    </button>
                  </div>
                </React.Fragment>
              ))}
              {projectInsertIdx === selProjects.length && <Divider />}
            </div>

            <button onClick={addProject}
              style={{
                padding: '8px 14px', borderRadius: 6, border: '1px dashed var(--tb-input-border)',
                background: 'transparent', color: 'var(--tb-text-secondary)', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: "'Open Sans', sans-serif", textAlign: 'left', marginTop: 8,
              }}>
              + Nuovo progetto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
