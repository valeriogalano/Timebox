import React, { useState, useEffect, useRef } from 'react';
import { fmtH, parseHHMM } from '../utils';
import DivergenceDot from './DivergenceDot';

function focusCell(target) {
  if (!target) return;
  target.click();
  requestAnimationFrame(() => target.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
}

function getTimeCells() {
  return Array.from(document.querySelectorAll('[data-timecell]'));
}

function getProjectRowCells(projectId) {
  return getTimeCells()
    .filter(el => el.dataset.project === projectId)
    .sort((a, b) => Number(a.dataset.col) - Number(b.dataset.col));
}

export default function TimeCell({
  hours, billableHours, billed, isBillable,
  isFuture, isToday, clientColor, colIndex, projectId,
  viewMode = 'tracked',
  onSave, onResetBillable, onEditStart, onEditEnd,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [hover, setHover] = useState(false);
  const inputRef = useRef();
  const cellRef = useRef();

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.select();
  }, [editing]);

  const hasEntry = hours > 0;
  const billable = (billableHours ?? hours);
  const divergent = isBillable && hasEntry && billableHours !== null && billableHours !== undefined && Math.abs(billableHours - hours) > 0.001;
  const inBillableView = viewMode === 'billable';
  const lockedInBillable = inBillableView && !isBillable;
  const displayValue = inBillableView ? billable : hours;
  const showDash = inBillableView && hasEntry && billableHours === 0;

  function startEdit() {
    if (lockedInBillable) return;
    const base = inBillableView ? (hasEntry ? billable : 0) : hours;
    setDraft(base > 0 ? fmtH(base) : '');
    setEditing(true);
    onEditStart?.();
  }

  function commit() {
    const parsed = parseHHMM(draft);
    if (inBillableView) {
      if (!hasEntry) {
        if (parsed > 0) onSave({ hours: parsed, billableHours: null });
      } else {
        const matchesTracked = Math.abs(parsed - hours) < 0.001;
        onSave({ hours, billableHours: matchesTracked ? null : parsed });
      }
    } else {
      onSave({ hours: parsed, billableHours: hasEntry && parsed > 0 ? (billableHours ?? null) : null });
    }
    setEditing(false);
    onEditEnd?.();
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
      const currentCell = inputRef.current?.closest('[data-timecell]');
      const col = currentCell?.dataset.col;
      const colCells = getTimeCells().filter(el => el.dataset.col === col);
      const cellIdx = colCells.indexOf(currentCell);
      if (cellIdx >= 0 && cellIdx < colCells.length - 1) focusCell(colCells[cellIdx + 1]);
      return;
    }
    // Annullando, il focus torna alla cella: senza, Tab ripartirebbe dall'inizio della pagina.
    if (e.key === 'Escape') { setEditing(false); onEditEnd?.(); cellRef.current?.focus(); }
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      commit();
      const currentCell = inputRef.current?.closest('[data-timecell]');
      const rowCells = getProjectRowCells(projectId);
      const cellIdx = rowCells.indexOf(currentCell);
      const offset = e.key === 'ArrowRight' ? 1 : -1;
      focusCell(rowCells[cellIdx + offset]);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      commit();
      const currentCell = inputRef.current.closest('[data-timecell]');
      const col = currentCell?.dataset.col;
      const allCells = getTimeCells();
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
      focusCell(target);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const current = parseHHMM(draft);
      const next = Math.max(0, current + (e.key === 'ArrowUp' ? 0.25 : -0.25));
      setDraft(next > 0 ? fmtH(next) : '');
    }
  }

  function handleReset(e) {
    e.stopPropagation();
    onResetBillable?.();
  }

  return (
    <div
      ref={cellRef}
      data-timecell
      // In modifica il controllo è il campo: la cella esce dal giro di Tab e non è più un pulsante.
      role={editing ? undefined : 'button'}
      tabIndex={lockedInBillable || editing ? -1 : 0}
      aria-label={editing ? undefined : `Ore: ${hasEntry ? fmtH(displayValue) : 'nessuna'}. Invio per modificare`}
      onKeyDown={e => {
        // Solo sulla cella: i tasti premuti nel campo arrivano qui per bubbling.
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); startEdit(); }
      }}
      data-col={colIndex}
      data-project={projectId}
      data-today={isToday ? 'true' : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: editing ? 'var(--tb-input-bg)'
          : isToday ? 'var(--tb-cell-today)'
          : (hover && !lockedInBillable) ? 'var(--tb-cell-hover)' : 'var(--tb-cell-bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 44,
        cursor: lockedInBillable ? 'default' : 'pointer',
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
          placeholder="1h 30m"
          style={{
            width: '100%', height: '100%', textAlign: 'center', border: 'none', outline: 'none',
            fontFamily: "'Open Sans', sans-serif", fontSize: 13, fontWeight: 700,
            color: clientColor, background: 'transparent', padding: '0 4px',
          }}
        />
      ) : lockedInBillable ? null : hasEntry ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          {showDash ? (
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tb-text-faint)', letterSpacing: '-0.01em' }}>
              —
            </span>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 800, color: clientColor, letterSpacing: '-0.01em' }}>
              {fmtH(displayValue)}
            </span>
          )}
          {isBillable && billed && (
            <span title="Fatturato" style={{ fontSize: 8, fontWeight: 800, color: 'var(--tb-text-secondary)',
              border: '1px solid var(--tb-border-mid)', padding: '0 3px', borderRadius: 2, lineHeight: 1.5 }}>
              €
            </span>
          )}
        </div>
      ) : (
        <span style={{
          fontSize: 12, color: hover ? 'var(--tb-text-faint)' : 'transparent',
          fontWeight: 600, transition: 'color 0.1s', letterSpacing: '0.02em',
        }}>
          ore
        </span>
      )}
      {!editing && divergent && (
        <DivergenceDot
          tooltip={inBillableView
            ? `Tracciate: ${fmtH(hours)}`
            : `Fatturabili: ${fmtH(billable)}`}
        />
      )}
      {!editing && hover && divergent && inBillableView && (
        <button
          onClick={handleReset}
          title="Resetta override · usa il valore tracciato"
          style={{
            position: 'absolute', bottom: 2, left: 2,
            background: 'var(--tb-panel-bg)', border: '1px solid var(--tb-border)',
            fontSize: 9, padding: '0 4px', borderRadius: 3,
            color: 'var(--tb-text-muted)', cursor: 'pointer', fontWeight: 700,
            fontFamily: "'Open Sans', sans-serif", lineHeight: 1.5,
          }}>
          = {fmtH(hours)}
        </button>
      )}
    </div>
  );
}
