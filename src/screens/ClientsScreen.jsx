import React, { useState } from 'react';

const BILLING_OPTIONS = ['none', 'hourly', 'fixed'];
const COLORS = [
  { hex: '#b8255f', label: 'Rosso ciliegia' },
  { hex: '#db4035', label: 'Rosso' },
  { hex: '#ff9933', label: 'Arancione' },
  { hex: '#fad000', label: 'Giallo' },
  { hex: '#afb83b', label: 'Verde oliva' },
  { hex: '#7ecc49', label: 'Verde lime' },
  { hex: '#299438', label: 'Verde' },
  { hex: '#6accbc', label: 'Verde menta' },
  { hex: '#158fad', label: 'Verde acqua' },
  { hex: '#14aaf5', label: 'Azzurro' },
  { hex: '#96c3eb', label: 'Blu chiaro' },
  { hex: '#4073ff', label: 'Blu' },
  { hex: '#884dff', label: 'Viola uva' },
  { hex: '#af38eb', label: 'Viola' },
  { hex: '#eb96eb', label: 'Lavanda' },
  { hex: '#e05194', label: 'Magenta' },
  { hex: '#ff8d85', label: 'Salmone' },
  { hex: '#808080', label: 'Antracite' },
  { hex: '#b8b8b8', label: 'Grigio' },
  { hex: '#ccac93', label: 'Talpa' },
];

const formLabel = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--tb-text-secondary)',
  letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4,
};
const formInput = {
  width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--tb-input-border)',
  fontFamily: "'Open Sans', sans-serif", fontSize: 13, color: 'var(--tb-input-text)',
  background: 'var(--tb-input-bg)', outline: 'none',
};

function ArchiveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
      <rect x="1" y="4" width="13" height="9.5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M1 4.5L2.5 1.5h10L14 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M5.5 8h4M7.5 6v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

function UnarchiveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
      <rect x="1" y="4" width="13" height="9.5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M1 4.5L2.5 1.5h10L14 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M5.5 8.5h4M7.5 10.5V6.5M6 8l1.5-1.5L9 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
      <path d="M2 4h11M6 4V2.5C6 2 6.5 1.5 7 1.5h1c.5 0 1 .5 1 1V4M5.5 4v7.5M9.5 4v7.5"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <rect x="3" y="4" width="9" height="9.5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  );
}

function BudgetIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 15 15" fill="none" style={{ flexShrink: 0 }}>
      <path d="M7.5 1a6.5 6.5 0 1 0 0 13A6.5 6.5 0 0 0 7.5 1z" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M7.5 4v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function WeeklyIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 15 15" fill="none" style={{ flexShrink: 0 }}>
      <rect x="1.5" y="3" width="12" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M1.5 6.5h12" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M5 1.5v3M10 1.5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M4.5 9.5h2M8.5 9.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

function MoveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 1v13M1 7.5h13M4 4.5L1 7.5l3 3M11 4.5l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

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

  // Project move
  const [movingProjectId, setMovingProjectId] = useState(null);

  // Project drag-to-area
  const [projectDragOverAreaId, setProjectDragOverAreaId] = useState(null);

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

  function deleteClient(id) {
    const area = clients.find(c => c.id === id);
    const areaProjects = projects.filter(p => p.clientId === id);
    const msg = areaProjects.length > 0
      ? `Eliminare l'area "${area?.name}" e i suoi ${areaProjects.length} progetti?`
      : `Eliminare l'area "${area?.name}"?`;
    if (!window.confirm(msg)) return;
    areaProjects.forEach(p => window.api.deleteProject(p.id));
    window.api.deleteClient(id);
    setProjects(prev => prev.filter(p => p.clientId !== id));
    setClients(prev => {
      const next = prev.filter(c => c.id !== id);
      setSelectedId(next[0]?.id ?? null);
      return next;
    });
  }

  function addClient() {
    const maxPos = clients.reduce((max, c) => Math.max(max, c.position ?? 0), -1);
    const id = crypto.randomUUID();
    const newClient = {
      id, name: 'Nuova area', color: COLORS[clients.length % COLORS.length].hex,
      billable: false, billing: 'hourly', rate: null, limitType: 'weekly', limitHours: null,
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
      name: 'Nuovo progetto', budgetHours: null, weeklyHours: null, position: maxPos + 1,
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
    const proj = projects.find(p => p.id === projectId);
    if (!window.confirm(`Eliminare il progetto "${proj?.name}"?`)) return;
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
    setProjectDragOverAreaId(null);
  }

  function handleAreaDropProject(e, targetClientId) {
    e.preventDefault();
    if (!draggingProjectId || targetClientId === selectedId) {
      setProjectDragOverAreaId(null);
      return;
    }
    moveProject(draggingProjectId, targetClientId);
    setDraggingProjectId(null);
    setProjectInsertIdx(null);
    setProjectDragOverAreaId(null);
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
                onDragOver={e => {
                  if (draggingProjectId) {
                    e.preventDefault();
                    e.stopPropagation();
                    setProjectDragOverAreaId(c.id);
                  } else {
                    handleAreaDragOver(e, i, c.id);
                  }
                }}
                onDragLeave={e => { if (draggingProjectId && !e.currentTarget.contains(e.relatedTarget)) setProjectDragOverAreaId(null); }}
                onDrop={e => draggingProjectId ? handleAreaDropProject(e, c.id) : undefined}
                onDragEnd={handleAreaDragEnd}
                onClick={() => setSelectedId(c.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 6,
                  background: projectDragOverAreaId === c.id ? c.color + '22' : selectedId === c.id ? 'var(--tb-panel-bg)' : 'transparent',
                  border: projectDragOverAreaId === c.id ? `1px solid ${c.color}` : selectedId === c.id ? '1px solid var(--tb-border)' : '1px solid transparent',
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
                    {c.billing === 'none' || !c.billing
                      ? 'nessun compenso'
                      : `${c.billing === 'hourly' ? 'Compenso a ore' : 'Compenso fisso'} · ${c.limitHours ? `${c.limitHours}h/${c.limitType === 'global' ? 'tot' : 'sett'}` : 'no limite'}`}
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
            <button onClick={() => deleteClient(sel.id)}
              title="Elimina area"
              style={{ padding: '5px 8px', borderRadius: 4, border: '1px solid var(--tb-border-mid)',
                background: 'transparent', color: 'var(--tb-text-secondary)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.2s', flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.color = '#d97070'; e.currentTarget.style.borderColor = '#d97070'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--tb-text-secondary)'; e.currentTarget.style.borderColor = 'var(--tb-border-mid)'; }}>
              <TrashIcon />
            </button>
          </div>

          {/* Aspetto + Limite ore */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div>
              <SectionLabel>Aspetto</SectionLabel>
              <div style={{ marginTop: 8 }}>
                <label style={formLabel}>Colore</label>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {COLORS.map(({ hex, label }) => (
                    <div key={hex} title={label} onClick={() => updateClient('color', hex)}
                      style={{
                        width: 22, height: 22, borderRadius: '50%', background: hex,
                        border: sel.color === hex ? '2px solid var(--tb-text-primary)' : '2px solid transparent',
                        cursor: 'pointer', flexShrink: 0, boxSizing: 'border-box',
                      }} />
                  ))}
                </div>
              </div>
            </div>
            <div>
              <SectionLabel>Limite ore</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <label style={formLabel}>Cadenza</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[['none', 'Nessuna'], ['weekly', 'Settimanale'], ['global', 'Globale']].map(([t, label]) => (
                      <button key={t} onClick={() => {
                        if (t === 'none') {
                          setClients(prev => prev.map(c => {
                            if (c.id !== selectedId) return c;
                            const updated = { ...c, limitType: 'none', limitHours: null };
                            window.api.saveClient(updated);
                            return updated;
                          }));
                        } else {
                          updateClient('limitType', t);
                        }
                      }}
                        style={{
                          flex: 1, padding: '8px 4px', borderRadius: 5, fontSize: 10, fontWeight: 700,
                          border: sel.limitType === t ? `2px solid ${sel.color}` : '1px solid var(--tb-border-mid)',
                          background: sel.limitType === t ? sel.color + '15' : 'transparent',
                          color: sel.limitType === t ? sel.color : 'var(--tb-text-secondary)', cursor: 'pointer',
                          fontFamily: "'Open Sans', sans-serif",
                        }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {sel.limitType !== 'none' && (
                <div>
                  <label style={formLabel}>Ore massime</label>
                  <input type="number" style={formInput} value={sel.limitHours ?? ''} placeholder="—"
                    onChange={e => updateClient('limitHours', e.target.value ? Number(e.target.value) : null)} />
                </div>
                )}
              </div>
            </div>
          </div>

          {/* Compenso */}
          <SectionLabel>Compenso</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8, marginBottom: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={formLabel}>Tipo di compenso</label>
              <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                {BILLING_OPTIONS.map(b => (
                  <button key={b} onClick={() => updateClient('billing', b)}
                    style={{
                      flex: 1, padding: '8px 4px', borderRadius: 5, fontSize: 10, fontWeight: 700,
                      border: sel.billing === b ? `2px solid ${sel.color}` : '1px solid var(--tb-border-mid)',
                      background: sel.billing === b ? sel.color + '15' : 'transparent',
                      color: sel.billing === b ? sel.color : 'var(--tb-text-secondary)', cursor: 'pointer',
                      fontFamily: "'Open Sans', sans-serif",
                    }}>
                    {b === 'none' ? 'Nessuno' : b === 'hourly' ? 'Compenso a ore' : 'Compenso fisso'}
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
          </div>

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
                      opacity: draggingProjectId === p.id ? 0.35 : (p.archived ? 0.5 : 1),
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
                        fontFamily: "'Open Sans', sans-serif",
                        textDecoration: p.archived ? 'line-through' : 'none' }} />
                    <div title="Budget totale progetto (ore globali)"
                      style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 7px',
                        borderRadius: 4, border: '1px solid var(--tb-border-mid)', flexShrink: 0,
                        color: 'var(--tb-text-faint)' }}>
                      <BudgetIcon />
                      <input
                        type="number"
                        value={p.budgetHours ?? ''}
                        placeholder="—"
                        onChange={e => updateProject(p.id, 'budgetHours', e.target.value ? Number(e.target.value) : null)}
                        onMouseDown={e => e.stopPropagation()}
                        style={{ width: 36, fontSize: 11, color: 'var(--tb-text-faint)', textAlign: 'right',
                          border: 'none', background: 'transparent', outline: 'none',
                          fontFamily: "'Open Sans', sans-serif" }} />
                      <span style={{ fontSize: 11, color: 'var(--tb-text-faint)', flexShrink: 0 }}>h</span>
                    </div>
                    <div title="Limite settimanale progetto (ore/settimana)"
                      style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 7px',
                        borderRadius: 4, border: '1px solid var(--tb-border-mid)', flexShrink: 0,
                        color: 'var(--tb-text-faint)' }}>
                      <WeeklyIcon />
                      <input
                        type="number"
                        value={p.weeklyHours ?? ''}
                        placeholder="—"
                        onChange={e => updateProject(p.id, 'weeklyHours', e.target.value ? Number(e.target.value) : null)}
                        onMouseDown={e => e.stopPropagation()}
                        style={{ width: 30, fontSize: 11, color: 'var(--tb-text-faint)', textAlign: 'right',
                          border: 'none', background: 'transparent', outline: 'none',
                          fontFamily: "'Open Sans', sans-serif" }} />
                      <span style={{ fontSize: 11, color: 'var(--tb-text-faint)', flexShrink: 0 }}>h/s</span>
                    </div>

                    <button
                      onClick={e => { e.stopPropagation(); setMovingProjectId(movingProjectId === p.id ? null : p.id); }}
                      title="Sposta in un'altra area"
                      style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid var(--tb-border-mid)',
                        background: movingProjectId === p.id ? 'var(--tb-border-mid)' : 'transparent',
                        color: movingProjectId === p.id ? 'var(--tb-text-primary)' : 'var(--tb-text-secondary)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }}>
                      <MoveIcon />
                    </button>
                    {movingProjectId === p.id && (
                    <select
                      autoFocus
                      value={p.clientId}
                      onChange={e => { moveProject(p.id, e.target.value); setMovingProjectId(null); }}
                      onBlur={() => setMovingProjectId(null)}
                      onMouseDown={e => e.stopPropagation()}
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
                    )}

                    <button onClick={() => updateProject(p.id, 'archived', !p.archived)}
                      title={p.archived ? "Ripristina progetto" : "Archivia progetto"}
                      style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid var(--tb-border-mid)',
                        background: p.archived ? 'var(--tb-border-mid)' : 'transparent',
                        color: p.archived ? 'var(--tb-text-primary)' : 'var(--tb-text-secondary)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }}>
                      {p.archived ? <UnarchiveIcon /> : <ArchiveIcon />}
                    </button>

                    <button onClick={() => deleteProject(p.id)}
                      title="Elimina progetto"
                      style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid var(--tb-border-mid)',
                        background: 'transparent', color: 'var(--tb-text-secondary)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#d97070'; e.currentTarget.style.borderColor = '#d97070'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--tb-text-secondary)'; e.currentTarget.style.borderColor = 'var(--tb-border-mid)'; }}>
                      <TrashIcon />
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
