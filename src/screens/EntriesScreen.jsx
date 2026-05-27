import React, { useState, useEffect, useCallback } from 'react';
import { getToday, fmt, fmtH, parseHHMM, toHHMM, effBillable } from '../utils';

function defaultFrom() {
  const d = new Date(getToday().getFullYear(), getToday().getMonth(), 1);
  return fmt(d);
}
function defaultTo() {
  return fmt(getToday());
}

export default function EntriesScreen({ clients, projects, onEntryChange }) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo]     = useState(defaultTo);
  const [filterClientId, setFilterClientId] = useState('');
  const [filterProjectId, setFilterProjectId] = useState('');
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
    const billableStr = entry.billableHours == null
      ? (toHHMM(entry.hours) || String(entry.hours))
      : (toHHMM(entry.billableHours) || String(entry.billableHours));
    setEditState({
      date: entry.date,
      hours: toHHMM(entry.hours) || String(entry.hours),
      billable: billableStr,
      projectId: entry.projectId,
      billed: entry.billed,
    });
  }

  async function commitEdit(entry) {
    const parsed = parseHHMM(editState.hours);
    if (isNaN(parsed) || parsed < 0) return;
    const entryClient = clients.find(c => {
      const p = projects.find(p2 => p2.id === editState.projectId);
      return p && c.id === p.clientId;
    });
    const isBillableClient = entryClient?.billing !== 'none';
    let billableValue = null;
    if (isBillableClient) {
      const parsedB = parseHHMM(editState.billable);
      if (!isNaN(parsedB) && parsedB >= 0 && Math.abs(parsedB - parsed) > 0.001) {
        billableValue = parsedB;
      }
    }
    const updated = {
      ...entry,
      date: editState.date,
      hours: parsed,
      billableHours: billableValue,
      projectId: editState.projectId,
      billed: isBillableClient ? editState.billed : false,
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

  const projectsForFilter = filterClientId
    ? projects.filter(p => p.clientId === filterClientId)
    : projects;

  const filtered = entries.filter(e => {
    if (filterClientId) {
      const p = projects.find(p2 => p2.id === e.projectId);
      if (!p || p.clientId !== filterClientId) return false;
    }
    if (filterProjectId && e.projectId !== filterProjectId) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
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

        <select value={filterClientId}
          onChange={e => { setFilterClientId(e.target.value); setFilterProjectId(''); }}
          style={selectStyle}>
          <option value="">Tutte le aree</option>
          {clients.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select value={filterProjectId}
          onChange={e => setFilterProjectId(e.target.value)}
          style={selectStyle}>
          <option value="">Tutti i progetti</option>
          {projectsForFilter.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <span style={{ fontSize: 11, color: 'var(--tb-text-muted)', marginLeft: 4 }}>
          {filtered.length} entr{filtered.length === 1 ? 'y' : 'ies'} · {fmtH(filtered.reduce((s, e) => s + e.hours, 0))}
          {(() => {
            const totBill = filtered.reduce((s, e) => {
              const cli = clientOf(e);
              if (!cli || cli.billing === 'none') return s;
              return s + effBillable(e);
            }, 0);
            const totTracked = filtered.reduce((s, e) => s + e.hours, 0);
            if (Math.abs(totBill - totTracked) < 0.001) return null;
            return <> · <span style={{ color: '#E07B3A' }}>{fmtH(totBill)} fatt.</span></>;
          })()}
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
                {['Data', 'Area', 'Progetto', 'Ore', 'Fatturabili', 'Fatturato', ''].map(h => (
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
                            {[...projects]
                              .sort((a, b) => {
                                const ca = clients.find(c2 => c2.id === a.clientId);
                                const cb = clients.find(c2 => c2.id === b.clientId);
                                const posA = ca?.position ?? 0;
                                const posB = cb?.position ?? 0;
                                if (posA !== posB) return posA - posB;
                                return (a.position ?? 0) - (b.position ?? 0);
                              })
                              .map(p => {
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

                    {/* Billable hours */}
                    <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {client?.billing === 'none' ? (
                        <span style={{ color: 'var(--tb-text-faint)' }}>—</span>
                      ) : isEditing ? (
                        <input value={editState.billable}
                          onChange={e => setEditState(s => ({ ...s, billable: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitEdit(entry);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          style={{ ...inputStyle, width: 70, textAlign: 'right' }} />
                      ) : (() => {
                        const eff = effBillable(entry);
                        const diverges = entry.billableHours != null && Math.abs(entry.billableHours - entry.hours) > 0.001;
                        return (
                          <span title={diverges ? `Tracciate: ${fmtH(entry.hours)}` : undefined}>
                            {fmtH(eff)}
                            {diverges && <span style={{
                              display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
                              background: '#E07B3A', marginLeft: 5, verticalAlign: 'middle',
                            }} />}
                          </span>
                        );
                      })()}
                    </td>

                    {/* Billed */}
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      {client?.billing !== 'none'
                        ? isEditing
                          ? <input type="checkbox" checked={editState.billed}
                              onChange={e => setEditState(s => ({ ...s, billed: e.target.checked }))} />
                          : entry.billed
                            ? <span style={{ color: '#3DB33D', fontWeight: 700, fontSize: 11 }}>€</span>
                            : <span style={{ color: 'var(--tb-text-muted)', fontSize: 11 }}>–</span>
                        : <span style={{ color: 'var(--tb-text-muted)', fontSize: 11 }}>n/a</span>
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
