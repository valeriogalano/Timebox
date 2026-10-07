// Un tetto (limite o budget) si misura su due conteggi: ore lavorate e ore fatturabili.
// Divergono solo nelle aree a ore; altrove il fatturabile non ha significato e vale il
// lavorato. L'avviso segue il conteggio messo peggio (`worst`); `kind` dice quale dei due
// è ('lavorate' | 'fatt.'), ed è null quando coincidono e non c'è niente da distinguere.
// Gemello CommonJS per la CLI: capUsage in lib/domain.js.
import { effBillable, fmtH } from './utils.js';

export function capUsage(worked = 0, billable = worked, hourly = false) {
  const b = hourly ? billable : worked;
  if (Math.abs(b - worked) < 0.001) return { worked, billable: worked, worst: worked, kind: null };
  return { worked, billable: b, worst: Math.max(worked, b), kind: b > worked ? 'fatt.' : 'lavorate' };
}

// Due mappe { projectId: ore } dalle registrazioni di un periodo.
export function sumByProject(entries) {
  const worked = {}, billable = {};
  for (const e of entries) {
    worked[e.projectId] = (worked[e.projectId] ?? 0) + e.hours;
    billable[e.projectId] = (billable[e.projectId] ?? 0) + effBillable(e);
  }
  return { worked, billable };
}

// Dalle due mappe all'uso di ogni progetto e di ogni area. L'area somma i due conteggi sui
// suoi progetti (archiviati compresi: le ore sono state spese sullo stesso tetto) e solo
// dopo sceglie il peggiore: sommare i peggiori dei singoli progetti la sovrastimerebbe.
export function usageMaps({ worked = {}, billable = {} } = {}, projects, clients) {
  const hourly = Object.fromEntries(clients.map(c => [c.id, c.billing === 'hourly']));
  const project = {}, sums = {};
  for (const p of projects) {
    const w = worked[p.id] ?? 0, b = billable[p.id] ?? w;
    project[p.id] = capUsage(w, b, hourly[p.clientId]);
    const s = sums[p.clientId] ??= { w: 0, b: 0 };
    s.w += w; s.b += b;
  }
  const area = {};
  for (const c of clients) area[c.id] = capUsage(sums[c.id]?.w ?? 0, sums[c.id]?.b ?? 0, hourly[c.id]);
  return { project, area };
}

const NONE = capUsage();
export const usageOf = (map, id) => (map || {})[id] ?? NONE;

// "30h" quando i conteggi coincidono, "30h lavorate" / "26h fatt." quando divergono.
export const fmtUsage = u => `${fmtH(u.worst)}${u.kind ? ` ${u.kind}` : ''}`;
// Coda per i titoli degli avvisi: dice su quale conteggio è scattato.
export const kindNote = u => (u.kind ? ` (ore ${u.kind === 'fatt.' ? 'fatturabili' : 'lavorate'})` : '');

export async function loadProjectTotals() {
  const [worked, billable] = await Promise.all([
    window.api.getProjectTotals(),
    window.api.getProjectBillableTotals(),
  ]);
  return { worked, billable };
}
