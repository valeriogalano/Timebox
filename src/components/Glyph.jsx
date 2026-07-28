import React from 'react';

// Dispatch di glifi "di segnale" usati nelle viste (trend, consuntivo, stato).
// ▴ / ▾ / ▸ non sono coperti in modo coerente da Open Sans — cadono su fallback
// di sistema con peso/offset diversi, e rispetto a ▪ / · risultano asimmetrici.
// Stesso ragionamento di AreaStatusGlyph: li disegniamo come SVG isotropo.
// Gli altri glifi (·, ▪, ✓, ✕, Δ, ○, …) restano testo dal font corrente.

const ARROW_MAP = { '▴': 'up', '▾': 'down', '▸': 'right' };

const SHAPES = {
  up: <polygon points="5,1.4 9,8.6 1,8.6" fill="currentColor" />,
  down: <polygon points="5,8.6 1,1.4 9,1.4" fill="currentColor" />,
  right: <polygon points="8.6,5 1.4,1.4 1.4,8.6" fill="currentColor" />,
};

function ArrowSvg({ kind, size, title }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      style={{ display: 'block', flexShrink: 0 }}
      role={title ? 'img' : undefined}
      aria-label={title}
    >
      {SHAPES[kind]}
      {title && <title>{title}</title>}
    </svg>
  );
}

export default function Glyph({ glyph, size = 13, className, title, style }) {
  if (!glyph) return null;
  const chars = [...glyph];
  if (chars.length && chars.every(c => ARROW_MAP[c] !== undefined)) {
    return (
      <span
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 1, verticalAlign: 'middle', ...style }}
      >
        {chars.map((c, i) => (
          <ArrowSvg key={i} kind={ARROW_MAP[c]} size={size} title={i === 0 ? title : undefined} />
        ))}
      </span>
    );
  }
  return (
    <span className={className} title={title} style={{ fontSize: size, ...style }}>
      {glyph}
    </span>
  );
}