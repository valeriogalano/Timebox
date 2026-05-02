const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const path = require('path');
const { initDb } = require('./db/schema');
const q = require('./db/queries');

function getAppIcon() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png'));
  return img.isEmpty() ? null : img;
}

const isDev = !!process.env.ELECTRON_START_URL;

if (isDev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9223');
}

function createWindow() {
  const icon = getAppIcon();
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Timebox',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL(process.env.ELECTRON_START_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

function setupIpc() {
  ipcMain.handle('db:getClients',          ()              => q.getClients());
  ipcMain.handle('db:saveClient',          (_, c)          => q.saveClient(c));
  ipcMain.handle('db:deleteClient',        (_, id)         => q.deleteClient(id));

  ipcMain.handle('db:getProjects',         ()              => q.getProjects());
  ipcMain.handle('db:saveProject',         (_, p)          => q.saveProject(p));
  ipcMain.handle('db:deleteProject',       (_, id)         => q.deleteProject(id));

  ipcMain.handle('db:getRecurring',        ()              => q.getRecurring());
  ipcMain.handle('db:saveRecurring',       (_, r)          => q.saveRecurring(r));
  ipcMain.handle('db:deleteRecurring',     (_, id)         => q.deleteRecurring(id));

  ipcMain.handle('db:getEntries',          (_, from, to)   => q.getEntries(from, to));
  ipcMain.handle('db:saveEntry',           (_, e)          => q.saveEntry(e));
  ipcMain.handle('db:deleteEntry',         (_, id)         => q.deleteEntry(id));

  ipcMain.handle('db:getWeekOverrides',    (_, wk)         => q.getWeekOverrides(wk));
  ipcMain.handle('db:saveWeekOverride',    (_, o)          => q.saveWeekOverride(o));
  ipcMain.handle('db:deleteWeekOverride',  (_, wk, di, sl) => q.deleteWeekOverride(wk, di, sl));

  ipcMain.handle('db:resetAllData',        ()              => q.resetAllData());
  ipcMain.handle('db:seedDemoData',        ()              => q.seedDemoData());
}

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath('userData'), 'timebox.db');
  const db = initDb(dbPath);
  q.init(db);
  setupIpc();
  if (process.platform === 'darwin') {
    const icon = getAppIcon();
    if (icon) app.dock.setIcon(icon);
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
