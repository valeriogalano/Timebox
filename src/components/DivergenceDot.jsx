import React from 'react';

export default function DivergenceDot({ tooltip, bottom = 3, right = 3 }) {
  return (
    <span
      title={tooltip}
      style={{
        position: 'absolute', bottom, right,
        width: 5, height: 5, borderRadius: '50%',
        background: '#E07B3A', pointerEvents: 'auto',
      }}
    />
  );
}
