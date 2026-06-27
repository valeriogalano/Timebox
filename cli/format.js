'use strict';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

function parseHours(str) {
  if (!str || str.trim() === '') return 0;
  str = str.trim();
  if (str.includes(':')) {
    const [h, m] = str.split(':').map(s => parseInt(s, 10) || 0);
    return h + m / 60;
  }
  return parseFloat(str.replace(',', '.')) || 0;
}

function fmt(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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
