import React from 'react';

export default function DivergenceDot({ tooltip, bottom = 3, right = 3 }) {
  return (
    <span
      title={tooltip}
      className="tb-divergent"
      style={{
        position: 'absolute', bottom, right,
        pointerEvents: 'auto',
        lineHeight: 1,
      }}
    >
      ◇
    </span>
  );
}
