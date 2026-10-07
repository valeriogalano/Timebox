import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, within, waitFor } from '@testing-library/react';
import EntriesScreen from './EntriesScreen.jsx';
import { getToday, fmt } from '../utils';

const clients = [
  { id: 'c1', name: 'A corpo', color: '#4073ff', billing: 'fixed' },
  { id: 'c2', name: 'A ore', color: '#eb96eb', billing: 'hourly', rate: 50 },
];
const projects = [
  { id: 'p1', clientId: 'c1', name: 'Progetto fisso' },
  { id: 'p2', clientId: 'c2', name: 'Progetto orario' },
];
const today = fmt(getToday());
const entries = [
  { id: 'e1', projectId: 'p1', date: today, hours: 2, slot: 'am', billed: false, billableHours: null },
  { id: 'e2', projectId: 'p2', date: today, hours: 2, slot: 'pm', billed: true, billableHours: 1 },
  { id: 'e3', projectId: 'p2', date: today, hours: 1, slot: 'eve', billed: false, billableHours: null },
];

const renderScreen = () => render(<EntriesScreen clients={clients} projects={projects} />);
const rowOf = (el) => el.closest('tr');
// il nome del progetto compare anche tra le opzioni del filtro
const inTable = { selector: 'td, td *' };

describe('EntriesScreen', () => {
  beforeEach(() => {
    window.api = {
      getEntries: vi.fn(() => Promise.resolve(entries)),
      saveEntry: vi.fn(() => Promise.resolve()),
      deleteEntry: vi.fn(() => Promise.resolve()),
    };
  });

  test('i testi sono in italiano: conteggio delle registrazioni e stato fuori dalle aree a ore', async () => {
    const { findByText, queryByText } = renderScreen();
    expect(await findByText(/3 registrazioni ·/)).toBeInTheDocument();
    expect(queryByText('n/a')).not.toBeInTheDocument();
  });

  test('una sola registrazione va al singolare, nessuna mostra il messaggio vuoto', async () => {
    window.api.getEntries = vi.fn(() => Promise.resolve([entries[0]]));
    const one = renderScreen();
    expect(await one.findByText(/1 registrazione ·/)).toBeInTheDocument();
    one.unmount();

    window.api.getEntries = vi.fn(() => Promise.resolve([]));
    const none = renderScreen();
    expect(await none.findByText('Nessuna registrazione nel periodo selezionato.')).toBeInTheDocument();
  });

  test('fatturato e ore fatturabili compaiono solo nelle aree a ore', async () => {
    const { findByText } = renderScreen();
    const fixed = rowOf(await findByText('Progetto fisso', inTable));
    const table = fixed.closest('tbody');

    expect(within(fixed).queryByText('✓')).not.toBeInTheDocument();
    expect(within(fixed).queryByText('○')).not.toBeInTheDocument();
    // le due registrazioni a ore: una fatturata, una no
    expect(within(table).getAllByText('✓')).toHaveLength(1);
    expect(within(table).getAllByText('○')).toHaveLength(1);
    // ore fatturabili diverse dalle lavorate: si mostra il fatturabile, le lavorate nel title
    expect(rowOf(within(table).getByText('✓'))).toContainElement(within(table).getByTitle('Tracciate: 2h'));
    expect(within(table).getByTitle('Tracciate: 2h')).toHaveTextContent('1h');
  });

  test('il filtro per area restringe elenco e conteggio', async () => {
    const { findByText, getAllByRole, queryByText } = renderScreen();
    await findByText(/3 registrazioni ·/);
    fireEvent.change(getAllByRole('combobox')[0], { target: { value: 'c2' } });
    expect(await findByText(/2 registrazioni ·/)).toBeInTheDocument();
    expect(queryByText('Progetto fisso', inTable)).not.toBeInTheDocument();
  });

  test('modifica e salvataggio passano dalla riga, Annulla la chiude', async () => {
    const { findByText } = renderScreen();
    const row = rowOf(await findByText('Progetto fisso', inTable));
    fireEvent.click(within(row).getByText('Modifica'));
    fireEvent.click(within(row).getByText('Annulla'));
    expect(within(row).getByText('Modifica')).toBeInTheDocument();

    fireEvent.click(within(row).getByText('Modifica'));
    fireEvent.click(within(row).getByText('Salva'));
    await waitFor(() => expect(window.api.saveEntry).toHaveBeenCalledTimes(1));
    expect(window.api.saveEntry.mock.calls[0][0]).toMatchObject({ id: 'e1', projectId: 'p1', hours: 2 });
    // dopo il salvataggio l'elenco si ricarica e la riga torna in sola lettura
    await waitFor(() => expect(window.api.getEntries).toHaveBeenCalledTimes(2));
    expect(await findByText('Progetto fisso', inTable)).toBeInTheDocument();
  });

  test('l\'eliminazione chiede conferma prima di cancellare', async () => {
    const { findByText } = renderScreen();
    const row = rowOf(await findByText('Progetto fisso', inTable));
    fireEvent.click(within(row).getByText('Elimina'));
    fireEvent.click(within(row).getByText('No'));
    expect(window.api.deleteEntry).not.toHaveBeenCalled();

    fireEvent.click(within(row).getByText('Elimina'));
    fireEvent.click(within(row).getByText('Sì'));
    await waitFor(() => expect(window.api.deleteEntry).toHaveBeenCalledWith('e1'));
    await waitFor(() => expect(window.api.getEntries).toHaveBeenCalledTimes(2));
    expect(await findByText(/3 registrazioni ·/)).toBeInTheDocument();
  });
});
