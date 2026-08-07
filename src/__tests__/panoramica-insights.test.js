import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { areaPlanFitInsights, capRunway, statusFor, PERSIST_WINDOW, MIN_HISTORY } from '../panoramica-insights.js';

const area = (name, weeks) => ({ client: { id: name, name, color: '#000' }, weeks });
// helper: settimana chiusa con done/planned
const wk = (done, planned) => ({ done, planned, isCurrent: false });
const rep = (n, w) => Array.from({ length: n }, () => w);

describe('areaPlanFitInsights', () => {
  test('flag sotto-piano quando la MEDIA dello svolto e\' sotto il piano', () => {
    const items = areaPlanFitInsights([area('A', rep(PERSIST_WINDOW, wk(6, 10)))]);
    assert.equal(items.length, 1);
    assert.equal(items[0].kind, 'under');
    assert.equal(items[0].avgDone, 6);
    assert.equal(items[0].avgPlanned, 10);
    assert.equal(items[0].of, PERSIST_WINDOW);
    assert.equal(items[0].to, 'Aree');
  });

  test('settimane sopra e sotto si compensano: la ricorrenza e\' tarata bene', () => {
    // +5h e -5h alternate su un piano da 10h: media esatta, nessuna decisione da prendere
    const weeks = Array.from({ length: PERSIST_WINDOW }, (_, i) => wk(i % 2 ? 15 : 5, 10));
    assert.deepEqual(areaPlanFitInsights([area('A', weeks)]), []);
  });

  test('una settimana storta si diluisce nella media e non fa scattare nulla', () => {
    const weeks = rep(PERSIST_WINDOW, wk(10, 10));
    weeks[weeks.length - 1] = wk(5, 10);   // -5h su 80h pianificate: dentro tolleranza
    assert.deepEqual(areaPlanFitInsights([area('A', weeks)]), []);
  });

  test('una settimana abbastanza estrema sposta la media e l\' area compare', () => {
    // Nessun guard anti-spike: -9h su 80h sono l' 11% in meno, e la card riporta le due
    // medie a confronto — sta a chi legge decidere se e\' un episodio o un ritmo.
    const weeks = rep(PERSIST_WINDOW, wk(10, 10));
    weeks[weeks.length - 1] = wk(1, 10);
    const items = areaPlanFitInsights([area('A', weeks)]);
    assert.equal(items.length, 1);
    assert.equal(items[0].kind, 'under');
  });

  test('oltre piano in media → Settimana', () => {
    const items = areaPlanFitInsights([area('A', rep(PERSIST_WINDOW, wk(20, 10)))]);
    assert.equal(items[0].kind, 'over');
    assert.equal(items[0].to, 'Settimana');
  });

  test('molte settimane poco sotto non battono poche settimane molto sopra', () => {
    // 4 sett a -0,5h e 4 a +4h: il vecchio conteggio diceva 'under', il netto e\' +14h
    const weeks = [...rep(4, wk(9.5, 10)), ...rep(4, wk(14, 10))];
    const items = areaPlanFitInsights([area('A', weeks)]);
    assert.equal(items[0].kind, 'over');
  });

  test('la settimana corrente (in corso) e\' esclusa dalla media', () => {
    const weeks = [...rep(PERSIST_WINDOW, wk(10, 10)), { done: 0, planned: 10, isCurrent: true }];
    assert.deepEqual(areaPlanFitInsights([area('A', weeks)]), []);
  });

  test('sotto MIN_HISTORY settimane con piano non si tocca il template', () => {
    const weeks = [...rep(PERSIST_WINDOW - (MIN_HISTORY - 1), wk(0, 0)), ...rep(MIN_HISTORY - 1, wk(1, 10))];
    assert.deepEqual(areaPlanFitInsights([area('A', weeks)]), []);
  });

  test('settimane senza piano (planned 0) non entrano nella media', () => {
    // 4 settimane senza piano + 4 in linea: la media resta in linea, non sotto
    const weeks = [...rep(4, wk(0, 0)), ...rep(4, wk(10, 10))];
    assert.deepEqual(areaPlanFitInsights([area('A', weeks)]), []);
  });

  test('severity = scarto proporzionale e aree piu\' gravi ordinate in cima', () => {
    const mild = area('mild', rep(PERSIST_WINDOW, wk(8, 10)));   // -20%
    const bad  = area('bad',  rep(PERSIST_WINDOW, wk(1, 10)));   // -90%
    const items = areaPlanFitInsights([mild, bad]);
    assert.equal(items[0].area, 'bad');
    assert.ok(items[0].severity > items[1].severity);
    assert.equal(items[1].area, 'mild');
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
