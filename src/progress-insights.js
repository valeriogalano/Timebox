import { fmtH } from './utils.js';

// "Da decidere" (lente "Nel tempo"): la decisione che questa card alimenta è una sola —
// "la RICORRENZA di quest'area è tarata male?". È strutturale, non riguarda la prossima
// settimana (quella si legge in Settimana, e infatti la corrente è esclusa dal calcolo).
//
// Per quella domanda la misura giusta è la MEDIA: la ricorrenza è una media settimanale
// per costruzione, quindi se pianifico 10h/sett e ne faccio 7 il piano è tarato 3h troppo
// alto, e come si distribuiscono quelle 7h è irrilevante — sopra e sotto DEVONO compensarsi.
// Contare le settimane fuori piano misurava un'altra cosa, la volatilità: un'area a 5h e
// 15h alternate è fuori piano 8 volte su 8 ma la ricorrenza è tarata benissimo, e mandare
// a toccarla peggiorerebbe le cose.
export const PERSIST_WINDOW = 8;  // allineata alla finestra dei trend della lente
// Sotto questo numero di settimane chiuse con piano non si cambia un template: due dati
// non sono un ritmo.
export const MIN_HISTORY = 4;

// Verdetto piano↔consuntivo. Due soglie, ciascuna combinata in ore e in percentuale:
// la percentuale da sola grida per le aree piccole (1h pianificata, 1h30 fatta = +50%
// ma è mezz'ora), le ore da sole tacciono per quelle grandi. Vince la più larga delle due.
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

// perAreaWeekly: [{ client, template, weeks: [{ done, planned, isCurrent }] }],
// `template` = ore a settimana della ricorrenza di oggi (facoltativo),
// weeks in ordine cronologico (la corrente è l'ultima).
export function areaPlanFitInsights(perAreaWeekly, window = PERSIST_WINDOW, minHistory = MIN_HISTORY) {
  const items = [];
  for (const { client, template, weeks } of perAreaWeekly) {
    // Le settimane senza piano non sono "sotto piano": l'area era chiusa o non
    // pianificata, includerle nella media abbasserebbe il ritmo di riferimento.
    const closed = weeks.filter(w => !w.isCurrent).slice(-window).filter(w => w.planned > 0);
    if (closed.length < minHistory) continue;
    const done    = closed.reduce((s, w) => s + (w.done || 0), 0);
    const planned = closed.reduce((s, w) => s + w.planned, 0);
    // statusFor sui TOTALI: la tolleranza si scala già sul pianificato, quindi applicata
    // alla somma vale come applicata alla media, senza soglie nuove da tarare.
    const { kind, level } = statusFor(done, planned);
    if (kind === 'on' || kind === 'none') continue;
    // La media dice SE il piano e' fuori taratura, non se lo e' per un ritmo o per un
    // episodio: -9h possono essere -1,1h per otto settimane o una settimana sola saltata.
    // Le due cose portano a decisioni opposte, quindi la distribuzione va mostrata.
    const off  = closed.filter(w => statusFor(w.done, w.planned).kind === kind);
    const peak = off.reduce((a, w) => Math.abs(w.done - w.planned) > Math.abs(a.done - a.planned) ? w : a, off[0]);
    items.push({
      color: client.color, area: client.name, kind, level,
      label: `${level === 2 ? 'Molto ' : ''}${kind === 'under' ? 'sotto' : 'oltre'} il piano`.replace(/^./, c => c.toUpperCase()),
      weeksOff: off.length,
      peakDelta: peak ? (peak.done || 0) - peak.planned : 0,
      peakWeek: peak?.week ?? null,
      weeks: closed,
      // Il numero utile è la media settimanale: è esattamente ciò che va scritto nella
      // ricorrenza, non uno scarto da ricalcolare a mente.
      avgDone: done / closed.length,
      avgPlanned: planned / closed.length,
      of: closed.length,
      // Arrotondata al quarto d'ora: è un valore da scrivere in un blocco, non una misura.
      suggested: Math.round((done / closed.length) * 4) / 4,
      // La ricorrenza di oggi può essere diversa dal piano medio delle settimane chiuse
      // (override, template cambiato nel frattempo): è lei che si va a modificare.
      template: template ?? null,
      severity: Math.abs(done - planned) / planned,
      // Sotto o sopra, la taratura si corregge nel template.
      to: 'Ricorrenza',
    });
  }
  // Scarto proporzionale più grande = piano più fuori taratura: in cima.
  return items.sort((a, b) => b.severity - a.severity);
}

// Ore con spazi non separabili: nelle card strette il numero non va a capo staccato
// dalla sua unità ("~18h" su una riga e "15m" sulla successiva).
const hNb = h => fmtH(h).replace(/ /g, '\u00a0');

// Riga di distribuzione della card. Lo scarto può stare dentro la tolleranza di ogni
// singola settimana e sommarsi lo stesso: in quel caso non c'è né conteggio né picco da
// mostrare, e "0 settimane sotto · picco 0h" contraddiceva il verdetto della card.
export function distributionLabel({ weeksOff, of, kind, peakDelta, peakWeek }) {
  if (!weeksOff) return 'nessuna settimana fuori soglia da sola';
  const weeks = `${weeksOff} ${weeksOff === 1 ? 'settimana' : 'settimane'}${of ? ` su ${of}` : ''}`;
  // Lo scarto porta il segno, che lo distingue da un totale, e la data: senza, un -21h
  // su una media pianificata di 12h sembra impossibile.
  const delta = `${peakDelta > 0 ? '+' : ''}${hNb(peakDelta)}`;
  const when = peakWeek ? ` (${peakWeek.slice(8, 10)}/${peakWeek.slice(5, 7)})` : '';
  return kind === 'under'
    ? `${weeks} sotto · la peggiore ${delta}${when}`
    : `${weeks} sopra · la più carica ${delta}${when}`;
}

// Cosa fare, con il numero già pronto. Se la ricorrenza di oggi è già al valore
// suggerito lo scarto viene da settimane passate e non c'è niente da modificare.
export function actionLabel({ suggested, template }) {
  // "Porta la ricorrenza a ~0h" non è un'istruzione: a zero ore la scelta è togliere i blocchi.
  if (!(suggested > 0)) return 'Nessuna ora svolta: valuta di togliere i blocchi dalla ricorrenza';
  if (template == null) return `Porta la ricorrenza a ~${hNb(suggested)}`;
  if (Math.abs(template - suggested) < 0.25) return `Ricorrenza già a ${hNb(template)}: nessuna modifica`;
  return `Porta la ricorrenza da ${hNb(template)} a ~${hNb(suggested)}`;
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
