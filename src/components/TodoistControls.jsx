import React, { useEffect, useRef, useState } from 'react';
import { toHHMM, parseHHMM, fmtH } from '../utils';
import MarkdownText from './MarkdownText';

export function TodoistControlBar({ children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', border: '1px solid var(--tb-border)',
      borderRadius: 6, background: 'var(--tb-panel-bg-soft)', overflow: 'hidden',
    }}>
      <span style={{
        display: 'flex', alignItems: 'center', padding: '0 10px',
        fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'var(--tb-text-faint)',
      }}>Todoist</span>
      {children}
    </div>
  );
}

export function TodoistSyncButton({ onRefresh, lastSyncLabel, title }) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={handleClick} disabled={busy}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 10, fontWeight: 700, padding: '0 10px', height: 28,
        background: 'transparent', border: 'none', borderLeft: '1px solid var(--tb-border)',
        color: 'var(--tb-text-secondary)',
        cursor: busy ? 'wait' : 'pointer', fontFamily: "'Open Sans', sans-serif",
        opacity: busy ? 0.6 : 1, transition: 'opacity 0.15s',
      }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
        style={{ animation: busy ? 'tbspin 0.8s linear infinite' : 'none', flexShrink: 0 }}>
        <path d="M9 5a4 4 0 1 1-1.2-2.8M9 1.5V3.5H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
      <span>Aggiorna</span>
      {lastSyncLabel && <span style={{ color: 'var(--tb-text-faint)', fontWeight: 600 }}>{lastSyncLabel}</span>}
      <style>{`@keyframes tbspin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}

export function TodoistImportButton({ dates, projects, onOpen }) {
  const [busy, setBusy] = useState(false);

  async function openImport() {
    setBusy(true);
    try {
      const debug = localStorage.getItem('timebox-todoist-debug') === 'true';
      const result = await window.api.getCompletedTodoistTasks(projects, dates, debug);
      if (result.error === 'no_token') {
        alert('Token Todoist non configurato. Vai in Impostazioni → Todoist per inserirlo.');
        return;
      }
      if (result.error) {
        alert(`Errore recupero completati Todoist${result.status ? ` (${result.status})` : ''}.`);
        return;
      }
      if (!result.tasks?.length) {
        alert('Nessun nuovo task Todoist completato da importare in questa settimana.');
        return;
      }
      onOpen({
        tasks: result.tasks.map(task => ({
          ...task,
          draft: task.hours ? toHHMM(task.hours) : '',
        })),
      });
    } catch (err) {
      alert(`Errore recupero completati Todoist: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={openImport}
      disabled={busy}
      title="Importa nel timesheet i task Todoist completati e non ancora importati"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 10, fontWeight: 700, padding: '0 10px', height: 28,
        background: 'transparent', border: 'none', borderLeft: '1px solid var(--tb-border)',
        color: 'var(--tb-text-secondary)',
        cursor: busy ? 'wait' : 'pointer', fontFamily: "'Open Sans', sans-serif",
        opacity: busy ? 0.6 : 1,
      }}
    >
      <span aria-hidden="true">↓</span>
      <span>{busy ? 'Caricamento…' : 'Importa completati'}</span>
    </button>
  );
}

function TodoistImportTimeInput({ value, onChange, focused, onNavigate }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!focused) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focused]);

  function normalize() {
    const hours = parseHHMM(value);
    onChange(hours > 0 ? toHHMM(hours) : '');
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const current = parseHHMM(value);
      const next = Math.max(0, current + (event.key === 'ArrowUp' ? 0.25 : -0.25));
      onChange(next > 0 ? toHHMM(next) : '');
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      normalize();
      onNavigate(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === 'Enter' && !event.metaKey) {
      event.preventDefault();
      normalize();
    }
  }

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={event => onChange(event.target.value)}
      onBlur={normalize}
      onKeyDown={handleKeyDown}
      placeholder="hh:mm"
      aria-label="Tempo da importare"
      style={{
        width: 58, height: 28, flexShrink: 0,
        borderRadius: 4, border: '1px solid var(--tb-border-mid)',
        background: 'var(--tb-input-bg)', color: 'var(--tb-text-primary)',
        fontFamily: "'Open Sans', sans-serif", fontSize: 11, fontWeight: 700,
        textAlign: 'center', outline: 'none', padding: '0 5px',
      }}
    />
  );
}

