'use strict';

// La CLI installabile, eseguita come processo contro il server HTTP di prova:
// così un nome di campo che diverge dall'API si vede nell'output.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const path = require('node:path');
const { createTestDb } = require('./helpers');
const { createHttpServer } = require('../http-server');
const { getProjects, getClients, saveClient, saveEntry, saveProject } = require('../../db/queries');
const { fmt, getToday } = require('../../lib/domain');

const CLI = path.join(__dirname, '..', 'standalone.js');
const DATE = '2031-03-04';

describe('CLI standalone', () => {
  let server;
  let port;
  let hourly;

  const run = (...args) => new Promise(resolve => {
    execFile(process.execPath, [CLI, ...args], { env: { ...process.env, TIMEBOX_PORT: String(port) } },
      (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
  });

  before(() => new Promise(resolve => {
    createTestDb();
    // Un'area a ore con una registrazione in cui fatturabili e lavorate divergono.
    const [area] = getClients();
    saveClient({ ...area, billing: 'hourly' });
    hourly = getProjects().find(p => p.clientId === area.id);
    saveEntry({ id: 'cli-1', projectId: hourly.id, date: DATE, hours: 3, billableHours: 2, slot: 'am', billed: false });
    server = createHttpServer();
    server.listen(0, '127.0.0.1', () => { port = server.address().port; resolve(); });
  }));

  after(() => new Promise(resolve => server.close(resolve)));

  it('projects: ogni riga ha il nome del progetto e le ore, non colonne vuote', async () => {
    const { code, stdout } = await run('projects');
    assert.equal(code, 0);
    const lines = stdout.trim().split('\n');
    assert.match(lines[0], /^PROJECT\s+AREA\s+LOGGED\s+BUDGET\s+WEEKLY\s+ARCHIVED/);
    const rows = lines.slice(2);
    assert.equal(rows.length, getProjects().filter(p => !p.archived).length);
    for (const p of getProjects().filter(x => !x.archived)) {
      assert.ok(rows.some(r => r.startsWith(p.name)), `manca ${p.name}`);
    }
    assert.ok(!stdout.includes('undefined'));
    // almeno un progetto dei dati demo ha ore registrate
    assert.ok(rows.some(r => /\s[1-9]\d*h/.test(r)), 'nessuna ora mostrata');
  });

  it('projects: nelle aree a ore mostra anche le fatturabili quando divergono', async () => {
    const row = (await run('projects')).stdout.split('\n').find(l => l.startsWith(hourly.name));
    assert.match(row, /\(.*fatt\.\)/);
  });

  it('projects --json restituisce i dati dell\'API così come sono', async () => {
    const data = JSON.parse((await run('projects', '--json')).stdout);
    assert.ok(data.every(p => 'project' in p && 'logged' in p));
  });

  it('projects --area filtra, --all include gli archiviati', async () => {
    const area = getClients().find(c => c.id === hourly.clientId).name;
    const rows = (await run('projects', '--area', area)).stdout.trim().split('\n').slice(2);
    assert.ok(rows.length > 0 && rows.every(r => r.includes(area)));
    assert.equal((await run('projects', '--all')).code, 0);
  });

  it('today, week, entries, areas e status rispondono senza valori mancanti', async () => {
    const today = await run('today', '--date', DATE);
    assert.match(today.stdout, new RegExp(`Date: ${DATE}`));
    assert.match(today.stdout, /Total: 3h \(2h fatt\.\)/);

    const week = await run('week');
    assert.match(week.stdout, /DAY\s+TOTAL/);
    assert.ok(!/\bAM\b|\bPM\b/.test(week.stdout), 'le ore registrate non hanno fascia');

    const entries = await run('entries', '--from', DATE, '--to', DATE);
    assert.match(entries.stdout, /Total: 3h/);

    const areas = await run('areas');
    assert.match(areas.stdout, /AREA\s+BILLING/);

    const status = await run('status');
    assert.match(status.stdout, /Today \(\d{4}-\d{2}-\d{2}\):/);

    for (const out of [today, week, entries, areas, status]) {
      assert.equal(out.code, 0);
      assert.ok(!out.stdout.includes('undefined') && !out.stdout.includes('NaN'), out.stdout);
    }
  });

  it('log registra le ore e today le mostra', async () => {
    const logged = await run('log', hourly.name, '1:30', '--date', '2031-03-05');
    assert.equal(logged.code, 0);
    assert.match(logged.stdout, /Logged: 1h 30m/);
    assert.match((await run('today', '--date', '2031-03-05')).stdout, /Total: 1h 30m/);
    assert.match((await run('today', '--date', '2031-03-05', '--json')).stdout, /"total":1.5/);
  });

  it('log aggiorna, somma con --add e cancella con zero ore', async () => {
    const day = '2031-03-06';
    assert.match((await run('log', hourly.name, '2', '--date', day, '--slot', 'pm')).stdout, /Logged: 2h/);
    assert.match((await run('log', hourly.name, '3', '--date', day, '--slot', 'pm', '--billable', '2:30')).stdout, /Updated: 3h \(2h 30m fatt\.\)/);
    assert.match((await run('log', hourly.name, '0:30', '--date', day, '--slot', 'pm', '--add')).stdout, /Updated: 3h 30m/);
    assert.match((await run('log', hourly.name, '0', '--date', day, '--slot', 'pm')).stdout, /Deleted: 0h/);
    assert.match((await run('today', '--date', day)).stdout, /Total: 0h/);
    const json = JSON.parse((await run('log', hourly.name, '1', '--date', day, '--json')).stdout);
    assert.equal(json.hours, 1);
  });

  it('week e status mostrano le fatturabili quando divergono', async () => {
    const today = fmt(getToday());
    await run('log', hourly.name, '4', '--date', today, '--billable', '3');
    assert.match((await run('week')).stdout, /Week total: .*\(.* fatt\.\)/);
    const status = (await run('status')).stdout;
    assert.match(status, /Today \(\d{4}-\d{2}-\d{2}\): .*\(.* fatt\.\)/);
    assert.match(status, /This week: .*\(.* fatt\.\)/);
    assert.match((await run('week', '--offset', '-1')).stdout, /Week \d{4}-\d{2}-\d{2}/);
  });

  it('status elenca gli avvisi quando un budget è superato', async () => {
    saveProject({ ...getProjects().find(p => p.id === hourly.id), budgetHours: 1 });
    const status = (await run('status')).stdout;
    assert.match(status, /Alerts:/);
    assert.ok(!status.includes('[object Object]'), status);
    saveProject({ ...getProjects().find(p => p.id === hourly.id), budgetHours: null });
  });

  it('projects: archiviati con --all, alias --client, e nessuna riga se il filtro non trova niente', async () => {
    const other = getProjects().find(p => p.clientId !== hourly.clientId);
    saveProject({ ...other, archived: true });
    assert.ok(!(await run('projects')).stdout.includes(other.name));
    const row = (await run('projects', '--all')).stdout.split('\n').find(l => l.startsWith(other.name));
    assert.match(row, /yes\s*$/);
    saveProject({ ...other, archived: false });

    const area = getClients().find(c => c.id === hourly.clientId).name;
    assert.ok((await run('projects', '--client', area)).stdout.includes(hourly.name));
    const none = await run('projects', '--area', 'nessunaareacosi');
    assert.equal(none.code, 0);
    assert.equal(none.stdout.trim(), '');
  });

  it('--json su week, entries, areas e status restituisce JSON valido', async () => {
    for (const args of [['week'], ['entries', '--from', DATE, '--to', DATE], ['areas'], ['status']]) {
      const out = await run(...args, '--json');
      assert.equal(out.code, 0, args.join(' '));
      assert.doesNotThrow(() => JSON.parse(out.stdout), args.join(' '));
    }
  });

  it('errori: comando sconosciuto, log senza argomenti, entries senza --from', async () => {
    const unknown = await run('nope');
    assert.equal(unknown.code, 1);
    assert.match(unknown.stderr, /Unknown command: nope/);
    assert.equal((await run('log')).code, 1);
    const entries = await run('entries');
    assert.equal(entries.code, 1);
    assert.match(entries.stderr, /YYYY-MM-DD/);
  });

  it('help elenca i comandi', async () => {
    const help = await run('help');
    assert.equal(help.code, 0);
    for (const cmd of ['today', 'week', 'projects', 'entries', 'areas', 'status', 'log']) assert.ok(help.stdout.includes(cmd), cmd);
  });

  it('con l\'app chiusa lo dice, senza uno stack', async () => {
    const closed = await new Promise(resolve => {
      execFile(process.execPath, [CLI, 'today'], { env: { ...process.env, TIMEBOX_PORT: '1' } },
        (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stderr }));
    });
    assert.equal(closed.code, 1);
    assert.match(closed.stderr, /^Error: /);
    assert.ok(!closed.stderr.includes('    at '));
  });
});
