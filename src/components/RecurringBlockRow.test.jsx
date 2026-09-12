import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import RecurringBlockRow from './RecurringBlockRow';
import { setMinutesThreshold, DEFAULT_MINUTES_THRESHOLD } from '../hours-threshold';

const block  = { id: 'b1', clientId: 'c1', hours: 2 };
const client = { id: 'c1', name: 'INVALSI', color: '#3B82F6' };

// Il campo ore del blocco si apre cliccando l'etichetta "2h".
function editHours(container, value) {
  fireEvent.click(container.querySelector('span[style*="cursor: text"]'));
  const input = container.querySelector('input');
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

afterEach(() => setMinutesThreshold(DEFAULT_MINUTES_THRESHOLD));

describe('RecurringBlockRow — il campo ore rispetta la soglia ore/minuti', () => {
  it('legge un numero nudo oltre la soglia come minuti', () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <RecurringBlockRow block={block} client={client} onUpdate={onUpdate} onRemove={() => {}} />
    );
    editHours(container, '90');
    expect(onUpdate).toHaveBeenCalledWith(1.5);
  });

  it('segue la soglia configurata, non quella di default', () => {
    setMinutesThreshold(6);
    const onUpdate = vi.fn();
    const { container } = render(
      <RecurringBlockRow block={block} client={client} onUpdate={onUpdate} onRemove={() => {}} />
    );
    editHours(container, '8');
    expect(onUpdate).toHaveBeenCalledWith(8 / 60);
  });

  it('accetta la forma esplicita con i due punti, che prima veniva scartata', () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <RecurringBlockRow block={block} client={client} onUpdate={onUpdate} onRemove={() => {}} />
    );
    editHours(container, '1:30');
    expect(onUpdate).toHaveBeenCalledWith(1.5);
  });

  it('ignora un valore non valido invece di azzerare il blocco', () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <RecurringBlockRow block={block} client={client} onUpdate={onUpdate} onRemove={() => {}} />
    );
    editHours(container, 'pippo');
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
