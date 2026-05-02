import React from 'react';
import { toHHMM } from '../utils';

export default function ExtraCell({ blocks, clients, isToday }) {
  if (!blocks || blocks.length === 0) {
    return (
      <div style={{
        minHeight: 32, borderRadius: 6, padding: '4px 6px',
        background: isToday ? '#fffdf8' : '#faf9f5',
        border: `1px dashed ${isToday ? '#E07B3A33' : '#e8e7e0'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 10, color: '#ddd' }}>—</span>
      </div>
    );
  }

  return (
    <div style={{
      borderRadius: 6, padding: 6,
      background: isToday ? '#fffdf8' : '#faf9f5',
      border: `1px dashed ${isToday ? '#E07B3A55' : '#e0dfd8'}`,
      display: 'flex', flexDirection: 'column', gap: 3,
    }}>
      {blocks.map(({ clientId, hours }) => {
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
    </div>
  );
}
