import { fmtH } from './utils.js';

// Taratura del template (lente "Nel tempo"): la domanda è "la RICORRENZA di quest'area è
// tarata male?". Strutturale, non riguarda la prossima settimana (la corrente è esclusa).
// Due segnali sulle ultime PERSIST_WINDOW settimane chiuse, tenuti separati perché portano
// a decisioni opposte:
//  1. obiettivo del lunedì ≠ template, quasi ogni settimana nello stesso verso: è il template
//     a essere sbagliato. Contano le sole settimane con un obiettivo salvato (senza, il
//     lunedì coincide col template per costruzione e non dice niente). Un'urgenza cambia
//     l'obiettivo finale, non quello del lunedì, quindi qui non pesa.
//  2. fatto ≠ obiettivo finale, quasi ogni settimana nello stesso verso: è l'esecuzione a
//     derivare, non il template. Senza obiettivo salvato il riferimento è il piano congelato
//     di quella settimana (vedi referenceHoursByArea in area-targets.js).
// Il totale è per area: come spalmarlo sui giorni lo decide chi apre Ricorrenza.
export const PERSIST_WINDOW = 8;
// Sotto questo numero di settimane utili un segnale non si dà: due dati non sono un ritmo.
export const MIN_HISTORY = 4;
// "Quasi ogni settimana": almeno tre su quattro delle settimane utili, nello stesso verso e
// fuori tolleranza. Con 8 settimane sono 6, con 4 sono 3.
export const MOST_RATIO = 0.75;

// Verdetto piano↔consuntivo. Due soglie, ciascuna combinata in ore e in percentuale:
// la percentuale da sola grida per le aree piccole (1h pianificata, 1h30 fatta = +50%
// ma è mezz'ora), le ore da sole tacciono per quelle grandi. Vince la più larga delle due.
// Gemello CommonJS di TOL_HOURS e TOL_PCT in lib/domain.js (tolleranza dello scarto per CLI e MCP).
export const TOL_HOURS = 0.5;     // mezz'ora: rumore di tracciamento, non un segnale
export const TOL_PCT = 0.10;
export const STRONG_HOURS = 2;    // oltre: scarto marcato → glifo doppio
export const STRONG_PCT = 0.30;
// La tolleranza scritta per i tooltip, derivata dalle costanti: scritta a mano era
// rimasta a "0,85×" mentre il calcolo usava il 10%.
export const TOLERANCE_LABEL = `±${Math.round(TOL_PCT * 100)}% o ±${TOL_HOURS * 60} minuti, quale dei due è più largo`;

// Piano a zero con ore fatte è sovraccarico, non "nessun verdetto": è lavoro
// interamente fuori piano, il caso che il verdetto deve gridare più forte.
// Solo piano 0 E fatto 0 è davvero "—" (area senza attività nella settimana).
export function statusFor(done, planned) {
  if (!(planned > 0) && !(done > 0)) return { kind: 'none', level: 0, label: '—', glyph: '·', color: 'var(--tb-text-muted)' };
  const delta = (done || 0) - planned;
  const tol = Math.max(TOL_HOURS, planned * TOL_PCT);
  // Zero ore su un piano è il piano saltato per intero, non rumore di tracciamento: senza
  // questa condizione un piano da mezz'ora restava "in linea" anche a 0h svolte, perché
  // lo scarto coincide con la tolleranza.
  if (Math.abs(delta) <= tol && (done > 0 || !(planned > 0))) {
    return { kind: 'on', level: 0, label: 'In linea', glyph: '▪', color: 'var(--tb-text-primary)' };
  }
  const level = Math.abs(delta) > Math.max(STRONG_HOURS, planned * STRONG_PCT) ? 2 : 1;
  return delta > 0
    ? { kind: 'over', level, label: level === 2 ? 'Molto sovraccarico' : 'Sovraccarico', glyph: '▴'.repeat(level), color: 'var(--tb-text-primary)' }
    : { kind: 'under', level, label: level === 2 ? 'Molto sottocarico' : 'Sottocarico', glyph: '▾'.repeat(level), color: 'var(--tb-text-muted)' };
}

