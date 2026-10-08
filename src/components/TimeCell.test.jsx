import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import TimeCell from './TimeCell';

// Renders two cells in the same day column (same data-col) but different rows,
// so Enter should save the top cell and move edit focus down to the one below.
function renderColumn(onSaveTop) {
  return render(
    <div>
      <TimeCell hours={0} colIndex={0} projectId="a" onSave={onSaveTop} />
      <TimeCell hours={0} colIndex={0} projectId="b" onSave={() => {}} />
    </div>
  );
}

describe('TimeCell — Enter saves and moves one row down', () => {
  it('commits the value and starts editing the cell below in the same column', () => {
    const onSave = vi.fn();
    const { container } = renderColumn(onSave);
    const [topCell, bottomCell] = container.querySelectorAll('[data-timecell]');

    fireEvent.click(topCell);               // enter edit mode on the top cell
    const input = topCell.querySelector('input');
    fireEvent.change(input, { target: { value: '1:30' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSave).toHaveBeenCalledWith({ hours: 1.5, billableHours: null });
    // focusCell clicks the target, which opens its editor
    expect(bottomCell.querySelector('input')).not.toBeNull();
  });
});

describe('TimeCell — da tastiera', () => {
  it('la cella prende il focus, si apre con Invio e con Esc lo riprende', () => {
    const { container } = render(<TimeCell hours={1.5} colIndex={0} projectId="a" onSave={() => {}} />);
    const cell = container.querySelector('[data-timecell]');
    expect(cell.tabIndex).toBe(0);
    expect(cell).toHaveAccessibleName('Ore: 1:30. Invio per modificare');

    fireEvent.keyDown(cell, { key: 'Enter' });
    const input = cell.querySelector('input');
    expect(input.value).toBe('1:30');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(cell.querySelector('input')).toBeNull();
    expect(document.activeElement).toBe(cell);
  });

  it('si apre anche con la barra spaziatrice', () => {
    const { container } = render(<TimeCell hours={0} colIndex={0} projectId="a" onSave={() => {}} />);
    const cell = container.querySelector('[data-timecell]');
    expect(cell).toHaveAccessibleName('Ore: nessuna. Invio per modificare');
    fireEvent.keyDown(cell, { key: ' ' });
    expect(cell.querySelector('input')).not.toBeNull();
  });

  it('una cella bloccata nella vista fatturabile resta fuori dal giro di Tab', () => {
    const { container } = render(
      <TimeCell hours={2} colIndex={0} projectId="a" viewMode="billable" isBillable={false} onSave={() => {}} />
    );
    const cell = container.querySelector('[data-timecell]');
    expect(cell.tabIndex).toBe(-1);
    fireEvent.keyDown(cell, { key: 'Enter' });
    expect(cell.querySelector('input')).toBeNull();
  });
});
