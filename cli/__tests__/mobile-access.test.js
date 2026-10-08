'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createMobileAccess, PORT } = require('../../lib/mobile-access');

const HOME = { mac: '38:16:5a:aa:a9:38', addresses: ['192.168.1.225', '192.168.1.226'] };
const CAFE = { mac: 'de:ad:be:ef:00:01', addresses: ['10.0.0.7'] };

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

describe('accesso dalla rete di casa', () => {
  let t;
  beforeEach(() => { t = setup(); });

  test('di default è chiuso: niente token, niente rete, niente porta', async () => {
    await t.access.refresh();
    assert.deepEqual(t.opened, []);
    assert.deepEqual(t.access.status(), {
      enabled: false, hasToken: false, trustedMac: null, currentMac: HOME.mac, onHomeNetwork: false, listening: [], port: PORT,
    });
    assert.equal(t.access.link(), null);
  });

  test('attivato ma senza rete dichiarata resta chiuso', async () => {
    assert.deepEqual(await t.access.setEnabled(true), { ok: true });
    assert.deepEqual(t.opened, []);
    assert.ok(t.access.status().hasToken, 'attivando si crea il token');
  });

  test('attivato sulla rete di casa: si lega ai soli indirizzi della LAN', async () => {
    await t.access.setEnabled(true);
    assert.deepEqual(await t.access.trustCurrentNetwork(), { ok: true });
    assert.deepEqual(t.opened, HOME.addresses.map(a => `${a}:${PORT}`));
    assert.ok(!t.opened.some(a => a.startsWith('0.0.0.0')));
    assert.deepEqual(t.access.status().listening, HOME.addresses);
    assert.ok(t.access.status().onHomeNetwork);
    // un secondo controllo non riapre ciò che è già aperto
    await t.access.refresh();
    assert.equal(t.opened.length, 2);
  });

  test('su un\'altra rete si chiude da solo', async () => {
    await t.access.setEnabled(true);
    await t.access.trustCurrentNetwork();
    t.env.network = CAFE;
    await t.access.refresh();
    assert.equal(t.closed.length, 2);
    assert.deepEqual(t.access.status().listening, []);
    assert.equal(t.access.status().onHomeNetwork, false);
    // e si riapre tornando a casa
    t.env.network = HOME;
    await t.access.refresh();
    assert.equal(t.opened.length, 4);
  });

  test('nel dubbio resta chiuso: rete non riconosciuta o riconoscimento che fallisce', async () => {
    await t.access.setEnabled(true);
    await t.access.trustCurrentNetwork();
    for (const unknown of [null, 'throw']) {
      t.env.network = unknown;
      await t.access.refresh();
      assert.deepEqual(t.access.status().listening, [], String(unknown));
      assert.equal(t.access.status().currentMac, null);
      t.env.network = HOME;
      await t.access.refresh();
    }
  });

  test('se cambia l\'indirizzo del computer chiude il vecchio e apre il nuovo', async () => {
    await t.access.setEnabled(true);
    await t.access.trustCurrentNetwork();
    t.env.network = { mac: HOME.mac, addresses: ['192.168.1.226', '192.168.1.50'] };
    await t.access.refresh();
    assert.deepEqual(t.access.status().listening.sort(), ['192.168.1.226', '192.168.1.50'].sort());
    assert.equal(t.closed.length, 1);
  });

  test('disattivato o dimenticata la rete, chiude', async () => {
    await t.access.setEnabled(true);
    await t.access.trustCurrentNetwork();
    await t.access.setEnabled(false);
    assert.deepEqual(t.access.status().listening, []);
    await t.access.setEnabled(true);
    assert.equal(t.access.status().listening.length, 2);
    await t.access.forgetNetwork();
    assert.deepEqual(t.access.status().listening, []);
    assert.equal(t.access.status().trustedMac, null);
  });

  test('non si può dichiarare di casa una rete che non si riconosce', async () => {
    t.env.network = null;
    assert.match((await t.access.trustCurrentNetwork()).error, /router/);
    assert.equal(t.access.status().trustedMac, null);
  });

  test('senza archiviazione sicura non si attiva e non si crea il token', async () => {
    const s = setup({ secure: false });
    assert.match((await s.access.setEnabled(true)).error, /Archiviazione sicura/);
    assert.equal(s.access.status().enabled, false);
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
    // riattivare non lo rigenera
    const second = t.access.getToken();
    await t.access.setEnabled(false);
    await t.access.setEnabled(true);
    assert.equal(t.access.getToken(), second);
  });

  test('il link usa il nome .local, o l\'indirizzo se il nome non lo è', async () => {
    await t.access.setEnabled(true);
    await t.access.trustCurrentNetwork();
    assert.equal(t.access.link(), `http://mac.local:${PORT}/#${t.access.getToken()}`);

    const s = setup({ hostname: 'macbook' });
    await s.access.setEnabled(true);
    await s.access.trustCurrentNetwork();
    assert.equal(s.access.link(), `http://192.168.1.225:${PORT}/#${s.access.getToken()}`);
  });

  test('una porta che non si apre non resta segnata come in ascolto', async () => {
    t.env.failListen = true;
    await t.access.setEnabled(true);
    await t.access.trustCurrentNetwork();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(t.access.status().listening, []);
  });

  test('start controlla subito e stop chiude tutto', async () => {
    await t.access.setEnabled(true);
    await t.access.trustCurrentNetwork();
    t.access.start();
    await t.access.refresh();
    assert.equal(t.access.status().listening.length, 2);
    t.access.stop();
    assert.deepEqual(t.access.status().listening, []);
    assert.equal(t.closed.length, 2);
  });
});
