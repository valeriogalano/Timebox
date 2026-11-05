import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as esm from '../area-targets.js';
import { TOL_HOURS, TOL_PCT } from '../progress-insights.js';

// Gemello CommonJS usato da CLI e MCP: deve dare gli stessi risultati.
const cjs = createRequire(import.meta.url)('../../lib/domain.js');

const week = (pairs) => {
  const days = Array.from({ length: 7 }, () => ({}));
  for (const [d, map] of pairs) days[d] = map;
  return days;
};

for (const [name, impl] of [['src/area-targets.js', esm], ['lib/domain.js', cjs]]) {
  describe(`areaGaps (${name})`, () => {
    // Area a: 4h al giorno da lunedì a venerdì, obiettivo 20h. Oggi è mercoledì.
    const plan = () => week([0, 1, 2, 3, 4].map(d => [d, { a: 4 }]));
    const done = week([[0, { a: 4 }], [1, { a: 4 }], [2, { a: 2 }]]);
    const gapOf = (plannedByDay, targets = { a: 20 }, doneByDay = done, todayIdx = 2) =>
      impl.areaGaps({ targets, plannedByDay, doneByDay, todayIdx }).byArea.a;

    test('settimana in pari: 10h fatte, 2h di oggi + 8h dopo, scarto zero', () => {
      assert.deepEqual(gapOf(plan()), { target: 20, done: 10, remaining: 10, gap: 0 });
    });

    test('spostare un blocco futuro, anche nel weekend, non cambia lo scarto', () => {
      const moved = plan();
      delete moved[3].a;
      moved[5] = { a: 4 };
      assert.equal(gapOf(moved).gap, 0);
      // e spostare il blocco di oggi quando non ci ho ancora lavorato
      const fresh = week([[0, { a: 4 }], [1, { a: 4 }]]);
      const movedToday = plan();
      delete movedToday[2].a;
      movedToday[6] = { a: 4 };
      assert.equal(gapOf(plan(), undefined, fresh).gap, gapOf(movedToday, undefined, fresh).gap);
    });

    test('tolto un blocco lo scarto si apre, compensando si chiude', () => {
      const reduced = plan();
      reduced[4] = { a: 1 };
      assert.equal(gapOf(reduced).gap, 3);
      reduced[5] = { a: 3 };
      assert.equal(gapOf(reduced).gap, 0);
    });

    test('cambiare l\'obiettivo: lo scarto segue l\'obiettivo finale', () => {
      assert.equal(gapOf(plan(), { a: 24 }).gap, 4);
      assert.equal(gapOf(plan(), { a: 16 }).gap, -4);
    });

    test('lavoro non pianificato: il fatto supera l\'obiettivo e si vede', () => {
      const r = impl.areaGaps({ targets: {}, plannedByDay: week([]), doneByDay: week([[1, { b: 3 }]]), todayIdx: 2 }).byArea.b;
      assert.deepEqual(r, { target: 0, done: 3, remaining: 0, gap: -3 });
    });

    test('tolto il blocco di oggi dopo averci lavorato: mancano ancora ore, non c\'è sovraccarico', () => {
      const removed = plan();
      delete removed[2].a;
      // 10h fatte, restano solo gio e ven (8h): mancano 2h
      assert.deepEqual(gapOf(removed), { target: 20, done: 10, remaining: 8, gap: 2 });
    });

    test('oggi oltre il piano non dà blocchi rimasti negativi', () => {
      const over = week([[2, { a: 6 }]]);
      assert.equal(gapOf(plan(), undefined, over).remaining, 8);
    });

    test('settimana futura: restano tutti i blocchi; settimana chiusa: nessuno', () => {
      assert.equal(gapOf(plan(), undefined, week([]), -3).remaining, 20);
      assert.deepEqual(gapOf(plan(), undefined, done, 9), { target: 20, done: 10, remaining: 0, gap: 10 });
    });

    test('totali e giorni mancanti', () => {
      const r = impl.areaGaps({ targets: { a: 5, c: 2 }, plannedByDay: [], doneByDay: [], todayIdx: 0 });
      assert.deepEqual(r, {
        byArea: { a: { target: 5, done: 0, remaining: 0, gap: 5 }, c: { target: 2, done: 0, remaining: 0, gap: 2 } },
        target: 7, done: 0, remaining: 0, gap: 7,
      });
    });
  });

  describe(`weekTargets e templateHoursByArea (${name})`, () => {
    const recurring = [
      { clientId: 'a', day: 0, hours: 4 }, { clientId: 'a', day: 6, hours: 2 },
      { clientId: 'b', day: 2, hours: 3 }, { clientId: 'b', day: 7, hours: 9 },
    ];

    test('il template è la somma della ricorrenza, weekend compreso', () => {
      assert.deepEqual(impl.templateHoursByArea(recurring), { a: 6, b: 3 });
    });

    test('senza righe vale il template; con righe la prima è il lunedì, l\'ultima il finale', () => {
      const t = impl.weekTargets({
        areaIds: ['a', 'b', 'c'],
        templateByArea: impl.templateHoursByArea(recurring),
        rows: [
          { areaId: 'a', hours: 8 }, { areaId: 'a', hours: 10 }, { areaId: 'a', hours: 12 },
          { areaId: 'x', hours: 1 },
        ],
      });
      assert.deepEqual(t.a, { template: 6, monday: 8, target: 12, set: true });
      assert.deepEqual(t.b, { template: 3, monday: 3, target: 3, set: false });
      assert.deepEqual(t.c, { template: 0, monday: 0, target: 0, set: false });
      assert.equal(t.x, undefined);
    });
  });

  describe(`gapWithinTolerance (${name})`, () => {
    test('mezz\'ora sugli obiettivi piccoli, confine compreso', () => {
      assert.equal(impl.gapWithinTolerance(0.5, 4), true);
      assert.equal(impl.gapWithinTolerance(-0.5, 4), true);
      assert.equal(impl.gapWithinTolerance(0.51, 4), false);
      assert.equal(impl.gapWithinTolerance(-0.51, 0), false);
    });
    test('il 10% dell\'obiettivo quando è più largo', () => {
      assert.equal(impl.gapWithinTolerance(2, 20), true);
      assert.equal(impl.gapWithinTolerance(-2, 20), true);
      assert.equal(impl.gapWithinTolerance(2.01, 20), false);
    });
  });

  describe(`targetWarnings (${name})`, () => {
    const weekly = { limitType: 'weekly', limitHours: 10 };
    test('obiettivo sopra il limite settimanale', () => {
      assert.deepEqual(impl.targetWarnings({ client: weekly, target: 12, status: 'active' }), [{ kind: 'over-weekly-limit', limit: 10 }]);
      assert.deepEqual(impl.targetWarnings({ client: weekly, target: 10, status: 'active' }), []);
      assert.deepEqual(impl.targetWarnings({ client: { limitType: 'global', limitHours: 5 }, target: 12 }), []);
    });
    test('area chiusa con obiettivo sopra lo zero', () => {
      assert.deepEqual(impl.targetWarnings({ client: {}, target: 2, status: 'closed' }), [{ kind: 'closed-with-target' }]);
      assert.deepEqual(impl.targetWarnings({ client: null, target: 0, status: 'closed' }), []);
    });
  });
}

test('la tolleranza del gemello CommonJS è quella di progress-insights', () => {
  assert.equal(cjs.TOL_HOURS, TOL_HOURS);
  assert.equal(cjs.TOL_PCT, TOL_PCT);
});
