import React from 'react';

// Handles **bold**, ~~strikethrough~~, `code`, *italic*/_italic_, [link](url) → text only
const TOKEN = /(\*\*|~~|`)(.+?)\1|([*_])(.+?)\3|\[([^\]]+)\]\([^)]+\)/g;

export default function MarkdownText({ text, style }) {
  if (!text) return null;

  const parts = [];
  let last = 0;
  TOKEN.lastIndex = 0;
  let m;

  while ((m = TOKEN.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));

    if      (m[1] === '**') parts.push(<strong key={m.index} style={{ fontWeight: 800 }}>{m[2]}</strong>);
    else if (m[1] === '~~') parts.push(<del key={m.index}>{m[2]}</del>);
    else if (m[1] === '`')  parts.push(<code key={m.index} style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>{m[2]}</code>);
    else if (m[3])          parts.push(<em key={m.index}>{m[4]}</em>);
    else if (m[5])          parts.push(m[5]);

    last = m.index + m[0].length;
  }

  if (last < text.length) parts.push(text.slice(last));

  return <span style={style}>{parts.length ? parts : text}</span>;
}
