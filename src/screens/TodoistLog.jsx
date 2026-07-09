import React, { useState, useEffect, useMemo } from 'react';
import { toHHMM, parseHHMM, fmtH, SLOTS, SLOT_LABELS, normalizeSlot } from '../utils';

const DAY_LONG = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const MONTHS_LONG = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = DAY_LONG[(d.getDay() + 6) % 7];
  return `${dow} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

function formatDateShort(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function normalizeDraft(row) {
  return {
    ...row,
    slot: normalizeSlot(row.slot),
    note: row.note ?? '',
    draftHours: toHHMM(row.hours),
  };
}

function displayTitle(row) {
  return row.titleSnapshot || row.todoistTaskId || '(senza titolo)';
}

export default function TodoistLog({ clients, projects }) {
  const [rows, setRows] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function loadRows() {
    const imports = await window.api.getTodoistImports('0000-01-01', '9999-12-31');
    setRows(imports.map(normalizeDraft).sort((a, b) => b.date.localeCompare(a.date) || (b.importedAt || '').localeCompare(a.importedAt || '')));
  }

  useEffect(() => {
    loadRows();
  }, []);

  const totals = useMemo(() => {
    const hours = rows.reduce((sum, row) => sum + row.hours, 0);
    const dates = new Set(rows.map(row => row.date));
    return { hours, dates: dates.size };
  }, [rows]);

  const groups = useMemo(() => {
    const byDate = [];
    for (const row of rows) {
      let group = byDate.find(item => item.date === row.date);
      if (!group) {
        group = { date: row.date, rows: [] };
        byDate.push(group);
      }
      group.rows.push(row);
    }
    return byDate;
  }, [rows]);

  function startEdit(row) {
    setEditingId(row.todoistTaskId);
    setDraft(normalizeDraft(row));
  }

  function updateDraft(field, value) {
    setDraft(current => ({ ...current, [field]: value }));
  }

  async function saveDraft() {
    if (!draft || busyId) return;
    const hours = parseHHMM(draft.draftHours);
    if (!(hours > 0)) {
      alert('Inserisci un tempo maggiore di zero.');
      return;
    }
    setBusyId(draft.todoistTaskId);
    try {
      const next = {
        ...draft,
        hours,
        note: draft.note?.trim() || null,
      };
      const result = await window.api.updateTodoistImport(next);
      if (result?.error === 'invalid_hours' || result?.updated === false) {
        alert('Non sono riuscito ad aggiornare questo import.');
        return;
      }
      await loadRows();
      setEditingId(null);
      setDraft(null);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRow(row) {
    if (busyId) return;
    const ok = window.confirm(`Rimuovere dal log l'import di "${displayTitle(row)}"?\nLe ore importate saranno sottratte dal timesheet.`);
    if (!ok) return;
    setBusyId(row.todoistTaskId);
    try {
      await window.api.deleteTodoistImport(row.todoistTaskId);
      await loadRows();
      if (editingId === row.todoistTaskId) {
        setEditingId(null);
        setDraft(null);
      }
    } finally {
      setBusyId(null);
    }
  }

  const projectOptions = projects;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--tb-text-primary)', letterSpacing: '-0.01em' }}>
          Import Todoist
        </h2>
        <span style={{ fontSize: 11, color: 'var(--tb-text-faint)' }}>
          {rows.length} task · {fmtH(totals.hours)} · {totals.dates} giorni
        </span>
      </div>

      {rows.length === 0 && (
        <div style={{
          padding: '40px 0', textAlign: 'center',
          color: 'var(--tb-text-faint)', fontSize: 13,
        }}>
          Nessun import registrato. Usa “Importa completati” dal Timesheet.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {groups.map(group => (
          <div key={group.date} style={{
            background: 'var(--tb-panel-bg)',
            border: '1px solid var(--tb-border)',
            borderRadius: 8, overflow: 'hidden',
          }}>
            <div style={{
              padding: '8px 14px',
              background: 'var(--tb-panel-bg-soft)',
              borderBottom: '1px solid var(--tb-border)',
              display: 'flex', justifyContent: 'space-between', gap: 12,
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tb-text-primary)' }}>
                {formatDate(group.date)}
              </span>
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--tb-text-secondary)' }}>
                {fmtH(group.rows.reduce((sum, row) => sum + row.hours, 0))}
              </span>
            </div>

            <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {group.rows.map(row => {
                const project = projects.find(p => p.id === row.projectId);
                const client = project ? clients.find(c => c.id === project.clientId) : null;
                const isEditing = editingId === row.todoistTaskId;
                const current = isEditing ? draft : row;

                return (
                  <div key={row.todoistTaskId} style={{
                    display: 'grid',
                    gridTemplateColumns: isEditing ? '84px 76px minmax(150px, 1fr) 82px 72px' : '34px minmax(180px, 1fr) 150px 68px 70px',
                    gap: 8,
                    alignItems: 'start',
                    padding: '7px 8px',
                    borderRadius: 5,
                    background: client ? `${client.color}0d` : 'var(--tb-panel-bg-soft)',
                    borderLeft: `3px solid ${client ? client.color : 'var(--tb-border-mid)'}`,
                  }}>
                    {isEditing ? (
                      <>
                        <input
                          type="date"
                          value={current.date}
                          onChange={event => updateDraft('date', event.target.value)}
                          style={inputStyle}
                        />
                        <select value={current.slot} onChange={event => updateDraft('slot', event.target.value)} style={inputStyle}>
                          {SLOTS.map(slot => <option key={slot} value={slot}>{SLOT_LABELS[slot]}</option>)}
                        </select>
                        <select value={current.projectId} onChange={event => updateDraft('projectId', event.target.value)} style={inputStyle}>
                          {projectOptions.map(option => {
                            const optionClient = clients.find(client => client.id === option.clientId);
                            return <option key={option.id} value={option.id}>{optionClient ? `${optionClient.name} · ` : ''}{option.name}</option>;
                          })}
                        </select>
                        <input
                          value={current.draftHours}
                          onChange={event => updateDraft('draftHours', event.target.value)}
                          onBlur={() => updateDraft('draftHours', toHHMM(parseHHMM(current.draftHours)))}
                          placeholder="hh:mm"
                          style={{ ...inputStyle, textAlign: 'center', fontWeight: 800 }}
                        />
                        <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                          <button onClick={saveDraft} disabled={busyId === row.todoistTaskId} title="Salva" style={iconButtonStyle}>✓</button>
                          <button onClick={() => { setEditingId(null); setDraft(null); }} title="Annulla" style={iconButtonStyle}>×</button>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <textarea
                            value={current.note ?? ''}
                            onChange={event => updateDraft('note', event.target.value)}
                            placeholder="Nota sul log import..."
                            rows={2}
                            style={{ ...inputStyle, width: '100%', minHeight: 48, resize: 'vertical', padding: '7px 8px', lineHeight: 1.35 }}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <span style={{
                          fontSize: 8, fontWeight: 800, letterSpacing: '0.08em',
                          color: client ? client.color : 'var(--tb-text-faint)',
                          textTransform: 'uppercase', marginTop: 4,
                        }}>
                          {SLOT_LABELS[normalizeSlot(row.slot)]}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{
                            fontSize: 11, fontWeight: 700, color: 'var(--tb-text-primary)',
                            lineHeight: 1.35, overflowWrap: 'anywhere',
                          }}>
                            {displayTitle(row)}
                          </div>
                          <div style={{ marginTop: 2, fontSize: 9, color: 'var(--tb-text-faint)' }}>
                            Importato {row.importedAt ? new Date(row.importedAt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : formatDateShort(row.date)}
                          </div>
                          {row.note && (
                            <div style={{ marginTop: 5, fontSize: 10, color: 'var(--tb-text-muted)', lineHeight: 1.35, overflowWrap: 'anywhere' }}>
                              {row.note}
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--tb-text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 3 }}>
                          {project?.name ?? 'Progetto non disponibile'}
                        </span>
                        <span style={{
                          fontSize: 11, fontWeight: 800,
                          color: client ? client.color : 'var(--tb-text-secondary)',
                          marginTop: 2,
                        }}>
                          {toHHMM(row.hours)}
                        </span>
                        <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                          <button onClick={() => startEdit(row)} title="Modifica import" style={iconButtonStyle}>✎</button>
                          <button onClick={() => deleteRow(row)} disabled={busyId === row.todoistTaskId} title="Elimina import" style={iconButtonStyle}>−</button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const inputStyle = {
  height: 30,
  minWidth: 0,
  borderRadius: 4,
  border: '1px solid var(--tb-border-mid)',
  background: 'var(--tb-input-bg)',
  color: 'var(--tb-text-primary)',
  fontFamily: "'Open Sans', sans-serif",
  fontSize: 11,
  padding: '0 7px',
  outline: 'none',
};

const iconButtonStyle = {
  width: 28,
  height: 28,
  borderRadius: 4,
  border: '1px solid var(--tb-border)',
  background: 'var(--tb-panel-bg)',
  color: 'var(--tb-text-secondary)',
  cursor: 'pointer',
  fontFamily: "'Open Sans', sans-serif",
  fontSize: 13,
  fontWeight: 800,
  lineHeight: 1,
};