export function TodoistImportDialog({ dialog, clients, projects, onClose, onImport }) {
  const [tasks, setTasks] = useState(dialog.tasks);
  const [busy, setBusy] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);

  const importable = tasks
    .map(task => ({ ...task, importHours: parseHHMM(task.draft) }))
    .filter(task => task.importHours > 0);
  const totalHours = importable.reduce((sum, task) => sum + task.importHours, 0);

  function updateDraft(taskId, draft) {
    setTasks(current => current.map(task => task.id === taskId ? { ...task, draft } : task));
  }

  async function confirmImport() {
    if (busy || importable.length === 0) return;
    setBusy(true);
    try {
      await onImport(importable.map(task => ({
        ...task,
        date: task.completedDate,
        hours: task.importHours,
      })));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.metaKey && event.key === 'Enter') {
        event.preventDefault();
        confirmImport();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });

  const groups = [];
  for (const task of tasks) {
    const key = `${task.completedDate}::${task.projectId}`;
    let group = groups.find(item => item.key === key);
    if (!group) {
      const project = projects.find(item => item.id === task.projectId);
      const client = project ? clients.find(item => item.id === project.clientId) : null;
      group = { key, date: task.completedDate, project, client, tasks: [] };
      groups.push(group);
    }
    group.tasks.push(task);
  }

  let inputIndex = 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Importa task Todoist completati"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.58)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{
        width: 'min(620px, 100%)', maxHeight: 'min(720px, calc(100vh - 48px))',
        background: 'var(--tb-panel-bg)', border: '1px solid var(--tb-border-mid)',
        borderRadius: 8, boxShadow: '0 18px 55px rgba(0,0,0,0.42)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid var(--tb-border)',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--tb-text-primary)' }}>Importa completati Todoist</div>
            <div style={{ marginTop: 2, fontSize: 10, color: 'var(--tb-text-muted)' }}>
              Le righe senza tempo resteranno disponibili al prossimo import.
            </div>
          </div>
          <button
            onClick={onClose}
            title="Chiudi"
            aria-label="Chiudi"
            style={{
              width: 28, height: 28, borderRadius: 4,
              border: '1px solid var(--tb-border)', background: 'transparent',
              color: 'var(--tb-text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1,
            }}
          >×</button>
        </div>

        <div style={{ overflowY: 'auto', padding: '10px 16px 14px' }}>
          {groups.map(group => (
            <section key={group.key} style={{ padding: '10px 0', borderBottom: '1px solid var(--tb-border-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--tb-text-faint)' }}>
                  {new Date(`${group.date}T00:00:00`).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
                <span style={{ fontSize: 11, fontWeight: 800, color: group.client?.color ?? 'var(--tb-text-primary)' }}>
                  {group.project?.name ?? 'Progetto non disponibile'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.tasks.map(task => {
                  const currentIndex = inputIndex++;
                  return (
                    <div key={task.id} style={{
                      minHeight: 32, display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <TodoistImportTimeInput
                        value={task.draft}
                        onChange={draft => updateDraft(task.id, draft)}
                        focused={focusIndex === currentIndex}
                        onNavigate={direction => setFocusIndex(
                          (currentIndex + direction + tasks.length) % tasks.length
                        )}
                      />
                      <MarkdownText
                        text={task.content || task.title || '(senza titolo)'}
                        style={{
                          minWidth: 0, fontSize: 11, fontWeight: 650,
                          color: 'var(--tb-text-primary)', lineHeight: 1.35,
                          overflowWrap: 'anywhere',
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '12px 16px', borderTop: '1px solid var(--tb-border)',
          background: 'var(--tb-panel-bg-soft)',
        }}>
          <span style={{ fontSize: 10, color: 'var(--tb-text-muted)' }}>
            ↑/↓ 15 min · Tab cambia campo · ⌘↵ importa
          </span>
          <button
            onClick={confirmImport}
            disabled={busy || importable.length === 0}
            style={{
              minWidth: 154, height: 32, borderRadius: 5,
              border: '1px solid var(--tb-navbtn-border)', background: importable.length > 0 ? 'var(--tb-tab-active-bg)' : 'transparent',
              color: importable.length > 0 ? 'var(--tb-tab-active-text)' : 'var(--tb-text-faint)',
              cursor: busy || importable.length === 0 ? 'default' : 'pointer',
              fontFamily: "'Open Sans', sans-serif", fontSize: 11, fontWeight: 800,
              opacity: busy ? 0.65 : 1,
            }}
          >
            {busy ? 'Importazione…' : `Importa ${fmtH(totalHours)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
