#!/usr/bin/env node
'use strict';

const { Command } = require('commander');
const { openDb } = require('./db');
const { logHours } = require('./commands/log');
const { getTodayData } = require('./commands/today');
const { getWeekData } = require('./commands/week');
const { getProjectsData } = require('./commands/projects');
const { getClientsData } = require('./commands/clients');
const { getStatusData } = require('./commands/status');
const {
  fmtH, fmt, getToday,
  fmtDay, fmtDayShort, fmtWeekRange, pad,
} = require('./format');

const pkg = require('../package.json');

function run(fn) {
  try {
    openDb();
    fn();
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

const program = new Command();
program
  .name('timebox')
  .description('Timebox time tracker CLI')
  .version(pkg.version);

// ── log ────────────────────────────────────────────────────────────────────────
program
  .command('log <project> <hours>')
  .description('Log hours to a project')
  .option('--slot <slot>', 'Time slot: am or pm')
  .option('--date <date>', 'Date YYYY-MM-DD (default: today)')
  .option('--add', 'Add to existing hours instead of replacing')
  .option('--json', 'Output JSON')
  .action((project, hours, opts) => {
    run(() => {
      const date = opts.date || fmt(getToday());
      const result = logHours({ projectName: project, hoursStr: hours, slot: opts.slot, date, add: opts.add });
      if (opts.json) {
        process.stdout.write(JSON.stringify(result) + '\n');
        return;
      }
      const { action, area, client, project: proj, hours: h, slot } = result;
      const areaLabel = area || client;
      if (action === 'deleted') {
        console.log(`✓ Deleted entry for ${areaLabel} › ${proj} on ${date}`);
      } else if (action === 'noop') {
        console.log(`Nothing to do (0h on a non-existing entry).`);
      } else {
        const verb = action === 'created' ? 'Logged' : 'Updated';
        console.log(`✓ ${verb} ${fmtH(h)} on ${areaLabel} › ${proj} [${slot}] ${date}`);
      }
    });
  });

// ── today ──────────────────────────────────────────────────────────────────────
program
  .command('today')
  .description("Show today's logged hours")
  .option('--date <date>', 'Date YYYY-MM-DD (default: today)')
  .option('--json', 'Output JSON')
  .action((opts) => {
    run(() => {
      const date = opts.date || fmt(getToday());
      const data = getTodayData(date);
      if (opts.json) {
        process.stdout.write(JSON.stringify(data) + '\n');
        return;
      }
      const dateObj = new Date(date + 'T00:00:00');
      console.log(`Today — ${fmtDay(dateObj)}\n`);
      for (const slot of ['am', 'pm']) {
        const entries = data.slots[slot];
        const total = slot === 'am' ? data.amTotal : data.pmTotal;
        console.log(`  ${slot.toUpperCase()}`);
        if (entries.length === 0) {
          console.log(`    —`);
        } else {
          for (const e of entries) {
            console.log(`    ${pad((e.area || e.client) + ' › ' + e.project, 38)} ${fmtH(e.hours)}`);
          }
          console.log(`    Total: ${fmtH(total)}`);
        }
        console.log();
      }
      console.log(`  TOTAL: ${fmtH(data.total)}`);
    });
  });

// ── week ───────────────────────────────────────────────────────────────────────
program
  .command('week')
  .description('Show weekly summary')
  .option('--offset <n>', 'Week offset, negative for past weeks (default: 0)', '0')
  .option('--json', 'Output JSON')
  .action((opts) => {
    run(() => {
      const offset = parseInt(opts.offset, 10) || 0;
      const data = getWeekData(getToday(), offset);
      if (opts.json) {
        const json = {
          ...data,
          monday: fmt(data.monday),
          friday: fmt(data.friday),
          days: data.days.map(d => ({ ...d, day: fmt(d.day) })),
        };
        process.stdout.write(JSON.stringify(json) + '\n');
        return;
      }
      console.log(`Week ${fmtWeekRange(data.monday)}\n`);
      for (const day of data.days) {
        const label = fmtDayShort(day.day);
        const hrs = day.total > 0 ? fmtH(day.total) : '—';
        const detail = day.entries
          .map(e => `${e.area || e.client} · ${e.project} ${fmtH(e.hours)}`)
          .join(', ');
        console.log(`  ${pad(label, 7)} ${pad(hrs, 8)} ${detail || '—'}`);
      }
      console.log(`  ${'─'.repeat(40)}`);
      console.log(`  ${'Total'.padEnd(7)} ${fmtH(data.total)}`);
    });
  });

// ── projects ───────────────────────────────────────────────────────────────────
program
  .command('projects')
  .description('List projects with budget and logged hours')
  .option('--area <name>', 'Filter by area name (partial match)')
  .option('--all', 'Include archived projects')
  .option('--json', 'Output JSON')
  .action((opts) => {
    run(() => {
      const data = getProjectsData({ areaFilter: opts.area, clientFilter: opts.client, includeArchived: opts.all });
      if (opts.json) {
        process.stdout.write(JSON.stringify(data) + '\n');
        return;
      }
      const W = [18, 22, 9, 9];
      const header = [pad('AREA', W[0]), pad('PROJECT', W[1]), pad('BUDGET', W[2]), pad('LOGGED', W[3]), 'REMAINING'].join('  ');
      console.log(header);
      console.log('─'.repeat(header.length));
      for (const p of data) {
        const clientLabel = (p.area || p.client) + (p.archived ? ' [archived]' : '');
        const remaining = p.budgetHours != null ? Math.max(0, p.budgetHours - p.logged) : null;
        console.log([
          pad(clientLabel, W[0]),
          pad(p.project, W[1]),
          pad(p.budgetHours != null ? fmtH(p.budgetHours) : '—', W[2]),
          pad(fmtH(p.logged), W[3]),
          remaining != null ? fmtH(remaining) : '—',
        ].join('  '));
      }
    });
  });

// ── clients ────────────────────────────────────────────────────────────────────
program
  .command('areas')
  .alias('clients')
  .description('List areas')
  .option('--json', 'Output JSON')
  .action((opts) => {
    run(() => {
      const data = getClientsData();
      if (opts.json) {
        process.stdout.write(JSON.stringify(data) + '\n');
        return;
      }
      const W = [18, 10, 10, 12];
      const header = [pad('AREA', W[0]), pad('BILLABLE', W[1]), pad('BILLING', W[2]), pad('RATE', W[3]), 'LIMIT'].join('  ');
      console.log(header);
      console.log('─'.repeat(header.length));
      for (const c of data) {
        const rate = c.rate ? `€${c.rate}/h` : '—';
        const limit = c.limitHours
          ? `${c.limitHours}h/${c.limitType === 'weekly' ? 'week' : 'total'}`
          : '—';
        console.log([
          pad(c.name, W[0]),
          pad(c.billable ? '✓' : '✗', W[1]),
          pad(c.billing || '—', W[2]),
          pad(rate, W[3]),
          limit,
        ].join('  '));
      }
    });
  });

// ── status ─────────────────────────────────────────────────────────────────────
program
  .command('status')
  .description('Quick overview: today, current week, budget alerts')
  .option('--json', 'Output JSON')
  .action((opts) => {
    run(() => {
      const today = fmt(getToday());
      const data = getStatusData(today);
      if (opts.json) {
        process.stdout.write(JSON.stringify(data) + '\n');
        return;
      }
      const todayObj = new Date(today + 'T00:00:00');
      console.log(`Today (${fmtDay(todayObj)}):   ${fmtH(data.todayTotal)}`);
      console.log(`Current week:   ${fmtH(data.weekTotal)}`);
      if (data.alerts.length > 0) {
        console.log('\nBudget alerts:');
        for (const a of data.alerts) {
          const pct = Math.round(a.pct * 100);
          console.log(`  ⚠  ${a.area || a.client} › ${a.project} — ${fmtH(a.logged)} / ${fmtH(a.budget)} (${pct}%)`);
        }
      }
    });
  });

program.parse();
