import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
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
