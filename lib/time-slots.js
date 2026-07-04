'use strict';

const MIDDAY_HOUR = 13;

function slotForDate(date) {
  return date.getHours() < MIDDAY_HOUR ? 'am' : 'pm';
}

// `new Date(dueValue)` parses the offset/UTC datetime from Todoist and
// `getHours()` then reads it back in the system's local timezone. That
// conversion is intentional, not a bug: a task due 11:30 UTC, read on a
// UTC+2 system, is 13:30 local and should land in 'pm' - matching the
// wall-clock time the user actually sees. Verified 2026-06-25.
function slotForDueValue(dueValue) {
  if (typeof dueValue !== 'string' || dueValue.length <= 10) return 'am';
  const date = new Date(dueValue);
  return Number.isNaN(date.getTime()) ? 'am' : slotForDate(date);
}

function currentSlot() {
  return slotForDate(new Date());
}

module.exports = {
  MIDDAY_HOUR,
  currentSlot,
  slotForDate,
  slotForDueValue,
};
