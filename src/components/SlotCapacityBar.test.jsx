import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import SlotCapacityBar from './SlotCapacityBar.jsx';

describe('SlotCapacityBar', () => {
  test('shows load / capacity in H:MM', () => {
    const { container } = render(<SlotCapacityBar plannedHours={2} loggedHours={1} capacityHours={4} />);
    // load = max(planned, logged) = 2h -> "2:00 / 4:00"
    expect(container).toHaveTextContent('2:00 / 4:00');
  });

  test('empty slot shows 0:00 / capacity', () => {
    const { container } = render(<SlotCapacityBar plannedHours={0} loggedHours={0} capacityHours={4} />);
    expect(container).toHaveTextContent('0:00 / 4:00');
  });

  test('over capacity shows the >capacity label', () => {
    const { container } = render(<SlotCapacityBar plannedHours={6} loggedHours={0} capacityHours={4} />);
    expect(container).toHaveTextContent('>4:00');
  });

  test('title describes planned and logged hours', () => {
    const { container } = render(<SlotCapacityBar plannedHours={2} loggedHours={3} capacityHours={4} />);
    const bar = container.querySelector('[title]');
    expect(bar.getAttribute('title')).toMatch(/Pianificate 2:00, tracciate 3:00/);
  });
});
