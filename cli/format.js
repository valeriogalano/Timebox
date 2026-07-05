'use strict';

const {
  DAYS, MONTHS,
  fmtH, parseHours, fmt, getToday, getMondayOfWeek, addDays,
  effBillable, isDivergent, fmtHoursWithBillable,
} = require('../lib/domain');

// Returns e.g. "Fri 17 May 2026"
function fmtDay(date) {
  const dow = date.getDay();
  const dayIdx = dow === 0 ? 6 : dow - 1;
  return `${DAYS[dayIdx]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

// Returns e.g. "Fri 17"
function fmtDayShort(date) {
  const dow = date.getDay();
  const dayIdx = dow === 0 ? 6 : dow - 1;
  return `${DAYS[dayIdx]} ${date.getDate()}`;
}

// Returns e.g. "May 11–17 2026" or "Apr 28 – May 4 2026"
function fmtWeekRange(monday) {
  const sunday = addDays(monday, 6);
  if (monday.getMonth() === sunday.getMonth()) {
    return `${MONTHS[monday.getMonth()]} ${monday.getDate()}–${sunday.getDate()} ${sunday.getFullYear()}`;
  }
  return `${MONTHS[monday.getMonth()]} ${monday.getDate()} – ${MONTHS[sunday.getMonth()]} ${sunday.getDate()} ${sunday.getFullYear()}`;
}

function pad(str, len) {
  str = String(str == null ? '' : str);
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

function padLeft(str, len) {
  str = String(str == null ? '' : str);
  return str.length >= len ? str : ' '.repeat(len - str.length) + str;
}

module.exports = {
  DAYS, MONTHS,
  fmtH, parseHours, fmt, getToday, getMondayOfWeek, addDays,
  fmtDay, fmtDayShort, fmtWeekRange, pad, padLeft,
  effBillable, isDivergent, fmtHoursWithBillable,
};
