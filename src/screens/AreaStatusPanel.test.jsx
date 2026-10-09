import { describe, test, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { AreaStatusPanel } from './WeeklyView.jsx';

const clients = [{ id: 'c1', name: 'Area', color: '#4073ff' }];

describe('AreaStatusPanel', () => {
  test('lo stato scelto è marcato, gli altri no', () => {
    const { getByLabelText } = render(<AreaStatusPanel clients={clients} statuses={{ c1: 'minimal' }} onChange={() => {}} compact />);
    expect(getByLabelText('Area: minima')).toHaveAttribute('aria-pressed', 'true');
    expect(getByLabelText('Area: attiva')).toHaveAttribute('aria-pressed', 'false');
    expect(getByLabelText('Area: chiusa')).toHaveAttribute('aria-pressed', 'false');
  });

  test('nella barra laterale la legenda dei tre stati è visibile', () => {
    const { getByText, rerender, queryByText } = render(<AreaStatusPanel clients={clients} statuses={{}} onChange={() => {}} compact />);
    for (const label of ['attiva', 'minima', 'chiusa']) expect(getByText(label)).toBeInTheDocument();
    rerender(<AreaStatusPanel clients={clients} statuses={{}} onChange={() => {}} />);
    expect(queryByText('minima')).not.toBeInTheDocument();
  });

  test('un clic cambia lo stato dell\'area', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(<AreaStatusPanel clients={clients} statuses={{}} onChange={onChange} compact />);
    fireEvent.click(getByLabelText('Area: chiusa'));
    expect(onChange).toHaveBeenCalledWith('c1', 'closed');
  });

  test('senza aree non rende niente', () => {
    const { container } = render(<AreaStatusPanel clients={[]} statuses={{}} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
