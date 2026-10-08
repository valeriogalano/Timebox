'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { createTestDb } = require('./helpers');
const { createMobileServer, tokenMatches } = require('../../lib/mobile-server');
const { getMobileDayData, saveMobileHours, isDate } = require('../commands/mobile');
const { getEntries, getProjects } = require('../../db/queries');

const TOKEN = 'token-di-prova';
const DATE = '2031-03-04';

function call(port, method, route, { token = TOKEN, body, rawBody } = {}) {
  return new Promise((resolve, reject) => {
    const payload = rawBody ?? (body ? JSON.stringify(body) : '');
    const req = http.request({
      hostname: '127.0.0.1', port, path: route, method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Length': Buffer.byteLength(payload) },
    }, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, raw, json: () => JSON.parse(raw) }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

describe('listener della pagina mobile', () => {
  let server;
  let port;
  let token = TOKEN;
  let changes = 0;
  let project;

  before(() => new Promise(resolve => {
    createTestDb();
    project = getProjects().find(p => !p.archived);
    server = createMobileServer({
      getToken: () => token,
      getDay: getMobileDayData,
      saveHours: saveMobileHours,
      isDate,
      today: () => DATE,
      onChange: () => { changes++; },
      pageDir: path.join(__dirname, '..', '..', 'mobile'),
    });
    server.listen(0, '127.0.0.1', () => { port = server.address().port; resolve(); });
  }));

  after(() => new Promise(resolve => server.close(resolve)));

  it('serve i file della pagina senza token, con le intestazioni di sicurezza', async () => {
    for (const [route, type] of [['/', 'text/html'], ['/app.js', 'text/javascript'], ['/app.css', 'text/css'], ['/manifest.webmanifest', 'application/manifest+json']]) {
      const res = await call(port, 'GET', route, { token: null });
      assert.equal(res.status, 200, route);
      assert.ok(res.headers['content-type'].startsWith(type), route);
      assert.match(res.headers['content-security-policy'], /default-src 'none'/);
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['cache-control'], 'no-store');
    }
  });

  it('la pagina rispetta la sua CSP: nessuno script o stile in linea', async () => {
    const html = (await call(port, 'GET', '/', { token: null })).raw;
    assert.ok(!/<script(?![^>]*\ssrc=)/.test(html), 'script in linea');
    assert.ok(!/<style|\sstyle=/.test(html), 'stile in linea');
  });

  it('i file della pagina non contengono dati: nessun progetto, nessun token', async () => {
    const all = (await Promise.all(['/', '/app.js', '/app.css'].map(r => call(port, 'GET', r, { token: null })))).map(r => r.raw).join('\n');
    assert.ok(!all.includes(TOKEN));
    assert.ok(!all.includes(project.name));
  });

  it('non serve altri file: niente uscita dalla cartella della pagina', async () => {
    for (const route of ['/../package.json', '/..%2Fpackage.json', '/index.html', '/app.js/', '/main.js', '/favicon.ico']) {
      assert.equal((await call(port, 'GET', route, { token: null })).status, 404, route);
    }
  });

  it('le rotte sui dati vogliono il token giusto', async () => {
    for (const bad of [null, 'sbagliato', TOKEN.slice(0, -1), TOKEN + 'x', '']) {
      const get = await call(port, 'GET', '/api/day', { token: bad });
      assert.equal(get.status, 401, String(bad));
      assert.deepEqual(get.json(), { error: 'Unauthorized' });
      const put = await call(port, 'PUT', '/api/hours', { token: bad, body: { projectId: project.id, date: DATE, clock: '1:00' } });
      assert.equal(put.status, 401, String(bad));
    }
    assert.equal(getEntries(DATE, DATE).length, 0, 'nessuna scrittura senza token');
    assert.equal(changes, 0);
  });

  it('senza token configurato nessuna richiesta passa, nemmeno con intestazione vuota', async () => {
    token = null;
    assert.equal((await call(port, 'GET', '/api/day', { token: '' })).status, 401);
    assert.equal((await call(port, 'GET', '/api/day', { token: 'null' })).status, 401);
    token = TOKEN;
  });

  it('un token rigenerato vale dalla richiesta successiva', async () => {
    token = 'nuovo';
    assert.equal((await call(port, 'GET', '/api/day')).status, 401);
    assert.equal((await call(port, 'GET', '/api/day', { token: 'nuovo' })).status, 200);
    token = TOKEN;
  });

  it('GET /api/day → la giornata, oggi se la data manca', async () => {
    const res = await call(port, 'GET', '/api/day');
    assert.equal(res.status, 200);
    assert.equal(res.json().date, DATE);
    assert.ok(res.json().areas.length > 0);
    assert.equal((await call(port, 'GET', '/api/day?date=2031-03-05')).json().date, '2031-03-05');
    assert.equal((await call(port, 'GET', '/api/day?date=domani')).status, 400);
  });

  it('PUT /api/hours → salva, avvisa l\'app e si rilegge nella giornata', async () => {
    const res = await call(port, 'PUT', '/api/hours', { body: { projectId: project.id, date: DATE, clock: '1:15' } });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json(), { projectId: project.id, date: DATE, hours: 1.25, clock: '1:15' });
    assert.equal(changes, 1);
    const day = (await call(port, 'GET', `/api/day?date=${DATE}`)).json();
    assert.equal(day.areas.flatMap(a => a.projects).find(p => p.id === project.id).hours, 1.25);
  });

  it('PUT /api/hours rifiuta i dati che non capisce e non avvisa nessuno', async () => {
    const put = body => call(port, 'PUT', '/api/hours', body);
    assert.equal((await put({ body: { projectId: project.id, date: DATE, clock: '99:00' } })).status, 400);
    assert.equal((await put({ body: { projectId: project.id, date: 'x', clock: '1:00' } })).status, 400);
    assert.equal((await put({ body: { projectId: 'nope', date: DATE, clock: '1:00' } })).status, 404);
    assert.equal((await put({ body: { date: DATE, clock: '1:00' } })).status, 404);
    assert.equal((await put({ rawBody: '{non json' })).status, 400);
    assert.equal(changes, 1);
  });

  it('un corpo troppo grande viene rifiutato', async () => {
    const res = await call(port, 'PUT', '/api/hours', { rawBody: JSON.stringify({ pad: 'x'.repeat(5000) }) }).catch(err => ({ error: err.code }));
    // il server chiude la connessione appena supera il limite, oppure risponde 400
    assert.ok(res.error || res.status === 400, JSON.stringify(res));
    assert.equal(changes, 1);
  });

  it('nessun\'altra rotta e nessun altro metodo, nemmeno col token', async () => {
    for (const [method, route] of [['DELETE', '/api/hours'], ['POST', '/api/hours'], ['GET', '/api/hours'], ['PUT', '/api/day'], ['GET', '/api/projects'], ['POST', '/log'], ['GET', '/today'], ['DELETE', '/projects/x']]) {
      assert.equal((await call(port, method, route)).status, 404, `${method} ${route}`);
    }
  });

  it('un errore interno non rivela dettagli', async () => {
    const broken = createMobileServer({ getToken: () => TOKEN, getDay: () => { throw new Error('SQLITE_segreto'); }, saveHours: saveMobileHours, isDate, today: () => DATE, pageDir: '/nessuna/cartella' });
    await new Promise(resolve => broken.listen(0, '127.0.0.1', resolve));
    const p = broken.address().port;
    const res = await call(p, 'GET', '/api/day');
    assert.equal(res.status, 500);
    assert.deepEqual(res.json(), { error: 'Internal error' });
    assert.equal((await call(p, 'GET', '/', { token: null })).status, 500);
    await new Promise(resolve => broken.close(resolve));
  });
});

describe('tokenMatches', () => {
  it('confronta solo intestazioni Bearer, e mai un token vuoto', () => {
    assert.ok(tokenMatches('Bearer abc', 'abc'));
    assert.ok(!tokenMatches('Bearer abc', 'abd'));
    assert.ok(!tokenMatches('abc', 'abc'));
    assert.ok(!tokenMatches('Basic abc', 'abc'));
    assert.ok(!tokenMatches('Bearer ', ''));
    assert.ok(!tokenMatches('Bearer ', null));
    assert.ok(!tokenMatches(undefined, 'abc'));
    assert.ok(!tokenMatches(['Bearer abc'], 'abc'));
  });
});