const quarter = h => Math.round(h * 4) / 4;

// Verso (+1 / -1) in cui `value` esce dalla tolleranza di `ref`, 0 se ci sta dentro.
const offBy = (value, ref) => Math.abs(value - ref) <= Math.max(TOL_HOURS, ref * TOL_PCT) ? 0 : Math.sign(value - ref);

// pairs: [{ value, ref }] delle settimane utili. Il segnale c'è se almeno MOST_RATIO di
// esse esce dalla tolleranza nello stesso verso. `suggested` è la media di `value`, al
// quarto d'ora: è un numero da scrivere in un blocco, non una misura.
function persistentSignal(pairs, minHistory) {
  const n = pairs.length;
  if (n < minHistory) return null;
  const dirs = pairs.map(p => offBy(p.value, p.ref));
  const up = dirs.filter(d => d > 0).length, down = dirs.filter(d => d < 0).length;
  const off = Math.max(up, down);
  if (off / n < MOST_RATIO) return null;
  const avg = key => pairs.reduce((s, p) => s + p[key], 0) / n;
  return { dir: up >= down ? 1 : -1, off, of: n, avgValue: avg('value'), avgRef: avg('ref'), suggested: quarter(avg('value')) };
}

// perArea: [{ client, template, weeks: [{ week, done, monday, target, set }] }], con
// `template` = ore a settimana della ricorrenza di oggi, weeks in ordine cronologico. Le
// settimane non chiuse vanno tolte a monte. `monday` e `target` sono l'obiettivo del lunedì
// e quello finale (weekTargets), `set` dice se la settimana ha un obiettivo salvato.
export function templateCalibration(perArea, window = PERSIST_WINDOW, minHistory = MIN_HISTORY) {
  const items = [];
  for (const { client, template, weeks } of perArea) {
    const recent = weeks.slice(-window);
    const templateSignal = persistentSignal(
      recent.filter(w => w.set).map(w => ({ value: w.monday, ref: template })), minHistory);
    // Una settimana senza obiettivo né piano non dice niente dell'esecuzione: l'area era
    // chiusa o non pianificata.
    const driftSignal = persistentSignal(
      recent.filter(w => w.target > 0).map(w => ({ value: w.done, ref: w.target })), minHistory);
    if (!templateSignal && !driftSignal) continue;
    const sig = templateSignal ?? driftSignal;
    items.push({
      color: client.color, area: client.name, template,
      templateSignal, driftSignal,
      severity: Math.abs(sig.avgValue - sig.avgRef) / Math.max(sig.avgRef, TOL_HOURS),
    });
  }
  return items.sort((a, b) => b.severity - a.severity);
}

// Ore con spazi non separabili: nelle card strette il numero non va a capo staccato
// dalla sua unità ("~18h" su una riga e "15m" sulla successiva).
const hNb = h => fmtH(h).replace(/ /g, '\u00a0');

// Frase del segnale 1: cosa fare del template. Se è già al valore suggerito lo scarto viene
// da settimane passate e non c'è niente da modificare.
export function templateActionLabel({ suggested }, template) {
  if (!(suggested > 0)) return 'Obiettivo del lunedì sempre a zero: valuta di togliere i blocchi dalla ricorrenza';
  if (Math.abs(template - suggested) < 0.25) return `Ricorrenza già a ${hNb(template)}: nessuna modifica`;
  return `Porta la ricorrenza da ${hNb(template)} a ${hNb(suggested)}`;
}

