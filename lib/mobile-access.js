'use strict';

// Decide quando il listener della pagina mobile (lib/mobile-server.js) è aperto.
// È aperto solo se sono vere tutte insieme: l'accesso è attivo nelle Impostazioni,
// esiste un token, una rete è stata dichiarata di casa, e il router raggiunto adesso
// è quello. Su qualunque altra rete, e ogni volta che la rete non si riesce a
// riconoscere, il listener si chiude.
//
// Si lega ai soli indirizzi del computer nella sottorete del router, mai a 0.0.0.0.

const { randomBytes } = require('node:crypto');
const os = require('node:os');

const PORT = 37374;
const CHECK_MS = 30_000;

const KEY_ENABLED = 'mobile_enabled';
const KEY_TRUSTED_MAC = 'mobile_trusted_mac';
const KEY_TOKEN = 'mobile_token_enc';

// `settings`: { get(key), set(key, value) } sul database.
// `secret`: { available(), encrypt(text) -> base64, decrypt(base64) -> text } (safeStorage).
// `detect()`: rete corrente { mac, addresses } o null (lib/home-network.js).
// `createServer()`: un http.Server della pagina mobile.
function createMobileAccess({ settings, secret, detect, createServer, logger, hostname = os.hostname, port = PORT }) {
  const servers = new Map();   // indirizzo -> server in ascolto
  let current = null;          // ultima rete riconosciuta
  let pending = Promise.resolve();
  let timer = null;

  const enabled = () => settings.get(KEY_ENABLED) === '1';
  const trustedMac = () => settings.get(KEY_TRUSTED_MAC) || null;

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
    const home = enabled() && !!getToken() && !!network && !!trustedMac() && network.mac === trustedMac();
    const wanted = new Set(home ? network.addresses : []);
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
      trustedMac: trustedMac(),
      currentMac: current?.mac ?? null,
      onHomeNetwork: !!current && !!trustedMac() && current.mac === trustedMac(),
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
    // Dichiara di casa la rete a cui il computer è collegato adesso.
    async trustCurrentNetwork() {
      await refresh();
      if (!current) return { error: 'Non riesco a riconoscere il router di questa rete.' };
      settings.set(KEY_TRUSTED_MAC, current.mac);
      await refresh();
      return { ok: true };
    },
    async forgetNetwork() {
      settings.set(KEY_TRUSTED_MAC, '');
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
