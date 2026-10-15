import { describe, test, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import AreasScreen from './AreasScreen.jsx';

const clients = [{ id: 'c1', name: 'Area 1', color: '#4073ff', billing: 'none' }];
const projects = [
  { id: 'p1', clientId: 'c1', name: 'Attivo', position: 0 },
  { id: 'p2', clientId: 'c1', name: 'Archiviato', position: 1, archived: true },
];

let worked = {};
beforeEach(() => {
  worked = {};
  window.api = { getProjectTotals: () => Promise.resolve(worked) };
});

describe('AreasScreen archived toggle', () => {
  test('nasconde i progetti archiviati di default e li mostra col toggle', () => {
    const { getByText, queryByDisplayValue, getByDisplayValue } = render(
      <AreasScreen clients={clients} projects={projects} setClients={() => {}} setProjects={() => {}} />
    );

    expect(getByDisplayValue('Attivo')).toBeInTheDocument();
    expect(queryByDisplayValue('Archiviato')).not.toBeInTheDocument();

    fireEvent.click(getByText('Mostra archiviati (1)'));

    expect(getByDisplayValue('Attivo')).toBeInTheDocument();
    expect(getByDisplayValue('Archiviato')).toBeInTheDocument();
  });
});

describe('AreasScreen / elenco delle aree da tastiera', () => {
  test('un\'area si seleziona con Invio dopo averla raggiunta con Tab', () => {
    const two = [...clients, { id: 'c2', name: 'Area 2', color: '#299438', billing: 'none' }];
    const { getByRole, getByDisplayValue, queryByDisplayValue } = render(
      <AreasScreen clients={two} projects={[...projects, { id: 'p3', clientId: 'c2', name: 'Altro', position: 0 }]}
        setClients={() => {}} setProjects={() => {}} />
    );

    const second = getByRole('button', { name: /Area 2/ });
    expect(second.tabIndex).toBe(0);
    expect(second).toHaveAttribute('aria-pressed', 'false');
    expect(queryByDisplayValue('Altro')).not.toBeInTheDocument();

    fireEvent.keyDown(second, { key: 'Enter' });
    expect(second).toHaveAttribute('aria-pressed', 'true');
    expect(getByDisplayValue('Altro')).toBeInTheDocument();
  });
});

describe('AreasScreen / prezzo a corpo', () => {
  test('mostra la tariffa effettiva sulle ore lavorate', async () => {
    worked = { p1: 25 };
    const priced = [{ ...projects[0], fixedPrice: 1000 }];
    const { getByDisplayValue, findByText } = render(
      <AreasScreen clients={clients} projects={priced} setClients={() => {}} setProjects={() => {}} />
    );
    expect(getByDisplayValue('1000')).toBeInTheDocument();
    expect(await findByText('· 40 €/h')).toBeInTheDocument();
  });

  test('senza ore lavorate la tariffa non compare', () => {
    const priced = [{ ...projects[0], fixedPrice: 1000 }];
    const { queryByText } = render(
      <AreasScreen clients={clients} projects={priced} setClients={() => {}} setProjects={() => {}} />
    );
    expect(queryByText(/€\/h/)).not.toBeInTheDocument();
  });
});
