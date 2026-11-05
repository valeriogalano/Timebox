import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { projectHours, projectsWithHours } from '../delete-guard.js';

describe('delete guard', () => {
  const totals = { p1: 12.5, p2: 0 };

  test('the hours of a project come from the worked totals, zero when absent', () => {
    assert.equal(projectHours('p1', totals), 12.5);
    assert.equal(projectHours('p2', totals), 0);
    assert.equal(projectHours('p3', totals), 0);
    assert.equal(projectHours('p1', undefined), 0);
  });

  test('an area is blocked by every project that has hours', () => {
    const projects = [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }, { id: 'p3', name: 'C' }];
    assert.deepEqual(projectsWithHours(projects, totals).map(p => p.name), ['A']);
  });
});
