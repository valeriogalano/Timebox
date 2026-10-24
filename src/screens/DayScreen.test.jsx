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

describe('DayScreen / Ore per fascia', () => {
  const clients = [{ id: 'c1', name: 'Area', color: '#888', billing: 'none' }];
  const projects = [{ id: 'p1', clientId: 'c1', name: 'Progetto' }];

  test('una riga per fascia, e cambiare la fascia sposta l\'entry', async () => {
    mockApi(0);
    const entries = [
      { id: 'e2', projectId: 'p1', date: 'x', hours: 1, billableHours: null, slot: 'pm', billed: false },
      { id: 'e1', projectId: 'p1', date: 'x', hours: 2, billableHours: null, slot: 'am', billed: false },
    ];
    const moves = [];
    window.api.getEntries = () => Promise.resolve(entries);
    window.api.moveEntrySlot = (id, slot) => { moves.push([id, slot]); return Promise.resolve({}); };
    const { findByText, findAllByLabelText } = render(
      <DayScreen projects={projects} clients={clients} slotCapacity={{ am: 5, pm: 4, sera: 2 }} />
    );
    fireEvent.click(await findByText('Ore'));
    const selects = await findAllByLabelText('Fascia di Progetto');
    expect(selects.map(s => s.value)).toEqual(['am', 'pm']);
    fireEvent.change(selects[1], { target: { value: 'sera' } });
    await waitFor(() => expect(moves).toEqual([['e2', 'sera']]));
  });
  test('il + aggiunge una riga in una fascia nuova e salva lì le ore', async () => {
    mockApi(0);
    const entries = [{ id: 'e1', projectId: 'p1', date: 'x', hours: 2, billableHours: null, slot: 'am', billed: false }];
    const saved = [];
    window.api.getEntries = () => Promise.resolve(entries);
    window.api.saveEntry = e => { saved.push(e); return Promise.resolve({}); };
    const { findByText, findByLabelText, findAllByLabelText, getByLabelText } = render(
      <DayScreen projects={projects} clients={clients} slotCapacity={{ am: 5, pm: 4, sera: 2 }} />
    );
    fireEvent.click(await findByText('Ore'));
    const plus = await findByLabelText(/Aggiungi ore di Progetto/);
    expect([...plus.options].map(o => o.value)).toEqual(['', 'pm', 'sera']);
    fireEvent.change(plus, { target: { value: 'pm' } });
    // la riga nuova mostra la sua fascia e una cella vuota; la riga di Mattina resta com'è
    expect(await findByText('Pomeriggio', { selector: 'span' })).toBeInTheDocument();
    expect((await findAllByLabelText('Fascia di Progetto')).map(s => s.value)).toEqual(['am']);
    // il + ora offre solo Sera
    expect([...getByLabelText(/Aggiungi ore di Progetto/).options].map(o => o.value)).toEqual(['', 'sera']);
  });
});
