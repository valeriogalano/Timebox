import React, { useState, useEffect, useCallback } from 'react';
import { TODAY, fmt, fmtH, parseHHMM, toHHMM } from '../utils';

function defaultFrom() {
  const d = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
  return fmt(d);
}
function defaultTo() {
  return fmt(TODAY);
}

export default function EntriesScreen({ clients, projects, onEntryChange }) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo]     = useState(defaultTo);
  const [entries, setEntries] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editState, setEditState] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(() => {
    if (from && to && from <= to) {
      window.api.getEntries(from, to).then(setEntries);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  function projectOf(e) { return projects.find(p => p.id === e.projectId); }
  function clientOf(e) {
    const p = projectOf(e);
    return p ? clients.find(c => c.id === p.clientId) : null;
  }

  function startEdit(entry) {
    setEditingId(entry.id);
    setEditState({
      date: entry.date,
      hours: toHHMM(entry.hours) || String(entry.hours),
      projectId: entry.projectId,
      billed: entry.billed,
    });
  }

  async function commitEdit(entry) {
    const parsed = parseHHMM(editState.hours);
    if (isNaN(parsed) || parsed < 0) return;
    const updated = {
      ...entry,
      date: editState.date,
      hours: parsed,
      projectId: editState.projectId,
      billed: editState.billed,
    };
    await window.api.saveEntry(updated);
    setEditingId(null);
    load();
    onEntryChange?.();
  }

  async function handleDelete(id) {
    await window.api.deleteEntry(id);
    setConfirmDelete(null);
    load();
    onEntryChange?.();
  }

  const sorted = [...entries].sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return (a.slot || '').localeCompare(b.slot || '');
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label style={labelStyle}>Dal</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
        <label style={labelStyle}>al</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
        <span style={{ fontSize: 11, color: 'var(--tb-text-muted)', marginLeft: 4 }}>
          {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} · {fmtH(entries.reduce((s, e) => s + e.hours, 0))}
        </span>
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--tb-text-muted)', fontSize: 13 }}>
          Nessuna entry nel periodo selezionato.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--tb-border)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--tb-table-header-bg, var(--tb-sidebar-bg))' }}>
                {['Data', 'Area', 'Progetto', 'Ore', 'Fatturato', ''].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry, i) => {
                const client = clientOf(entry);
                const project = projectOf(entry);
                const isEditing = editingId === entry.id;
                const isConfirm = confirmDelete === entry.id;

                return (
                  <tr key={entry.id}
                    style={{
                      background: i % 2 === 0 ? 'var(--tb-main-bg)' : 'var(--tb-table-alt-bg, var(--tb-sidebar-bg))',
                      borderTop: '1px solid var(--tb-border)',
                    }}>

                    {/* Date */}
                    <td style={tdStyle}>
                      {isEditing
                        ? <input type="date" value={editState.date}
                            onChange={e => setEditState(s => ({ ...s, date: e.target.value }))}
                            style={{ ...inputStyle, width: 130 }} />
                        : <span style={{ fontVariantNumeric: 'tabular-nums' }}>{entry.date}</span>
                      }
                    </td>

                    {/* Client */}
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {client && <div style={{ width: 7, height: 7, borderRadius: '50%',
                          background: client.color, flexShrink: 0 }} />}
                        <span style={{ color: 'var(--tb-text-secondary)' }}>{client?.name ?? '—'}</span>
                      </div>
                    </td>

                    {/* Project */}
                    <td style={tdStyle}>
                      {isEditing
                        ? <select value={editState.projectId}
                            onChange={e => setEditState(s => ({ ...s, projectId: e.target.value }))}
                            style={selectStyle}>
                            {projects.map(p => {
                              const c = clients.find(c2 => c2.id === p.clientId);
                              return (
                                <option key={p.id} value={p.id}>
                                  {c ? `${c.name} / ` : ''}{p.name}{p.archived ? ' (archiviato)' : ''}
                                </option>
                              );
                            })}
                          </select>
                        : <span style={{ color: 'var(--tb-text-primary)' }}>{project?.name ?? '—'}</span>
                      }
                    </td>

                    {/* Hours */}
                    <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {isEditing
                        ? <input value={editState.hours}
                            onChange={e => setEditState(s => ({ ...s, hours: e.target.value }))}
                            onKeyDown={e => {
                              if (e.key === 'Enter') commitEdit(entry);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            style={{ ...inputStyle, width: 70, textAlign: 'right' }} />
                        : fmtH(entry.hours)
                      }
                    </td>

                    {/* Billed */}
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {isEditing
                        ? <input type="checkbox" checked={editState.billed}
                            onChange={e => setEditState(s => ({ ...s, billed: e.target.checked }))} />
                        : entry.billed
                          ? <span style={{ color: '#3DB33D', fontWeight: 700, fontSize: 11 }}>€</span>
                          : <span style={{ color: 'var(--tb-text-muted)', fontSize: 11 }}>–</span>
                      }
                    </td>

                    {/* Actions */}
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                      {isConfirm ? (
                        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--tb-text-muted)' }}>Eliminare?</span>
                          <ActionBtn danger onClick={() => handleDelete(entry.id)}>Sì</ActionBtn>
                          <ActionBtn onClick={() => setConfirmDelete(null)}>No</ActionBtn>
                        </span>
                      ) : isEditing ? (
                        <span style={{ display: 'flex', gap: 6 }}>
                          <ActionBtn primary onClick={() => commitEdit(entry)}>Salva</ActionBtn>
                          <ActionBtn onClick={() => setEditingId(null)}>Annulla</ActionBtn>
                        </span>
                      ) : (
                        <span style={{ display: 'flex', gap: 6 }}>
                          <ActionBtn onClick={() => startEdit(entry)}>Modifica</ActionBtn>
                          <ActionBtn danger onClick={() => setConfirmDelete(entry.id)}>Elimina</ActionBtn>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const labelStyle = {
  fontSize: 12, fontWeight: 600, color: 'var(--tb-text-secondary)',
};

const inputStyle = {
  fontSize: 12, padding: '5px 8px', borderRadius: 5,
  border: '1px solid var(--tb-border)',
  background: 'var(--tb-main-bg)', color: 'var(--tb-text-primary)',
  outline: 'none',
};

const selectStyle = {
  fontSize: 12, padding: '4px 6px', borderRadius: 5,
  border: '1px solid var(--tb-border)',
  background: 'var(--tb-main-bg)', color: 'var(--tb-text-primary)',
  outline: 'none', maxWidth: 200,
};

const thStyle = {
  padding: '8px 12px', textAlign: 'left', fontSize: 10,
  fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'var(--tb-text-muted)',
};

const tdStyle = {
  padding: '8px 12px', verticalAlign: 'middle',
  color: 'var(--tb-text-primary)',
};

function ActionBtn({ onClick, children, primary, danger }) {
  const [hover, setHover] = useState(false);
  const bg = danger
    ? (hover ? '#c0392b' : 'transparent')
    : primary
      ? (hover ? '#2ea82e' : '#3DB33D')
      : (hover ? 'var(--tb-sidebar-bg)' : 'transparent');
  const color = primary
    ? '#fff'
    : danger
      ? (hover ? '#fff' : '#e74c3c')
      : 'var(--tb-text-secondary)';
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
        border: primary ? 'none' : `1px solid ${danger ? '#e74c3c' : 'var(--tb-border)'}`,
        background: bg, color,
        cursor: 'pointer', fontFamily: "'Open Sans', sans-serif",
        transition: 'all 0.1s',
      }}>
      {children}
    </button>
  );
}
