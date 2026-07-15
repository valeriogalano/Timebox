import React from 'react';

// I glifi Unicode ●/◑/○ rendono a dimensioni diverse a seconda del font — disegnati
// via SVG per garantire lo stesso ingombro visivo indipendentemente dal glifo/font.
const SHAPES = {
  active: color => <circle cx="5" cy="5" r="4" fill={color} />,
  minimal: color => (
    <>
      <circle cx="5" cy="5" r="4" fill="none" stroke={color} strokeWidth="1.3" />
      <path d="M5 1.35a3.65 3.65 0 0 0 0 7.3z" fill={color} />
    </>
  ),
  closed: color => <circle cx="5" cy="5" r="4" fill="none" stroke={color} strokeWidth="1.3" />,
};

export default function AreaStatusGlyph({ status, size = 10, color = 'currentColor' }) {
  const shape = SHAPES[status];
  if (!shape) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" style={{ display: 'block', flexShrink: 0 }}>
      {shape(color)}
    </svg>
  );
}
