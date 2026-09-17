// Override ripetuti nella vista Ricorrenza: confronta lo storicizzato
// (week_overrides, congelato da freezeWeeksBeforeRecurringChange o da un
// override manuale in Settimana/Oggi) col template attuale per le ultime
// settimane passate, e segnala gli slot dove lo scostamento è sistematico.

import { SLOTS } from './utils.js';

export const DIVERGENCE_HISTORY_WEEKS = 8;
export const DIVERGENCE_MIN_OCCURRENCES = 3;

// pastOverrides: righe { weekKey, dayIndex, slot, blocks } per la finestra osservata.
// recurring: il template attuale (usato per calcolare lo scarto di ogni settimana).
// dismissed: Set di chiavi "day-slot-clientId" da escludere.
export function computeDivergences(pastOverrides, recurring, dismissed = new Set()) {
  // Difensiva: una sola delta per (weekKey, day, slot, clientId). Il PRIMARY KEY
  // su week_overrides garantisce al più uno snapshot per combinazione, ma il
  // conteggio via forEach poteva gonfiarsi in presenza di duplicati per
  // weekKey (mai possibile per schema, ma isolato qui per evitare ribilanci
  // errati di occurrences > DIVERGENCE_HISTORY_WEEKS).
  const unique = new Map();
  pastOverrides.forEach(r => {
    const blocks = r.blocks || [];
    const templateBlocks = recurring.filter(rr => rr.day === r.dayIndex && rr.slot === r.slot);
    const clientIds = new Set([
      ...blocks.map(b => b.clientId),
      ...templateBlocks.map(b => b.clientId),
    ]);
    clientIds.forEach(clientId => {
      const actual = blocks.filter(b => b.clientId === clientId).reduce((s, b) => s + b.hours, 0);
      const template = templateBlocks.filter(b => b.clientId === clientId).reduce((s, b) => s + b.hours, 0);
      const delta = actual - template;
      if (Math.abs(delta) < 0.01) return;
      const id = `${r.weekKey}|${r.dayIndex}|${r.slot}|${clientId}`;
      unique.set(id, { day: r.dayIndex, slot: r.slot, clientId, weekKey: r.weekKey, delta });
    });
  });

  const stats = {};
  unique.forEach(entry => {
    const key = `${entry.day}-${entry.slot}-${entry.clientId}`;
    const stat = stats[key] ?? (stats[key] = {
      day: entry.day, slot: entry.slot, clientId: entry.clientId,
      deltas: [], weekKeys: new Set(),
    });
    if (stat.weekKeys.has(entry.weekKey)) return; // difensiva: mai più di una delta per settimana
    stat.weekKeys.add(entry.weekKey);
    stat.deltas.push(entry.delta);
  });

  return Object.values(stats)
    .filter(s => s.deltas.length >= DIVERGENCE_MIN_OCCURRENCES)
    .map(s => ({
      day: s.day, slot: s.slot, clientId: s.clientId,
      // Media sull'intera finestra osservata, non sulle sole settimane
      // divergenti: una settimana senza riga in week_overrides ha usato il
      // template (scarto zero) e deve contribuire al denominatore, altrimenti
      // lo scarto medio risulta gonfiato — ed è lui che "Applica" scrive nel
      // nuovo template.
      avgDelta: s.deltas.reduce((a, b) => a + b, 0) / DIVERGENCE_HISTORY_WEEKS,
      occurrences: s.deltas.length,
    }))
    .filter(s => !dismissed.has(`${s.day}-${s.slot}-${s.clientId}`))
    // Ordine di lettura settimanale: giorno → fascia → più corretti prima.
    .sort((a, b) => a.day - b.day || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) || b.occurrences - a.occurrences);
}
