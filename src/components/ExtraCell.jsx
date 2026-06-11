import React, { useRef, useState } from 'react';
import { toHHMM } from '../utils';
import TodoistTaskTooltip from './TodoistTaskTooltip';

function OrphanBlock({ orphan, cl, isToday, isFuture }) {
  const [hover, setHover] = useState(false);
  const blockRef = useRef(null);
  const showTooltip = hover && (isToday || isFuture) && orphan.tasks && orphan.tasks.length > 0;
  return (
    <div key={'o-' + orphan.clientId}
      ref={blockRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Task Todoist senza blocco pianificato"
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 5,
        borderLeft: `3px solid ${cl.color}aa`,
        border: `1px dashed ${cl.color}55`,
        borderRadius: 4, padding: '2px 6px',
        backgroundImage: `repeating-linear-gradient(135deg, ${cl.color}10 0 4px, transparent 4px 8px)`,
      }}>
      {showTooltip && (
        <TodoistTaskTooltip anchorRef={blockRef} tasks={orphan.tasks} color={cl.color} />
      )}
      <span style={{
        fontSize: 10, fontWeight: 700, color: cl.color, flex: 1, opacity: 0.85,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{cl.name}</span>
      <span style={{
        fontSize: 9, fontWeight: 700, color: cl.color, opacity: 0.7, flexShrink: 0,
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>{orphan.slot === 'pm' ? 'PM' : 'AM'}</span>
      <span style={{ fontSize: 11, fontWeight: 800, color: cl.color, flexShrink: 0 }}>
        {toHHMM(orphan.hours)}
      </span>
    </div>
  );
}

export default function ExtraCell({ blocks, orphanTodoist, clients, isToday, isFuture }) {
  const hasOrphans = orphanTodoist && orphanTodoist.length > 0;
  if ((!blocks || blocks.length === 0) && !hasOrphans) {
    return (
      <div style={{
        minHeight: 32, borderRadius: 6, padding: '4px 6px',
        background: isToday ? 'var(--tb-cell-extra-today)' : 'var(--tb-cell-extra)',
        border: `1px dashed ${isToday ? '#E07B3A33' : 'var(--tb-border)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 10, color: 'var(--tb-border-mid)' }}>—</span>
      </div>
    );
  }

  return (
    <div style={{
      borderRadius: 6, padding: 6,
      background: isToday ? 'var(--tb-cell-extra-today)' : 'var(--tb-cell-extra)',
      border: `1px dashed ${isToday ? '#E07B3A55' : 'var(--tb-border-mid)'}`,
      display: 'flex', flexDirection: 'column', gap: 3,
    }}>
      {blocks && blocks.map(({ clientId, hours }) => {
        const cl = clients.find(c => c.id === clientId);
        if (!cl) return null;
        return (
          <div key={clientId} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: cl.color + '15',
            borderLeft: `3px solid ${cl.color}`,
            borderRadius: 4, padding: '3px 7px',
          }}>
            <span style={{
              fontSize: 10, fontWeight: 700, color: cl.color, flex: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {cl.name}
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, color: cl.color, flexShrink: 0 }}>
              {toHHMM(hours)}
            </span>
          </div>
        );
      })}
      {hasOrphans && orphanTodoist.map((orphan) => {
        const cl = clients.find(c => c.id === orphan.clientId);
        if (!cl) return null;
        return <OrphanBlock key={'o-' + orphan.clientId + orphan.slot} orphan={orphan} cl={cl} isToday={isToday} isFuture={isFuture} />;
      })}
    </div>
  );
}
