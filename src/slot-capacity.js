import { SLOTS } from './utils.js';

export const DEFAULT_SLOT_CAPACITY_HOURS = 4;
export const SLOT_CAPACITY_SETTING_KEY = 'slotCapacityHours';

export function normalizeSlotCapacityHours(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SLOT_CAPACITY_HOURS;
  return Math.max(0.5, Math.min(12, Math.round(n * 4) / 4));
}

// Il setting è salvato come JSON per-slot ({"am":5,"pm":4,"sera":2}). I valori
// vecchi sono un singolo numero: vale per tutti gli slot, nessuna migrazione.
export function normalizeSlotCapacity(value) {
  let raw = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { /* numero o spazzatura: sotto */ }
  }
  const perSlot = raw && typeof raw === 'object' ? raw : null;
  return Object.fromEntries(SLOTS.map(slot => [
    slot, normalizeSlotCapacityHours(perSlot ? perSlot[slot] : raw),
  ]));
}

export function dayCapacityHours(capacity) {
  const perSlot = normalizeSlotCapacity(capacity);
  return SLOTS.reduce((sum, slot) => sum + perSlot[slot], 0);
}

export function getSlotCapacityLoad(plannedHours, loggedHours) {
  return Math.max(Number(plannedHours) || 0, Number(loggedHours) || 0);
}
