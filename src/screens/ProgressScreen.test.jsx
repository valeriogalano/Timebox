import { describe, test, expect, beforeEach } from 'vitest';
import { render, within, fireEvent } from '@testing-library/react';
import ProgressScreen from './ProgressScreen.jsx';
import { getToday, fmt, getMondayOfWeek, addDays } from '../utils';

const clients = [
  { id: 'c1', name: 'Settimanale', color: '#4073ff', billing: 'none', limitType: 'weekly', limitHours: 10 },
  { id: 'c2', name: 'Globale', color: '#299438', billing: 'none', limitType: 'global', limitHours: 100 },
  { id: 'c3', name: 'Libera', color: '#db4035', billing: 'none', limitType: 'none' },
  { id: 'c4', name: 'A ore', color: '#eb96eb', billing: 'hourly', rate: 50, limitType: 'none' },
];
const projects = [
  { id: 'p1', clientId: 'c1', name: 'Progetto uno', weeklyHours: 5 },
  { id: 'p2', clientId: 'c2', name: 'Progetto due', budgetHours: 40 },
  { id: 'p3', clientId: 'c3', name: 'Archiviato', budgetHours: 10, archived: true },
  { id: 'p4', clientId: 'c2', name: 'Chiuso', archived: true },
  { id: 'p5', clientId: 'c4', name: 'Pacchetto', budgetHours: 40 },
];

function renderPanoramica() {
  return render(
    <ProgressScreen clients={clients} projects={projects} recurring={[]} screen="progress"
      weekOffset={0} setWeekOffset={() => {}} />
  );
}

describe('ProgressScreen / Settimana: limiti e budget', () => {
  beforeEach(() => {
    const today = fmt(getToday());
    window.api = {
      getEntries: () => Promise.resolve([
        { id: 'e1', projectId: 'p1', date: today, hours: 12, slot: 'am' },
        { id: 'e2', projectId: 'p2', date: today, hours: 3, slot: 'am' },
      ]),
      getProjectTotals: () => Promise.resolve({ p1: 12, p2: 30, p4: 20, p5: 31 }),
      getProjectBillableTotals: () => Promise.resolve({ p1: 12, p2: 30, p4: 20, p5: 26 }),
      getWeekOverridesRange: () => Promise.resolve([]),
    };
  });

  test('separa i limiti della settimana dai budget totali, con aree e progetti', async () => {
    const { findByText, getByText, queryByText } = renderPanoramica();

    const weekly = (await findByText('Limiti della settimana')).closest('div').parentElement;
    const total = getByText('Budget totali').closest('div').parentElement;
    expect(getByText('da inizio progetto · indipendente dal periodo')).toBeInTheDocument();

    // area con limite settimanale e progetto con ore settimanali
    expect(within(weekly).getByText('Settimanale')).toBeInTheDocument();
    expect(within(weekly).getByText('Progetto uno')).toBeInTheDocument();
    expect(within(weekly).queryByText('Progetto due')).not.toBeInTheDocument();
    // area con limite globale e progetto con budget totale
    expect(within(total).getByText('Globale')).toBeInTheDocument();
    expect(within(total).getByText('Progetto due')).toBeInTheDocument();
    expect(within(total).queryByText('Progetto uno')).not.toBeInTheDocument();
    // il tetto globale d'area consuma anche le ore dei progetti archiviati: 30h + 20h.
    // Su un tetto di 100h il residuo è anch'esso 50h: fatte e residuo, due volte.
    expect(within(total).getAllByText('50h')).toHaveLength(2);
    // un progetto archiviato è storia: il suo budget non è più una decisione
    expect(queryByText('Archiviato')).not.toBeInTheDocument();
  });

  test('ogni card mostra il residuo, o di quanto il tetto è superato', async () => {
    const { findByText, getByText } = renderPanoramica();

    const weekly = (await findByText('Limiti della settimana')).closest('div').parentElement;
    const total = getByText('Budget totali').closest('div').parentElement;

    // Progetto due: 30h su 40h di budget
    expect(within(total).getByText('10h').previousSibling).toHaveTextContent('mancano');
    // Progetto uno: 12h su 5h settimanali
    expect(within(weekly).getByText('7h').previousSibling).toHaveTextContent('oltre di');
  });

  test('in un\'area a ore la card mostra ore fatturabili e ore lavorate quando divergono', async () => {
    const { findByText } = renderPanoramica();

    // Pacchetto: 40h di budget, 31h lavorate di cui 26h fatturabili
    const card = (await findByText('Pacchetto')).closest('div').parentElement.parentElement;
    expect(card).toHaveTextContent('mancano14hfatt.·mancano9hlavorate');
    expect(card).toHaveTextContent('26h fatt.·31h lavorate / 40h');
    // la percentuale segue il conteggio messo peggio: 31h su 40h
    expect(card).toHaveTextContent('78%');
  });

  test('le lenti sono pulsanti, con l\'aiuto raggiungibile a parte', async () => {
    const { findByRole, getByRole, findByText } = renderPanoramica();

    const trend = await findByRole('button', { name: 'Trend' });
    expect(getByRole('button', { name: 'Settimana' })).toHaveAttribute('aria-pressed', 'true');
    expect(getByRole('button', { name: /^Aiuto: Le ultime 8 settimane/ })).toBeInTheDocument();

    fireEvent.click(trend);
    expect(trend).toHaveAttribute('aria-pressed', 'true');
    expect(await findByText('Per area')).toBeInTheDocument();
  });

  test('In prospettiva legge un\'area a ore sul conteggio messo peggio e lo dichiara', async () => {
    const { findByText, getByText } = renderPanoramica();

    await findByText('Limiti della settimana');
    fireEvent.click(getByText('In prospettiva'));
    // Pacchetto: 31h lavorate contro 26h fatturabili, quindi il consumato è in ore lavorate
    const row = (await findByText('Pacchetto')).closest('div').parentElement;
    expect(row).toHaveTextContent('consumato 31h lavorate su 40h');
    expect(row).toHaveTextContent('restano 9h');
    // Progetto due è in un'area a corpo: nessuna etichetta
    expect(getByText('Progetto due').closest('div').parentElement).toHaveTextContent('consumato 30h su 40h');
  });

  test('la colonna Limite compare nel consuntivo per area e segnala il superamento', async () => {
    const { findByText, getAllByTitle } = renderPanoramica();

    await findByText('Limite');
    // 12h su un limite di 10h: ⚠ nella colonna e nella card dell'area
    expect(getAllByTitle('Superato').length).toBeGreaterThanOrEqual(2);
  });
});

