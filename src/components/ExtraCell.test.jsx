import { describe, test, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import ExtraCell from './ExtraCell.jsx';

const clients = [
  { id: 'c1', name: 'Acme', color: '#4073ff' },
  { id: 'c2', name: 'Blog', color: '#db4035' },
];

describe('ExtraCell', () => {
  test('senza extra né task orfani mostra il riempitivo', () => {
    const { container } = render(<ExtraCell blocks={[]} orphanTodoist={[]} clients={clients} />);
    expect(container).toHaveTextContent('—');
  });

  // Le ore oltre il piano non appartengono a una fascia: l'extra è dell'area, sul giorno.
  test('le ore extra sono per area, senza fascia', () => {
    const { getByText, queryByText, container } = render(
      <ExtraCell blocks={[{ clientId: 'c1', hours: 1.5 }, { clientId: 'nope', hours: 2 }]} orphanTodoist={[]} clients={clients} />
    );
    expect(getByText('Acme')).toBeInTheDocument();
    expect(container).toHaveTextContent('1:30');
    expect(queryByText(/^(AM|PM|Sera)$/)).not.toBeInTheDocument();
  });

  // La fascia resta sui task Todoist, che sono pianificazione.
  test('un task Todoist senza blocco porta la fascia in cui è pianificato', () => {
    const { getByText, getByTitle } = render(
      <ExtraCell blocks={[]} clients={clients} isToday
        orphanTodoist={[{ clientId: 'c2', hours: 2, slot: 'pm', tasks: [] }]} />
    );
    expect(getByTitle('Task Todoist senza blocco pianificato')).toHaveTextContent('Blog');
    expect(getByText('PM')).toBeInTheDocument();
  });

  test('nella vista compatta mostra le stesse cose', () => {
    const empty = render(<ExtraCell compact isToday blocks={[]} orphanTodoist={[]} clients={clients} />);
    expect(empty.container).toHaveTextContent('—');
    empty.unmount();

    const { getByText } = render(
      <ExtraCell compact isToday clients={clients}
        blocks={[{ clientId: 'c1', hours: 1 }]}
        orphanTodoist={[{ clientId: 'c2', hours: 2, slot: 'sera', tasks: [] }, { clientId: 'nope', hours: 1, slot: 'am' }]} />
    );
    expect(getByText('Acme')).toBeInTheDocument();
    expect(getByText('Sera')).toBeInTheDocument();
  });

  test('al passaggio del mouse un task orfano di oggi mostra i suoi task', () => {
    const orphan = { clientId: 'c2', hours: 2, slot: 'pm', tasks: [{ id: 't1', content: 'Scrivi articolo', hours: 2, projectName: 'Blog' }] };
    const { getByTitle, queryByText, rerender } = render(
      <ExtraCell blocks={[]} clients={clients} isToday orphanTodoist={[orphan]} />
    );
    const block = getByTitle('Task Todoist senza blocco pianificato');
    expect(queryByText('Scrivi articolo')).not.toBeInTheDocument();
    fireEvent.mouseEnter(block);
    expect(queryByText('Scrivi articolo')).toBeInTheDocument();
    fireEvent.mouseLeave(block);
    expect(queryByText('Scrivi articolo')).not.toBeInTheDocument();

    // su un giorno passato il dettaglio non si apre
    rerender(<ExtraCell blocks={[]} clients={clients} orphanTodoist={[orphan]} />);
    fireEvent.mouseEnter(getByTitle('Task Todoist senza blocco pianificato'));
    expect(queryByText('Scrivi articolo')).not.toBeInTheDocument();
  });
});
