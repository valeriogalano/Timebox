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

describe('WeeklyView / la cella del giorno ha solo ore', () => {
  const client = { id: 'c1', name: 'Area uno', color: '#4073ff', billing: 'hourly', limitType: 'none' };
  const monday = fmt(getMondayOfWeek(addDays(getToday(), 7)));
  const entry = (id, hours, extra = {}) => ({ id, projectId: 'p1', date: monday, hours, billableHours: null, billed: false, ...extra });

  function setup(entries) {
    const calls = { saved: [], deleted: [] };
    window.api = {
      getEntries: () => Promise.resolve(entries),
      getWeekOverrides: () => Promise.resolve([]),
      getWeekAreaStatuses: () => Promise.resolve([]),
      getTodoistCache: () => Promise.resolve([]),
      getProjectTotals: () => Promise.resolve({}),
      getProjectBillableTotals: () => Promise.resolve({}),
      syncTodoist: () => Promise.resolve({ byDate: {} }),
      saveEntry: e => { calls.saved.push(e); return Promise.resolve(); },
      deleteEntry: id => { calls.deleted.push(id); return Promise.resolve(); },
    };
    return calls;
  }

  const cellWith = (container, text) => [...container.querySelectorAll('[data-timecell]')].find(c => c.textContent.includes(text));
  const type = (cell, value) => {
    fireEvent.click(cell);
    const input = cell.querySelector('input');
    fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, { key: 'Enter' });
  };

  test('scrivere ore aggiorna l\'entry del giorno: stesso id, fatturato conservato, nessuna fascia', async () => {
    const calls = setup([entry('e1', 2, { billed: true })]);
    const { container } = renderWeek(client);
    const cell = await waitFor(() => cellWith(container, '2h') ?? Promise.reject(new Error('cell')));
    type(cell, '3h');
    await waitFor(() => expect(calls.saved).toHaveLength(1));
    expect(calls.saved[0]).toEqual({ id: 'e1', projectId: 'p1', date: monday, hours: 3, billableHours: null, billed: true });
  });

  test('zero ore cancella l\'entry', async () => {
    const calls = setup([entry('e1', 2)]);
    const { container } = renderWeek(client);
    const cell = await waitFor(() => cellWith(container, '2h') ?? Promise.reject(new Error('cell')));
    type(cell, '0');
    await waitFor(() => expect(calls.deleted).toEqual(['e1']));
  });

  test('il reset delle ore fatturabili riporta l\'override al lavorato', async () => {
    localStorage.setItem('timebox-timesheet-view', 'billable');
    const calls = setup([entry('e1', 2, { billableHours: 1 })]);
    const { findByTitle, container } = renderWeek(client);
    const cell = await waitFor(() => cellWith(container, '1h') ?? Promise.reject(new Error('cell')));
    fireEvent.mouseEnter(cell);
    fireEvent.click(await findByTitle('Resetta override · usa il valore lavorato'));
    await waitFor(() => expect(calls.saved).toHaveLength(1));
    expect(calls.saved[0]).toMatchObject({ id: 'e1', hours: 2, billableHours: null });
    localStorage.removeItem('timebox-timesheet-view');
  });
});

describe('WeeklyView / avvisi dei progetti: gli archiviati non ne generano', () => {
  const client = { id: 'c1', name: 'Area uno', color: '#4073ff', billing: 'none', limitType: 'none' };
  const monday = fmt(getMondayOfWeek(addDays(getToday(), 7)));
  const prj = (id, name, extra = {}) => ({ id, clientId: 'c1', name, budgetHours: 10, weeklyHours: 5, ...extra });
  const entry = (id, projectId) => ({ id, projectId, date: monday, hours: 6, billableHours: null, billed: false });

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
