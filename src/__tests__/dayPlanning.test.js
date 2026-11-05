import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  mergeProjectDayEntries,
  getEffectiveBlocks,
  computeDayPlanning,
  planDayEntrySave,
  planQuickLogAdd,
  fillPlannedBlocks,
} from '../dayPlanning.js';

// Gemelli CommonJS usati dal processo principale: devono dare gli stessi risultati.
const domain = createRequire(import.meta.url)('../../lib/domain.js');

describe('mergeProjectDayEntries', () => {
  test('sums the rows of the same project+day into one entry', () => {
    const merged = mergeProjectDayEntries([
      { projectId: 1, date: '2026-07-15', hours: 2, billableHours: null, billed: true },
      { projectId: 1, date: '2026-07-15', hours: 3, billableHours: null, billed: true },
    ]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].hours, 5);
  });
  test('billableHours stays null when it equals total hours', () => {
    const [m] = mergeProjectDayEntries([
      { projectId: 1, date: '2026-07-15', hours: 2, billableHours: 2, billed: false },
      { projectId: 1, date: '2026-07-15', hours: 3, billableHours: 3, billed: false },
    ]);
    assert.equal(m.billableHours, null);
  });
  test('billableHours surfaces the summed billable when it diverges', () => {
    const [m] = mergeProjectDayEntries([
      { projectId: 1, date: '2026-07-15', hours: 2, billableHours: 1, billed: false },
      { projectId: 1, date: '2026-07-15', hours: 3, billableHours: 3, billed: false },
    ]);
    assert.equal(m.billableHours, 4);
  });
  test('billed is true only when every row is billed', () => {
    const [m] = mergeProjectDayEntries([
      { projectId: 1, date: '2026-07-15', hours: 2, billableHours: null, billed: true },
      { projectId: 1, date: '2026-07-15', hours: 3, billableHours: null, billed: false },
    ]);
    assert.equal(m.billed, false);
  });
  test('keeps distinct projects separate', () => {
    const merged = mergeProjectDayEntries([
      { projectId: 1, date: '2026-07-15', hours: 2, billableHours: null, billed: true },
      { projectId: 2, date: '2026-07-15', hours: 3, billableHours: null, billed: true },
    ]);
    assert.equal(merged.length, 2);
  });
});

describe('getEffectiveBlocks', () => {
  const recurring = [
    { id: 'b', day: 0, slot: 'am', clientId: 10, hours: 2, position: 1 },
    { id: 'a', day: 0, slot: 'am', clientId: 11, hours: 1, position: 0 },
    { id: 'c', day: 0, slot: 'pm', clientId: 10, hours: 3, position: 0 },
  ];
  test('returns recurring blocks for the day/slot sorted by position', () => {
    const blocks = getEffectiveBlocks(recurring, {}, 'w', 0, 'am');
    assert.deepEqual(blocks.map(b => b.id), ['a', 'b']);
  });
  test('a week override replaces the recurring blocks for that slot', () => {
    const overrides = { w: { 0: { am: [{ id: 'x', clientId: 99, hours: 4 }] } } };
    const blocks = getEffectiveBlocks(recurring, overrides, 'w', 0, 'am');
    assert.deepEqual(blocks.map(b => b.id), ['x']);
  });
  test('an override can clear a slot with an empty array', () => {
    const overrides = { w: { 0: { am: [] } } };
    assert.deepEqual(getEffectiveBlocks(recurring, overrides, 'w', 0, 'am'), []);
  });
});

