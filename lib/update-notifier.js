const https = require('https');
const { shell, dialog } = require('electron');

// Cross-platform "update notifier" used where a native auto-update is not
// possible. On macOS electron-updater (Squirrel.Mac) refuses any update that is
// not signed with a valid Apple Developer ID, so an unsigned/ad-hoc build can
// never auto-update there. Instead of failing silently, this module checks the
// latest GitHub release, compares versions, and — when a newer one exists —
// shows a native dialog offering to open the download page in the browser.
//
// It exposes the same IPC channels as lib/updater.js so the preload bridge and
// the renderer stay platform-agnostic. `installUpdate` opens the release page
// rather than installing in place, because installation stays manual.

const DEFAULT_REPO = 'valeriogalano/Timebox';

function createNotifierState() {
  return {
    status: 'idle',
    error: null,
    info: null,
    progress: null,
    updatedAt: null,
  };
}

// Compare dotted numeric versions. Returns 1 if a > b, -1 if a < b, 0 if equal.
// A leading "v" is tolerated and missing components count as 0.
function compareVersions(a, b) {
  const parse = v => String(v).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function fetchLatestRelease(repo) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${repo}/releases/latest`,
      method: 'GET',
      headers: {
        'User-Agent': 'Timebox-Update-Notifier',
        Accept: 'application/vnd.github+json',
      },
    }, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        if (res.statusCode === 404) return reject(new Error('No published release found'));
        if (res.statusCode >= 400) return reject(new Error(`GitHub API responded ${res.statusCode}`));
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('Invalid GitHub API response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('GitHub API request timed out')));
    req.end();
  });
}

function setupUpdateNotifier({ app, ipcMain, logger, mainWindow, repo = DEFAULT_REPO } = {}) {
  const state = createNotifierState();
  let prompted = false; // avoid re-prompting for the same session

  function updateState(patch) {
    Object.assign(state, patch, { updatedAt: new Date().toISOString() });
    logger.info('update-notifier state', state);
  }

  function serializeError(error) {
    return { message: error?.message ?? String(error), stack: error?.stack ?? null };
  }

  function promptDownload(release) {
    if (prompted) return;
    prompted = true;
    const opts = {
      type: 'info',
      buttons: ['Scarica', 'Più tardi'],
      defaultId: 0,
      cancelId: 1,
      title: 'Aggiornamento disponibile',
      message: `È disponibile Timebox ${release.tag_name}.`,
      detail: 'Questa build non si aggiorna automaticamente. Vuoi aprire la pagina di download?',
    };
    const choice = mainWindow && !mainWindow.isDestroyed()
      ? dialog.showMessageBoxSync(mainWindow, opts)
      : dialog.showMessageBoxSync(opts);
    if (choice === 0 && release.html_url) shell.openExternal(release.html_url);
  }

  async function checkForUpdates({ manual = false } = {}) {
    if (!app.isPackaged) {
      updateState({ status: 'skipped', error: null, info: { reason: 'not-packaged' }, progress: null });
      return { ok: true, skipped: true, reason: 'not-packaged', state };
    }

    try {
      updateState({ status: 'checking', error: null, progress: null });
      const release = await fetchLatestRelease(repo);
      const latest = release.tag_name || release.name || '';
      const current = app.getVersion();
      const isNewer = compareVersions(latest, current) > 0;

      if (isNewer) {
        // ponytail: distinct from auto-updater's 'available' (which auto-downloads);
        // here nothing downloads — the user gets a GitHub link.
        updateState({
          status: 'available-manual',
          info: { version: latest, releaseUrl: release.html_url, notes: release.body ?? null },
          error: null,
          progress: null,
        });
        promptDownload(release);
      } else {
        updateState({ status: 'not-available', info: { version: latest }, error: null, progress: null });
      }
      return { ok: true, available: isNewer, state };
    } catch (error) {
      const serialized = serializeError(error);
      updateState({ status: 'error', error: serialized });
      return { ok: false, error: serialized, state };
    }
  }

  function openReleasePage() {
    const url = state.info?.releaseUrl || `https://github.com/${repo}/releases/latest`;
    shell.openExternal(url);
    return { ok: true, url };
  }

  ipcMain.handle('app:getUpdateStatus', () => state);
  ipcMain.handle('app:checkForUpdates', () => checkForUpdates({ manual: true }));
  // On platforms without native auto-update, "install" means open the download page.
  ipcMain.handle('app:installUpdate', () => openReleasePage());

  setTimeout(() => {
    checkForUpdates().catch(error => {
      logger.error('update-notifier check failed', serializeError(error));
    });
  }, 5000);

  return { checkForUpdates, openReleasePage, compareVersions, state };
}

module.exports = { setupUpdateNotifier, compareVersions };
