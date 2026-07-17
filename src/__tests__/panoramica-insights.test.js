import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { persistentAreaInsights, PERSIST_WINDOW, PERSIST_MIN } from '../panoramica-insights.js';

const area = (name, weeks) => ({ client: { id: name, name, color: '#000' }, weeks });
// helper: settimana chiusa con done/planned
const wk = (done, planned) => ({ done, planned, isCurrent: false });

describe('persistentAreaInsights', () => {
  test('flag sotto-piano solo se persistente (>= PERSIST_MIN su PERSIST_WINDOW)', () => {
    // 3 settimane sotto (done < 85% planned), il resto in linea
    const weeks = [wk(10, 10), wk(10, 10), wk(10, 10), wk(10, 10), wk(10, 10), wk(2, 10), wk(2, 10), wk(2, 10)];
    const items = persistentAreaInsights([area('A', weeks)]);
    assert.equal(items.length, 1);
    assert.equal(items[0].kind, 'under');
    assert.equal(items[0].weeksOff, 3);
    assert.equal(items[0].to, 'Aree');
  });

  test('una sola settimana storta = rumore, nessun insight', () => {
    const weeks = Array.from({ length: PERSIST_WINDOW }, () => wk(10, 10));
    weeks[weeks.length - 1] = wk(1, 10);
    assert.deepEqual(persistentAreaInsights([area('A', weeks)]), []);
  });

  test('oltre piano persistente → Settimana', () => {
    const weeks = Array.from({ length: PERSIST_WINDOW }, () => wk(20, 10)); // sempre >110%
    const items = persistentAreaInsights([area('A', weeks)]);
    assert.equal(items[0].kind, 'over');
    assert.equal(items[0].to, 'Settimana');
    assert.ok(items[0].weeksOff >= PERSIST_MIN);
  });

  test('la settimana corrente (in corso) è esclusa dal conteggio', () => {
    // 2 settimane chiuse sotto + corrente sotto: 2 < PERSIST_MIN → niente flag
    const weeks = [
      ...Array.from({ length: PERSIST_WINDOW - 3 }, () => wk(10, 10)),
      wk(1, 10), wk(1, 10),
      { done: 0, planned: 10, isCurrent: true },
    ];
    assert.deepEqual(persistentAreaInsights([area('A', weeks)]), []);
  });

  test('severity = weeksOff/window e aree piu\' gravi ordinate in cima', () => {
    const mild = area('mild', [...Array.from({ length: PERSIST_WINDOW - 3 }, () => wk(10, 10)), wk(1, 10), wk(1, 10), wk(1, 10)]); // 3 sotto
    const bad = area('bad', Array.from({ length: PERSIST_WINDOW }, () => wk(1, 10)));                                              // 8 sotto
    const items = persistentAreaInsights([mild, bad]);
    assert.equal(items[0].area, 'bad');            // piu' grave prima
    assert.equal(items[0].severity, 1);            // 8/8
    assert.equal(items[1].area, 'mild');
    assert.ok(items[1].severity < items[0].severity);
  });

  test('settimane senza piano (planned 0) non contano come sotto', () => {
    const weeks = Array.from({ length: PERSIST_WINDOW }, () => wk(0, 0));
    assert.deepEqual(persistentAreaInsights([area('A', weeks)]), []);
  });
});
