import { describe, test, expect, beforeEach } from 'vitest';
import { render, within } from '@testing-library/react';
import RecurringScreen from './RecurringScreen.jsx';

const clients = [
  { id: 'c1', name: 'Alfa', color: '#4073ff', billing: 'none' },
  { id: 'c2', name: 'Beta', color: '#299438', billing: 'none' },
  { id: 'c3', name: 'Gamma', color: '#db4035', billing: 'none' },
];
const recurring = [
  { id: 'r1', clientId: 'c1', day: 0, slot: 'am', hours: 4, position: 0 },
  { id: 'r2', clientId: 'c1', day: 2, slot: 'pm', hours: 2.5, position: 0 },
  { id: 'r3', clientId: 'c2', day: 1, slot: 'am', hours: 3, position: 0 },
];

describe('RecurringScreen', () => {
  beforeEach(() => {
    window.api = { getWeekAreaStatuses: () => Promise.resolve([]) };
  });

  test('shows the template hours per area next to the weekly total, and no repeated-overrides section', () => {
    const { getByText, queryByText } = render(
      <RecurringScreen clients={clients} recurring={recurring} setRecurring={() => {}} slotCapacity={{ am: 4, pm: 4, sera: 2 }} />
    );
    const summary = getByText('Totale settimana').parentElement.parentElement;
    expect(within(summary).getByText('9h 30m')).toBeInTheDocument();
    expect(within(summary).getByText('Ore per area')).toBeInTheDocument();
    expect(within(summary).getByText('Alfa').parentElement).toHaveTextContent('Alfa6h 30m');
    expect(within(summary).getByText('Beta').parentElement).toHaveTextContent('Beta3h');
    expect(within(summary).queryByText('Gamma')).not.toBeInTheDocument();
    expect(queryByText('Override ripetuti')).not.toBeInTheDocument();
  });
});
