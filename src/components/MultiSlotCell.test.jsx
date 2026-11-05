import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import React from 'react';
import MultiSlotCell from './MultiSlotCell';

afterEach(cleanup);

const clients = [{ id: 'c1', name: 'INVALSI', color: '#3B82F6' }, { id: 'c2', name: 'Moveo', color: '#10B981' }];
const blocks = [{ id: 'b1', clientId: 'c1', hours: 2 }, { id: 'b2', clientId: 'c2', hours: 1 }];

function setup(props = {}) {
  const handlers = { onAdd: vi.fn(), onUpdate: vi.fn(), onRemove: vi.fn(), onReorder: vi.fn(), onDrop: vi.fn(), onDragOver: vi.fn(), onDragLeave: vi.fn() };
  const utils = render(<MultiSlotCell blocks={blocks} clients={clients} capacityHours={4} {...handlers} {...props} />);
  return { ...utils, ...handlers };
}

describe('MultiSlotCell', () => {
  it('mostra un blocco per area e salta quelli con area sconosciuta', () => {
    setup({ blocks: [...blocks, { id: 'b3', clientId: 'zz', hours: 1 }] });
    expect(screen.getByText('INVALSI')).toBeTruthy();
    expect(screen.getByText('Moveo')).toBeTruthy();
  });

  it('aggiunge un blocco: senza area il pulsante è disabilitato', () => {
    const { onAdd } = setup();
    fireEvent.click(screen.getByText('+'));
    const button = screen.getByText('Aggiungi');
    expect(button.disabled).toBe(true);
    fireEvent.change(document.querySelector('select'), { target: { value: 'c2' } });
    fireEvent.change(document.querySelector('input[type="number"]'), { target: { value: '1.5' } });
    fireEvent.click(screen.getByText('Aggiungi'));
    expect(onAdd).toHaveBeenCalledWith('c2', 1.5);
    expect(screen.getByText('+')).toBeTruthy();
  });

  it('un clic fuori chiude il form di aggiunta', () => {
    setup();
    fireEvent.click(screen.getByText('+'));
    expect(screen.getByText('Aggiungi')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('Aggiungi')).toBeNull();
  });

  it('un trascinamento esterno passa per onDragOver, onDragLeave e onDrop', () => {
    const { container, onDragOver, onDragLeave, onDrop } = setup();
    fireEvent.dragOver(container.firstChild);
    expect(onDragOver).toHaveBeenCalled();
    fireEvent.dragLeave(container.firstChild, { relatedTarget: document.body });
    expect(onDragLeave).toHaveBeenCalled();
    fireEvent.drop(container.firstChild);
    expect(onDrop).toHaveBeenCalled();
  });

  it('un trascinamento interno riordina i blocchi', () => {
    const { container, onReorder, onDrop } = setup({ draggingId: 'b1' });
    // jsdom non ha layout: ogni blocco ha rect a zero, quindi l'inserimento va in fondo.
    fireEvent.dragOver(container.firstChild, { clientY: 10 });
    fireEvent.drop(container.firstChild);
    expect(onReorder).toHaveBeenCalledWith([blocks[1], blocks[0]]);
    expect(onDrop).not.toHaveBeenCalled();
  });
});
