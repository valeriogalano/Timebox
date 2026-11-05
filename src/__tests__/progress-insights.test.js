import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { capRunway, runwaySummary, statusFor, templateCalibration, templateActionLabel, PERSIST_WINDOW, MIN_HISTORY, TOLERANCE_LABEL } from '../progress-insights.js';

const area = (name, weeks, template = 10) => ({ client: { id: name, name, color: '#000' }, template, weeks });
// settimana chiusa: obiettivo del lunedì, obiettivo finale, fatto; `set` = obiettivo salvato
let wkSeq = 0;
const wk = (monday, target, done, set = true) => ({ week: `2026-01-${String(++wkSeq % 28 + 1).padStart(2, '0')}`, monday, target, done, set });
const rep = (n, w) => Array.from({ length: n }, () => w);

describe('templateCalibration', () => {
  test('lunedì sempre sopra il template: il template è sbagliato, con il valore da scrivere', () => {
    const [item] = templateCalibration([area('A', rep(PERSIST_WINDOW, wk(14.1, 14.1, 14.1)))]);
    assert.equal(item.templateSignal.dir, 1);
    assert.equal(item.templateSignal.off, PERSIST_WINDOW);
    assert.equal(item.templateSignal.suggested, 14);
    assert.equal(item.driftSignal, null);
    assert.equal(templateActionLabel(item.templateSignal, item.template), 'Porta la ricorrenza da 10h a 14h');
  });

  test('un\'urgenza cambia l\'obiettivo finale, non quello del lunedì: nessun segnale', () => {
    const weeks = rep(PERSIST_WINDOW, wk(10, 16, 16));
    assert.deepEqual(templateCalibration([area('A', weeks)]), []);
  });

  test('fatto sempre sotto l\'obiettivo finale: è l\'esecuzione, non il template', () => {
    const [item] = templateCalibration([area('A', rep(PERSIST_WINDOW, wk(10, 10, 6)))]);
    assert.equal(item.templateSignal, null);
    assert.equal(item.driftSignal.dir, -1);
    assert.equal(item.driftSignal.suggested, 6);
    assert.equal(item.driftSignal.avgRef, 10);
  });

  test('i due segnali insieme restano separati', () => {
    const [item] = templateCalibration([area('A', rep(PERSIST_WINDOW, wk(14, 14, 9)))]);
    assert.equal(item.templateSignal.dir, 1);
    assert.equal(item.driftSignal.dir, -1);
  });

  test('"quasi ogni settimana": 6 su 8 bastano, 5 su 8 no', () => {
    const six = [...rep(6, wk(14, 14, 14)), ...rep(2, wk(10, 14, 14))];
    assert.equal(templateCalibration([area('A', six)])[0].templateSignal.off, 6);
    const five = [...rep(5, wk(14, 14, 14)), ...rep(3, wk(10, 14, 14))];
    assert.deepEqual(templateCalibration([area('A', five)]), []);
  });

  test('versi opposti non si sommano: alternare sopra e sotto non è una deriva', () => {
    const weeks = Array.from({ length: PERSIST_WINDOW }, (_, i) => wk(i % 2 ? 15 : 5, 10, 10));
    assert.deepEqual(templateCalibration([area('A', weeks)]), []);
  });

  test('dentro la tolleranza (mezz\'ora o 10%) non è uno scarto', () => {
    assert.deepEqual(templateCalibration([area('A', rep(PERSIST_WINDOW, wk(10.5, 10.5, 10.5)))]), []);
    assert.deepEqual(templateCalibration([area('A', rep(PERSIST_WINDOW, wk(21, 21, 21)), 20)]), []);
    assert.equal(templateCalibration([area('A', rep(PERSIST_WINDOW, wk(11.1, 11.1, 11.1)))]).length, 1);
  });

  test('senza obiettivo salvato il lunedì non conta per il template, il fatto sì', () => {
    // il riferimento del fatto è il piano congelato (già in `target`)
    const [item] = templateCalibration([area('A', rep(PERSIST_WINDOW, wk(10, 10, 5, false)))]);
    assert.equal(item.templateSignal, null);
    assert.equal(item.driftSignal.dir, -1);
  });

  test('settimane a obiettivo zero non sono "sotto": l\'area era ferma', () => {
    assert.deepEqual(templateCalibration([area('A', rep(PERSIST_WINDOW, wk(0, 0, 0, false)))]), []);
  });

  test('sotto MIN_HISTORY settimane utili non si tocca il template', () => {
    assert.deepEqual(templateCalibration([area('A', rep(MIN_HISTORY - 1, wk(14, 14, 6)))]), []);
    assert.equal(templateCalibration([area('A', rep(MIN_HISTORY, wk(14, 14, 6)))]).length, 1);
  });

  test('guarda solo le ultime PERSIST_WINDOW settimane', () => {
    const old = rep(4, wk(10, 10, 10));
    assert.deepEqual(templateCalibration([area('A', [...rep(PERSIST_WINDOW, wk(10, 10, 10)), ...old])]), []);
    assert.equal(templateCalibration([area('A', [...old, ...rep(PERSIST_WINDOW, wk(14, 14, 14))])]).length, 1);
  });

  test('in cima l\'area più fuori taratura', () => {
    const mild = area('mild', rep(PERSIST_WINDOW, wk(12, 12, 12)));
    const bad = area('bad', rep(PERSIST_WINDOW, wk(30, 30, 30)));
    assert.deepEqual(templateCalibration([mild, bad]).map(i => i.area), ['bad', 'mild']);
  });

  test('azione: già al valore suggerito, e obiettivo sempre a zero', () => {
    assert.equal(templateActionLabel({ suggested: 14.25 }, 14.25), 'Ricorrenza già a 14h\u00a015m: nessuna modifica');
    assert.match(templateActionLabel({ suggested: 0 }, 10), /sempre a zero/);
  });
});

