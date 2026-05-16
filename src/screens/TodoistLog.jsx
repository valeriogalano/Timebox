import React, { useState, useEffect } from 'react';
import { toHHMM } from '../utils';
import MarkdownText from '../components/MarkdownText';

const DAY_LONG = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const MONTHS_LONG = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = DAY_LONG[(d.getDay() + 6) % 7];
  return `${dow} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

export default function TodoistLog({ clients, projects }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    window.api.getAllTodoistCache().then(setRows);
  }, []);

  const days = rows
    .map(row => ({ ...row, tasks: row.tasks.filter(t => t.hours > 0) }))
    .filter(row => row.tasks.length > 0);

  const lastSync = rows.reduce((max, r) => r.syncedAt && r.syncedAt > max ? r.syncedAt : max, '');
  const lastSyncLabel = lastSync
    ? new Date(lastSync).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--tb-text-primary)', letterSpacing: '-0.01em' }}>
          Task Todoist
        </h2>
        {lastSyncLabel && (
          <span style={{ fontSize: 11, color: 'var(--tb-text-faint)' }}>
            Aggiornato il {lastSyncLabel}
          </span>
        )}
      </div>

      {days.length === 0 && (
        <div style={{
          padding: '40px 0', textAlign: 'center',
          color: 'var(--tb-text-faint)', fontSize: 13,
        }}>
          Nessun task in cache. Sincronizza Todoist dal Timesheet.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {days.map(({ dateStr, tasks }) => {
          const amTasks = tasks.filter(t => t.slot === 'am');
          const pmTasks = tasks.filter(t => t.slot === 'pm');

          return (
            <div key={dateStr} style={{
              background: 'var(--tb-panel-bg)',
              border: '1px solid var(--tb-border)',
              borderRadius: 8, overflow: 'hidden',
            }}>
              {/* Day header */}
              <div style={{
                padding: '8px 14px',
                background: 'var(--tb-panel-bg-soft)',
                borderBottom: '1px solid var(--tb-border)',
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tb-text-primary)' }}>
                  {formatDate(dateStr)}
                </span>
              </div>

              {/* Tasks */}
              <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {[...amTasks.map(t => ({ ...t, slot: 'am' })), ...pmTasks.map(t => ({ ...t, slot: 'pm' }))].map(task => {
                  const proj = projects.find(p => p.id === task.projectId);
                  const cl = proj ? clients.find(c => c.id === proj.clientId) : null;
                  return (
                    <div key={task.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 8px', borderRadius: 5,
                      background: cl ? cl.color + '0d' : 'var(--tb-panel-bg-soft)',
                      borderLeft: `3px solid ${cl ? cl.color : 'var(--tb-border-mid)'}`,
                    }}>
                      <span style={{
                        fontSize: 8, fontWeight: 800, letterSpacing: '0.08em',
                        color: cl ? cl.color : 'var(--tb-text-faint)',
                        textTransform: 'uppercase', flexShrink: 0, width: 18,
                      }}>
                        {task.slot === 'am' ? 'AM' : 'PM'}
                      </span>
                      <MarkdownText text={task.content || '(senza titolo)'} style={{
                        fontSize: 11, fontWeight: 600, color: 'var(--tb-text-primary)',
                        flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }} />
                      {proj && (
                        <span style={{ fontSize: 10, color: 'var(--tb-text-faint)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                          {proj.name}
                        </span>
                      )}
                      <span style={{
                        fontSize: 11, fontWeight: 800,
                        color: cl ? cl.color : 'var(--tb-text-secondary)',
                        flexShrink: 0,
                      }}>
                        {toHHMM(task.hours)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
