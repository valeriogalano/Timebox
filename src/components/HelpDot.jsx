import React, { useState } from 'react';

// Pallino "?" con l'aiuto in un riquadro. Si apre al passaggio del mouse e col focus
// da tastiera: un `title` nativo compare solo col mouse. Il riquadro è `fixed`, così
// non viene tagliato dai pannelli con overflow nascosto.
// `color`: dentro una scheda il punto segue il testo della scheda, che da attiva ha il fondo invertito.
export default function HelpDot({ text, color = 'var(--tb-text-muted)' }) {
  const [pos, setPos] = useState(null);

  function show(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 336));
    // Nella metà bassa della finestra il riquadro si apre verso l'alto.
    setPos(r.top > window.innerHeight / 2
      ? { left, bottom: window.innerHeight - r.top + 6 }
      : { left, top: r.bottom + 6 });
  }
  const hide = () => setPos(null);

  return (
    <button
      type="button"
      aria-label={`Aiuto: ${text}`}
      onFocus={show} onBlur={hide} onMouseEnter={show} onMouseLeave={hide}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => { if (e.key === 'Escape') hide(); }}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 13, height: 13, padding: 0,
        borderRadius: '50%', border: '1px solid var(--tb-border-mid)', background: 'transparent', color,
        fontFamily: 'inherit', fontSize: 9, lineHeight: 1, cursor: 'help', letterSpacing: 0, flexShrink: 0,
      }}
    >
      ?
      {pos && (
        <span role="tooltip" style={{
          position: 'fixed', ...pos, zIndex: 1000, width: 'max-content', maxWidth: 320,
          padding: '8px 10px', borderRadius: 6, whiteSpace: 'pre-wrap', textAlign: 'left',
          background: 'var(--tb-panel-bg)', color: 'var(--tb-text-primary)', border: '1px solid var(--tb-border-mid)',
          boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
          fontSize: 11, fontWeight: 500, lineHeight: 1.45, letterSpacing: 0, textTransform: 'none', cursor: 'default',
        }}>{text}</span>
      )}
    </button>
  );
}
