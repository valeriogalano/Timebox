import { describe, test, expect, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import QuickLogModal, { parseQuickLogQuery } from './QuickLogModal';
import { setMinutesThreshold, DEFAULT_MINUTES_THRESHOLD } from '../hours-threshold';

afterEach(() => setMinutesThreshold(DEFAULT_MINUTES_THRESHOLD));

describe('parseQuickLogQuery', () => {
  test('un numero nudo sotto la soglia sono ore', () => {
    expect(parseQuickLogQuery('INVALSI+8')).toEqual({ search: 'INVALSI', addHours: 8 });
  });
  test('sopra la soglia sono minuti', () => {
    expect(parseQuickLogQuery('INVALSI+30').addHours).toBe(0.5);
  });
  test('segue la soglia configurata', () => {
    setMinutesThreshold(4);
    expect(parseQuickLogQuery('INVALSI+8').addHours).toBe(8 / 60);
  });
  test('un suffisso di fascia non è più letto: il tempo non è valido', () => {
    expect(parseQuickLogQuery('Acme +1h +pom')).toEqual({ search: 'Acme', addHours: null });
    expect(parseQuickLogQuery('Acme +pom')).toEqual({ search: 'Acme', addHours: null });
  });
});

describe('QuickLogModal', () => {
  const clients = [{ id: 'c1', name: 'Acme', color: '#4073ff' }];
  const projects = [
    { id: 'p1', clientId: 'c1', name: 'Sito', description: 'Restyling del sito' },
    { id: 'p2', clientId: 'c1', name: 'App' },
    { id: 'p3', clientId: 'c1', name: 'Vecchio', archived: true },
  ];
  const open = () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const utils = render(<QuickLogModal projects={projects} clients={clients} onSelect={onSelect} onClose={onClose} />);
    return { ...utils, onSelect, onClose, input: utils.getByPlaceholderText(/Cerca progetto/) };
  };

  test('con "+1h" Invio somma le ore al progetto scelto, senza fascia', () => {
    const { input, onSelect, getByText } = open();
    fireEvent.change(input, { target: { value: 'sito +1h' } });
    expect(getByText('+1h oggi')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('p1', 1);
  });

  test('senza ore apre il progetto; le frecce scelgono, gli archiviati non ci sono, Esc chiude', () => {
    const { input, onSelect, onClose, queryByText, getByText } = open();
    expect(queryByText('Vecchio')).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith('p2', null);
    fireEvent.change(input, { target: { value: 'restyling' } });
    expect(getByText('Restyling', { selector: 'mark' })).toBeInTheDocument();
    fireEvent.click(getByText('Sito'));
    expect(onSelect).toHaveBeenLastCalledWith('p1', null);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  test('nessun risultato lo dice', () => {
    const { input, getByText } = open();
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(getByText('Nessun progetto trovato')).toBeInTheDocument();
  });
});
