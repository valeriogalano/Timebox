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

  test('Limiti della settimana mostra solo i tetti settimanali; i budget totali stanno in In prospettiva', async () => {
    const { findByText, getByText, queryByText } = renderPanoramica();

    const weekly = (await findByText('Limiti della settimana')).closest('div').parentElement;
    expect(queryByText('Budget totali')).not.toBeInTheDocument();
    // area con limite settimanale e progetto con ore settimanali
    expect(within(weekly).getByText('Settimanale')).toBeInTheDocument();
    expect(within(weekly).getByText('Progetto uno')).toBeInTheDocument();
    expect(within(weekly).queryByText('Progetto due')).not.toBeInTheDocument();
    expect(within(weekly).queryByText('Globale')).not.toBeInTheDocument();

    fireEvent.click(getByText('In prospettiva'));
    // il tetto globale d'area consuma anche le ore dei progetti archiviati: 30h + 20h
    expect((await findByText('Globale')).closest('div').parentElement).toHaveTextContent('consumato 50h su 100h');
    expect(getByText('Progetto due')).toBeInTheDocument();
    // un progetto archiviato è storia: il suo budget non è più una decisione
    expect(queryByText('Archiviato')).not.toBeInTheDocument();
  });

  test('ogni card mostra il residuo, o di quanto il tetto è superato', async () => {
    const { findByText } = renderPanoramica();

    const weekly = (await findByText('Limiti della settimana')).closest('div').parentElement;
    // Progetto uno: 12h su 5h settimanali
    expect(within(weekly).getByText('7h').previousSibling).toHaveTextContent('oltre di');
    // Settimanale: 12h su 10h, oltre già ora e quindi anche sul previsto
    expect(within(weekly).getByText('2h').previousSibling).toHaveTextContent('oltre di');
  });

  test('in un\'area a ore la card mostra ore fatturabili e ore lavorate quando divergono', async () => {
    const today = fmt(getToday());
    window.api.getEntries = () => Promise.resolve([
      { id: 'e1', projectId: 'p6', date: today, hours: 8, billableHours: 6, slot: 'am' },
    ]);
    const hourly = { id: 'c5', name: 'Consulenza', color: '#b8255f', billing: 'hourly', rate: 50, limitType: 'weekly', limitHours: 10 };
    const { findByText } = render(
      <ProgressScreen clients={[hourly]} projects={[{ id: 'p6', clientId: 'c5', name: 'Supporto' }]} recurring={[]}
        screen="progress" weekOffset={0} setWeekOffset={() => {}} />
    );

    const card = (await findByText('Consulenza', { selector: 'span[style*="font-size: 13px"]' })).closest('div').parentElement.parentElement;
    expect(card).toHaveTextContent('mancano4hfatt.·mancano2hlavorate');
    expect(card).toHaveTextContent('6h fatt.·8h lavorate / 10h');
    // la percentuale segue il conteggio messo peggio: 8h su 10h
    expect(card).toHaveTextContent('80%');
  });

  test('settimana futura: il previsto è il piano, e il ⚠ scatta quando supera il limite', async () => {
    // 2h al giorno su Settimanale (limite 10h): la settimana prossima arriva a 14h
    const recurring = Array.from({ length: 7 }, (_, day) => ({ id: `r${day}`, clientId: 'c1', day, slot: 'am', hours: 2, position: 0 }));
    window.api.getEntries = () => Promise.resolve([]);
    const { findByText, getByText, getAllByTitle } = render(
      <ProgressScreen clients={clients} projects={projects} recurring={recurring} screen="progress"
        weekOffset={1} setWeekOffset={() => {}} />
    );

    const weekly = (await findByText('Limiti della settimana')).closest('div').parentElement;
    const card = within(weekly).getByText('Settimanale').closest('div').parentElement.parentElement;
    // ancora nessuna ora fatta, ma il piano porta a 14h
    expect(card).toHaveTextContent('mancano10h');
    expect(card).toHaveTextContent('previsto 14h');
    expect(getAllByTitle('Previsto 14h su 10h · Limite − Previsto -4h').length).toBeGreaterThanOrEqual(1);

    // per area: piano, fatto e previsto; in linea perché il previsto è il piano
    expect(getByText('piano · fatto · previsto')).toBeInTheDocument();
    expect(getAllByTitle('In linea · Δ +0h sul previsto')).toHaveLength(1);
    // carico: 14h previste su 14h di capacità
    expect(getByText('100%')).toBeInTheDocument();
    expect(getByText('Previsto a fine settimana')).toBeInTheDocument();
  });

  test('settimana chiusa: niente colonna Previsto, il verdetto è sul fatto', async () => {
    const monday = getMondayOfWeek(getToday());
    const lastWeek = fmt(addDays(monday, -7));
    const recurring = [{ id: 'r1', clientId: 'c3', day: 0, slot: 'am', hours: 4, position: 0 }];
    window.api.getEntries = () => Promise.resolve([{ id: 'e1', projectId: 'p3', date: lastWeek, hours: 1, slot: 'am' }]);
    const { findByText, queryByText, getAllByTitle } = render(
      <ProgressScreen clients={clients} projects={projects} recurring={recurring} screen="progress"
        weekOffset={-1} setWeekOffset={() => {}} />
    );

    expect(await findByText('piano · fatto')).toBeInTheDocument();
    expect(queryByText('Previsto')).not.toBeInTheDocument();
    expect(queryByText('Previsto a fine settimana')).not.toBeInTheDocument();
    // 1h su 4h: molto sotto, scarto di 3h
    expect(getAllByTitle('Molto sottocarico · Δ -3h')).toHaveLength(1);
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

  test('In prospettiva: il riepilogo conta i tetti per fascia, con le parole delle card', async () => {
    // Progetto due oltre il budget: 45h su 40h. Gli altri tetti sono fermi o lontani.
    window.api.getProjectTotals = () => Promise.resolve({ p2: 45 });
    window.api.getProjectBillableTotals = () => Promise.resolve({ p2: 45 });
    window.api.getEntries = () => Promise.resolve([]);
    const { findByText, getByText } = renderPanoramica();

    await findByText('Limiti della settimana');
    fireEvent.click(getByText('In prospettiva'));
    expect(await findByText('1 già esaurito')).toBeInTheDocument();
    expect(getByText('Progetto due').closest('div').parentElement).toHaveTextContent('Tetto esaurito');
  });

  test('In prospettiva senza tetti cumulativi lo dice', async () => {
    const { findByText, getByText } = render(
      <ProgressScreen clients={[clients[2]]} projects={[]} recurring={[]} screen="progress"
        weekOffset={0} setWeekOffset={() => {}} />
    );

    fireEvent.click(await findByText('In prospettiva'));
    expect(getByText('Nessun tetto cumulativo')).toBeInTheDocument();
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

  test('mini-grafici: piano di ogni settimana, glifo sulle chiuse, settimane oltre il limite', async () => {
    // Settimanale (limite 10h), 8h a settimana di piano; due delle sette settimane chiuse a 12h
    const weekly = [{ id: 'r1', clientId: 'c1', day: 0, slot: 'am', hours: 8, position: 0 }];
    const monday = getMondayOfWeek(getToday());
    const past = Array.from({ length: 7 }, (_, k) => ({
      id: `e${k}`, projectId: 'p1', date: fmt(addDays(monday, -7 * (k + 1))), hours: k < 2 ? 12 : 8, slot: 'am',
    }));
    // la settimana in corso, a zero, non deve far dire "sotto" al glifo
    window.api.getEntries = () => Promise.resolve(past);

    const { findByText, getByText } = render(
      <ProgressScreen clients={clients} projects={projects} recurring={weekly} screen="progress"
        weekOffset={0} setWeekOffset={() => {}} />
    );
    fireEvent.click(await findByText('Trend'));
    const card = getByText('Settimanale', { selector: 'span[style*="flex: 1"]' }).closest('div').parentElement;

    expect(within(card).getByText('2 su 7 oltre il limite di 10h')).toBeInTheDocument();
    expect(within(card).getByTitle('Limite settimanale 10h')).toBeInTheDocument();
    // 64h fatte su 56h di piano nelle chiuse: oltre il 10% e oltre mezz'ora
    expect(within(card).getByTitle('Sovraccarico · settimane chiuse')).toBeInTheDocument();
    // un segno di piano per ognuna delle 8 settimane
    expect(card.querySelectorAll('[data-plan-mark]')).toHaveLength(8);
  });
});

