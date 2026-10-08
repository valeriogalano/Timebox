import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import SlotCapacityBar from './SlotCapacityBar.jsx';

describe('SlotCapacityBar', () => {
  test('shows load / capacity in the single hours format', () => {
    const { container } = render(<SlotCapacityBar plannedHours={2} loggedHours={1} capacityHours={4} />);
    // load = max(planned, logged) = 2h -> "2h / 4h"
    expect(container).toHaveTextContent('2h / 4h');
  });

  test('empty slot shows 0h / capacity', () => {
    const { container } = render(<SlotCapacityBar plannedHours={0} loggedHours={0} capacityHours={4} />);
    expect(container).toHaveTextContent('0h / 4h');
  });

  test('over capacity shows the >capacity label', () => {
    const { container } = render(<SlotCapacityBar plannedHours={6} loggedHours={0} capacityHours={4} />);
    expect(container).toHaveTextContent('>4h');
  });

  test('title describes planned and logged hours', () => {
    const { container } = render(<SlotCapacityBar plannedHours={2} loggedHours={3} capacityHours={4} />);
    const bar = container.querySelector('[title]');
    expect(bar.getAttribute('title')).toMatch(/Pianificate 2h, tracciate 3h/);
  });
});
