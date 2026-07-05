'use strict';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_IT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const MIDDAY_HOUR = 13;

function getToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmt(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fmtH(h) {
  if (!h || h === 0) return '0h';
  let hh = Math.floor(Math.abs(h));
  let mm = Math.round((Math.abs(h) - hh) * 60);
  if (mm === 60) {
    hh += 1;
    mm = 0;
  }
  const sign = h < 0 ? '-' : '';
  return mm === 0 ? `${sign}${hh}h` : `${sign}${hh}h ${mm}m`;
}

function toHHMM(hours) {
  if (!hours || hours === 0) return '';
  let h = Math.floor(hours);
  let m = Math.round((hours - h) * 60);
  if (m === 60) {
    h += 1;
    m = 0;
  }
  return `${h}:${m.toString().padStart(2, '0')}`;
}

function parseClockInput(str) {
  if (!str || str.trim() === '') return 0;
  const value = str.trim();
  if (value.includes(':')) {
    const [h, m] = value.split(':').map(s => parseInt(s, 10) || 0);
    return h + m / 60;
  }
  return parseFloat(value.replace(',', '.')) || 0;
}

function parseHours(str) {
  return parseClockInput(str);
}

function parseHHMM(str) {
  const numeric = parseClockInput(str);
  return numeric > 12 && !String(str || '').includes(':') ? numeric / 60 : numeric;
}

function effBillable(entry) {
  if (!entry) return 0;
  return entry.billableHours == null ? entry.hours : entry.billableHours;
}

function isDivergent(entry) {
  if (!entry || entry.billableHours == null) return false;
  return Math.abs(entry.billableHours - entry.hours) > 0.001;
}

function fmtHoursWithBillable(hours, billableHours) {
  const h = fmtH(hours);
  if (billableHours == null || Math.abs(billableHours - hours) < 0.001) return h;
  return `${h} (${fmtH(billableHours)} fatt.)`;
}

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
  DAYS,
  DAY_SHORT,
  MONTHS,
  MONTHS_IT,
  MIDDAY_HOUR,
  getToday,
  getMondayOfWeek,
  addDays,
  fmt,
  fmtH,
  toHHMM,
  parseHours,
  parseHHMM,
  effBillable,
  isDivergent,
  fmtHoursWithBillable,
  slotForDate,
  slotForDueValue,
  currentSlot,
};
