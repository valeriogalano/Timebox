'use strict';

function numericOrder(value, fallback = Number.MAX_SAFE_INTEGER) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function timedOrder(value, fallback = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== 'string' || value.length <= 10) return fallback;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : fallback;
}

function todoistTaskOrder(a, b) {
  const byDueTime = timedOrder(a.dueDate) - timedOrder(b.dueDate);
  if (byDueTime !== 0) return byDueTime;

  const byDayOrder = numericOrder(a.dayOrder) - numericOrder(b.dayOrder);
  if (byDayOrder !== 0) return byDayOrder;

  const byChildOrder = numericOrder(a.childOrder ?? a.order) - numericOrder(b.childOrder ?? b.order);
  if (byChildOrder !== 0) return byChildOrder;

  return String(a.id).localeCompare(String(b.id));
}

module.exports = {
  numericOrder,
  timedOrder,
  todoistTaskOrder,
};
