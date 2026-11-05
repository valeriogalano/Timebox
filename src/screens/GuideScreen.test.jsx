import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GuideScreen from './GuideScreen';

const source = '# Guida\n\n## Concetti\n\nUn **numero**.\n\n- uno\n  - sotto\n\n### Scarto\n\nTesto.\n\n## Glossario\n';

describe('GuideScreen', () => {
  test('rende titoli, paragrafi ed elenchi dal Markdown', () => {
    render(<GuideScreen source={source} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Guida' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Scarto' })).toHaveAttribute('id', 'scarto');
    expect(screen.getByText('numero').tagName).toBe('STRONG');
    expect(screen.getByText('sotto')).toBeInTheDocument();
  });

  test("l'indice porta alla sezione", () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<GuideScreen source={source} />);
    fireEvent.click(screen.getByRole('button', { name: 'Glossario' }));
    expect(scrollIntoView).toHaveBeenCalled();
  });

  test('senza argomenti rende la guida del repo', () => {
    render(<GuideScreen />);
    expect(screen.getByRole('heading', { level: 1, name: 'Guida di Timebox' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Glossario' })).toBeInTheDocument();
  });
});
