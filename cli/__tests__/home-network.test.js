'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { parseDefaultRoute, parseArpMac, lanAddresses, currentNetwork } = require('../../lib/home-network');

const ROUTE = `   route to: default
destination: default
       mask: default
    gateway: 192.168.1.1
  interface: en7
      flags: <UP,GATEWAY,DONE,STATIC,PRCLONING,GLOBAL>
`;
const ARP = `? (192.168.1.1) at 38:16:5a:aa:a9:38 on en7 ifscope [ethernet]
? (192.168.1.1) at 38:16:5a:aa:a9:38 on en0 ifscope [ethernet]
`;
const IFACES = {
  lo0: [{ family: 'IPv4', address: '127.0.0.1', netmask: '255.0.0.0', internal: true }],
  en0: [{ family: 'IPv4', address: '192.168.1.226', netmask: '255.255.255.0', internal: false },
        { family: 'IPv6', address: 'fe80::1', netmask: 'ffff:ffff:ffff:ffff::', internal: false }],
  en7: [{ family: 'IPv4', address: '192.168.1.225', netmask: '255.255.255.0', internal: false }],
  utun8: [{ family: 'IPv4', address: '192.168.22.6', netmask: '255.255.255.255', internal: false }],
  utun4: [{ family: 'IPv4', address: '10.8.0.2', netmask: '255.255.255.0', internal: false }],
};

describe('parseDefaultRoute', () => {
  test('legge gateway e interfaccia', () => {
    assert.deepEqual(parseDefaultRoute(ROUTE), { gateway: '192.168.1.1', iface: 'en7' });
  });

  test('senza gateway IPv4 non è una rete riconoscibile', () => {
    assert.equal(parseDefaultRoute(''), null);
    assert.equal(parseDefaultRoute('route: writing to routing socket: not in table'), null);
    assert.equal(parseDefaultRoute(ROUTE.replace('192.168.1.1', 'link#24')), null);
    assert.equal(parseDefaultRoute('    gateway: 192.168.1.1\n'), null);
  });
});

describe('parseArpMac', () => {
  test('legge il MAC del router richiesto', () => {
    assert.equal(parseArpMac(ARP, '192.168.1.1'), '38:16:5a:aa:a9:38');
  });

  test('normalizza gli ottetti senza zero iniziale e le maiuscole', () => {
    assert.equal(parseArpMac('? (10.0.0.1) at 0:1C:b3:9:85:15 on en0 ifscope [ethernet]', '10.0.0.1'), '00:1c:b3:09:85:15');
  });

  test('nel dubbio niente: voce incompleta, altro indirizzo, MAC che non identifica nessuno', () => {
    assert.equal(parseArpMac('? (192.168.1.1) at (incomplete) on en0 ifscope [ethernet]', '192.168.1.1'), null);
    assert.equal(parseArpMac(ARP, '192.168.1.2'), null);
    assert.equal(parseArpMac('? (192.168.1.1) at ff:ff:ff:ff:ff:ff on en0', '192.168.1.1'), null);
    assert.equal(parseArpMac('? (192.168.1.1) at 0:0:0:0:0:0 on en0', '192.168.1.1'), null);
    assert.equal(parseArpMac('? (192.168.1.1) at 38:16:5a:aa:a9 on en0', '192.168.1.1'), null);
    assert.equal(parseArpMac('', '192.168.1.1'), null);
  });
});

describe('lanAddresses', () => {
  test('solo gli indirizzi nella sottorete del router: né loopback né VPN', () => {
    assert.deepEqual(lanAddresses('192.168.1.1', IFACES), ['192.168.1.226', '192.168.1.225']);
  });

  test('gateway non valido o nessuna interfaccia sulla sua rete: nessun indirizzo', () => {
    assert.deepEqual(lanAddresses('link#24', IFACES), []);
    assert.deepEqual(lanAddresses('172.16.0.1', IFACES), []);
    assert.deepEqual(lanAddresses(null, IFACES), []);
  });
});

describe('currentNetwork', () => {
  const exec = outputs => async file => outputs[file] ?? '';

  test('rete riconosciuta: MAC del router e indirizzi su cui ascoltare', async () => {
    const net = await currentNetwork({ platform: 'darwin', interfaces: IFACES, exec: exec({ '/sbin/route': ROUTE, '/usr/sbin/arp': ARP }) });
    assert.deepEqual(net, { mac: '38:16:5a:aa:a9:38', addresses: ['192.168.1.226', '192.168.1.225'] });
  });

  test('se la voce del router è scaduta dalla tabella ARP, un ping la fa tornare', async () => {
    const calls = [];
    let pinged = false;
    const net = await currentNetwork({
      platform: 'darwin', interfaces: IFACES,
      exec: async (file, args) => {
        calls.push(file);
        if (file === '/sbin/route') return ROUTE;
        if (file === '/sbin/ping') { pinged = true; assert.deepEqual(args, ['-c', '1', '-t', '1', '192.168.1.1']); return ''; }
        return pinged ? ARP : '192.168.1.1 (192.168.1.1) -- no entry\n';
      },
    });
    assert.equal(net.mac, '38:16:5a:aa:a9:38');
    assert.deepEqual(calls, ['/sbin/route', '/usr/sbin/arp', '/sbin/ping', '/usr/sbin/arp']);
  });

  test('con la voce presente non serve nessun ping', async () => {
    const calls = [];
    await currentNetwork({ platform: 'darwin', interfaces: IFACES, exec: async file => { calls.push(file); return file === '/sbin/route' ? ROUTE : ARP; } });
    assert.deepEqual(calls, ['/sbin/route', '/usr/sbin/arp']);
  });

  test('nel dubbio non è casa', async () => {
    const ok = { '/sbin/route': ROUTE, '/usr/sbin/arp': ARP };
    assert.equal(await currentNetwork({ platform: 'linux', interfaces: IFACES, exec: exec(ok) }), null);
    assert.equal(await currentNetwork({ platform: 'darwin', interfaces: IFACES, exec: exec({ ...ok, '/sbin/route': '' }) }), null);
    assert.equal(await currentNetwork({ platform: 'darwin', interfaces: IFACES, exec: exec({ ...ok, '/usr/sbin/arp': '' }) }), null);
    assert.equal(await currentNetwork({ platform: 'darwin', interfaces: {}, exec: exec(ok) }), null);
  });

  test('un comando che fallisce davvero dà stringa vuota, quindi nessuna rete', async () => {
    // senza `exec` iniettato usa execFile: un percorso inesistente non deve lanciare
    assert.equal(await currentNetwork({ platform: 'sunos' }), null);
  });
});
