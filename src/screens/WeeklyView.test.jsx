import { describe, test, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import WeeklyView from './WeeklyView.jsx';

const projects = [{ id: 'p1', clientId: 'c1', name: 'Progetto uno' }];
// 2h ogni giorno: 14h nella settimana
const recurring = Array.from({ length: 7 }, (_, day) => ({ id: `r${day}`, clientId: 'c1', day, slot: 'am', hours: 2, position: 0 }));

function renderWeek(client) {
  return render(
    <WeeklyView clients={[client]} projects={projects} recurring={recurring}
      weekOffset={1} setWeekOffset={() => {}} slotCapacity={{ am: 5, pm: 4, sera: 2 }} />
  );
}

describe('WeeklyView / avviso sul limite settimanale previsto', () => {
  beforeEach(() => {
    window.api = {
      getEntries: () => Promise.resolve([]),
      getWeekOverrides: () => Promise.resolve([]),
      getWeekAreaStatuses: () => Promise.resolve([]),
      getTodoistCache: () => Promise.resolve([]),
      getProjectTotals: () => Promise.resolve({}),
      getProjectBillableTotals: () => Promise.resolve({}),
      syncTodoist: () => Promise.resolve({ byDate: {} }),
    };
  });

  test('il piano della settimana prossima supera il limite: avviso con previsto e tetto', async () => {
    const { findByText } = renderWeek({ id: 'c1', name: 'Settimanale', color: '#4073ff', billing: 'none', limitType: 'weekly', limitHours: 10 });
    const banner = (await findByText('Limite settimanale area superato dal piano:')).parentElement;
    expect(banner).toHaveTextContent('Settimanale (previsto 14h / 10h)');
  });

  test('senza limite settimanale nessun avviso', async () => {
    const { findAllByText, queryByText } = renderWeek({ id: 'c1', name: 'Libera', color: '#4073ff', billing: 'none', limitType: 'none' });
    await findAllByText('Libera');
    expect(queryByText('Limite settimanale area superato dal piano:')).not.toBeInTheDocument();
  });
});