describe('computeDayPlanning', () => {
  const clients = [{ id: 10 }, { id: 11 }];
  const projects = [
    { id: 100, clientId: 10 },
    { id: 110, clientId: 11 },
  ];
  const base = {
    dayIndex: 0, isToday: false, isFuture: false,
    weekOverrides: {}, weekKey: 'w',
    clients, projects,
  };

  test('computes planned/logged totals and the delta', () => {
    const r = computeDayPlanning({
      ...base,
      recurring: [{ id: 'b1', day: 0, slot: 'am', clientId: 10, hours: 4, position: 0 }],
      dayEntries: [{ projectId: 100, hours: 3 }],
    });
    assert.equal(r.plannedTotal, 4);
    assert.equal(r.dayHours, 3);
    assert.equal(r.delta, -1);
    assert.equal(r.amLogged, 3);
  });

  test('le ore registrate di una fascia sono quelle finite nei suoi blocchi, non la fascia dell\'entry', () => {
    // 8h in un'unica registrazione, su un'area pianificata 4h al mattino e 3h al pomeriggio
    // id a stringa come nel database: le fixture numeriche qui sopra non reggono il
    // confronto tra aree pianificate e registrate.
    const r = computeDayPlanning({
      ...base,
      clients: [{ id: 'c1' }],
      projects: [{ id: 'p1', clientId: 'c1' }],
      recurring: [
        { id: 'am', day: 0, slot: 'am', clientId: 'c1', hours: 4, position: 0 },
        { id: 'pm', day: 0, slot: 'pm', clientId: 'c1', hours: 3, position: 0 },
      ],
      dayEntries: [{ projectId: 'p1', slot: 'am', hours: 8 }],
    });
    assert.deepEqual(r.slotLogged, { am: 4, pm: 3, sera: 0 });
    assert.equal(r.blockFill.pm.logged, 3);
    // l'ora oltre il piano non sta in nessuna fascia: è extra
    assert.deepEqual(r.extraBlocks, [{ clientId: 'c1', hours: 1 }]);
  });

  test('logging against an unplanned client shows up as extra', () => {
    const r = computeDayPlanning({
      ...base,
      recurring: [{ id: 'b1', day: 0, slot: 'am', clientId: 10, hours: 4, position: 0 }],
      dayEntries: [{ projectId: 110, hours: 2 }],
    });
    const extra = r.extraBlocks.find(b => b.clientId === '11');
    assert.ok(extra, 'expected an extra block for the unplanned client');
    assert.equal(extra.hours, 2);
  });

  test('blocks for clients not in the client list are filtered out', () => {
    const r = computeDayPlanning({
      ...base,
      recurring: [{ id: 'ghost', day: 0, slot: 'am', clientId: 999, hours: 4, position: 0 }],
      dayEntries: [],
    });
    assert.equal(r.plannedTotal, 0);
    assert.equal(r.visibleBlocks.length, 0);
  });

  test('uncovered Todoist tasks become orphans only for today/future', () => {
    const args = {
      ...base,
      recurring: [],
      dayEntries: [],
      todoistTasks: [{ projectId: 100, slot: 'am', hours: 2 }],
    };
    assert.equal(computeDayPlanning({ ...args, isFuture: false }).orphanTodoist.length, 0);
    const future = computeDayPlanning({ ...args, isFuture: true }).orphanTodoist;
    assert.equal(future.length, 1);
    assert.equal(future[0].hours, 2);
  });
});

describe('planDayEntrySave', () => {
  const base = { projectId: 'p1', date: '2026-10-07', newId: 'new' };
  const entry = { id: 'a', projectId: 'p1', date: '2026-10-07', hours: 1, billableHours: 0.5, billed: true };

  // Ogni caso gira sul modulo del renderer e sul gemello di lib/domain.js.
  for (const [name, plan] of [['renderer', planDayEntrySave], ['lib/domain', domain.planDayEntrySave]]) {
    test(`${name}: senza entry ne crea una nuova, non fatturata`, () => {
      assert.deepEqual(plan({ ...base, hours: 1.5 }), {
        save: { id: 'new', projectId: 'p1', date: '2026-10-07', hours: 1.5, billableHours: null, billed: false },
        deleteIds: [],
      });
    });

    test(`${name}: aggiorna l'entry del giorno e ne conserva id e fatturato`, () => {
      const { save, deleteIds } = plan({ ...base, existing: entry, hours: 3, billableHours: 0.5 });
      assert.deepEqual(save, { ...entry, hours: 3 });
      assert.deepEqual(deleteIds, []);
    });

    test(`${name}: a zero ore cancella l'entry, se c'è`, () => {
      assert.deepEqual(plan({ ...base, existing: entry, hours: 0 }), { save: null, deleteIds: ['a'] });
      assert.deepEqual(plan({ ...base, hours: 0 }), { save: null, deleteIds: [] });
    });
  }

  test('planQuickLogAdd somma sull\'entry del giorno, o ne crea una', () => {
    const entries = [{ id: 'a', projectId: 'p1', date: '2026-10-07', hours: 1, billableHours: 0.5, billed: true }];
    assert.deepEqual(
      planQuickLogAdd({ entries, projectId: 'p1', date: '2026-10-07', addHours: 2, newId: 'n' }),
      { ...entries[0], hours: 3 },
    );
    assert.deepEqual(
      planQuickLogAdd({ entries, projectId: 'p1', date: '2026-10-08', addHours: 2, newId: 'n' }),
      { id: 'n', projectId: 'p1', date: '2026-10-08', hours: 2, billableHours: null, billed: false },
    );
  });
});

describe('fillPlannedBlocks', () => {
  const blocks = [
    { clientId: 'a', hours: 2 }, { clientId: 'b', hours: 1 },
    { clientId: 'a', hours: 3 }, { clientId: 'c', hours: 2 },
  ];

  for (const [name, fill] of [['renderer', fillPlannedBlocks], ['lib/domain', domain.fillPlannedBlocks]]) {
    test(`${name}: riempie i blocchi di ogni area in ordine e si ferma alle ore registrate`, () => {
      assert.deepEqual(fill(blocks, { a: 4, b: 5 }), [2, 1, 2, 0]);
      assert.deepEqual(fill(blocks, {}), [0, 0, 0, 0]);
      assert.deepEqual(fill([], { a: 4 }), []);
    });

    test(`${name}: non modifica le ore registrate che riceve`, () => {
      const logged = { a: 4 };
      fill(blocks, logged);
      assert.deepEqual(logged, { a: 4 });
    });
  }
});
