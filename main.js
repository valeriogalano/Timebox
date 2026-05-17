const { app, BrowserWindow, ipcMain, nativeImage, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { initDb } = require('./db/schema');
const q = require('./db/queries');
const { createHttpServer } = require('./cli/http-server');

function getAppIcon() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png'));
  return img.isEmpty() ? null : img;
}

function createLogger() {
  const logDir = path.join(app.getPath('userData'), 'logs');
  const logFile = path.join(logDir, 'timebox.log');

  function write(level, message, extra) {
    try {
      fs.mkdirSync(logDir, { recursive: true });
      const ts = new Date().toISOString();
      const suffix = extra !== undefined ? ` ${JSON.stringify(extra)}` : '';
      fs.appendFileSync(logFile, `[${ts}] [${level}] ${message}${suffix}\n`, 'utf8');
    } catch (_) {
      // Last-resort logging must never crash app startup.
    }
  }

  return {
    file: logFile,
    info: (msg, extra) => write('INFO', msg, extra),
    warn: (msg, extra) => write('WARN', msg, extra),
    error: (msg, extra) => write('ERROR', msg, extra),
  };
}

app.name = 'Timebox';

const isDev = !!process.env.ELECTRON_START_URL;
const logger = createLogger();

let _db = null;
let _dbPath = null;
let _httpServer = null;
const HTTP_PORT = 37373;

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(data) {
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    logger.error('saveConfig failed', { message: err.message });
  }
}

function openDatabase(dbPath) {
  if (_db) {
    try { _db.close(); } catch (_) {}
  }
  _dbPath = dbPath;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  logger.info('db init', { dbPath });
  _db = initDb(dbPath);
  q.init(_db);
  saveConfig({ dbPath });
}

if (isDev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9223');
}

function attachWindowLogging(win) {
  win.webContents.on('did-start-loading', () => {
    logger.info('did-start-loading');
  });

  win.webContents.on('did-finish-load', () => {
    logger.info('did-finish-load', { url: win.webContents.getURL() });
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    logger.error('did-fail-load', { errorCode, errorDescription, validatedURL, isMainFrame });
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    logger.error('render-process-gone', details);
  });

  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    logger.info('renderer-console', { level, message, line, sourceId });
  });

  win.webContents.on('unresponsive', () => {
    logger.warn('window-unresponsive');
  });

  win.webContents.on('responsive', () => {
    logger.info('window-responsive');
  });
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

  attachWindowLogging(win);

  if (isDev) {
    logger.info('loading dev url', { url: process.env.ELECTRON_START_URL });
    win.loadURL(process.env.ELECTRON_START_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const rendererEntry = path.join(__dirname, 'renderer-dist', 'index.html');
    logger.info('loading production file', { rendererEntry, exists: fs.existsSync(rendererEntry) });
    win.loadFile(rendererEntry);
  }
}

