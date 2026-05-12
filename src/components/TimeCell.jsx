import React, { useState, useEffect, useRef } from 'react';
import { toHHMM, parseHHMM } from '../utils';

export default function TimeCell({ hours, billed, isBillable, isFuture, isToday, clientColor, colIndex, onSave }) {
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
      const currentCell = inputRef.current.closest('[data-timecell]');
      const col = currentCell?.dataset.col;
      const allCells = Array.from(document.querySelectorAll('[data-timecell]'));
      const allCols = [...new Set(allCells.map(el => +el.dataset.col))].sort((a, b) => a - b);
      const colCells = allCells.filter(el => el.dataset.col === col);
      const cellIdx = colCells.indexOf(currentCell);
      const colIdx = allCols.indexOf(+col);
      let target;
      if (!e.shiftKey) {
        if (cellIdx < colCells.length - 1) target = colCells[cellIdx + 1];
        else if (colIdx < allCols.length - 1) target = allCells.find(el => +el.dataset.col === allCols[colIdx + 1]);
      } else {
        if (cellIdx > 0) target = colCells[cellIdx - 1];
        else if (colIdx > 0) {
          const prevColCells = allCells.filter(el => +el.dataset.col === allCols[colIdx - 1]);
          target = prevColCells[prevColCells.length - 1];
        }
      }
      if (target) { target.click(); requestAnimationFrame(() => target.scrollIntoView({ behavior: 'smooth', block: 'nearest' })); }
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
      data-today={isToday ? 'true' : undefined}
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
          {isBillable && billed && (
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

    </div>
  );
}
