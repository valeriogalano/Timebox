export const DEFAULT_SLOT_CAPACITY_HOURS = 4;
export const SLOT_CAPACITY_SETTING_KEY = 'slotCapacityHours';

export function normalizeSlotCapacityHours(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SLOT_CAPACITY_HOURS;
  return Math.max(0.5, Math.min(12, Math.round(n * 4) / 4));
}

export function getSlotCapacityLoad(plannedHours, loggedHours) {
  return Math.max(Number(plannedHours) || 0, Number(loggedHours) || 0);
}
