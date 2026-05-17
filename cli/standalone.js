#!/usr/bin/env node
'use strict';

const http = require('node:http');

const PORT = parseInt(process.env.TIMEBOX_PORT || '37373', 10);
const BASE = `http://127.0.0.1:${PORT}`;

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtH(h) {
  if (h === 0) return '0h';
  const neg = h < 0;
  const abs = Math.abs(h);
  const hh = Math.floor(abs);
  const mm = Math.round((abs - hh) * 60);
  let s = '';
  if (hh) s += `${hh}h`;
  if (mm) s += ` ${mm}m`;
  return neg ? `-${s.trim()}` : s.trim();
}

function pad(n, w = 2) { return String(n).padStart(w, '0'); }

function request(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          if (res.statusCode >= 400) reject(Object.assign(new Error(data.error || raw), { status: res.statusCode }));
          else resolve(data);
        } catch { reject(new Error(`Invalid response: ${raw}`)); }
      });
    });
    req.on('error', err => {
      if (err.code === 'ECONNREFUSED') {
        reject(new Error(
          `Cannot connect to Timebox (${BASE}).\nPlease open the Timebox app and try again.`
        ));
      } else {
        reject(err);
      }
    });
    if (payload) req.write(payload);
    req.end();
  });
}

// ── arg parser ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { positional: [], flags: {} };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args.flags[key] = true;
        i++;
      } else {
        args.flags[key] = next;
        i += 2;
      }
    } else {
      args.positional.push(a);
      i++;
    }
  }
  return args;
}

// ── formatters ────────────────────────────────────────────────────────────────

function col(str, w) {
  const s = String(str ?? '');
  return s.length >= w ? s.slice(0, w - 1) + ' ' : s + ' '.repeat(w - s.length);
}

function printTable(rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const widths = keys.map(k => Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length)) + 2);
  const header = keys.map((k, i) => col(k.toUpperCase(), widths[i])).join('');
  const sep = widths.map(w => '-'.repeat(w)).join('');
  console.log(header);
  console.log(sep);
  for (const r of rows) console.log(keys.map((k, i) => col(r[k], widths[i])).join(''));
}

// ── commands ──────────────────────────────────────────────────────────────────

async function cmdToday(flags) {
  const qs = flags.date ? `?date=${encodeURIComponent(flags.date)}` : '';
  const d = await request(`/today${qs}`);
  if (flags.json) { console.log(JSON.stringify(d)); return; }

  console.log(`\nDate: ${d.date}`);
  for (const slot of ['am', 'pm']) {
    const entries = d.slots[slot];
    if (!entries.length) continue;
    console.log(`\n  ${slot.toUpperCase()}`);
    for (const e of entries) console.log(`    ${col(e.project, 30)} ${fmtH(e.hours)}`);
  }
  const total = (d.amTotal || 0) + (d.pmTotal || 0);
  console.log(`\n  Total: ${fmtH(total)}\n`);
}

async function cmdWeek(flags) {
  const offset = parseInt(flags.offset || '0', 10) || 0;
  const d = await request(`/week?offset=${offset}`);
  if (flags.json) { console.log(JSON.stringify(d)); return; }

  console.log(`\nWeek ${d.monday} – ${d.friday}\n`);
  const rows = d.days.map(day => ({
    Day: day.label || day.day,
    AM: fmtH(day.amTotal || 0),
    PM: fmtH(day.pmTotal || 0),
    Total: fmtH(day.total || 0),
  }));
  printTable(rows);
  console.log(`\n  Week total: ${fmtH(d.total || 0)}\n`);
}

async function cmdProjects(flags) {
  const params = new URLSearchParams();
  if (flags.client) params.set('client', flags.client);
  if (flags.all) params.set('all', '1');
  const qs = params.toString() ? `?${params}` : '';
  const d = await request(`/projects${qs}`);
  if (flags.json) { console.log(JSON.stringify(d)); return; }

  const rows = d.map(p => ({
    Project: p.name,
    Client: p.client,
    Logged: fmtH(p.loggedHours || 0),
    Budget: p.budgetHours ? fmtH(p.budgetHours) : '—',
    Weekly: p.weeklyHours ? fmtH(p.weeklyHours) : '—',
    Archived: p.archived ? 'yes' : '',
  }));
  printTable(rows);
  console.log('');
}

async function cmdClients(flags) {
  const d = await request('/clients');
  if (flags.json) { console.log(JSON.stringify(d)); return; }

  const rows = d.map(c => ({
    Client: c.name,
    Billing: c.billing || c.billable || '—',
    Rate: c.rate ? `€${c.rate}/h` : '—',
    Limit: c.limitHours ? `${c.limitHours}h (${c.limitType || ''})` : '—',
  }));
  printTable(rows);
  console.log('');
}

async function cmdStatus(flags) {
  const d = await request('/status');
  if (flags.json) { console.log(JSON.stringify(d)); return; }

  console.log(`\nToday (${d.today}): ${fmtH(d.todayTotal || 0)}`);
  console.log(`This week:   ${fmtH(d.weekTotal || 0)}`);
  if (d.alerts && d.alerts.length) {
    console.log('\nAlerts:');
    for (const a of d.alerts) console.log(`  ⚠  ${a}`);
  }
  console.log('');
}

async function cmdLog(positional, flags) {
  const [, project, hoursStr] = positional;
  if (!project || !hoursStr) {
    console.error('Usage: timebox log <project> <hours> [--slot am|pm] [--date YYYY-MM-DD] [--add]');
    process.exit(1);
  }
  const body = {
    project,
    hours: hoursStr,
    slot: flags.slot || undefined,
    date: flags.date || undefined,
    add: !!flags.add,
  };
  const d = await request('/log', 'POST', body);
  if (flags.json) { console.log(JSON.stringify(d)); return; }

  const action = d.action === 'deleted' ? 'Deleted' : d.action === 'updated' ? 'Updated' : 'Logged';
  console.log(`\n  ${action}: ${fmtH(d.hours || 0)} on ${d.project} (${d.date}, ${d.slot || 'am'})\n`);
}

function cmdHelp() {
  console.log(`
Timebox CLI — requires the Timebox app to be running

Usage: timebox <command> [options]

Commands:
  today             Hours logged today
  week              Weekly summary
  projects          List projects
  clients           List clients
  status            Quick overview: today, week, alerts
  log <proj> <hrs>  Log hours on a project

Options (log):
  --slot am|pm      Time slot (default: am)
  --date YYYY-MM-DD Date (default: today)
  --add             Add to existing hours instead of replacing

Options (week):
  --offset N        Week offset (e.g. -1 = last week)

Options (projects):
  --client <name>   Filter by client
  --all             Include archived projects

Global:
  --json            Output raw JSON

Examples:
  timebox today
  timebox week --offset -1
  timebox log website 2:30 --slot pm
  timebox log website 1 --add
  timebox projects --json
`);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const cmd = positional[0];

  try {
    if (!cmd || cmd === 'help' || flags.help) { cmdHelp(); return; }
    if (cmd === 'today')    { await cmdToday(flags); return; }
    if (cmd === 'week')     { await cmdWeek(flags); return; }
    if (cmd === 'projects') { await cmdProjects(flags); return; }
    if (cmd === 'clients')  { await cmdClients(flags); return; }
    if (cmd === 'status')   { await cmdStatus(flags); return; }
    if (cmd === 'log')      { await cmdLog(positional, flags); return; }

    console.error(`Unknown command: ${cmd}. Run "timebox help" for usage.`);
    process.exit(1);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
