import { describe, test, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import BillingScreen from './BillingScreen.jsx';

const clients = [
  { id: 'c1', name: 'A ore', color: '#4073ff', billing: 'hourly', rate: 50 },
  { id: 'c2', name: 'A corpo', color: '#299438', billing: 'fixed' },
  { id: 'c3', name: 'Senza compenso', color: '#db4035', billing: 'none' },
];
const projects = [
  { id: 'p1', clientId: 'c1', name: 'Progetto a ore' },
  { id: 'p2', clientId: 'c2', name: 'Progetto a corpo' },
  { id: 'p3', clientId: 'c3', name: 'Progetto libero' },
];

describe('Rendiconto: solo le aree a ore', () => {
  beforeEach(() => {
    window.api = {
      getEntries: () => Promise.resolve([
        { id: 'e1', projectId: 'p1', date: '2026-10-01', hours: 3, billableHours: 2, slot: 'am', billed: false },
        { id: 'e2', projectId: 'p2', date: '2026-10-01', hours: 7, billableHours: 5, slot: 'am', billed: false },
        { id: 'e3', projectId: 'p3', date: '2026-10-01', hours: 9, slot: 'am', billed: false },
      ]),
    };
  });

  test('le aree a corpo escono dal dettaglio e restano come riga di riepilogo in ore lavorate', async () => {
    const { findByText, getByText, queryByText } = render(
      <BillingScreen clients={clients} projects={projects} screen="billing" />
    );

    // l'area a ore ha la sua sezione, con i progetti
    await findByText('Progetto a ore');
    // l'area a corpo non ha sezione: niente elenco dei suoi progetti
    expect(queryByText('Progetto a corpo')).not.toBeInTheDocument();
    // ma compare in fondo, con le ore lavorate (7h) e non le fatturabili (5h)
    const summary = getByText('Aree a corpo · ore lavorate nel periodo').parentElement;
    expect(summary).toHaveTextContent('A corpo 7h');
    // l'area senza compenso non compare da nessuna parte
    expect(queryByText('Senza compenso')).not.toBeInTheDocument();
  });

  test('segnare una registrazione come fatturata la sposta tra i riquadri', async () => {
    const saved = [];
    window.api.saveEntry = e => { saved.push(e); return Promise.resolve(); };
    const { findByTitle, getByText } = render(
      <BillingScreen clients={clients} projects={projects} screen="billing" />
    );

    // 2h fatturabili a 50 €/h, ancora da fatturare
    const card = label => getByText(label).closest('div').parentElement;
    fireEvent.click(await findByTitle('Segna come fatturata'));
    await findByTitle('Segna come non fatturata');

    expect(saved).toEqual([expect.objectContaining({ id: 'e1', billed: true })]);
    expect(card('Fatturate')).toHaveTextContent('2h');
    expect(card('Fatturate')).toHaveTextContent('€100');
    expect(card('Da fatturare')).toHaveTextContent('0h');
  });

  test('senza registrazioni a ore nel periodo i tre riquadri a zero non compaiono', async () => {
    window.api.getEntries = () => Promise.resolve([
      { id: 'e2', projectId: 'p2', date: '2026-10-01', hours: 7, slot: 'am', billed: false },
    ]);
    const { findByText, getByText, queryByText } = render(
      <BillingScreen clients={clients} projects={projects} screen="billing" />
    );

    expect(await findByText(/^Nessuna registrazione a ore per /)).toBeInTheDocument();
    expect(queryByText('Fatturabili totali')).not.toBeInTheDocument();
    expect(getByText('Aree a corpo · ore lavorate nel periodo').parentElement).toHaveTextContent('A corpo 7h');
  });
});
