'use strict';

// Riconosce la rete di casa dall'indirizzo fisico (MAC) del router, non dal nome del
// Wi-Fi: macOS oscura il nome a chi non ha il permesso di localizzazione, e due Wi-Fi
// e il cavo della stessa casa hanno comunque lo stesso router.
//
// Regola di fondo: nel dubbio la rete NON è quella di casa. Ogni errore, ogni output
// che non si capisce e ogni piattaforma diversa da macOS danno `null`.
//
// ponytail: il MAC del router si può falsificare. Chi lo fa su un'altra rete deve
// conoscerlo già e avere comunque il token: qui serve a non aprire la porta in un
// bar, non a fermare un attaccante mirato.

const { execFile } = require('node:child_process');
const os = require('node:os');

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function run(file, args) {
  return new Promise(resolve => {
    execFile(file, args, { timeout: 3000 }, (err, stdout) => resolve(err ? '' : String(stdout)));
  });
}

// `route -n get default` → { gateway, iface }, o null se manca uno dei due.
function parseDefaultRoute(output) {
  const gateway = /^\s*gateway:\s*(\S+)\s*$/m.exec(output)?.[1];
  const iface = /^\s*interface:\s*(\S+)\s*$/m.exec(output)?.[1];
  // Con una VPN a tunnel completo il gateway non è un indirizzo IPv4 della LAN
  // (es. "link#24"): non è la rete di casa.
  return gateway && iface && IPV4.test(gateway) ? { gateway, iface } : null;
}

// `arp -n <ip>` → MAC in minuscolo con gli ottetti a due cifre, o null.
// macOS scrive gli ottetti senza zero iniziale ("0:1c:b3:..."): vanno normalizzati,
// o lo stesso router darebbe due stringhe diverse.
function parseArpMac(output, ip) {
  for (const line of output.split('\n')) {
    const m = /\(([\d.]+)\) at ([0-9a-fA-F:]+)/.exec(line);
    if (!m || m[1] !== ip) continue;
    const octets = m[2].split(':');
    if (octets.length !== 6 || octets.some(o => !/^[0-9a-fA-F]{1,2}$/.test(o))) continue;
    const mac = octets.map(o => o.padStart(2, '0').toLowerCase()).join(':');
    // Indirizzi che non identificano nessun router.
    if (mac === '00:00:00:00:00:00' || mac === 'ff:ff:ff:ff:ff:ff') continue;
    return mac;
  }
  return null;
}

const toInt = ip => ip.split('.').reduce((n, part) => ((n << 8) | Number(part)) >>> 0, 0);

// Indirizzi IPv4 di questo computer nella stessa sottorete del router. Il listener
// si lega solo a questi: mai a 0.0.0.0, che lo esporrebbe anche sulle interfacce VPN.
function lanAddresses(gateway, interfaces = os.networkInterfaces()) {
  if (!IPV4.test(gateway || '')) return [];
  const gw = toInt(gateway);
  const out = [];
  for (const list of Object.values(interfaces)) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal || !IPV4.test(a.netmask || '')) continue;
      const mask = toInt(a.netmask);
      // Una maschera /32 o /0 non descrive una LAN.
      if (mask === 0 || mask === 0xffffffff) continue;
      if (((toInt(a.address) & mask) >>> 0) === ((gw & mask) >>> 0)) out.push(a.address);
    }
  }
  return out;
}

// Stato della rete adesso: { mac, addresses } del router raggiunto dalla rotta di
// default, o null se non si riesce a stabilirlo.
async function currentNetwork({ platform = process.platform, exec = run, interfaces } = {}) {
  if (platform !== 'darwin') return null;
  const route = parseDefaultRoute(await exec('/sbin/route', ['-n', 'get', 'default']));
  if (!route) return null;
  const mac = parseArpMac(await exec('/usr/sbin/arp', ['-n', route.gateway]), route.gateway);
  if (!mac) return null;
  const addresses = lanAddresses(route.gateway, interfaces);
  return addresses.length ? { mac, addresses } : null;
}

module.exports = { parseDefaultRoute, parseArpMac, lanAddresses, currentNetwork };
