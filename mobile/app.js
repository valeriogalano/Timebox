'use strict';

// Pagina mobile di Timebox: le ore lavorate di una giornata, per progetto e per fascia.
// Parla solo con il Mac che la serve (tre rotte, token nell'intestazione).
// Tutto il testo passa da textContent: niente HTML costruito da dati.
// Fascia e ore sono menu nativi: su iPhone si aprono come ruota, senza pulsanti.

const STEP = 0.25;                 // la ruota delle ore va a passi di 15 minuti
const MAX_HOURS = 12;              // per fascia; un valore già salvato oltre il limite resta
const SLOTS = { am: 'Mattina', pm: 'Pomeriggio', sera: 'Sera' };

// Il token arriva nel frammento del link (#...), che il browser non manda al server.
// Resta nell'indirizzo di proposito: "Aggiungi a Home" su iOS salva l'indirizzo
// corrente, e l'app sulla Home ha una memoria separata da quella di Safari.
const token = location.hash.slice(1) || localStorage.getItem('timebox-token') || '';
if (location.hash.slice(1)) localStorage.setItem('timebox-token', token);

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Le ore si scrivono come nell'app: "1h 30m".
function fmtH(h) {
  if (!h) return '0h';
  let hh = Math.floor(h);
  let mm = Math.round((h - hh) * 60);
  if (mm === 60) { hh += 1; mm = 0; }
  return mm === 0 ? `${hh}h` : `${hh}h ${mm}m`;
}

// Al server le ore vanno come "H:MM".
function clock(h) {
  const minutes = Math.round(h * 60);
  return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
}

let day = new Date();
let data = null;

function say(text) {
  $('message').textContent = text || '';
  $('message').hidden = !text;
}

async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(path, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
  } catch {
    throw new Error('Il Mac non risponde. Deve essere acceso, con Timebox aperto e la pagina accesa, sulla stessa rete dell\'iPhone.');
  }
  if (res.status === 401) throw new Error('Link non valido. Riapri quello mostrato nelle Impostazioni di Timebox.');
  if (!res.ok) throw new Error('Qualcosa non ha funzionato. Riprova.');
  return res.json();
}

function renderTotals() {
  const tracked = data.areas.reduce((s, a) => s + a.projects.reduce((t, p) => t + p.rows.reduce((u, r) => u + r.hours, 0), 0), 0);
  $('totals').textContent = `${fmtH(tracked)} lavorate · ${fmtH(data.plannedHours)} pianificate`;
}

const option = (value, text) => Object.assign(document.createElement('option'), { value, textContent: text });

// Una riga per fascia con ore. Un progetto senza ore ne ha una vuota, nella fascia in cui
// finirebbero ore nuove; `saved` dice se la riga esiste sul Mac.
function buildRows(project) {
  project.rows = project.entries.length
    ? project.entries.map(e => ({ slot: e.slot, hours: e.hours, saved: true }))
    : [{ slot: project.defaultSlot, hours: 0, saved: false }];
}

function hoursSelect(project, row, onChange) {
  const select = document.createElement('select');
  select.className = row.hours ? 'hours' : 'hours zero';
  select.setAttribute('aria-label', `Ore di ${project.name}, ${SLOTS[row.slot]}`);
  const values = Array.from({ length: MAX_HOURS / STEP + 1 }, (_, i) => i * STEP);
  // Un valore fuori passo (20 minuti da Todoist) compare comunque: non si arrotonda in silenzio.
  if (!values.some(v => Math.abs(v - row.hours) < 0.001)) values.push(row.hours);
  for (const v of values.sort((a, b) => a - b)) select.append(option(String(v), fmtH(v)));
  select.value = String(row.hours);
  select.addEventListener('change', () => onChange(Number(select.value)));
  return select;
}

