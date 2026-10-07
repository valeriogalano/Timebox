import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { capUsage, sumByProject, usageMaps, usageOf, fmtUsage, kindNote } from '../cap-usage.js';

describe('capUsage', () => {
  test('fuori dalle aree a ore il fatturabile non conta: vale il lavorato, senza etichetta', () => {
    assert.deepEqual(capUsage(30, 26, false), { worked: 30, billable: 30, worst: 30, kind: null });
  });

  test('in un\'area a ore con conteggi uguali non c\'è niente da distinguere', () => {
    assert.equal(capUsage(30, 30, true).kind, null);
  });

  test('in un\'area a ore segue il conteggio messo peggio e dice quale', () => {
    assert.deepEqual(capUsage(30, 26, true), { worked: 30, billable: 26, worst: 30, kind: 'lavorate' });
    assert.deepEqual(capUsage(20, 24, true), { worked: 20, billable: 24, worst: 24, kind: 'fatt.' });
  });
});

describe('usageMaps', () => {
  const clients = [{ id: 'h', billing: 'hourly' }, { id: 'f', billing: 'fixed' }];
  const projects = [
    { id: 'p1', clientId: 'h' }, { id: 'p2', clientId: 'h' }, { id: 'p3', clientId: 'f' },
  ];

  test('somma dalle registrazioni: lavorate e fatturabili per progetto', () => {
    const sums = sumByProject([
      { projectId: 'p1', hours: 5, billableHours: 4 },
      { projectId: 'p1', hours: 2, billableHours: null },
    ]);
    assert.deepEqual(sums, { worked: { p1: 7 }, billable: { p1: 6 } });
  });

  test('l\'area sceglie il peggiore dopo aver sommato, non somma i peggiori', () => {
    // p1: lavorate 10, fatt. 6 · p2: lavorate 4, fatt. 7 → area: lavorate 14, fatt. 13
    const { project, area } = usageMaps({ worked: { p1: 10, p2: 4, p3: 8 }, billable: { p1: 6, p2: 7, p3: 3 } }, projects, clients);
    assert.equal(project.p1.worst, 10);
    assert.equal(project.p2.worst, 7);
    assert.deepEqual(area.h, { worked: 14, billable: 13, worst: 14, kind: 'lavorate' });
    // area a corpo: il fatturabile (3h) è ignorato
    assert.deepEqual(area.f, { worked: 8, billable: 8, worst: 8, kind: null });
  });

  test('un progetto senza ore fatturabili note vale il lavorato', () => {
    const { project } = usageMaps({ worked: { p1: 5 }, billable: {} }, projects, clients);
    assert.equal(project.p1.kind, null);
    assert.equal(usageOf(project, 'assente').worst, 0);
  });
});

describe('etichette', () => {
  test('il numero porta l\'etichetta solo quando i conteggi divergono', () => {
    assert.equal(fmtUsage(capUsage(30, 30, true)), '30h');
    assert.equal(fmtUsage(capUsage(30, 26, true)), '30h lavorate');
    assert.equal(fmtUsage(capUsage(20, 24, true)), '24h fatt.');
    assert.equal(kindNote(capUsage(30, 30, true)), '');
    assert.equal(kindNote(capUsage(20, 24, true)), ' (ore fatturabili)');
    assert.equal(kindNote(capUsage(30, 26, true)), ' (ore lavorate)');
  });
});
