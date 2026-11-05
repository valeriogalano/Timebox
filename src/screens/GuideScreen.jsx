import React, { useMemo } from 'react';
import MarkdownText from '../components/MarkdownText';
import guideSource from '../../docs/guida.md?raw';
import { parseGuide } from '../guide-markdown';

const text = { color: 'var(--tb-text-secondary)', fontSize: 13, lineHeight: 1.65 };

export default function GuideScreen({ source = guideSource }) {
  const blocks = useMemo(() => parseGuide(source), [source]);
  const sections = blocks.filter(b => b.type === 'h2');
  const go = id => document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });

  return (
    <div style={{ maxWidth: 720, paddingBottom: 48 }}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h1':
            return (
              <React.Fragment key={i}>
                <h1 id={b.id} style={{ fontSize: 20, fontWeight: 800, color: 'var(--tb-text-primary)', margin: '0 0 8px' }}>{b.text}</h1>
                <nav aria-label="Indice" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '12px 0 8px' }}>
                  {sections.map(s => (
                    <button key={s.id} type="button" onClick={() => go(s.id)} style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                      border: '1px solid var(--tb-border-mid)', background: 'transparent',
                      color: 'var(--tb-text-muted)', fontFamily: "'Open Sans', sans-serif",
                    }}>{s.text}</button>
                  ))}
                </nav>
              </React.Fragment>
            );
          case 'h2':
            return <h2 key={i} id={b.id} style={{ fontSize: 16, fontWeight: 800, color: 'var(--tb-text-primary)', margin: '32px 0 4px', paddingTop: 12, borderTop: '1px solid var(--tb-border)' }}>{b.text}</h2>;
          case 'h3':
            return <h3 key={i} id={b.id} style={{ fontSize: 13, fontWeight: 800, color: 'var(--tb-text-primary)', margin: '20px 0 4px' }}>{b.text}</h3>;
          case 'ul':
            return (
              <ul key={i} style={{ ...text, margin: '6px 0', paddingLeft: 20 }}>
                {b.items.map((it, j) => (
                  <li key={j} style={{ margin: '3px 0' }}>
                    <MarkdownText text={it.text} />
                    {it.children.length > 0 && (
                      <ul style={{ paddingLeft: 18, margin: '3px 0' }}>
                        {it.children.map((c, k) => <li key={k}><MarkdownText text={c} /></li>)}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            );
          default:
            return <p key={i} style={{ ...text, margin: '6px 0' }}><MarkdownText text={b.text} /></p>;
        }
      })}
    </div>
  );
}
