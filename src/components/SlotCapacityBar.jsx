import React from 'react';
import { toHHMM } from '../utils';
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
  const label = overflow ? `>${toHHMM(capacity)}` : `${toHHMM(load) || '0:00'} / ${toHHMM(capacity)}`;
  const title = `Capacità slot: ${toHHMM(load) || '0:00'} su ${toHHMM(capacity)}. Pianificate ${toHHMM(plannedHours) || '0:00'}, tracciate ${toHHMM(loggedHours) || '0:00'}.`;

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
        overflow: 'visible',
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
        {overflow && <span className="tb-hatch" style={{ position: 'absolute', top: 0, bottom: 0, left: '100%', width: `${Math.min(30, (fillPct - 1) * 100 || 15)}%`, borderRadius: '0 3px 3px 0' }} />}
            <span className="tb-tick" style={{ left: '100%' }} />
      </div>
      <span style={{
        flexShrink: 0,
        fontSize: compact ? 7 : 8,
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
