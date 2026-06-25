'use strict';

function numericOrder(value, fallback = Number.MAX_SAFE_INTEGER) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Date.parse() resolves the offset/UTC datetime to an absolute timestamp, so
// ordering by it is timezone-independent regardless of the source offset.
// Unlike am/pm slot classification (see lib/time-slots.js), there is no
// local-time ambiguity to fix here. Verified 2026-06-25.
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
