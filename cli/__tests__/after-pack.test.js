'use strict';

// Il controllo che ferma la build se nel pacchetto non c'è esattamente il binario
// di better-sqlite3 della piattaforma (build/after-pack.js).

const { test, describe, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkPrebuild } = require('../../build/after-pack');

// Un pacchetto finto con i binari indicati, nella disposizione di ogni piattaforma.
function packageWith(platform, files) {
  const appOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'timebox-pack-'));
  const resources = platform === 'darwin'
    ? path.join(appOutDir, 'Timebox.app', 'Contents', 'Resources')
    : path.join(appOutDir, 'resources');
  const dir = path.join(resources, 'app.asar.unpacked', 'node_modules', 'better-sqlite3', 'prebuilds');
  if (files) {
    fs.mkdirSync(dir, { recursive: true });
    for (const f of files) fs.writeFileSync(path.join(dir, f), '');
  }
  return { appOutDir, electronPlatformName: platform, packager: { appInfo: { productFilename: 'Timebox' } } };
}
const ARM64 = 3;
const X64 = 1;

describe('after-pack: binario di better-sqlite3 nel pacchetto', () => {
  test('passa con il solo binario della piattaforma, su ogni sistema', () => {
    assert.doesNotThrow(() => checkPrebuild({ ...packageWith('darwin', ['darwin-arm64.node']), arch: ARM64 }));
    assert.doesNotThrow(() => checkPrebuild({ ...packageWith('darwin', ['darwin-x64.node']), arch: X64 }));
    assert.doesNotThrow(() => checkPrebuild({ ...packageWith('linux', ['linux-x64.node']), arch: X64 }));
    assert.doesNotThrow(() => checkPrebuild({ ...packageWith('win32', ['win32-x64.node']), arch: X64 }));
    assert.doesNotThrow(() => checkPrebuild({ ...packageWith('win32', ['win32-arm64.node']), arch: ARM64 }));
  });

  test('ferma la build se il binario manca', () => {
    assert.throws(() => checkPrebuild({ ...packageWith('win32', []), arch: X64 }), /serve solo win32-x64\.node, trovato \[\]/);
    assert.throws(() => checkPrebuild({ ...packageWith('linux', null), arch: X64 }), /serve solo linux-x64\.node/);
  });

  test('ferma la build se è quello di un\'altra piattaforma o architettura', () => {
    assert.throws(() => checkPrebuild({ ...packageWith('linux', ['linuxmusl-x64.node']), arch: X64 }), /trovato \[linuxmusl-x64\.node\]/);
    assert.throws(() => checkPrebuild({ ...packageWith('darwin', ['darwin-x64.node']), arch: ARM64 }), /serve solo darwin-arm64\.node/);
  });

  test('ferma la build se ne restano altri oltre a quello giusto', () => {
    assert.throws(
      () => checkPrebuild({ ...packageWith('darwin', ['darwin-arm64.node', 'win32-x64.node']), arch: ARM64 }),
      /trovato \[darwin-arm64\.node, win32-x64\.node\]/,
    );
  });
});

describe('after-pack: firma su macOS', () => {
  // execFileSync va sostituito prima di caricare il modulo, che lo destruttura subito.
  function loadWithFakeCodesign() {
    const calls = [];
    const cp = require('node:child_process');
    const fake = mock.method(cp, 'execFileSync', (file, args) => { calls.push([file, ...args]); });
    delete require.cache[require.resolve('../../build/after-pack')];
    const afterPack = require('../../build/after-pack').default;
    return { afterPack, calls, restore: () => { fake.mock.restore(); delete require.cache[require.resolve('../../build/after-pack')]; } };
  }

  test('su macOS controlla il binario e poi firma l\'app con gli entitlements', async () => {
    const { afterPack, calls, restore } = loadWithFakeCodesign();
    const ctx = packageWith('darwin', ['darwin-arm64.node']);
    ctx.packager.projectDir = '/progetto';
    await afterPack({ ...ctx, arch: ARM64 });
    restore();
    assert.deepEqual(calls, [[
      'codesign', '--force', '--deep', '--sign', '-',
      '--entitlements', path.join('/progetto', 'build', 'entitlements.mac.plist'),
      path.join(ctx.appOutDir, 'Timebox.app'),
    ]]);
  });

  test('sugli altri sistemi controlla il binario e non firma', async () => {
    const { afterPack, calls, restore } = loadWithFakeCodesign();
    await afterPack({ ...packageWith('linux', ['linux-x64.node']), arch: X64 });
    await afterPack({ ...packageWith('win32', ['win32-x64.node']), arch: X64 });
    restore();
    assert.deepEqual(calls, []);
  });

  test('se il binario manca non arriva a firmare', async () => {
    const { afterPack, calls, restore } = loadWithFakeCodesign();
    await assert.rejects(afterPack({ ...packageWith('darwin', []), arch: ARM64 }), /serve solo darwin-arm64\.node/);
    restore();
    assert.deepEqual(calls, []);
  });
});
