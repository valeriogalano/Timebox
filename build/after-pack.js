const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// electron-builder: 0 ia32, 1 x64, 2 armv7l, 3 arm64, 4 universal.
const ARCH = { 1: 'x64', 3: 'arm64' };

// `build.files` tiene nel pacchetto un solo binario di better-sqlite3, quello della
// piattaforma. Se il filtro sbaglia l'app parte e si chiude subito, senza database:
// meglio far fallire la build qui che pubblicare un'app che non si apre.
function checkPrebuild(context) {
  const resources = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  const dir = path.join(resources, 'app.asar.unpacked', 'node_modules', 'better-sqlite3', 'prebuilds');
  const expected = `${context.electronPlatformName}-${ARCH[context.arch]}.node`;
  const found = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  if (found.length !== 1 || found[0] !== expected) {
    throw new Error(`better-sqlite3: nel pacchetto serve solo ${expected}, trovato [${found.join(', ')}] in ${dir}`);
  }
}

exports.default = async function afterPack(context) {
  checkPrebuild(context);

  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const entitlementsPath = path.join(context.packager.projectDir, 'build', 'entitlements.mac.plist');

  execFileSync('codesign', [
    '--force',
    '--deep',
    '--sign',
    '-',
    '--entitlements',
    entitlementsPath,
    appPath,
  ], { stdio: 'inherit' });
};

exports.checkPrebuild = checkPrebuild;