function sh(s) { return "'" + s.replace(/'/g, "'\\''") + "'"; }

function installTool(src, dest) {
  return new Promise(resolve => {
    // First try without privileges (works if /usr/local/bin is user-writable)
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      try { fs.unlinkSync(dest); } catch (_) {}
      fs.symlinkSync(src, dest);
      fs.chmodSync(src, 0o755);
      return resolve({ ok: true });
    } catch (_) {}

    // Fall back to osascript admin prompt (macOS)
    const cmd = `ln -sf ${sh(src)} ${sh(dest)} && chmod 755 ${sh(src)}`;
    const script = `do shell script "${cmd.replace(/"/g, '\\"')}" with administrator privileges`;
    execFile('osascript', ['-e', script], err => {
      if (err) resolve({ error: err.message });
      else resolve({ ok: true });
    });
  });
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
  ipcMain.handle('db:getProjectTotals',    ()              => q.getProjectTotals());
  ipcMain.handle('db:saveEntry',           (_, e)          => q.saveEntry(e));
  ipcMain.handle('db:deleteEntry',         (_, id)         => q.deleteEntry(id));

  ipcMain.handle('db:getWeekOverrides',      (_, wk)         => q.getWeekOverrides(wk));
  ipcMain.handle('db:getWeekOverridesRange', (_, f, t)       => q.getWeekOverridesRange(f, t));
  ipcMain.handle('db:saveWeekOverride',    (_, o)          => q.saveWeekOverride(o));
  ipcMain.handle('db:deleteWeekOverride',  (_, wk, di, sl) => q.deleteWeekOverride(wk, di, sl));
  ipcMain.handle('db:freezeWeeksBeforeRecurringChange', (_, r) => q.freezeWeeksBeforeRecurringChange(r));

  ipcMain.handle('db:resetAllData',        ()              => q.resetAllData());
  ipcMain.handle('db:seedDemoData',        ()              => q.seedDemoData());

  ipcMain.handle('app:getHttpPort', () => HTTP_PORT);

  ipcMain.handle('app:checkCliInstalled', () => {
    try { fs.accessSync('/usr/local/bin/timebox'); return true; } catch { return false; }
  });

  ipcMain.handle('app:installCli', () => installTool(
    app.isPackaged ? path.join(process.resourcesPath, 'timebox') : path.join(__dirname, 'cli', 'standalone.js'),
    '/usr/local/bin/timebox'
  ));

  ipcMain.handle('app:checkMcpServerInstalled', () => {
    try { fs.accessSync('/usr/local/bin/timebox-mcp'); return true; } catch { return false; }
  });

  ipcMain.handle('app:installMcpServer', () => installTool(
    app.isPackaged ? path.join(process.resourcesPath, 'timebox-mcp') : path.join(__dirname, 'cli', 'mcp-server.js'),
    '/usr/local/bin/timebox-mcp'
  ));

  ipcMain.handle('settings:getTodoistToken', () => {
    const enc = q.getSetting('todoist_token_enc');
    if (!enc || !safeStorage.isEncryptionAvailable()) return '';
    try { return safeStorage.decryptString(Buffer.from(enc, 'base64')); } catch { return ''; }
  });

  ipcMain.handle('settings:setTodoistToken', (_, token) => {
    if (!safeStorage.isEncryptionAvailable()) return;
    const enc = safeStorage.encryptString(token);
    q.setSetting('todoist_token_enc', enc.toString('base64'));
  });

  ipcMain.handle('db:getTodoistCache',     (_, dates)               => q.getTodoistCache(dates));
  ipcMain.handle('db:setTodoistCache',     (_, dateStr, tasks, syncedAt) => q.setTodoistCache(dateStr, tasks, syncedAt));
  ipcMain.handle('db:getAllTodoistCache',  ()                       => q.getAllTodoistCache());

  ipcMain.handle('todoist:sync', async (_, timboxProjects, dates, debug) => {
    const enc = q.getSetting('todoist_token_enc');
    if (!enc || !safeStorage.isEncryptionAvailable()) return { error: 'no_token' };
    let token;
    try { token = safeStorage.decryptString(Buffer.from(enc, 'base64')); } catch { return { error: 'no_token' }; }

    const headers = { Authorization: `Bearer ${token}` };
    const dateSet = new Set(dates);

    logger.info('todoist:sync token_len', { len: token.length });
    logger.info('todoist:sync dates', { dates });

    // Fetch all open tasks with pagination
    const openTasks = [];
    let cursor = null;
    do {
      const url = 'https://api.todoist.com/api/v1/tasks?limit=200' + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
      const res = await fetch(url, { headers });
      if (!res.ok) { logger.info('todoist:sync open_error', { status: res.status }); break; }
      const data = await res.json();
      openTasks.push(...(data.results ?? data.tasks ?? []));
      cursor = data.next_cursor ?? null;
    } while (cursor);

    // Fetch projects (single page)
    const projRes = await fetch('https://api.todoist.com/api/v1/projects?limit=200', { headers });
    const projData = projRes.ok ? await projRes.json() : {};
    const todoistProjects = projData.results ?? projData.projects ?? [];

    logger.info('todoist:sync tasks', { open: openTasks.length, projects: todoistProjects.length });

    function matchProject(todoistProjectId) {
      const tp = todoistProjects.find(p => p.id === todoistProjectId);
      if (!tp) return null;
      return timboxProjects.find(p => p.name === tp.name) ?? null;
    }

    function parseDurationHours(duration) {
      if (!duration) return null;
      if (typeof duration === 'object') return (duration.amount ?? 60) / 60;
      const h = duration.match(/(\d+)\s*h/);
      const m = duration.match(/(\d+)\s*m/);
      return (h ? parseInt(h[1]) : 0) + (m ? parseInt(m[1]) / 60 : 0) || null;
    }

    function taskSlot(due) {
      if (!due?.date) return 'am';
      const dt = due.date.length > 10 ? new Date(due.date) : null;
      return dt && dt.getHours() < 13 ? 'am' : 'pm';
    }

    const byDate = {};
    for (const t of openTasks) {
      const date = t.due?.date?.slice(0, 10) ?? null;
      if (debug) logger.info('todoist:task', { content: t.content, date, project_id: t.project_id, inDateSet: date ? dateSet.has(date) : false });
      if (!date || !dateSet.has(date)) continue;
      const proj = matchProject(t.project_id);
      if (debug) logger.info('todoist:match', { content: t.content, date, matched: proj?.name ?? null });
      if (!proj) continue;
      const hours = parseDurationHours(t.duration);
      if (!hours) continue;
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push({ id: t.id, projectId: proj.id, content: t.content ?? '', hours, slot: taskSlot(t.due), completed: false });
    }
    logger.info('todoist:sync byDate', { dates: Object.keys(byDate), counts: Object.fromEntries(Object.entries(byDate).map(([d, ts]) => [d, ts.length])) });
    return { byDate };
  });

  ipcMain.handle('todoist:importProjects', async () => {
    const enc = q.getSetting('todoist_token_enc');
    if (!enc || !safeStorage.isEncryptionAvailable()) return { error: 'no_token' };
    let token;
    try { token = safeStorage.decryptString(Buffer.from(enc, 'base64')); } catch { return { error: 'no_token' }; }

    const headers = { Authorization: `Bearer ${token}` };
    const projRes = await fetch('https://api.todoist.com/api/v1/projects?limit=200', { headers });
    if (!projRes.ok) return { error: 'api_error', status: projRes.status };
    const projData = await projRes.json();
    const todoistProjects = projData.results ?? projData.projects ?? [];

    return q.importTodoistProjects(todoistProjects);
  });

  ipcMain.handle('app:getDbPath', () => _dbPath);

  ipcMain.handle('app:selectDbFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Seleziona file dati',
      defaultPath: app.getPath('documents'),
      filters: [{ name: 'Database SQLite', extensions: ['db'] }],
      properties: ['openFile', 'createDirectories', 'promptToCreate'],
    });
    if (canceled || !filePaths[0]) return null;
    openDatabase(filePaths[0]);
    return filePaths[0];
  });

  ipcMain.handle('app:saveDbCopy', async () => {
    if (!_dbPath) return null;
    const defaultDir = path.dirname(_dbPath);
    const baseName = path.basename(_dbPath, '.db');
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Salva una copia del database',
      defaultPath: path.join(defaultDir, `${baseName}-copia.db`),
      filters: [{ name: 'Database SQLite', extensions: ['db'] }],
      properties: ['createDirectory'],
    });
    if (canceled || !filePath) return null;
    const finalPath = filePath.endsWith('.db') ? filePath : filePath + '.db';
    fs.copyFileSync(_dbPath, finalPath);
    return finalPath;
  });

  ipcMain.handle('app:createNewDb', async () => {
    const defaultDir = _dbPath ? path.dirname(_dbPath) : app.getPath('documents');
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Crea nuovo database',
      defaultPath: path.join(defaultDir, 'timebox.db'),
      filters: [{ name: 'Database SQLite', extensions: ['db'] }],
      properties: ['createDirectory'],
    });
    if (canceled || !filePath) return null;
    const finalPath = filePath.endsWith('.db') ? filePath : filePath + '.db';
    openDatabase(finalPath);
    return finalPath;
  });
}

