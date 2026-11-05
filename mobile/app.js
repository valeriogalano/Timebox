'use strict';

// Pagina mobile di Timebox: le ore lavorate di una giornata, per progetto.
// Parla solo con il Mac che la serve (due rotte, token nell'intestazione).
// Tutto il testo passa da textContent: niente HTML costruito da dati.
// Le ore sono un menu nativo: su iPhone si apre come ruota, senza pulsanti.

const STEP = 0.25;                 // la ruota delle ore va a passi di 15 minuti
const MAX_HOURS = 12;              // un valore già salvato oltre il limite resta

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
  const tracked = data.areas.reduce((s, a) => s + a.projects.reduce((t, p) => t + p.hours, 0), 0);
  $('totals').textContent = `${fmtH(tracked)} lavorate · ${fmtH(data.plannedHours)} pianificate`;
}

const option = (value, text) => Object.assign(document.createElement('option'), { value, textContent: text });

function hoursSelect(project, onChange) {
  const select = document.createElement('select');
  select.className = project.hours ? 'hours' : 'hours zero';
  select.setAttribute('aria-label', `Ore di ${project.name}`);
  const values = Array.from({ length: MAX_HOURS / STEP + 1 }, (_, i) => i * STEP);
  // Un valore fuori passo (20 minuti da Todoist) compare comunque: non si arrotonda in silenzio.
  if (!values.some(v => Math.abs(v - project.hours) < 0.001)) values.push(project.hours);
  for (const v of values.sort((a, b) => a - b)) select.append(option(String(v), fmtH(v)));
  select.value = String(project.hours);
  select.addEventListener('change', () => onChange(Number(select.value)));
  return select;
}

function projectBox(project) {
  const box = document.createElement('div');
  box.className = 'project';

  function paint() {
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = project.name;
    box.replaceChildren(name, hoursSelect(project, setHours));
    renderTotals();
  }

  async function setHours(hours) {
    const before = project.hours;
    project.hours = hours;
    renderTotals();
    box.classList.add('saving');
    try {
      const saved = await api('/api/hours', {
        method: 'PUT',
        body: JSON.stringify({ projectId: project.id, date: data.date, clock: clock(hours) }),
      });
      project.hours = saved.hours;
      say('');
    } catch (err) {
      project.hours = before;
      say(`${project.name}: ore non salvate. ${err.message}`);
    }
    box.classList.remove('saving');
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
