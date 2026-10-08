'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createMobileAccess, PORT } = require('../../lib/mobile-access');

const HOME = { gateway: '192.168.1.1', addresses: ['192.168.1.225', '192.168.1.226'] };
const CAFE = { gateway: '10.0.0.1', addresses: ['10.0.0.7'] };

// Impostazioni, cifratura, rete e server finti: il test osserva solo cosa viene
// aperto e chiuso, e su quali indirizzi.
function setup({ network = HOME, secure = true, hostname = 'mac.local' } = {}) {
  const store = {};
  const opened = [];
  const closed = [];
  const env = { network, secure, failListen: false };
  const access = createMobileAccess({
    settings: { get: key => store[key] ?? null, set: (key, value) => { store[key] = value; } },
    secret: { available: () => env.secure, encrypt: text => `enc:${text}`, decrypt: enc => enc.replace(/^enc:/, '') },
    detect: async () => { if (env.network === 'throw') throw new Error('boom'); return env.network; },
    createServer: () => {
      const server = new EventEmitter();
      server.listen = (port, address, cb) => {
        if (env.failListen) return setImmediate(() => server.emit('error', new Error('EADDRINUSE')));
        opened.push(`${address}:${port}`); cb?.();
      };
      server.close = () => closed.push(server);
      return server;
    },
    hostname: () => hostname,
  });
  return { access, store, opened, closed, env };
}

describe('accesso alla pagina mobile', () => {
  let t;
  beforeEach(() => { t = setup(); });

  test('di default è spento: niente token, niente porta', async () => {
    await t.access.refresh();
    assert.deepEqual(t.opened, []);
    assert.deepEqual(t.access.status(), { enabled: false, hasToken: false, listening: [], port: PORT });
    assert.equal(t.access.link(), null);
  });

  test('acceso: crea il token e si lega ai soli indirizzi della rete locale', async () => {
    assert.deepEqual(await t.access.setEnabled(true), { ok: true });
    assert.ok(t.access.status().hasToken);
    assert.deepEqual(t.opened, HOME.addresses.map(a => `${a}:${PORT}`));
    assert.ok(!t.opened.some(a => a.startsWith('0.0.0.0')));
    assert.deepEqual(t.access.status().listening, HOME.addresses);
    // un secondo controllo non riapre ciò che è già aperto
    await t.access.refresh();
    assert.equal(t.opened.length, 2);
  });

  test('resta acceso su qualunque rete: segue gli indirizzi, non sceglie la rete', async () => {
    await t.access.setEnabled(true);
    t.env.network = CAFE;
    await t.access.refresh();
    assert.equal(t.closed.length, 2, 'chiude gli indirizzi della rete lasciata');
    assert.deepEqual(t.access.status().listening, CAFE.addresses);
  });

  test('senza una rete locale non ascolta, e riprende quando torna', async () => {
    await t.access.setEnabled(true);
    for (const none of [null, 'throw']) {
      t.env.network = none;
      await t.access.refresh();
      assert.deepEqual(t.access.status().listening, [], String(none));
      assert.ok(t.access.status().enabled, 'resta acceso: manca solo la rete');
      t.env.network = HOME;
      await t.access.refresh();
      assert.equal(t.access.status().listening.length, 2);
    }
  });

  test('se cambia l\'indirizzo del computer chiude il vecchio e apre il nuovo', async () => {
    await t.access.setEnabled(true);
    t.env.network = { gateway: HOME.gateway, addresses: ['192.168.1.226', '192.168.1.50'] };
    await t.access.refresh();
    assert.deepEqual(t.access.status().listening.sort(), ['192.168.1.226', '192.168.1.50'].sort());
    assert.equal(t.closed.length, 1);
  });

  test('spento, chiude tutto e ci resta', async () => {
    await t.access.setEnabled(true);
    await t.access.setEnabled(false);
    assert.deepEqual(t.access.status().listening, []);
    assert.equal(t.closed.length, 2);
    await t.access.refresh();
    assert.equal(t.opened.length, 2, 'un controllo successivo non riapre');
  });

  test('senza archiviazione sicura non si accende e non si crea il token', async () => {
    const s = setup({ secure: false });
    assert.match((await s.access.setEnabled(true)).error, /Archiviazione sicura/);
    assert.equal(s.access.status().enabled, false);
    assert.deepEqual(s.opened, []);
    assert.match(s.access.regenerateToken().error, /Archiviazione sicura/);
    assert.equal(s.access.getToken(), null);
  });

  test('il token è cifrato nelle impostazioni, e rigenerarlo lo cambia', async () => {
    await t.access.setEnabled(true);
    const first = t.access.getToken();
    assert.ok(first.length >= 40);
    assert.equal(t.store.mobile_token_enc, `enc:${first}`);
    assert.deepEqual(t.access.regenerateToken(), { ok: true });
    assert.notEqual(t.access.getToken(), first);
    // spegnere e riaccendere non lo rigenera
    const second = t.access.getToken();
    await t.access.setEnabled(false);
    await t.access.setEnabled(true);
    assert.equal(t.access.getToken(), second);
  });

  test('il link usa il nome .local, o l\'indirizzo se il nome non lo è', async () => {
    await t.access.setEnabled(true);
    assert.equal(t.access.link(), `http://mac.local:${PORT}/#${t.access.getToken()}`);

    const s = setup({ hostname: 'macbook' });
    await s.access.setEnabled(true);
    assert.equal(s.access.link(), `http://192.168.1.225:${PORT}/#${s.access.getToken()}`);
  });

  test('una porta che non si apre non resta segnata come in ascolto', async () => {
    t.env.failListen = true;
    await t.access.setEnabled(true);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(t.access.status().listening, []);
  });

  test('start controlla subito e stop chiude tutto', async () => {
    await t.access.setEnabled(true);
    t.access.start();
    await t.access.refresh();
    assert.equal(t.access.status().listening.length, 2);
    t.access.stop();
    assert.deepEqual(t.access.status().listening, []);
    assert.equal(t.closed.length, 2);
  });
});
