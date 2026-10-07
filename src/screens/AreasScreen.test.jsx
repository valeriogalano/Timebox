import { describe, test, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import AreasScreen from './AreasScreen.jsx';

const clients = [{ id: 'c1', name: 'Area 1', color: '#4073ff', billing: 'none' }];
const projects = [
  { id: 'p1', clientId: 'c1', name: 'Attivo', position: 0 },
  { id: 'p2', clientId: 'c1', name: 'Archiviato', position: 1, archived: true },
];

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
