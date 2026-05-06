import React, { useState, useEffect, useRef } from 'react';
import { toHHMM, parseHHMM } from '../utils';

export default function TimeCell({ hours, billed, isFuture, isToday, clientColor, colIndex, onSave, onToggleBilled }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [hover, setHover] = useState(false);
  const inputRef = useRef();

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.select();
  }, [editing]);

  function startEdit() {
    setDraft(hours > 0 ? toHHMM(hours) : '');
    setEditing(true);
  }

  function commit() {
    onSave(parseHHMM(draft));
    setEditing(false);
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') setEditing(false);
    if (e.key === 'Tab') {
      e.preventDefault();
      commit();
      const col = inputRef.current.closest('[data-timecell]')?.dataset.col;
      const all = Array.from(document.querySelectorAll(`[data-timecell][data-col="${col}"]`));
      const idx = all.indexOf(inputRef.current.closest('[data-timecell]'));
      const target = all[idx + (e.shiftKey ? -1 : 1)];
      if (target) target.click();
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const current = parseHHMM(draft);
      const next = Math.max(0, current + (e.key === 'ArrowUp' ? 0.25 : -0.25));
      setDraft(next > 0 ? toHHMM(next) : '');
    }
  }

  const hasHours = hours > 0;

  return (
    <div
      data-timecell
      data-col={colIndex}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: editing ? 'var(--tb-input-bg)'
          : isToday ? 'var(--tb-cell-today)'
          : hover ? 'var(--tb-cell-hover)' : 'var(--tb-cell-bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 44, cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.1s',
      }}
      onClick={!editing ? startEdit : undefined}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          placeholder="hh:mm"
          style={{
            width: '100%', height: '100%', textAlign: 'center', border: 'none', outline: 'none',
            fontFamily: "'Open Sans', sans-serif", fontSize: 13, fontWeight: 700,
            color: clientColor, background: 'transparent', padding: '0 4px',
          }}
        />
      ) : hasHours ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: clientColor, letterSpacing: '-0.01em' }}>
            {toHHMM(hours)}
          </span>
          {billed && (
            <span style={{ fontSize: 8, fontWeight: 800, color: '#3DB33D',
              border: '1px solid #3DB33D', padding: '0 3px', borderRadius: 2, lineHeight: 1.5 }}>
              €
            </span>
          )}
        </div>
      ) : (
        <span style={{
          fontSize: 12, color: hover ? 'var(--tb-text-faint)' : 'transparent',
          fontWeight: 600, transition: 'color 0.1s', letterSpacing: '0.02em',
        }}>
          hh:mm
        </span>
      )}

      {hasHours && !editing && hover && (
        <button
          onClick={e => { e.stopPropagation(); onToggleBilled(); }}
          title={billed ? 'Segna come non fatturato' : 'Segna come fatturato'}
          style={{
            position: 'absolute', top: 3, right: 3, background: 'none', border: 'none',
            cursor: 'pointer', color: billed ? '#3DB33D' : 'var(--tb-border-mid)', fontSize: 10, padding: 0,
            lineHeight: 1, fontWeight: 800,
          }}>
          €
        </button>
      )}
    </div>
  );
}
