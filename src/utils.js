export const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

export const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
export const MONTHS_IT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

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
  const hh = Math.floor(Math.abs(h));
  const mm = Math.round((Math.abs(h) - hh) * 60);
  const sign = h < 0 ? '-' : '';
  return mm === 0 ? `${sign}${hh}h` : `${sign}${hh}h ${mm}m`;
}

export function toHHMM(hours) {
  if (!hours || hours === 0) return '';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}:${m.toString().padStart(2, '0')}`;
}

export function parseHHMM(str) {
  if (!str || str.trim() === '') return 0;
  str = str.trim();
  if (str.includes(':')) {
    const [h, m] = str.split(':').map(s => parseInt(s) || 0);
    return h + m / 60;
  }
  return parseFloat(str.replace(',', '.')) || 0;
}
