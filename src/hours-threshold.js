// Soglia oltre cui un numero nudo digitato in un campo ore viene letto come MINUTI
// invece che come ore: con soglia 9, "8" sono 8 ore e "90" sono 90 minuti (1,5h).
// Un input con i due punti ("1:30") è sempre esplicito e non passa mai da qui.
//
// È configurabile perché la soglia giusta dipende da come si registra: chi lavora a
// blocchi lunghi vuole poter scrivere "14" e ottenere 14 ore, chi registra sempre in
// minuti la vuole bassa.
export const DEFAULT_MINUTES_THRESHOLD = 9;
export const MINUTES_THRESHOLD_SETTING_KEY = 'hoursMinutesThreshold';

// Sotto 1 ogni cifra diventerebbe minuti, compresi i decimali ("0,5" → 30 secondi):
// non è una preferenza, è un campo inutilizzabile. Sopra 24 la soglia non morde più.
//
// Assente ≠ zero: `getSetting` torna null quando la chiave non c'è mai stata scritta, e
// `Number(null)` è 0 — che è finito, quindi passerebbe il controllo e verrebbe alzato a 1,
// rendendo minuti ogni numero al primo avvio. Il caso "manca" va intercettato prima.
export function normalizeMinutesThreshold(value) {
  if (value == null || value === '') return DEFAULT_MINUTES_THRESHOLD;
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_MINUTES_THRESHOLD;
  return Math.max(1, Math.min(24, Math.round(n)));
}

// ponytail: stato di modulo invece di prop o context. `parseHHMM` è chiamata da otto
// punti in sei file e la soglia non varia mai dentro la sessione, quindi filtrarla come
// prop attraverso mezza interfaccia costerebbe più del problema. Il tetto: non può
// variare per vista. Se servisse, la si passa esplicitamente — `parseHHMM` accetta già
// il secondo argomento, ed è così che la usano i test.
let current = DEFAULT_MINUTES_THRESHOLD;

export function getMinutesThreshold() {
  return current;
}

export function setMinutesThreshold(value) {
  current = normalizeMinutesThreshold(value);
  return current;
}
