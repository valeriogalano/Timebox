import { describe, test, expect, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import DayScreen from './DayScreen.jsx';

const overBlock = n => Array.from({ length: n }, (_, i) => ({
  id: `t${i}`, title: `Task ${i + 1}`, project: 'Progetto', slot: 'am', estimatedHours: 0.5, availableBeforeTask: 0, overflowHours: 0.5,
}));

const ready = n => Array.from({ length: n }, (_, i) => ({
  areaId: `a${i}`, area: `Area ${i + 1}`, slot: 'am', missingHours: 1, estimatedHours: 0, availableHours: 1,
}));

function mockApi(n, readyCount = 0) {
  window.api = {
    getDayInsights: () => Promise.resolve({
      freeCapacity: { totals: {} },
      readyBlocks: { groups: ready(readyCount) },
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

describe('DayScreen / Blocchi pianificati senza azioni', () => {
  test('oltre l\'ottavo blocco dichiara quelli non mostrati', async () => {
    mockApi(0, 10);
    const { findByText, queryByText } = render(<DayScreen projects={[]} slotCapacity={{ am: 5, pm: 4, eve: 2 }} />);
    expect(await findByText('Area 8 · Mattina')).toBeInTheDocument();
    expect(queryByText('Area 9 · Mattina')).not.toBeInTheDocument();
    expect(queryByText('e altri 2')).toBeInTheDocument();
  });

  test('fino a otto blocchi non c\'è niente da dichiarare', async () => {
    mockApi(0, 8);
    const { findByText, queryByText } = render(<DayScreen projects={[]} slotCapacity={{ am: 5, pm: 4, eve: 2 }} />);
    expect(await findByText('Area 8 · Mattina')).toBeInTheDocument();
    expect(queryByText(/^e (un altro|altri)/)).not.toBeInTheDocument();
  });
});

describe('DayScreen / Ore', () => {
  const clients = [{ id: 'c1', name: 'Area', color: '#888', billing: 'none' }];
  const projects = [{ id: 'p1', clientId: 'c1', name: 'Progetto' }, { id: 'p2', clientId: 'c1', name: 'Altro' }];

  test('una riga per progetto, senza fascia; scrivere ore aggiorna l\'entry del giorno', async () => {
    mockApi(0);
    const entries = [{ id: 'e1', projectId: 'p1', date: 'x', hours: 2, billableHours: null, billed: true }];
    const saved = [];
    window.api.getEntries = () => Promise.resolve(entries);
    window.api.saveEntry = e => { saved.push(e); return Promise.resolve({}); };
    const { findByText, container, queryByLabelText } = render(
      <DayScreen projects={projects} clients={clients} slotCapacity={{ am: 5, pm: 4, sera: 2 }} />
    );
    fireEvent.click(await findByText('Ore'));
    await findByText('Altro');
    expect(queryByLabelText('Fascia di Progetto')).not.toBeInTheDocument();
    const cells = container.querySelectorAll('[data-timecell]');
    expect(cells).toHaveLength(2);
    const cell = [...cells].find(c => c.textContent.includes('2h'));
    fireEvent.click(cell);
    const input = cell.querySelector('input');
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toEqual({ ...entries[0], hours: 3 });
  });

  test('a zero ore l\'entry si cancella', async () => {
    mockApi(0);
    const deleted = [];
    window.api.getEntries = () => Promise.resolve([{ id: 'e1', projectId: 'p1', date: 'x', hours: 2, billableHours: null, billed: false }]);
    window.api.deleteEntry = id => { deleted.push(id); return Promise.resolve(); };
    const { findByText, container } = render(
      <DayScreen projects={projects} clients={clients} slotCapacity={{ am: 5, pm: 4, sera: 2 }} />
    );
    fireEvent.click(await findByText('Ore'));
    await findByText('Altro');
    const cell = [...container.querySelectorAll('[data-timecell]')].find(c => c.textContent.includes('2h'));
    fireEvent.click(cell);
    const input = cell.querySelector('input');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(deleted).toEqual(['e1']));
  });
});
