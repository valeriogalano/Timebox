import { describe, test, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import PlanningCell from './PlanningCell.jsx';
import { capUsage } from '../cap-usage';

const clients = [{ id: 'c1', name: 'Area', color: '#4073ff', billing: 'hourly' }];
const projects = [{ id: 'p1', clientId: 'c1', name: 'Progetto', budgetHours: 100, weeklyHours: 10 }];
const blocks = [{ id: 'b1', clientId: 'c1', hours: 2 }];

function renderCell(usage) {
  return render(
    <PlanningCell slot="am" dayIndex={0} blocks={blocks} clients={clients} projects={projects} {...usage} />
  );
}

describe('PlanningCell: tacche di limite', () => {
  test('nessuna tacca sotto metà di ogni tetto', () => {
    const { queryByTitle } = renderCell({
      totalUsage: { p1: capUsage(10) }, weekUsage: { p1: capUsage(2) },
    });
    expect(queryByTitle(/Limite/)).not.toBeInTheDocument();
  });

  test('il limite settimanale del progetto fa scattare le tacche anche se il budget totale è lontano', () => {
    const { getByTitle } = renderCell({
      totalUsage: { p1: capUsage(10) }, weekUsage: { p1: capUsage(8.5) },
    });
    expect(getByTitle("Limite all'80%+")).toBeInTheDocument();
  });

  test('quando i conteggi divergono il titolo dice su quale è scattato', () => {
    // 7h lavorate ma 11h fatturabili su 10h settimanali: supera solo il fatturabile
    const { getByTitle } = renderCell({
      totalUsage: { p1: capUsage(10) }, weekUsage: { p1: capUsage(7, 11, true) },
    });
    expect(getByTitle('Limite superato (ore fatturabili)')).toBeInTheDocument();
  });
});

describe('PlanningCell: blocchi', () => {
  const twoClients = [
    ...clients,
    { id: 'c2', name: 'Seconda', color: '#299438', billing: 'none', areaStatus: 'minimal' },
  ];

  test('uno slot senza blocchi mostra il trattino e nessun controllo se non è modificabile', () => {
    const { getByText, queryByText } = render(
      <PlanningCell slot="am" dayIndex={0} blocks={[]} clients={clients} projects={projects} />
    );
    expect(getByText('—')).toBeInTheDocument();
    expect(queryByText('+')).not.toBeInTheDocument();
  });

  test('un blocco di un\'area sconosciuta non viene reso', () => {
    const { queryByText, getByText } = render(
      <PlanningCell slot="am" dayIndex={0} blocks={[{ id: 'x', clientId: 'assente', hours: 1 }]} clients={clients} projects={projects} />
    );
    expect(queryByText('Area')).not.toBeInTheDocument();
    expect(getByText('—')).toBeInTheDocument();
  });

  test('mostra le ore tracciate sul pianificato, l\'avviso di slot oltre capacità e lo stato dell\'area', () => {
    const { getByText, getByTitle, getAllByText } = render(
      <PlanningCell slot="pm" dayIndex={1} compact isToday hasTodoistSync
        blocks={[{ id: 'b1', clientId: 'c1', hours: 2 }, { id: 'b2', clientId: 'c2', hours: 0.5 }, { id: 'b3', clientId: 'c1', hours: 1 }]}
        clients={twoClients} projects={projects}
        blockFill={{ b1: { logged: 1, hasExtra: true }, b3: { logged: 1, hasExtra: false } }}
        todoistByClient={{ c1: 2.5 }}
        todoistTasksByClient={{ c1: [{ id: 't1', content: 'Primo', hours: 1.5 }, { id: 't2', content: 'Secondo', hours: 1 }] }}
      />
    );
    // parziale: 1:00 tracciata su 2:00 pianificate; completo: 1:00 su 1:00
    expect(getAllByText('1h').length).toBeGreaterThanOrEqual(2);
    expect(getByText('2h')).toBeInTheDocument();
    expect(getByTitle('Slot oltre capacità')).toBeInTheDocument();
    expect(getByText('Seconda')).toBeInTheDocument();
  });

  test('la durata si modifica in linea: Invio salva, Esc annulla, zero non salva', () => {
    const updates = [];
    const { getByTitle, getByDisplayValue, queryByDisplayValue } = render(
      <PlanningCell slot="am" dayIndex={0} editable blocks={blocks} clients={clients} projects={projects}
        onUpdateBlock={(id, h) => updates.push([id, h])} />
    );
    fireEvent.click(getByTitle('Modifica durata pianificata'));
    fireEvent.change(getByDisplayValue('2h'), { target: { value: '3:30' } });
    fireEvent.keyDown(getByDisplayValue('3:30'), { key: 'Enter' });
    expect(updates).toEqual([['b1', 3.5]]);

    fireEvent.click(getByTitle('Modifica durata pianificata'));
    fireEvent.keyDown(getByDisplayValue('2h'), { key: 'Escape' });
    expect(queryByDisplayValue('2h')).not.toBeInTheDocument();

    fireEvent.click(getByTitle('Modifica durata pianificata'));
    fireEvent.change(getByDisplayValue('2h'), { target: { value: '0' } });
    fireEvent.blur(getByDisplayValue('0'));
    expect(updates).toHaveLength(1);
  });

  test('al passaggio del mouse compare la rimozione del blocco', () => {
    const removed = [];
    const { getByText, getByTitle, queryByTitle } = render(
      <PlanningCell slot="am" dayIndex={0} editable blocks={blocks} clients={clients} projects={projects}
        onRemoveBlock={id => removed.push(id)} />
    );
    expect(queryByTitle('Rimuovi blocco')).not.toBeInTheDocument();
    fireEvent.mouseEnter(getByText('Area').parentElement.parentElement);
    fireEvent.click(getByTitle('Rimuovi blocco'));
    expect(removed).toEqual(['b1']);
  });

  test('il pulsante + aggiunge un blocco solo con un\'area scelta e ore positive', () => {
    const added = [];
    const { getByText, getByRole, getByPlaceholderText, queryByText } = render(
      <PlanningCell slot="am" dayIndex={0} editable blocks={blocks} clients={clients} projects={projects}
        onAddBlock={(clientId, h) => added.push([clientId, h])} />
    );
    fireEvent.click(getByText('+'));
    fireEvent.click(getByText('Aggiungi'));
    expect(added).toEqual([]);

    fireEvent.change(getByRole('combobox'), { target: { value: 'c1' } });
    fireEvent.change(getByPlaceholderText('ore'), { target: { value: '0' } });
    fireEvent.click(getByText('Aggiungi'));
    expect(added).toEqual([]);

    fireEvent.change(getByPlaceholderText('ore'), { target: { value: '1:30' } });
    fireEvent.click(getByText('Aggiungi'));
    expect(added).toEqual([['c1', 1.5]]);
    expect(queryByText('Aggiungi')).not.toBeInTheDocument();
  });
});
