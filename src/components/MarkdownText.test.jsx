import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import MarkdownText from './MarkdownText.jsx';

function renderMd(text) {
  return render(<MarkdownText text={text} />).container;
}

describe('MarkdownText', () => {
  test('renders nothing for empty text', () => {
    const { container } = render(<MarkdownText text="" />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders plain text as-is', () => {
    expect(renderMd('just text')).toHaveTextContent('just text');
  });

  test('bold **x** becomes a <strong>', () => {
    const c = renderMd('a **bold** b');
    const strong = c.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong).toHaveTextContent('bold');
    expect(c).toHaveTextContent('a bold b');
  });

  test('italic *x* and _x_ become <em>', () => {
    expect(renderMd('an *emphatic* word').querySelector('em')).toHaveTextContent('emphatic');
    expect(renderMd('an _emphatic_ word').querySelector('em')).toHaveTextContent('emphatic');
  });

  test('strikethrough ~~x~~ becomes <del>', () => {
    expect(renderMd('~~gone~~').querySelector('del')).toHaveTextContent('gone');
  });

  test('inline code `x` becomes <code>', () => {
    expect(renderMd('run `npm test` now').querySelector('code')).toHaveTextContent('npm test');
  });

  test('bold-italic ***x*** nests <em> inside <strong>', () => {
    const strong = renderMd('***loud***').querySelector('strong');
    expect(strong.querySelector('em')).toHaveTextContent('loud');
  });

  test('link renders an anchor with href and opens in a new tab', () => {
    const a = renderMd('see [docs](https://example.com)').querySelector('a');
    expect(a).toHaveAttribute('href', 'https://example.com');
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveTextContent('docs');
  });

  test('preserves surrounding text around a token', () => {
    expect(renderMd('before **mid** after')).toHaveTextContent('before mid after');
  });
});
