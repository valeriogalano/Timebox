import { describe, test, expect, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { getToday, getMondayOfWeek, addDays, fmt } from '../utils';
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

describe('WeeklyView / fasce nella cella del giorno', () => {
  const client = { id: 'c1', name: 'Area uno', color: '#4073ff', billing: 'none', limitType: 'none' };
  const monday = fmt(getMondayOfWeek(addDays(getToday(), 7)));
  const entry = (id, slot, hours) => ({ id, projectId: 'p1', date: monday, hours, billableHours: null, slot, billed: false });

  function setup(entries) {
    const calls = { saved: [], moved: [] };
    window.api = {
      getEntries: () => Promise.resolve(entries),
      getWeekOverrides: () => Promise.resolve([]),
      getWeekAreaStatuses: () => Promise.resolve([]),
      getTodoistCache: () => Promise.resolve([]),
      getProjectTotals: () => Promise.resolve({}),
      getProjectBillableTotals: () => Promise.resolve({}),
      syncTodoist: () => Promise.resolve({ byDate: {} }),
      saveEntry: e => { calls.saved.push(e); return Promise.resolve(); },
      deleteEntry: () => Promise.resolve(),
      moveEntrySlot: (id, slot) => { calls.moved.push([id, slot]); return Promise.resolve({}); },
    };
    return calls;
  }

  test('una cella con ore su due fasce mostra M·P e apre il popover; cambiare fascia sposta', async () => {
    const calls = setup([entry('e1', 'am', 1), entry('e2', 'pm', 2)]);
    const { findByText, findByRole, findAllByLabelText } = renderWeek(client);
    fireEvent.click(await findByText('M·P'));
    await findByRole('dialog');
    const selects = await findAllByLabelText('Fascia di Progetto uno');
    expect(selects.map(s => s.value)).toEqual(['am', 'pm']);
    fireEvent.change(selects[1], { target: { value: 'sera' } });
    await waitFor(() => expect(calls.moved).toEqual([['e2', 'sera']]));
  });

  test('"+pom" in una cella con una sola entry la sposta: stesso id, nuova fascia', async () => {
    const calls = setup([entry('e1', 'am', 2)]);
    const { findByText, container } = renderWeek(client);
    await findByText('M');
    const cell = [...container.querySelectorAll('[data-timecell]')].find(c => c.textContent.includes('2h'));
    fireEvent.click(cell);
    const input = cell.querySelector('input');
    fireEvent.change(input, { target: { value: '+pom' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(calls.saved).toHaveLength(1));
    expect(calls.saved[0]).toMatchObject({ id: 'e1', slot: 'pm', hours: 2 });
  });
});

describe('WeeklyView / avvisi dei progetti: gli archiviati non ne generano', () => {
  const client = { id: 'c1', name: 'Area uno', color: '#4073ff', billing: 'none', limitType: 'none' };
  const monday = fmt(getMondayOfWeek(addDays(getToday(), 7)));
  const prj = (id, name, extra = {}) => ({ id, clientId: 'c1', name, budgetHours: 10, weeklyHours: 5, ...extra });
  const entry = (id, projectId) => ({ id, projectId, date: monday, hours: 6, billableHours: null, slot: 'am', billed: false });

  beforeEach(() => {
    window.api = {
      getEntries: () => Promise.resolve([entry('e1', 'p1'), entry('e2', 'p2')]),
      getWeekOverrides: () => Promise.resolve([]),
      getWeekAreaStatuses: () => Promise.resolve([]),
      getTodoistCache: () => Promise.resolve([]),
      getProjectTotals: () => Promise.resolve({ p1: 12, p2: 12 }),
      getProjectBillableTotals: () => Promise.resolve({ p1: 12, p2: 12 }),
      syncTodoist: () => Promise.resolve({ byDate: {} }),
    };
  });

  test('budget e limite settimanale superati: compare solo il progetto attivo', async () => {
    const projects = [prj('p1', 'Attivo'), prj('p2', 'Archiviato', { archived: true })];
    const { findByText } = render(
      <WeeklyView clients={[client]} projects={projects} recurring={[]}
        weekOffset={1} setWeekOffset={() => {}} slotCapacity={{ am: 5, pm: 4, sera: 2 }} />
    );
    const budget = (await findByText('Budget totale superato:')).parentElement;
    expect(budget).toHaveTextContent('Attivo (12h / 10h)');
    expect(budget).not.toHaveTextContent('Archiviato');
    const weekly = (await findByText('Limite settimanale superato:')).parentElement;
    expect(weekly).toHaveTextContent('Attivo (6h / 5h)');
    expect(weekly).not.toHaveTextContent('Archiviato');
  });
});
