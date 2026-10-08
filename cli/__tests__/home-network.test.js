'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { parseDefaultRoute, lanAddresses, currentNetwork } = require('../../lib/home-network');

const ROUTE = `   route to: default
destination: default
       mask: default
    gateway: 192.168.1.1
  interface: en7
      flags: <UP,GATEWAY,DONE,STATIC,PRCLONING,GLOBAL>
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
  const exec = output => async () => output;

  test('rete locale: router e indirizzi su cui ascoltare', async () => {
    const net = await currentNetwork({ platform: 'darwin', interfaces: IFACES, exec: exec(ROUTE) });
    assert.deepEqual(net, { gateway: '192.168.1.1', addresses: ['192.168.1.226', '192.168.1.225'] });
  });

  test('legge solo la rotta: nessun altro comando', async () => {
    const calls = [];
    await currentNetwork({ platform: 'darwin', interfaces: IFACES, exec: async (file, args) => { calls.push([file, ...args]); return ROUTE; } });
    assert.deepEqual(calls, [['/sbin/route', '-n', 'get', 'default']]);
  });

  test('senza una rete locale non c\'è dove ascoltare', async () => {
    assert.equal(await currentNetwork({ platform: 'linux', interfaces: IFACES, exec: exec(ROUTE) }), null);
    assert.equal(await currentNetwork({ platform: 'darwin', interfaces: IFACES, exec: exec('') }), null);
    assert.equal(await currentNetwork({ platform: 'darwin', interfaces: IFACES, exec: exec(ROUTE.replace('192.168.1.1', 'link#24')) }), null);
    assert.equal(await currentNetwork({ platform: 'darwin', interfaces: {}, exec: exec(ROUTE) }), null);
  });

  test('un comando che fallisce davvero dà stringa vuota, quindi nessuna rete', async () => {
    // senza `exec` iniettato usa execFile: su un'altra piattaforma non deve lanciare
    assert.equal(await currentNetwork({ platform: 'sunos' }), null);
  });
});