// Lente "In prospettiva": quanto manca a esaurire i tetti CUMULATIVI (budget totale
// di progetto, limite globale d'area). I tetti *settimanali* non stanno qui: si
// azzerano ogni settimana, quindi non li si "raggiunge" mai — il loro numero utile è
// il margine della settimana corrente, che si legge in Settimana.
//
// Il ritmo di proiezione è quello MISURATO sulle ultime settimane chiuse, non il ritmo
// template: il template sovrastima (INVALSI 14,25h/sett a fronte di ~10,6 reali) e a
// livello progetto non esiste affatto, perché `recurring` mappa solo le aree.
export const RUNWAY_WINDOW = 4;   // settimane chiuse su cui si misura il ritmo

// Fasce, non settimane esatte: il ritmo misurato ha un'incertezza più larga della
// distanza fra "3" e "4 settimane", quindi un numero preciso comunicherebbe una
// precisione che il dato non ha. 8 è il fondo scala, allineato alla finestra di Trend.
// La fascia più stretta è una settimana: sotto, il residuo è meno del ritmo di una
// settimana, e "entro 2 settimane" lo farebbe sembrare più lontano di quanto è.
const BANDS = [
  { max: 1,        band: 'entro1',  label: 'Esaurito entro una settimana', glyph: '▴▴' },
  { max: 2,        band: 'entro2',  label: 'Esaurito entro 2 settimane', glyph: '▴▴' },
  { max: 4,        band: 'entro4',  label: 'Esaurito entro 4 settimane', glyph: '▴'  },
  { max: 8,        band: 'entro8',  label: 'Esaurito entro 8 settimane', glyph: '▪'  },
  { max: Infinity, band: 'oltre8',  label: 'Oltre 8 settimane',          glyph: '▪'  },
];

// Ordine di urgenza delle fasce: il tetto più vicino all'esaurimento per primo.
export const RUNWAY_ORDER = ['esaurito', 'entro1', 'entro2', 'entro4', 'entro8', 'oltre8', 'nessuno'];

// Riepilogo in testa alla lente: conta i tetti per fascia, con le stesse parole
// delle card. Un solo conteggio "entro 4 settimane" metteva insieme fasce diverse
// e contraddiceva la card di un tetto che si esaurisce prima.
const SUMMARY_BANDS = [
  ['esaurito', n => (n === 1 ? 'già esaurito' : 'già esauriti')],
  ['entro1', () => 'entro una settimana'],
  ['entro2', () => 'entro 2 settimane'],
  ['entro4', () => 'entro 4 settimane'],
];

export function runwaySummary(rows) {
  const parts = SUMMARY_BANDS
    .map(([band, text]) => [rows.filter(r => r.band === band).length, text])
    .filter(([n]) => n > 0)
    .map(([n, text]) => `${n} ${text(n)}`);
  return parts.length ? parts.join(' · ') : 'nessuno entro 4 settimane';
}

export function capRunway({ cap, consumed = 0, rhythm = 0 }) {
  if (!(cap > 0)) {
    return { hasCap: false, remaining: 0, weeks: null, band: 'nocap', label: 'Senza tetto', glyph: '·' };
  }
  const remaining = cap - consumed;
  const base = { hasCap: true, cap, consumed, remaining, rhythm, ratio: consumed / cap };
  // Tetto già sfondato: è il caso che il verdetto deve gridare più forte, non un
  // runway a zero settimane da leggere come "quasi".
  if (remaining <= 0) {
    return { ...base, weeks: 0, band: 'esaurito', label: 'Tetto esaurito', glyph: '▴▴' };
  }
  // Ritmo nullo: il progetto è fermo. Dividere darebbe Infinity, che stampato come
  // "oltre 8 settimane" mentirebbe dicendo che il lavoro procede lentamente.
  if (!(rhythm > 0)) {
    return { ...base, weeks: null, band: 'nessuno', label: 'Fermo · nessun esaurimento previsto', glyph: '·' };
  }
  const weeks = remaining / rhythm;
  const { band, label, glyph } = BANDS.find(b => weeks <= b.max);
  return { ...base, weeks, band, label, glyph };
}