describe('capRunway', () => {
  test('senza tetto: nessun runway da leggere', () => {
    const r = capRunway({ cap: 0, consumed: 10, rhythm: 5 });
    assert.equal(r.hasCap, false);
    assert.equal(r.band, 'nocap');
  });

  test('fasce 2/4/8 sulle settimane residue', () => {
    // 10h residue: a 5h/sett = 2 sett, a 3h/sett ~3,3 sett, a 1,5h/sett ~6,7 sett
    assert.equal(capRunway({ cap: 20, consumed: 10, rhythm: 5 }).band,   'entro2');
    assert.equal(capRunway({ cap: 20, consumed: 10, rhythm: 3 }).band,   'entro4');
    assert.equal(capRunway({ cap: 20, consumed: 10, rhythm: 1.5 }).band, 'entro8');
    assert.equal(capRunway({ cap: 20, consumed: 10, rhythm: 0.5 }).band, 'oltre8');
  });

  test('i confini di fascia sono inclusivi: esattamente 2 e 4 settimane non scivolano su', () => {
    assert.equal(capRunway({ cap: 10, consumed: 0, rhythm: 5 }).band,   'entro2');   // 2,0
    assert.equal(capRunway({ cap: 10, consumed: 0, rhythm: 2.5 }).band, 'entro4');   // 4,0
    assert.equal(capRunway({ cap: 10, consumed: 0, rhythm: 1.25 }).band, 'entro8');  // 8,0
  });

  test('residuo sotto il ritmo di una settimana: fascia a se, non "entro 2 settimane"', () => {
    // caso visto su Moveo - fuel v2: 1h 45m residue a 3h 56m a settimana
    const r = capRunway({ cap: 20, consumed: 18.25, rhythm: 3.93 });
    assert.equal(r.band, 'entro1');
    assert.equal(r.label, 'Esaurito entro una settimana');
    assert.equal(capRunway({ cap: 10, consumed: 0, rhythm: 10 }).band, 'entro1');   // 1,0 inclusivo
  });

  test('tetto gia sfondato: esaurito, non un residuo negativo da leggere come quasi', () => {
    const r = capRunway({ cap: 20, consumed: 25, rhythm: 5 });
    assert.equal(r.band, 'esaurito');
    assert.equal(r.weeks, 0);
    assert.equal(r.remaining, -5);
  });

  test('ritmo nullo: fermo, non "oltre 8 settimane" (Infinity non si stampa come lento)', () => {
    const r = capRunway({ cap: 20, consumed: 5, rhythm: 0 });
    assert.equal(r.band, 'nessuno');
    assert.equal(r.weeks, null);
    assert.equal(r.remaining, 15);
  });

  test('il ritmo non e piu invariante: raddoppiarlo dimezza le settimane', () => {
    const slow = capRunway({ cap: 40, consumed: 0, rhythm: 4 });
    const fast = capRunway({ cap: 40, consumed: 0, rhythm: 8 });
    assert.equal(slow.weeks, 10);
    assert.equal(fast.weeks, 5);
    assert.notEqual(slow.band, fast.band);
  });

  test('caso reale Moveo: 70h di budget, 45,25 consumate, ritmo 6,44/sett', () => {
    const r = capRunway({ cap: 70, consumed: 45.25, rhythm: 6.4375 });
    assert.equal(r.remaining, 24.75);
    assert.ok(r.weeks > 3.8 && r.weeks < 3.9);
    assert.equal(r.band, 'entro4');
  });
});

