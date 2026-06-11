import React from 'react';

// Handles the Todoist markdown that appears in task titles.
function createTokenMatcher() {
  return /(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))|(\*\*\*([\s\S]+?)\*\*\*)|(\*\*([\s\S]+?)\*\*)|(~~([\s\S]+?)~~)|(\*([^*]+?)\*)|(_([^_]+?)_)/g;
}

function renderInline(text, keyPrefix = 'md') {
  const parts = [];
  const token = createTokenMatcher();
  let last = 0;
  let m;

  while ((m = token.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));

    const key = `${keyPrefix}-${m.index}`;
    if (m[1]) {
      parts.push(<code key={key} style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>{m[2]}</code>);
    } else if (m[3]) {
      parts.push(
        <a
          key={key}
          href={m[5]}
          target="_blank"
          rel="noreferrer"
          style={{ color: 'inherit', textDecoration: 'underline', textDecorationThickness: '1px', textUnderlineOffset: 2 }}
          onClick={e => e.stopPropagation()}
        >
          {renderInline(m[4], key)}
        </a>
      );
    } else if (m[6]) {
      parts.push(<strong key={key} style={{ fontWeight: 800 }}><em>{renderInline(m[7], key)}</em></strong>);
    } else if (m[8]) {
      parts.push(<strong key={key} style={{ fontWeight: 800 }}>{renderInline(m[9], key)}</strong>);
    } else if (m[10]) {
      parts.push(<del key={key}>{renderInline(m[11], key)}</del>);
    } else if (m[12]) {
      parts.push(<em key={key}>{renderInline(m[13], key)}</em>);
    } else if (m[14]) {
      parts.push(<em key={key}>{renderInline(m[15], key)}</em>);
    }

    last = m.index + m[0].length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

export default function MarkdownText({ text, style }) {
  if (!text) return null;

  return <span style={style}>{renderInline(text)}</span>;
}
