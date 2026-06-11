'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { numericOrder, todoistTaskOrder } = require('../../lib/todoist-order');

describe('todoistTaskOrder', () => {
  test('sorts by Todoist day order first', () => {
    const tasks = [
      { id: 'late', dayOrder: 30, childOrder: 1 },
      { id: 'early', dayOrder: 10, childOrder: 1 },
    ];

    assert.deepEqual(tasks.sort(todoistTaskOrder).map(t => t.id), ['early', 'late']);
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
});
