const { autoUpdater } = require('electron-updater');

function createUpdateState() {
  return {
    status: 'idle',
    error: null,
    info: null,
    progress: null,
    updatedAt: null,
  };
}

function setupAutoUpdater({ app, ipcMain, logger }) {
  const state = createUpdateState();

  function updateState(patch) {
    Object.assign(state, patch, { updatedAt: new Date().toISOString() });
    logger.info('auto-update state', state);
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
      const result = await autoUpdater.checkForUpdatesAndNotify();
      return { ok: true, result: result ? { updateInfo: result.updateInfo } : null, state };
    } catch (error) {
      const serialized = serializeError(error);
      updateState({ status: 'error', error: serialized });
      if (manual) return { ok: false, error: serialized, state };
      return { ok: false, error: serialized, state };
    }
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    updateState({ status: 'checking', error: null, progress: null });
  });
  autoUpdater.on('update-available', info => {
    updateState({ status: 'available', info, error: null, progress: null });
  });
  autoUpdater.on('update-not-available', info => {
    updateState({ status: 'not-available', info, error: null, progress: null });
  });
  autoUpdater.on('download-progress', progress => {
    updateState({ status: 'downloading', progress, error: null });
  });
  autoUpdater.on('update-downloaded', info => {
    updateState({ status: 'downloaded', info, error: null, progress: null });
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
