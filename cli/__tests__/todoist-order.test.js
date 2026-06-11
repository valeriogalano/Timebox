'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { numericOrder, timedOrder, todoistTaskOrder } = require('../../lib/todoist-order');

describe('todoistTaskOrder', () => {
  test('sorts by Todoist day order first', () => {
    const tasks = [
      { id: 'late', dayOrder: 30, childOrder: 1 },
      { id: 'early', dayOrder: 10, childOrder: 1 },
    ];

    assert.deepEqual(tasks.sort(todoistTaskOrder).map(t => t.id), ['early', 'late']);
  });

  test('sorts timed tasks by due time before Todoist day order', () => {
    const tasks = [
      { id: 'db', dueDate: '2026-06-12T11:45:00', dayOrder: 10, childOrder: 1 },
      { id: 'sstat', dueDate: '2026-06-12T11:15:00', dayOrder: 20, childOrder: 1 },
    ];

    assert.deepEqual(tasks.sort(todoistTaskOrder).map(t => t.id), ['sstat', 'db']);
  });

  test('falls back to child order when day order is equal', () => {
    const tasks = [
      { id: 'second', dayOrder: 10, childOrder: 2 },
      { id: 'first', dayOrder: 10, childOrder: 1 },
    ];

    assert.deepEqual(tasks.sort(todoistTaskOrder).map(t => t.id), ['first', 'second']);
  });

  test('places missing day order after valid Todoist day order values', () => {
    const tasks = [
      { id: 'valid-late', dayOrder: 30, childOrder: 1 },
      { id: 'missing', dayOrder: null, childOrder: 99 },
      { id: 'valid-early', dayOrder: 10, childOrder: 1 },
    ];

    assert.deepEqual(tasks.sort(todoistTaskOrder).map(t => t.id), ['valid-early', 'valid-late', 'missing']);
  });

  test('treats empty or invalid numeric order values as missing', () => {
    assert.equal(numericOrder(null), Number.MAX_SAFE_INTEGER);
    assert.equal(numericOrder(undefined), Number.MAX_SAFE_INTEGER);
    assert.equal(numericOrder(''), Number.MAX_SAFE_INTEGER);
    assert.equal(numericOrder('nope'), Number.MAX_SAFE_INTEGER);
    assert.equal(numericOrder('0'), 0);
  });

  test('treats all-day or invalid due dates as untimed', () => {
    assert.equal(timedOrder(null), Number.MAX_SAFE_INTEGER);
    assert.equal(timedOrder('2026-06-12'), Number.MAX_SAFE_INTEGER);
    assert.equal(timedOrder('not-a-date'), Number.MAX_SAFE_INTEGER);
    assert.ok(timedOrder('2026-06-12T11:15:00') < Number.MAX_SAFE_INTEGER);
  });
});
