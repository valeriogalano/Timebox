import { describe, test, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import DayScreen from './DayScreen.jsx';

const overBlock = n => Array.from({ length: n }, (_, i) => ({
  id: `t${i}`, title: `Task ${i + 1}`, project: 'Progetto', slot: 'am', estimatedHours: 0.5, availableBeforeTask: 0, overflowHours: 0.5,
}));

function mockApi(n) {
  window.api = {
    getDayInsights: () => Promise.resolve({
      freeCapacity: { totals: {} },
      readyBlocks: { groups: [] },
      mismatches: { counts: { tasksOverBlockCapacity: n }, mismatches: { tasksOverBlockCapacity: overBlock(n) } },
    }),
    getEntries: () => Promise.resolve([]),
    getWeekOverrides: () => Promise.resolve([]),
    getTodoistCache: () => Promise.resolve([]),
    getWeekAreaStatuses: () => Promise.resolve([]),
    getProjectTotals: () => Promise.resolve({}),
    getProjectBillableTotals: () => Promise.resolve({}),
  };
}

describe('DayScreen / Mismatch dopo sync', () => {
  beforeEach(() => mockApi(5));

  test('un gruppo con più di quattro elementi dichiara quelli non mostrati', async () => {
    const { findByText, queryByText } = render(<DayScreen projects={[]} slotCapacity={{ am: 5, pm: 4, eve: 2 }} />);
    expect(await findByText('Oltre blocco · 5')).toBeInTheDocument();
    expect(queryByText('Task 4')).toBeInTheDocument();
    expect(queryByText('Task 5')).not.toBeInTheDocument();
    expect(queryByText('e un altro')).toBeInTheDocument();
  });

  test('fino a quattro elementi non c\'è niente da dichiarare', async () => {
    mockApi(4);
    const { findByText, queryByText } = render(<DayScreen projects={[]} slotCapacity={{ am: 5, pm: 4, eve: 2 }} />);
    expect(await findByText('Oltre blocco · 4')).toBeInTheDocument();
    expect(queryByText(/^e (un altro|altri)/)).not.toBeInTheDocument();
  });
});
