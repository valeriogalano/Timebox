import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import TodoistLabels from './TodoistLabels.jsx';

describe('TodoistLabels', () => {
  test('renders nothing without labels', () => {
    expect(render(<TodoistLabels labels={[]} />).container).toBeEmptyDOMElement();
    expect(render(<TodoistLabels labels={null} />).container).toBeEmptyDOMElement();
  });

  test('renders one chip per label', () => {
    const { getByText, container } = render(<TodoistLabels labels={['urgente', 'cliente']} />);
    expect(getByText('urgente')).toBeInTheDocument();
    expect(getByText('cliente')).toBeInTheDocument();
    expect(container.querySelectorAll('span')).toHaveLength(2);
  });
});
