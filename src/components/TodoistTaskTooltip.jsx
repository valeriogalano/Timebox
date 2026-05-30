import React, { useLayoutEffect, useState } from 'react';
import { toHHMM } from '../utils';
import MarkdownText from './MarkdownText';

export default function TodoistTaskTooltip({ anchorRef, tasks, color }) {
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const width = 240;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const top = rect.top > 120 ? rect.top - 8 : rect.bottom + 8;
    const transform = rect.top > 120 ? 'translateY(-100%)' : 'none';

    setPos({ left, top, width, transform });
  }, [anchorRef, tasks]);

  if (!pos) return null;

  return (
    <div style={{
      position: 'fixed',
      left: pos.left,
      top: pos.top,
      width: pos.width,
      transform: pos.transform,
      background: 'var(--tb-panel-bg)',
      border: '1px solid var(--tb-border-mid)',
      borderRadius: 6,
      padding: '6px 8px',
      boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: 5,
      pointerEvents: 'none',
    }}>
      {tasks.map(t => (
        <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <MarkdownText text={t.content || '(senza titolo)'} style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--tb-text-primary)',
            lineHeight: 1.3,
            wordBreak: 'break-word',
          }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 9, color, fontWeight: 600 }}>{toHHMM(t.hours)}</span>
            <span style={{ fontSize: 9, color: 'var(--tb-text-faint)' }}>{t.projectName}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
