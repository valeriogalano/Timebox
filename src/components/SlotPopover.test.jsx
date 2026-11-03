import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import SlotPopover from './SlotPopover';

const project = { id: 'p1', name: 'Sito' };
const client = { id: 'c1', color: '#4073ff', billing: 'none' };
const entry = (id, slot, hours) => ({ id, projectId: 'p1', date: '2026-11-04', hours, billableHours: null, slot, billed: false });

function setup(entries, extra = {}) {
  const props = {
    project, client, dateLabel: 'Mar 4', dateStr: '2026-11-04', entries,
    anchorRect: { left: 40, top: 200, bottom: 240 }, viewMode: 'tracked', isFuture: false, isToday: false,
    onSave: vi.fn(), onMove: vi.fn(), onClose: vi.fn(), ...extra,
  };
  return { props, ...render(<SlotPopover {...props} />) };
}

describe('SlotPopover', () => {
  it('una riga per entry, in ordine di fascia, con il selettore che sposta', () => {
    const { props, getAllByLabelText } = setup([entry('e2', 'pm', 2), entry('e1', 'am', 1)]);
    const selects = getAllByLabelText('Fascia di Sito');
    expect(selects.map(s => s.value)).toEqual(['am', 'pm']);
    fireEvent.change(selects[1], { target: { value: 'sera' } });
    expect(props.onMove).toHaveBeenCalledWith('e2', 'sera');
  });

  it('Escape e un clic fuori lo chiudono, un clic dentro no', () => {
    const { props, getByRole } = setup([entry('e1', 'am', 1)]);
    fireEvent.mouseDown(getByRole('dialog'));
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(document.body);
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it('se la pagina scorre si chiude', () => {
    const { props } = setup([entry('e1', 'am', 1)]);
    fireEvent.scroll(document.body);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('il "+" aggiunge una riga in una fascia libera, pronta a scrivere, e salva su quella fascia', () => {
    const { props, getByLabelText, container } = setup([entry('e1', 'am', 1)]);
    fireEvent.change(getByLabelText("Aggiungi ore di Sito in un'altra fascia"), { target: { value: 'sera' } });
    const input = container.querySelector('input');
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { value: '1h 30m' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onSave).toHaveBeenCalledWith('sera', { hours: 1.5, billableHours: null });
  });

  it('senza fasce libere non c\'è il "+"', () => {
    const { queryByLabelText } = setup([entry('a', 'am', 1), entry('b', 'pm', 1), entry('c', 'sera', 1)]);
    expect(queryByLabelText("Aggiungi ore di Sito in un'altra fascia")).toBeNull();
  });

  it('senza spazio sotto la cella si apre sopra', () => {
    const { getByRole } = setup([entry('e1', 'am', 1)], { anchorRect: { left: 40, top: window.innerHeight - 30, bottom: window.innerHeight - 4 } });
    const style = getByRole('dialog').style;
    expect(style.bottom).not.toBe('');
    expect(style.top).toBe('');
  });
});
