'use strict';

// Decide quando il listener della pagina mobile (lib/mobile-server.js) è aperto:
// quando l'accesso è attivo, esiste un token e il computer è su una rete locale.
// Non distingue una rete dall'altra: finché è attivo, è aperto su qualunque rete a
// cui il computer si collega. L'interruttore sta nella barra in alto dell'app
// proprio perché si veda sempre se è acceso.
//
// Si lega ai soli indirizzi del computer nella sottorete del router, mai a 0.0.0.0,
// e segue i cambi di rete ricontrollando ogni 30 secondi.

const { randomBytes } = require('node:crypto');
const os = require('node:os');

const PORT = 37374;
const CHECK_MS = 30_000;

const KEY_ENABLED = 'mobile_enabled';
const KEY_TOKEN = 'mobile_token_enc';

// `settings`: { get(key), set(key, value) } sul database.
// `secret`: { available(), encrypt(text) -> base64, decrypt(base64) -> text } (safeStorage).
// `detect()`: rete locale corrente { addresses } o null (lib/home-network.js).
// `createServer()`: un http.Server della pagina mobile.
function createMobileAccess({ settings, secret, detect, createServer, logger, hostname = os.hostname, port = PORT }) {
  const servers = new Map();   // indirizzo -> server in ascolto
  let current = null;          // ultima rete locale vista
  let pending = Promise.resolve();
  let timer = null;

  const enabled = () => settings.get(KEY_ENABLED) === '1';

  function getToken() {
    const enc = settings.get(KEY_TOKEN);
    if (!enc || !secret.available()) return null;
    try { return secret.decrypt(enc) || null; } catch { return null; }
  }

  function newToken() {
    if (!secret.available()) return { error: 'Archiviazione sicura non disponibile su questo sistema: token non creato.' };
    // 32 byte casuali: non si indovina e non serve un limite ai tentativi.
    settings.set(KEY_TOKEN, secret.encrypt(randomBytes(32).toString('base64url')));
    return { ok: true };
  }

  function close(address) {
    const server = servers.get(address);
    servers.delete(address);
    if (!server) return;
    server.close();
    server.closeAllConnections?.();
    logger?.info('mobile listener closed', { address });
  }

  function open(address) {
    const server = createServer();
    servers.set(address, server);
    server.on('error', err => {
      logger?.warn('mobile listener error', { address, message: err.message });
      if (servers.get(address) === server) servers.delete(address);
    });
    server.listen(port, address, () => logger?.info('mobile listener open', { address, port }));
  }

  async function check() {
    let network = null;
    try { network = await detect(); } catch { network = null; }
    current = network;
    const wanted = new Set(enabled() && getToken() && network ? network.addresses : []);
    for (const address of [...servers.keys()]) if (!wanted.has(address)) close(address);
    for (const address of wanted) if (!servers.has(address)) open(address);
  }

  // Un controllo alla volta: due in parallelo potrebbero aprire due volte lo stesso indirizzo.
  function refresh() {
    pending = pending.then(check, check);
    return pending;
  }

  function status() {
    return {
      enabled: enabled(),
      hasToken: !!getToken(),
      listening: [...servers.keys()],
      port,
    };
  }

  // Il link con il token, da aprire una volta sull'iPhone. Usa il nome .local del
  // computer, che non cambia quando il DHCP assegna un altro indirizzo.
  function link() {
    const token = getToken();
    const name = hostname();
    const host = name.endsWith('.local') ? name : (servers.keys().next().value || current?.addresses?.[0]);
    return token && host ? `http://${host}:${port}/#${token}` : null;
  }

  return {
    getToken,
    status,
    link,
    refresh,
    async setEnabled(value) {
      if (value && !getToken()) {
        const created = newToken();
        if (created.error) return created;
      }
      settings.set(KEY_ENABLED, value ? '1' : '0');
      await refresh();
      return { ok: true };
    },
    // Il token vecchio smette di valere subito: il server lo rilegge a ogni richiesta.
    regenerateToken() {
      return newToken();
    },
    start() {
      refresh();
      timer = setInterval(refresh, CHECK_MS);
      timer.unref?.();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      for (const address of [...servers.keys()]) close(address);
    },
  };
}

module.exports = { createMobileAccess, PORT, CHECK_MS };
