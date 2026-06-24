'use strict';

const MIDDAY_HOUR = 12;

function slotForDate(date) {
  return date.getHours() < MIDDAY_HOUR ? 'am' : 'pm';
}

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
