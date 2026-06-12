import React from 'react';

export default function TodoistLabels({ labels, compact = false }) {
  if (!labels || labels.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: compact ? 4 : 5,
      marginTop: compact ? 2 : 4,
    }}>
      {labels.map(label => (
        <span
          key={label}
          style={{
            fontSize: compact ? 9 : 10,
            fontWeight: 700,
            lineHeight: 1.2,
            color: 'var(--tb-text-secondary)',
            background: 'var(--tb-panel-bg-soft)',
            border: '1px solid var(--tb-border)',
            borderRadius: 999,
            padding: compact ? '1px 6px' : '2px 7px',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      ))}
    </div>
  );
}
