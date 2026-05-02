import React from 'react';

export default function WeekendCell({ slim }) {
  return (
    <div style={{
      minHeight: slim ? 36 : 80,
      borderRadius: 6,
      background: 'var(--tb-cell-weekend)',
      border: '1px solid var(--tb-border-soft)',
      opacity: 0.4,
    }} />
  );
}
