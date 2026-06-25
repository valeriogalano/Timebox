const { autoUpdater } = require('electron-updater');
const { dialog } = require('electron');

function createUpdateState() {
  return {
    status: 'idle',
    error: null,
    info: null,
    progress: null,
    updatedAt: null,
  };
}

function setupAutoUpdater({ app, ipcMain, logger, mainWindow }) {
  const state = createUpdateState();
  let downloadPrompted = false;
  let installPrompted = false;

  function updateState(patch) {
    Object.assign(state, patch, { updatedAt: new Date().toISOString() });
    logger.info('auto-update state', state);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auto-update-state', { ...state });
    }
  }

  function ask(opts) {
    return mainWindow && !mainWindow.isDestroyed()
      ? dialog.showMessageBoxSync(mainWindow, opts)
      : dialog.showMessageBoxSync(opts);
  }

  function serializeError(error) {
    return {
      message: error?.message ?? String(error),
      stack: error?.stack ?? null,
    };
  }

  async function checkForUpdates({ manual = false } = {}) {
    if (!app.isPackaged) {
      updateState({ status: 'skipped', error: null, info: { reason: 'not-packaged' }, progress: null });
      return { ok: true, skipped: true, reason: 'not-packaged', state };
    }

    try {
      updateState({ status: 'checking', error: null, progress: null });
      // autoDownload is off: this only checks. Download starts after the user
      // confirms in the 'update-available' prompt below.
      const result = await autoUpdater.checkForUpdates();
      return { ok: true, result: result ? { updateInfo: result.updateInfo } : null, state };
    } catch (error) {
      const serialized = serializeError(error);
      updateState({ status: 'error', error: serialized });
      if (manual) return { ok: false, error: serialized, state };
      return { ok: false, error: serialized, state };
    }
  }

  // Do not download silently: ask the user first, then ask again before
  // restarting to install. Native auto-update still works without code signing
  // on Windows (NSIS) and Linux (AppImage).
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    updateState({ status: 'checking', error: null, progress: null });
  });
  autoUpdater.on('update-available', info => {
    updateState({ status: 'available', info, error: null, progress: null });
    if (downloadPrompted) return;
    downloadPrompted = true;
    const choice = ask({
      type: 'info',
      buttons: ['Scarica', 'Più tardi'],
      defaultId: 0,
      cancelId: 1,
      title: 'Aggiornamento disponibile',
      message: `È disponibile Timebox ${info?.version ?? ''}.`.trim(),
      detail: 'Vuoi scaricare ora l’aggiornamento? Potrai installarlo al termine del download.',
    });
    if (choice === 0) {
      autoUpdater.downloadUpdate().catch(error => {
        updateState({ status: 'error', error: serializeError(error) });
      });
    }
  });
  autoUpdater.on('update-not-available', info => {
    updateState({ status: 'not-available', info, error: null, progress: null });
  });
  autoUpdater.on('download-progress', progress => {
    updateState({ status: 'downloading', progress, error: null });
  });
  autoUpdater.on('update-downloaded', info => {
    updateState({ status: 'downloaded', info, error: null, progress: null });
    if (installPrompted) return;
    installPrompted = true;
    const choice = ask({
      type: 'info',
      buttons: ['Riavvia e installa', 'Più tardi'],
      defaultId: 0,
      cancelId: 1,
      title: 'Aggiornamento pronto',
      message: `Timebox ${info?.version ?? ''} è stato scaricato.`.trim(),
      detail: 'Vuoi riavviare ora per installarlo? In alternativa verrà installato alla chiusura dell’app.',
    });
    if (choice === 0) autoUpdater.quitAndInstall(false, true);
  });
  autoUpdater.on('error', error => {
    updateState({ status: 'error', error: serializeError(error) });
  });

  ipcMain.handle('app:getUpdateStatus', () => state);
  ipcMain.handle('app:checkForUpdates', () => checkForUpdates({ manual: true }));
  ipcMain.handle('app:installUpdate', () => {
    if (state.status !== 'downloaded') return { ok: false, error: 'no-update-downloaded', state };
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  });

  setTimeout(() => {
    checkForUpdates().catch(error => {
      logger.error('auto-update check failed', serializeError(error));
    });
  }, 5000);

  return { checkForUpdates, state };
}

module.exports = { setupAutoUpdater };
