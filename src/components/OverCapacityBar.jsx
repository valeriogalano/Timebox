import React from 'react';

// Barra "carico su capacità". Il bordo destro della traccia è sempre il tetto:
// il fill si ferma al 100% e lo sforamento è segnalato dal quadratino tratteggiato
// accanto alla barra — stesso linguaggio di SlotCapacityBar (Settimana / Pianificato).
export function barFill(value, cap) {
  const v = Math.max(0, value || 0);
  const c = Math.max(0, cap || 0);
  if (c <= 0) return { fill: 100, over: false };
  return { fill: Math.min(100, (v / c) * 100), over: v > c + 0.001 };
}

export default function OverCapacityBar({
  value,
  cap,
  color = 'var(--tb-bar-tracked)',
  height = 8,
  fillOpacity = 1,
  overTitle = 'Oltre capacità',
  style,
}) {
  const { fill, over } = barFill(value, cap);
  const r = height / 2;
  const dot = Math.max(7, height);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, ...style }}>
      <div style={{
        position: 'relative', flex: 1, minWidth: 0, height, borderRadius: r,
        background: 'var(--tb-bar-track)', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: `${fill}%`,
          background: color, borderRadius: r, opacity: fillOpacity, transition: 'width 0.4s ease',
        }} />
      </div>
      {over && (
        <span className="tb-hatch" title={overTitle} style={{
          width: dot, height: dot, borderRadius: 2, flexShrink: 0,
        }} />
      )}
    </div>
  );
}
