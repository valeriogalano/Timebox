import { getMinutesThreshold } from './hours-threshold.js';

export const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
export const MONTHS_IT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

export function getToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function fmt(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fmtH(h) {
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

export function toHHMM(hours) {
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

// La soglia arriva dal setting (vedi ./hours-threshold): omessa, si usa quella corrente.
// Passala esplicitamente nei test, così non dipendono dallo stato del modulo.
export function parseHHMM(str, threshold = getMinutesThreshold()) {
  const numeric = parseClockInput(str);
  return numeric > threshold && !String(str || '').includes(':') ? numeric / 60 : numeric;
}

export function effBillable(entry) {
  if (!entry) return 0;
  return entry.billableHours == null ? entry.hours : entry.billableHours;
}

// Two thresholds split the day: am < 13, pm 13–18, sera >= 18.
export const AM_END_HOUR = 13;
export const PM_END_HOUR = 18;
export const SLOTS = ['am', 'pm', 'sera'];
export const SLOT_LABELS = { am: 'AM', pm: 'PM', sera: 'Sera' };

export function normalizeSlot(slot) {
  return SLOTS.includes(slot) ? slot : 'am';
}

export function slotForDate(date) {
  const h = date.getHours();
  if (h < AM_END_HOUR) return 'am';
  if (h < PM_END_HOUR) return 'pm';
  return 'sera';
}

export function currentSlot() {
  return slotForDate(new Date());
}

// Shared budget-meter alert scale, used for both project budgets/weekly caps
// and area limits: 0 nothing to flag, 1 half consumed, 2 near the cap, 3 at or
// over it. `pct` is a ratio (1 = 100%), not a percentage.
export function budgetAlertLevel(pct) {
  if (pct == null) return 0;
  if (pct >= 1) return 3;
  if (pct >= 0.8) return 2;
  if (pct >= 0.5) return 1;
  return 0;
}
