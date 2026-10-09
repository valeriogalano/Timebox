import React from 'react';
import { fmtH } from '../utils';
import { getSlotCapacityLoad, normalizeSlotCapacityHours } from '../slot-capacity';

export default function SlotCapacityBar({
  plannedHours = 0,
  loggedHours = 0,
  capacityHours,
  compact = false,
}) {
  const capacity = normalizeSlotCapacityHours(capacityHours);
  const load = getSlotCapacityLoad(plannedHours, loggedHours);
  const fillPct = capacity > 0 ? Math.min(1, load / capacity) : 0;
  const overflow = load > capacity + 0.001;
  const empty = load <= 0.001;
  // Redesign: nessun colore di stato. Fill neutro + tratteggio oltre capacità.
  const fillBg = 'var(--tb-bar-tracked)';
  const label = overflow ? `>${fmtH(capacity)}` : `${fmtH(load)} / ${fmtH(capacity)}`;
  const title = `Capacità slot: ${fmtH(load)} su ${fmtH(capacity)}. Pianificate ${fmtH(plannedHours)}, tracciate ${fmtH(loggedHours)}.`;

  return (
    <div title={title} style={{ display: 'flex', alignItems: 'center', gap: compact ? 3 : 4, minHeight: compact ? 10 : 13 }}>
      <div style={{
        position: 'relative',
        flex: 1,
        minWidth: 0,
        height: compact ? 4 : 5,
        borderRadius: 3,
        background: 'var(--tb-bar-track)',
        border: '1px solid var(--tb-border-soft)',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${Math.min(100, fillPct * 100)}%`,
          background: empty ? 'transparent' : fillBg,
          borderRadius: 3,
          transition: 'width 0.25s ease',
        }} />
      </div>
      {overflow && (
        <span title="Slot oltre capacità" className="tb-hatch" style={{ width: compact ? 7 : 8, height: compact ? 7 : 8, borderRadius: 2, flexShrink: 0 }} />
      )}
      <span style={{
        flexShrink: 0,
        fontSize: 11,
        lineHeight: 1,
        fontWeight: 800,
        color: empty ? 'var(--tb-text-faint)' : 'var(--tb-text-primary)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {label}
      </span>
    </div>
  );
}
