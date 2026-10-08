'use strict';

// Indirizzi della rete locale su cui la pagina mobile può ascoltare: quelli del
// computer nella sottorete del router raggiunto dalla rotta di default. Mai 0.0.0.0,
// che esporrebbe la pagina anche sulle interfacce VPN.
//
// Qui non si riconosce *quale* rete è: su macOS un'app non può leggere né il nome del
// Wi-Fi né l'indirizzo fisico del router (la tabella ARP torna vuota ai programmi non
// di Apple). La pagina è quindi aperta su qualunque rete finché è attiva; vedi
// SECURITY.md.

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
  // (es. "link#24"): non c'è una rete locale su cui ascoltare.
  return gateway && iface && IPV4.test(gateway) ? { gateway, iface } : null;
}

const toInt = ip => ip.split('.').reduce((n, part) => ((n << 8) | Number(part)) >>> 0, 0);

// Indirizzi IPv4 di questo computer nella stessa sottorete del router.
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

// La rete locale adesso: { gateway, addresses }, o null se non ce n'è una (nessuna
// rotta, VPN a tunnel completo, piattaforma diversa da macOS).
async function currentNetwork({ platform = process.platform, exec = run, interfaces } = {}) {
  if (platform !== 'darwin') return null;
  const route = parseDefaultRoute(await exec('/sbin/route', ['-n', 'get', 'default']));
  if (!route) return null;
  const addresses = lanAddresses(route.gateway, interfaces);
  return addresses.length ? { gateway: route.gateway, addresses } : null;
}

module.exports = { parseDefaultRoute, lanAddresses, currentNetwork };
