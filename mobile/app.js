'use strict';

// Pagina mobile di Timebox: le ore lavorate di una giornata, per progetto.
// Parla solo con il Mac che la serve (due rotte, token nell'intestazione).
// Tutto il testo passa da textContent: niente HTML costruito da dati.

const STEP = 0.25;                 // un tocco = 15 minuti
const SAVE_DELAY = 700;            // si salva quando i tocchi si fermano

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
    throw new Error('Il Mac non risponde. Deve essere acceso, con Timebox aperto, sulla rete di casa.');
  }
  if (res.status === 401) throw new Error('Link non valido. Riapri quello mostrato nelle Impostazioni di Timebox.');
  if (!res.ok) throw new Error('Qualcosa non ha funzionato. Riprova.');
  return res.json();
}

function renderTotals() {
  const tracked = data.areas.reduce((s, a) => s + a.projects.reduce((t, p) => t + p.hours, 0), 0);
  $('totals').textContent = `${fmtH(tracked)} lavorate · ${fmtH(data.plannedHours)} pianificate`;
}

function row(project) {
  const el = document.createElement('div');
  el.className = 'row';
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = project.name;
  const value = document.createElement('output');
  let timer = null;

  const show = () => {
    value.textContent = fmtH(project.hours);
    value.classList.toggle('zero', !project.hours);
    renderTotals();
  };

  async function save() {
    el.classList.add('saving');
    el.classList.remove('failed');
    try {
      const saved = await api('/api/hours', {
        method: 'PUT',
        body: JSON.stringify({ projectId: project.id, date: data.date, clock: clock(project.hours) }),
      });
      project.hours = saved.hours;
      say('');
    } catch (err) {
      el.classList.add('failed');
      say(`${project.name}: ore non salvate. ${err.message}`);
    }
    el.classList.remove('saving');
    show();
  }

  function step(delta, label, aria) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-label', `${aria}, ${project.name}`);
    b.addEventListener('click', () => {
      project.hours = Math.min(24, Math.max(0, Math.round((project.hours + delta) / STEP) * STEP));
      show();
      clearTimeout(timer);
      timer = setTimeout(save, SAVE_DELAY);
    });
    return b;
  }

  el.append(name, step(-STEP, '−15m', 'Togli 15 minuti'), value, step(STEP, '+15m', 'Aggiungi 15 minuti'), step(1, '+1h', 'Aggiungi un\'ora'));
  value.textContent = fmtH(project.hours);
  value.classList.toggle('zero', !project.hours);
  return el;
}

function render() {
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
    section.append(title, ...area.projects.map(row));
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
