import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import HelpDot from './HelpDot';

describe('HelpDot', () => {
  it('è un pulsante e apre l\'aiuto col focus, non solo col mouse', () => {
    const { getByRole, queryByRole } = render(<HelpDot text="Spiegazione" />);
    const dot = getByRole('button', { name: 'Aiuto: Spiegazione' });
    expect(queryByRole('tooltip')).toBeNull();

    fireEvent.focus(dot);
    expect(getByRole('tooltip')).toHaveTextContent('Spiegazione');
    fireEvent.blur(dot);
    expect(queryByRole('tooltip')).toBeNull();

    fireEvent.mouseEnter(dot);
    expect(getByRole('tooltip')).toBeInTheDocument();
    fireEvent.keyDown(dot, { key: 'Escape' });
    expect(queryByRole('tooltip')).toBeNull();
  });

  it('nella metà bassa della finestra si apre verso l\'alto', () => {
    const { getByRole } = render(<HelpDot text="Giù" />);
    const dot = getByRole('button');
    dot.getBoundingClientRect = () => ({ top: window.innerHeight - 20, bottom: window.innerHeight - 7, left: 40 });
    fireEvent.focus(dot);
    expect(getByRole('tooltip').style.bottom).toBe('26px');
    expect(getByRole('tooltip').style.top).toBe('');
  });

  it('il clic non arriva al contenitore', () => {
    let clicks = 0;
    const { getByRole } = render(<div onClick={() => { clicks++; }}><HelpDot text="x" /></div>);
    fireEvent.click(getByRole('button'));
    expect(clicks).toBe(0);
  });
});
