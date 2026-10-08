import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  mergeProjectDayEntries,
  getEffectiveBlocks,
  computeDayPlanning,
  resolveEntrySlot,
  planDayEntrySave,
  fillPlannedBlocks,
} from '../dayPlanning.js';

// Gemelli CommonJS usati dal processo principale: devono dare gli stessi risultati.
const domain = createRequire(import.meta.url)('../../lib/domain.js');

describe('mergeProjectDayEntries', () => {
  test('sums the AM/PM rows of the same project+day into one entry', () => {
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

describe('resolveEntrySlot', () => {
  const blocksForSlot = map => (slot => map[slot] || []);

  test('existing slot wins over any block heuristic', () => {
    const slot = resolveEntrySlot({
      existingSlot: 'pm', clientId: 'c1',
      blocksForSlot: blocksForSlot({ am: [{ clientId: 'c1' }] }),
    });
    assert.equal(slot, 'pm');
  });

  test('picks the only slot with a block for the area — sera included (regression)', () => {
    const slot = resolveEntrySlot({
      existingSlot: null, clientId: 'c1',
      blocksForSlot: blocksForSlot({ sera: [{ clientId: 'c1' }] }),
    });
    assert.equal(slot, 'sera');
  });

  test('prefers the earliest slot (am → pm → sera) when the area has several blocks', () => {
    const slot = resolveEntrySlot({
      existingSlot: null, clientId: 'c1',
      blocksForSlot: blocksForSlot({ pm: [{ clientId: 'c1' }], am: [{ clientId: 'c1' }] }),
    });
    assert.equal(slot, 'am');
  });

  test('falls back when the area has no block anywhere', () => {
    const slot = resolveEntrySlot({
      existingSlot: null, clientId: 'c9',
      blocksForSlot: blocksForSlot({ am: [{ clientId: 'c1' }] }),
      fallback: 'pm',
    });
    assert.equal(slot, 'pm');
  });

  test('falls back to am by default without clientId or blocks source', () => {
    assert.equal(resolveEntrySlot({}), 'am');
  });
});

describe('planDayEntrySave', () => {
  const base = { projectId: 'p1', date: '2026-10-07', slot: 'pm', newId: 'new' };
  const am = { id: 'a', projectId: 'p1', date: '2026-10-07', hours: 1, billableHours: 0.5, slot: 'am', billed: true };
  const pm = { id: 'b', projectId: 'p1', date: '2026-10-07', hours: 2, billableHours: null, slot: 'pm', billed: false };

  // Ogni caso gira sul modulo del renderer e sul gemello di lib/domain.js.
  for (const [name, plan] of [['renderer', planDayEntrySave], ['lib/domain', domain.planDayEntrySave]]) {
    test(`${name}: senza entry ne crea una nuova, non fatturata`, () => {
      assert.deepEqual(plan({ ...base, existingList: [], hours: 1.5 }), {
        save: { id: 'new', projectId: 'p1', date: '2026-10-07', hours: 1.5, billableHours: null, slot: 'pm', billed: false },
        deleteIds: [],
      });
    });

    test(`${name}: aggiorna l'entry esistente e ne conserva id e fatturato`, () => {
      const { save, deleteIds } = plan({ ...base, existingList: [am], hours: 3, billableHours: 0.5, slot: 'am' });
      assert.deepEqual(save, { ...am, hours: 3 });
      assert.deepEqual(deleteIds, []);
    });

    test(`${name}: le entry sparse su più fasce si accorpano nella prima`, () => {
      const { save, deleteIds } = plan({ ...base, existingList: [am, pm], hours: 4, billableHours: 0.5, slot: 'am' });
      assert.equal(save.id, 'a');
      assert.deepEqual(deleteIds, ['b']);
    });

    test(`${name}: a zero ore cancella tutto e non salva niente`, () => {
      assert.deepEqual(plan({ ...base, existingList: [am, pm], hours: 0 }), { save: null, deleteIds: ['a', 'b'] });
      assert.deepEqual(plan({ ...base, existingList: [], hours: 0 }), { save: null, deleteIds: [] });
    });
  }

  test('il gemello di resolveEntrySlot segue la stessa priorità', () => {
    const blocksForSlot = slot => ({ sera: [{ clientId: 'c1' }] }[slot] || []);
    for (const args of [
      { existingSlot: 'pm', clientId: 'c1', blocksForSlot },
      { existingSlot: null, clientId: 'c1', blocksForSlot },
      { existingSlot: null, clientId: 'c2', blocksForSlot, fallback: 'pm' },
      { existingSlot: null, clientId: 'c2', blocksForSlot },
    ]) assert.equal(domain.resolveEntrySlot(args), resolveEntrySlot(args));
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