process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', { message: err.message, stack: err.stack });
});

process.on('unhandledRejection', (reason) => {
  const normalized = reason instanceof Error
    ? { message: reason.message, stack: reason.stack }
    : { reason };
  logger.error('unhandledRejection', normalized);
});

app.whenReady().then(() => {
  logger.info('app ready', {
    appPath: app.getAppPath(),
    userData: app.getPath('userData'),
    isPackaged: app.isPackaged,
    logFile: logger.file,
  });

  const config = loadConfig();
  const defaultDbPath = path.join(app.getPath('documents'), 'Timebox', 'timebox.db');
  try {
    openDatabase(config.dbPath || defaultDbPath);
  } catch (err) {
    logger.error('openDatabase failed', { message: err.message });
    dialog.showErrorBox(
      'Impossibile aprire il database',
      `Il file dati è bloccato da un altro processo o non è accessibile.\n\n${err.message}\n\nChiudi eventuali altre istanze di Timebox e riavvia l'app.`
    );
    app.quit();
    return;
  }
  setupIpc();

  _httpServer = createHttpServer();
  _httpServer.emitter.on('change', type => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('db:changed', type);
    }
  });
  _httpServer.listen(HTTP_PORT, '127.0.0.1', () => logger.info('HTTP server started', { port: HTTP_PORT }));
  _httpServer.on('error', err => logger.warn('HTTP server error', { message: err.message }));

  if (process.platform === 'darwin') {
    const icon = getAppIcon();
    if (icon) app.dock.setIcon(icon);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  if (_httpServer) _httpServer.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