describe('ProgressScreen / Trend: Da decidere', () => {
  // 4h a settimana per l'area c3, mai svolte: ogni settimana chiusa è sotto il piano
  const recurring = [{ id: 'r1', clientId: 'c3', day: 0, slot: 'am', hours: 4, position: 0 }];

  beforeEach(() => {
    window.api = {
      getEntries: () => Promise.resolve([]),
      getProjectTotals: () => Promise.resolve({}),
      getProjectBillableTotals: () => Promise.resolve({}),
      getWeekOverridesRange: () => Promise.resolve([]),
    };
  });

  test('la card dice il verdetto a parole, le due medie e cosa fare', async () => {
    const { findByText, getByText } = render(
      <ProgressScreen clients={clients} projects={projects} recurring={recurring} screen="progress"
        weekOffset={0} setWeekOffset={() => {}} />
    );
    fireEvent.click(await findByText('Trend'));
    const card = (await findByText('Molto sotto il piano')).parentElement;

    expect(getByText('media sulle settimane chiuse · fino a 8')).toBeInTheDocument();
    expect(within(card).getByText('Libera')).toBeInTheDocument();
    expect(within(card).getByText('di 4h/sett')).toBeInTheDocument();
    expect(within(card).getByText('0%')).toBeInTheDocument();
    expect(within(card).getByText(/^7 settimane su 7 sotto · la peggiore -4h/)).toBeInTheDocument();
    expect(within(card).getByText('Nessuna ora svolta: valuta di togliere i blocchi dalla ricorrenza')).toBeInTheDocument();
  });
  test('oltre il piano: barra piena, percentuale sopra 100 e ricorrenza da alzare', async () => {
    // 8h ogni lunedì delle sette settimane chiuse, su 4h di ricorrenza
    const monday = getMondayOfWeek(getToday());
    const past = Array.from({ length: 7 }, (_, k) => ({
      id: `e${k}`, projectId: 'p3', date: fmt(addDays(monday, -7 * (k + 1))), hours: 8, slot: 'am',
    }));
    window.api.getEntries = () => Promise.resolve(past);

    const { findByText } = render(
      <ProgressScreen clients={clients} projects={projects} recurring={recurring} screen="progress"
        weekOffset={0} setWeekOffset={() => {}} />
    );
    fireEvent.click(await findByText('Trend'));
    const card = (await findByText('Molto oltre il piano')).parentElement;

    expect(within(card).getByText('8h')).toBeInTheDocument();
    expect(within(card).getByText('200%')).toBeInTheDocument();
    expect(within(card).getByTitle('Oltre il piano')).toBeInTheDocument();
    expect(within(card).getByText(/^7 settimane su 7 sopra · la più carica \+4h/)).toBeInTheDocument();
    expect(within(card).getByText('Porta la ricorrenza da 4h a ~8h')).toBeInTheDocument();
  });

  test('un\'area in linea con il piano non compare', async () => {
    const monday = getMondayOfWeek(getToday());
    const past = Array.from({ length: 7 }, (_, k) => ({
      id: `e${k}`, projectId: 'p3', date: fmt(addDays(monday, -7 * (k + 1))), hours: 4, slot: 'am',
    }));
    window.api.getEntries = () => Promise.resolve(past);

    const { findByText, queryByText } = render(
      <ProgressScreen clients={clients} projects={projects} recurring={recurring} screen="progress"
        weekOffset={0} setWeekOffset={() => {}} />
    );
    fireEvent.click(await findByText('Trend'));
    await findByText('Per area');
    expect(queryByText('Da decidere')).not.toBeInTheDocument();
  });
});
