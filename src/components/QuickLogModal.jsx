import React, { useState, useEffect, useRef } from 'react';
import { fmtH } from '../utils';

function parseTimeSpec(s) {
  s = s.trim().toLowerCase();
  if (!s) return null;
  if (/^\d+:\d+$/.test(s)) {
    const [h, m] = s.split(':').map(Number);
    return h + m / 60;
  }
  const m1 = s.match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+)m)?$/);
  if (m1 && (m1[1] || m1[2])) {
    return parseFloat(m1[1] || '0') + parseInt(m1[2] || '0', 10) / 60;
  }
  if (/^\d+(?:[.,]\d+)?$/.test(s)) {
    const numeric = parseFloat(s.replace(',', '.'));
    return numeric > 4 ? numeric / 60 : numeric;
  }
  return null;
}

export function parseQuickLogQuery(q) {
  const trimmed = q.trim();
  const m = trimmed.match(/^(.*?)\s*\+(.*)$/);
  if (!m) return { search: trimmed, addHours: null };
  const hours = parseTimeSpec(m[2].trim());
  return { search: m[1].trim(), addHours: (hours != null && hours > 0) ? hours : null };
}

export default function QuickLogModal({ projects, clients, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef();
  const listRef = useRef();

  const { search, addHours } = parseQuickLogQuery(query);
  const addMode = addHours != null;

  const active = projects.filter(p => !p.archived);
  const q = search.toLowerCase();
  const filtered = q
    ? active.filter(p =>
        p.name.toLowerCase().includes(q) ||
        clients.find(c => c.id === p.clientId)?.name.toLowerCase().includes(q) ||
        (p.description?.toLowerCase() || '').includes(q)
      )
    : active;

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setSelectedIdx(0); }, [query]);

  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[selectedIdx];
    if (item) item.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  function highlight(text, term) {
    if (!term) return text;
    const idx = text.toLowerCase().indexOf(term);
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: 'var(--tb-text-primary)', color: 'var(--tb-panel-bg)', borderRadius: 2, padding: '0 1px' }}>
          {text.slice(idx, idx + term.length)}
        </mark>
        {text.slice(idx + term.length)}
      </>
    );
  }

  function commit() {
    if (!filtered[selectedIdx]) return;
    onSelect(filtered[selectedIdx].id, addMode ? addHours : null);
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, filtered.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '18vh',
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--tb-panel-bg)', borderRadius: 10,
          border: '1px solid var(--tb-border)',
          width: 420, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
        }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--tb-border-soft)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <svg width="14" height="14" viewBox="0 0 15 15" fill="none" style={{ flexShrink: 0, color: 'var(--tb-text-faint)' }}>
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10 10L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Cerca progetto… (es. Acme +1h, +30, +30m)"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontFamily: "'Open Sans', sans-serif", fontSize: 14, fontWeight: 600,
              color: 'var(--tb-text-primary)',
            }}
          />
          {addMode ? (
            <span style={{
              fontSize: 10, fontWeight: 700, color: 'var(--tb-panel-bg)',
              background: 'var(--tb-text-primary)', borderRadius: 4,
              padding: '3px 6px', flexShrink: 0, fontFamily: 'monospace',
            }}>+{fmtH(addHours)} oggi</span>
          ) : (
            <span style={{ fontSize: 10, color: 'var(--tb-text-faint)', flexShrink: 0, fontFamily: 'monospace' }}>⌘L</span>
          )}
        </div>

        <div ref={listRef} style={{ overflowY: 'auto', maxHeight: 340 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: 'var(--tb-text-muted)' }}>
              Nessun progetto trovato
            </div>
          ) : filtered.map((project, i) => {
            const client = clients.find(c => c.id === project.clientId);
            return (
              <div
                key={project.id}
                onClick={() => onSelect(project.id, addMode ? addHours : null)}
                onMouseEnter={() => setSelectedIdx(i)}
                style={{
                  padding: '10px 16px', cursor: 'pointer',
                  background: i === selectedIdx ? 'var(--tb-cell-hover)' : 'transparent',
                  display: 'flex', alignItems: 'center', gap: 10,
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--tb-border-soft)' : 'none',
                  transition: 'background 0.08s',
                }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: client?.color ?? '#888', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {project.name}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--tb-text-muted)', fontWeight: 600 }}>{client?.name ?? ''}</div>
                  {q && project.description?.toLowerCase().includes(q) && (
                    <div style={{ fontSize: 10, color: 'var(--tb-text-faint)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {highlight(project.description, q)}
                    </div>
                  )}
                </div>
                {i === selectedIdx && (
                  <span style={{ fontSize: 10, color: 'var(--tb-text-faint)', fontFamily: 'monospace', flexShrink: 0 }}>↵</span>
                )}
              </div>
            );
          })}
        </div>

        <div style={{
          padding: '8px 16px', borderTop: '1px solid var(--tb-border-soft)',
          display: 'flex', gap: 16,
          fontSize: 10, color: 'var(--tb-text-faint)', fontWeight: 600,
        }}>
          <span>↑↓ naviga</span>
          <span>↵ {addMode ? 'somma' : 'apri'}</span>
          <span>Esc chiudi</span>
          {!addMode && <span style={{ marginLeft: 'auto', opacity: 0.7 }}>aggiungi <code style={{ fontFamily: 'monospace' }}>+1h</code>, <code style={{ fontFamily: 'monospace' }}>+30</code> o <code style={{ fontFamily: 'monospace' }}>+30m</code> per sommare</span>}
        </div>
      </div>
    </div>
  );
}