describe('runwaySummary', () => {
  const rows = (...bands) => bands.map(band => ({ band }));

  test('un solo tetto: il riepilogo dice la stessa fascia della card', () => {
    assert.equal(runwaySummary(rows('entro1')), '1 entro una settimana');
    assert.equal(runwaySummary(rows('entro2', 'oltre8')), '1 entro 2 settimane');
  });

  test('piu fasce: conta per fascia, dalla piu vicina', () => {
    assert.equal(
      runwaySummary(rows('entro4', 'esaurito', 'entro4', 'entro2', 'esaurito', 'entro8')),
      '2 già esauriti · 1 entro 2 settimane · 2 entro 4 settimane',
    );
    assert.equal(runwaySummary(rows('esaurito')), '1 già esaurito');
  });

  test('niente entro 4 settimane: lo dice, fermi e lontani non contano', () => {
    assert.equal(runwaySummary(rows('entro8', 'oltre8', 'nessuno')), 'nessuno entro 4 settimane');
    assert.equal(runwaySummary([]), 'nessuno entro 4 settimane');
  });
});

describe('statusFor', () => {
  test('mezz\'ora di scarto è rumore, anche su un piano piccolo', () => {
    assert.equal(statusFor(1.5, 1).kind, 'on');    // +50% ma solo +30m
    assert.equal(statusFor(0.5, 1).kind, 'on');
  });

  test('la tolleranza scala col piano (10%)', () => {
    assert.equal(statusFor(43, 40).kind, 'on');    // +3h ma dentro il 10%
    assert.equal(statusFor(45, 40).kind, 'over');  // +5h, fuori
  });

  test('glifo doppio solo oltre la soglia marcata (2h o 30%)', () => {
    assert.equal(statusFor(4.5, 2).glyph, '▴▴');   // +2h30 e +125%
    assert.equal(statusFor(3, 2).glyph, '▴');      // +1h, +50%
    assert.equal(statusFor(26, 40).glyph, '▾▾');   // -14h, oltre il 30%
    assert.equal(statusFor(30, 40).glyph, '▾');    // -10h (25%): fuori piano ma non marcato
  });

  test('zero ore su un piano non sono mai in linea, anche dentro la tolleranza', () => {
    assert.equal(statusFor(0, 0.5).kind, 'under');   // -30m = tolleranza, ma il piano è saltato
    assert.equal(statusFor(0.25, 0.75).kind, 'on');  // qualcosa di fatto: resta rumore
  });

  test('le etichette dicono il verdetto, con "Molto" solo oltre la soglia marcata', () => {
    assert.equal(statusFor(8, 10).label, 'Sottocarico');
    assert.equal(statusFor(4, 10).label, 'Molto sottocarico');
    assert.equal(statusFor(12, 10).label, 'Sovraccarico');
    assert.equal(statusFor(20, 10).label, 'Molto sovraccarico');
    assert.equal(statusFor(undefined, 10).kind, 'under');
  });

  test('senza piano e senza ore non c\'è verdetto', () => {
    assert.equal(statusFor(0, 0).kind, 'none');
    assert.equal(statusFor(0, 0).glyph, '·');
  });

  test('ore fatte senza piano sono sovraccarico', () => {
    assert.equal(statusFor(5, 0).kind, 'over');     // 5h tutte fuori piano
    assert.equal(statusFor(5, 0).glyph, '▴▴');      // oltre 2h di scarto
    assert.equal(statusFor(1, 0).glyph, '▴');       // 1h: fuori piano ma non marcato
    assert.equal(statusFor(0.25, 0).kind, 'on');    // 15m: rumore di tracciamento
  });
});


test('la tolleranza nei tooltip segue le costanti del calcolo', () => {
  assert.equal(TOLERANCE_LABEL, '±10% o ±30 minuti, quale dei due è più largo');
});

