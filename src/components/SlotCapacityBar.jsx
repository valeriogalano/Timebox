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
  const color = overflow ? '#E05252' : fillPct >= 0.9 ? '#E07B3A' : '#4A8FE8';
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
        background: 'var(--tb-panel-bg-soft)',
        border: `1px solid ${overflow ? '#E0525244' : 'var(--tb-border-soft)'}`,
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${fillPct * 100}%`,
          background: empty ? 'transparent' : color,
          transition: 'width 0.25s ease, background 0.15s',
        }} />
      </div>
      <span style={{
        flexShrink: 0,
        fontSize: compact ? 7 : 8,
        lineHeight: 1,
        fontWeight: 800,
        color: empty ? 'var(--tb-text-faint)' : color,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {label}
      </span>
    </div>
  );
}