function slotSelect(project, row, onChange) {
  const select = document.createElement('select');
  select.setAttribute('aria-label', `Fascia di ${project.name}`);
  for (const [slot, label] of Object.entries(SLOTS)) {
    // Una fascia dove il progetto ha già ore: scegliendola le ore si sommano.
    const taken = slot !== row.slot && project.rows.some(r => r.slot === slot);
    select.append(option(slot, taken ? `${label} (somma)` : label));
  }
  select.value = row.slot;
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function projectBox(project) {
  const box = document.createElement('div');
  box.className = 'project';

  function paint() {
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = project.name;
    const lines = project.rows.map(row => {
      const line = document.createElement('div');
      line.className = 'row';
      line.append(slotSelect(project, row, to => moveRow(row, to, line)), hoursSelect(project, row, hours => setHours(row, hours, line)));
      return line;
    });
    const free = Object.keys(SLOTS).filter(slot => !project.rows.some(r => r.slot === slot));
    const add = document.createElement('select');
    add.className = 'add';
    add.setAttribute('aria-label', `Aggiungi ore di ${project.name} in un'altra fascia`);
    add.append(option('', '+ fascia'), ...free.map(slot => option(slot, SLOTS[slot])));
    add.addEventListener('change', () => {
      project.rows.push({ slot: add.value, hours: 0, saved: false });
      paint();
    });
    box.replaceChildren(name, ...lines, ...(free.length ? [add] : []));
    renderTotals();
  }

  async function setHours(row, hours, line) {
    const before = row.hours;
    row.hours = hours;
    renderTotals();
    line.classList.add('saving');
    try {
      const saved = await api('/api/hours', {
        method: 'PUT',
        body: JSON.stringify({ projectId: project.id, date: data.date, clock: clock(hours), slot: row.slot }),
      });
      row.hours = saved.hours;
      row.saved = saved.hours > 0;
      say('');
    } catch (err) {
      row.hours = before;
      say(`${project.name}: ore non salvate. ${err.message}`);
    }
    paint();
  }

  // Le ore già salvate si spostano sul Mac; una riga vuota esiste solo qui.
  async function moveRow(row, to, line) {
    const other = project.rows.find(r => r !== row && r.slot === to);
    if (row.saved) {
      line.classList.add('saving');
      try {
        await api('/api/slot', { method: 'PUT', body: JSON.stringify({ projectId: project.id, date: data.date, from: row.slot, to }) });
        say('');
      } catch (err) {
        say(`${project.name}: fascia non cambiata. ${err.message}`);
        return paint();
      }
    }
    if (other) {
      other.hours += row.hours;
      other.saved = other.saved || row.saved;
      project.rows = project.rows.filter(r => r !== row);
    } else {
      row.slot = to;
    }
    paint();
  }

  paint();
  return box;
}

// La pianificazione del giorno, in sola lettura: per fascia, le aree con le ore
// coperte su quelle pianificate. Si aggiorna quando la pagina ricarica i dati.
function renderPlan() {
  const plan = $('plan');
  plan.replaceChildren();
  plan.hidden = !data.plan?.length;
  if (plan.hidden) return;
  const title = document.createElement('h2');
  title.textContent = 'Piano del giorno';
  plan.append(title);
  for (const slot of data.plan) {
    const group = document.createElement('div');
    group.className = 'plan-slot';
    const label = document.createElement('h3');
    label.textContent = slot.label;
    group.append(label);
    for (const block of slot.blocks) {
      const line = document.createElement('div');
      line.className = 'plan-block';
      const dot = document.createElement('span');
      dot.className = 'dot';
      if (block.color) dot.style.background = block.color;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = block.area;
      const value = document.createElement('span');
      value.className = 'value';
      value.textContent = `${fmtH(block.trackedHours)} su ${fmtH(block.hours)}`;
      line.append(dot, name, value);
      group.append(line);
    }
    plan.append(group);
  }
}

function render() {
  for (const area of data.areas) area.projects.forEach(buildRows);   // i totali leggono le righe di tutti
  renderPlan();
  const areas = $('areas');
  areas.replaceChildren();
  for (const area of data.areas) {
    const section = document.createElement('section');
    const title = document.createElement('h2');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = area.color;        // via CSSOM: la CSP vieta gli stili in linea
    const label = document.createElement('span');
    label.textContent = area.name;
    title.append(dot, label);
    if (area.plannedHours > 0) {
      const planned = document.createElement('small');
      planned.textContent = `${fmtH(area.plannedHours)} pianificate`;
      title.append(planned);
    }
    section.append(title, ...area.projects.map(projectBox));
    areas.append(section);
  }
  renderTotals();
}

async function load() {
  $('date').textContent = day.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  $('today').hidden = iso(day) === iso(new Date());
  if (!token) return say('Apri il link mostrato nelle Impostazioni di Timebox, alla voce iPhone.');
  try {
    data = await api(`/api/day?date=${iso(day)}`);
    say('');
    render();
  } catch (err) {
    $('areas').replaceChildren();
    $('plan').hidden = true;
    $('totals').textContent = '';
    say(err.message);
  }
}

function move(days) {
  day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);
  load();
}

$('prev').addEventListener('click', () => move(-1));
$('next').addEventListener('click', () => move(1));
$('today').addEventListener('click', () => { day = new Date(); load(); });
// Riaprendo la pagina dopo un po' i dati potrebbero essere cambiati dal Mac.
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
load();
