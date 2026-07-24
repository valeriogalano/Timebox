const { app, BrowserWindow, ipcMain, nativeImage, dialog, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { initDb } = require('./db/schema');
const q = require('./db/queries');
const { createHttpServer } = require('./cli/http-server');
const { getDayInsightsData } = require('./cli/commands/day-insights');
const { todoistTaskOrder } = require('./lib/todoist-order');
const { slotForDueValue } = require('./lib/time-slots');
const { setupAutoUpdater } = require('./lib/updater');
const { setupUpdateNotifier } = require('./lib/update-notifier');

function getAppIcon() {
  const fileName = isDev ? 'icon-dev.png' : 'icon.png';
  const img = nativeImage.createFromPath(path.join(__dirname, 'build', fileName));
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
const CLI_CANDIDATES = {
  codex: [
    path.join(app.getPath('home'), '.local', 'bin', 'codex'),
    '/usr/local/bin/codex',
    '/opt/homebrew/bin/codex',
  ],
  claude: [
    path.join(app.getPath('home'), '.local', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
  ],
};

function getToolFileName(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function getToolInstallDir() {
  if (process.platform === 'win32') return path.join(app.getPath('appData'), 'Timebox', 'bin');
  return path.join(app.getPath('home'), '.local', 'bin');
}

function getToolPath(name) {
  return path.join(getToolInstallDir(), getToolFileName(name));
}

function getLegacyToolPath(name) {
  if (process.platform === 'win32') return null;
  return path.join('/usr/local/bin', name);
}

function getMcpBinPath() {
  return getToolPath('timebox-mcp');
}

function decryptTodoistToken() {
  const enc = q.getSetting('todoist_token_enc');
  if (!enc || !safeStorage.isEncryptionAvailable()) return null;
  try { return safeStorage.decryptString(Buffer.from(enc, 'base64')); } catch { return null; }
}

function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysToDateStr(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

function localDateStartIso(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toISOString();
}

function parseTodoistDurationHours(duration) {
  if (!duration) return null;
  if (typeof duration === 'object') {
    if (duration.unit === 'minute') return (duration.amount ?? 0) / 60 || null;
    if (duration.unit === 'day') return (duration.amount ?? 0) * 8 || null;
    return (duration.amount ?? 60) / 60 || null;
  }
  const h = duration.match(/(\d+)\s*h/);
  const m = duration.match(/(\d+)\s*m/);
  return (h ? parseInt(h[1]) : 0) + (m ? parseInt(m[1]) / 60 : 0) || null;
}

function taskDueValue(due) {
  return due?.datetime ?? due?.date ?? null;
}

function taskSlotFromDateTime(dateTime) {
  if (!dateTime) return 'am';
  const date = new Date(dateTime);
  return Number.isNaN(date.getTime()) ? 'am' : (date.getHours() < 12 ? 'am' : 'pm');
}

function taskSlot(due, completedAt) {
  const dueValue = taskDueValue(due);
  if (!dueValue) return taskSlotFromDateTime(completedAt);
  return slotForDueValue(dueValue);
}

function taskLabels(task) {
  if (Array.isArray(task.labels)) return task.labels;
  if (Array.isArray(task.label_names)) return task.label_names;
  if (Array.isArray(task.labelNames)) return task.labelNames;
  return [];
}

async function fetchTodoistProjects(headers) {
  const projRes = await fetch('https://api.todoist.com/api/v1/projects?limit=200', { headers });
  if (!projRes.ok) return { error: 'api_error', status: projRes.status, projects: [] };
  const projData = await projRes.json();
  return { projects: projData.results ?? projData.projects ?? [] };
}

function getToolInstallInfo() {
  return {
    platform: process.platform,
    installDir: getToolInstallDir(),
    cliPath: getToolPath('timebox'),
    mcpPath: getMcpBinPath(),
    pathHint: process.platform === 'win32'
      ? `%APPDATA%\\Timebox\\bin`
      : '~/.local/bin',
  };
}

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
  // Dev/test runs share the packaged app's userData/config.json (same app
  // name), so never persist the dev DB path there or the next production
  // launch would pick it up.
  if (!isDev) saveConfig({ dbPath });
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
    // macOS-first: keep native traffic lights, drop the system title bar.
    // The renderer paints its own header/data area and makes it draggable.
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
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

  return win;
}

function sh(s) { return "'" + s.replace(/'/g, "'\\''") + "'"; }

function installTool(src, dest) {
  return new Promise(resolve => {
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      try { fs.unlinkSync(dest); } catch (_) {}

      if (process.platform === 'win32') {
        const body = `@echo off\r\nnode "${src}" %*\r\n`;
        fs.writeFileSync(dest, body, 'utf8');
      } else {
        const body = `#!/bin/sh\nexec node ${sh(src)} "$@"\n`;
        fs.writeFileSync(dest, body, { encoding: 'utf8', mode: 0o755 });
        fs.chmodSync(dest, 0o755);
      }
      return resolve({ ok: true });
    } catch (err) {
      resolve({ error: err.message });
    }
  });
}

function runCommand(command, args, options = {}) {
  return new Promise(resolve => {
    execFile(command, args, { timeout: 15000, ...options }, (error, stdout = '', stderr = '') => {
      if (error) return resolve({ ok: false, error, stdout, stderr });
      resolve({ ok: true, stdout, stderr });
    });
  });
}

async function resolveCommandBinary(command) {
  const candidates = CLI_CANDIDATES[command] ?? [];
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {}
  }

  const lookup = await runCommand('/bin/zsh', ['-lic', `command -v ${command}`]);
  if (lookup.ok) {
    const resolved = (lookup.stdout || '').trim().split('\n').find(Boolean);
    if (resolved) return resolved;
  }
  return command;
}

function getMcpServerSource() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'timebox-mcp')
    : path.join(__dirname, 'cli', 'mcp-server.js');
}

async function ensureMcpServerInstalled() {
  const dest = getMcpBinPath();
  const result = await installTool(getMcpServerSource(), dest);
  if (!result.ok) return result;
  try {
    const real = fs.realpathSync(dest);
    fs.accessSync(real, fs.constants.X_OK);
    return { ok: true, path: dest };
  } catch (e) {
    return { error: `Comando creato ma non eseguibile: ${e.message}` };
  }
}

function formatCommandFailure(command, args, result) {
  const detail = [result?.stderr, result?.stdout, result?.error?.message]
    .map(v => (v || '').trim())
    .find(Boolean);
  return `Comando non riuscito: ${command} ${args.join(' ')}${detail ? `\n${detail}` : ''}`;
}

async function isMcpConfiguredViaCommand(command, args) {
  const bin = await resolveCommandBinary(command);
  const result = await runCommand(bin, args);
  return result.ok;
}

async function configureMcpViaCommand(command, addArgs, checkArgs) {
  const install = await ensureMcpServerInstalled();
  if (!install.ok) return install;

  const bin = await resolveCommandBinary(command);

  if (await isMcpConfiguredViaCommand(command, checkArgs)) return { ok: true };

  const addResult = await runCommand(bin, addArgs);
  if (!addResult.ok && !(await isMcpConfiguredViaCommand(command, checkArgs))) {
    return { error: formatCommandFailure(bin, addArgs, addResult) };
  }

  if (await isMcpConfiguredViaCommand(command, checkArgs)) return { ok: true };
  return { error: `Configurazione ${command} completata ma verifica finale non riuscita.` };
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
  ipcMain.handle('db:deleteRecurring',         (_, id)     => q.deleteRecurring(id));
  ipcMain.handle('db:deleteRecurringByClient', (_, cid)   => q.deleteRecurringByClient(cid));

  ipcMain.handle('db:getEntries',          (_, from, to)   => q.getEntries(from, to));
  ipcMain.handle('db:getProjectTotals',    ()              => q.getProjectTotals());
  ipcMain.handle('db:saveEntry',           (_, e)          => q.saveEntry(e));
  ipcMain.handle('db:deleteEntry',         (_, id)         => q.deleteEntry(id));

  ipcMain.handle('db:getWeekOverrides',      (_, wk)         => q.getWeekOverrides(wk));
  ipcMain.handle('db:getWeekOverridesRange', (_, f, t)       => q.getWeekOverridesRange(f, t));
  ipcMain.handle('db:saveWeekOverride',    (_, o)          => q.saveWeekOverride(o));
  ipcMain.handle('db:deleteWeekOverride',  (_, wk, di, sl) => q.deleteWeekOverride(wk, di, sl));
  ipcMain.handle('db:getWeekAreaStatuses', (_, wk)         => q.getWeekAreaStatuses(wk));
  ipcMain.handle('db:saveWeekAreaStatus',  (_, s)          => q.saveWeekAreaStatus(s));
  ipcMain.handle('db:freezeWeeksBeforeRecurringChange', (_, r) => q.freezeWeeksBeforeRecurringChange(r));

  ipcMain.handle('db:resetAllData',        ()              => q.resetAllData());
  ipcMain.handle('db:seedDemoData',        ()              => q.seedDemoData());

  ipcMain.handle('app:getHttpPort', () => HTTP_PORT);
  ipcMain.handle('app:getToolInstallInfo', () => getToolInstallInfo());

  ipcMain.handle('app:checkCliInstalled', () => {
    return [getToolPath('timebox'), getLegacyToolPath('timebox')]
      .filter(Boolean)
      .some(candidate => {
        try {
          const real = fs.realpathSync(candidate);
          fs.accessSync(real, fs.constants.X_OK);
          return true;
        } catch { return false; }
      });
  });

  ipcMain.handle('app:installCli', async () => {
    const src = app.isPackaged
      ? path.join(process.resourcesPath, 'timebox')
      : path.join(__dirname, 'cli', 'standalone.js');
    const dest = getToolPath('timebox');
    const result = await installTool(src, dest);
    if (!result.ok) return result;
    try {
      const real = fs.realpathSync(dest);
      fs.accessSync(real, fs.constants.X_OK);
      return { ok: true, path: dest };
    } catch (e) {
      return { error: `Comando creato ma non eseguibile: ${e.message}` };
    }
  });

  ipcMain.handle('app:checkMcpServerInstalled', () => {
    return [getMcpBinPath(), getLegacyToolPath('timebox-mcp')]
      .filter(Boolean)
      .some(candidate => {
        try {
          const real = fs.realpathSync(candidate);
          fs.accessSync(real, fs.constants.X_OK);
          return true;
        } catch { return false; }
      });
  });

  ipcMain.handle('app:installMcpServer', async () => {
    return ensureMcpServerInstalled();
  });

  ipcMain.handle('app:checkMcpCodexInstalled', async () => {
    return isMcpConfiguredViaCommand('codex', ['mcp', 'get', 'timebox']);
  });

  ipcMain.handle('app:installMcpCodex', async () => {
    return configureMcpViaCommand(
      'codex',
      ['mcp', 'add', 'timebox', '--', getMcpBinPath()],
      ['mcp', 'get', 'timebox'],
    );
  });

  ipcMain.handle('app:checkMcpClaudeCodeInstalled', async () => {
    return isMcpConfiguredViaCommand('claude', ['mcp', 'get', 'timebox']);
  });

  ipcMain.handle('app:installMcpClaudeCode', async () => {
    return configureMcpViaCommand(
      'claude',
      ['mcp', 'add', '-s', 'user', 'timebox', '--', getMcpBinPath()],
      ['mcp', 'get', 'timebox'],
    );
  });

  ipcMain.handle('app:checkMcpDesktopInstalled', () => {
    if (process.platform !== 'darwin') return false;
    const configPath = path.join(app.getPath('home'), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const cmd = cfg?.mcpServers?.timebox?.command;
      if (!cmd) return false;
      const real = fs.realpathSync(cmd);
      fs.accessSync(real, fs.constants.X_OK);
      return true;
    } catch { return false; }
  });

  ipcMain.handle('app:installMcpDesktop', async () => {
    if (process.platform !== 'darwin') {
      return { error: 'La configurazione automatica di Claude Desktop è disponibile solo su macOS.' };
    }
    const src = app.isPackaged
      ? path.join(process.resourcesPath, 'timebox-mcp')
      : path.join(__dirname, 'cli', 'mcp-server.js');
    const symlink = await installTool(src, getMcpBinPath());
    if (!symlink.ok) return symlink;
    const configPath = path.join(app.getPath('home'), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    try {
      let cfg = {};
      try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
      if (!cfg.mcpServers) cfg.mcpServers = {};
      cfg.mcpServers.timebox = { command: getMcpBinPath() };
      fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
      return { ok: true };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('settings:getTodoistToken', () => {
    const enc = q.getSetting('todoist_token_enc');
    if (!enc || !safeStorage.isEncryptionAvailable()) return '';
    try { return safeStorage.decryptString(Buffer.from(enc, 'base64')); } catch { return ''; }
  });

  ipcMain.handle('settings:setTodoistToken', (_, token) => {
    if (!safeStorage.isEncryptionAvailable()) {
      return { error: 'Archiviazione sicura non disponibile su questo sistema: token non salvato.' };
    }
    const enc = safeStorage.encryptString(token);
    q.setSetting('todoist_token_enc', enc.toString('base64'));
    return { ok: true };
  });

  ipcMain.handle('settings:get', (_, key) => q.getSetting(key));
  ipcMain.handle('settings:set', (_, key, value) => {
    q.setSetting(key, value);
    return { ok: true };
  });

  ipcMain.handle('db:getTodoistCache',     (_, dates)               => q.getTodoistCache(dates));
  ipcMain.handle('db:setTodoistCache',     (_, dateStr, tasks, syncedAt) => q.setTodoistCache(dateStr, tasks, syncedAt));
  ipcMain.handle('db:getAllTodoistCache',  ()                       => q.getAllTodoistCache());
  ipcMain.handle('db:getTodoistImports',   (_, from, to)             => q.getTodoistImports(from, to));
  ipcMain.handle('db:saveTodoistImport',   (_, todoistImport)        => q.saveTodoistImport(todoistImport));
  ipcMain.handle('db:updateTodoistImport', (_, todoistImport)        => q.updateTodoistImport(todoistImport));
  ipcMain.handle('db:deleteTodoistImport', (_, todoistTaskId)        => q.deleteTodoistImport(todoistTaskId));
  ipcMain.handle('db:importCompletedTodoistTasks', (_, imports)      => q.importCompletedTodoistTasks(imports));
  ipcMain.handle('db:getDayInsights',       (_, date)                 => getDayInsightsData(date || formatLocalDate(new Date())));

  ipcMain.handle('todoist:sync', async (_, timboxProjects, dates, debug) => {
    const token = decryptTodoistToken();
    if (!token) return { error: 'no_token' };

    const headers = { Authorization: `Bearer ${token}` };
    const dateSet = new Set(dates);

    if (debug) logger.info('todoist:sync token_len', { len: token.length });
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

    const projectsResult = await fetchTodoistProjects(headers);
    const todoistProjects = projectsResult.projects;

    logger.info('todoist:sync tasks', { open: openTasks.length, projects: todoistProjects.length });

    function matchProject(todoistProjectId) {
      const tp = todoistProjects.find(p => p.id === todoistProjectId);
      if (!tp) return null;
      return timboxProjects.find(p => p.name === tp.name) ?? null;
    }

    const byDate = {};
    for (const t of openTasks) {
      const date = t.due?.date?.slice(0, 10) ?? null;
      if (debug) logger.info('todoist:task', { content: t.content, date, project_id: t.project_id, inDateSet: date ? dateSet.has(date) : false });
      if (!date || !dateSet.has(date)) continue;
      const proj = matchProject(t.project_id);
      if (debug) logger.info('todoist:match', { content: t.content, date, matched: proj?.name ?? null });
      if (!proj) continue;
      const todoistProject = todoistProjects.find(project => project.id === t.project_id) ?? null;
      // A task without a specific due time isn't placed in a slot, so its duration
      // (if any survives on the Todoist side) must not count toward block capacity.
      // API v1 carries the time inside `due.date` ("YYYY-MM-DDTHH:MM:SS"); older
      // payloads had a separate `due.datetime`. Accept both shapes.
      const hasDueTime = Boolean(t.due?.datetime)
        || (typeof t.due?.date === 'string' && t.due.date.includes('T'));
      const hours = hasDueTime ? parseTodoistDurationHours(t.duration) : null;
      if (!hours) continue;
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push({
        id: t.id,
        title: t.content ?? '',
        projectId: proj.id,
        todoistProjectName: todoistProject?.name ?? null,
        timeboxProjectName: proj.name,
        content: t.content ?? '',
        labels: taskLabels(t),
        hours,
        estimatedHours: hours,
        slot: taskSlot(t.due),
        dueDate: taskDueValue(t.due),
        dayOrder: t.day_order ?? null,
        childOrder: t.child_order ?? null,
        order: t.order ?? null,
        matchStatus: 'matched',
        completed: false,
      });
    }
    for (const date of Object.keys(byDate)) byDate[date].sort(todoistTaskOrder);
    logger.info('todoist:sync byDate', { dates: Object.keys(byDate), counts: Object.fromEntries(Object.entries(byDate).map(([d, ts]) => [d, ts.length])) });
    return { byDate };
  });

  ipcMain.handle('todoist:getCompletedTasks', async (_, timboxProjects, dates, debug) => {
    const token = decryptTodoistToken();
    if (!token) return { error: 'no_token' };
    if (!dates || dates.length === 0) return { tasks: [] };

    const headers = { Authorization: `Bearer ${token}` };
    const sortedDates = [...dates].sort();
    const dateSet = new Set(sortedDates);
    const since = localDateStartIso(sortedDates[0]);
    const until = localDateStartIso(addDaysToDateStr(sortedDates[sortedDates.length - 1], 1));

    logger.info('todoist:completed dates', { dates: sortedDates, since, until });

    const completedTasks = [];
    let cursor = null;
    do {
      const params = new URLSearchParams({ since, until, limit: '200' });
      if (cursor) params.set('cursor', cursor);
      const url = `https://api.todoist.com/api/v1/tasks/completed/by_completion_date?${params}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        logger.info('todoist:completed error', { status: res.status });
        return { error: 'api_error', status: res.status };
      }
      const data = await res.json();
      completedTasks.push(...(data.items ?? data.results ?? data.tasks ?? []));
      cursor = data.next_cursor ?? null;
    } while (cursor);

    const projectsResult = await fetchTodoistProjects(headers);
    if (projectsResult.error) return { error: projectsResult.error, status: projectsResult.status };
    const todoistProjects = projectsResult.projects;
    const importedIds = new Set(q.getTodoistImportIds(completedTasks.map(task => task.id)));

    function matchProject(todoistProjectId) {
      const tp = todoistProjects.find(p => p.id === todoistProjectId);
      if (!tp) return null;
      return timboxProjects.find(p => p.name === tp.name) ?? null;
    }

    const tasks = [];
    for (const t of completedTasks) {
      if (!t.id || importedIds.has(t.id)) continue;
      const completedAt = t.completed_at ?? t.completedAt ?? null;
      if (!completedAt) continue;
      const date = formatLocalDate(new Date(completedAt));
      if (!dateSet.has(date)) continue;
      const proj = matchProject(t.project_id);
      if (debug) logger.info('todoist:completed match', { content: t.content, date, matched: proj?.name ?? null });
      if (!proj) continue;
      const todoistProject = todoistProjects.find(project => project.id === t.project_id) ?? null;
      const hours = parseTodoistDurationHours(t.duration);
      tasks.push({
        id: t.id,
        title: t.content ?? '',
        content: t.content ?? '',
        projectId: proj.id,
        todoistProjectName: todoistProject?.name ?? null,
        timeboxProjectName: proj.name,
        labels: taskLabels(t),
        hours,
        estimatedHours: hours,
        slot: taskSlot(t.due, completedAt),
        dueDate: taskDueValue(t.due),
        completedAt,
        completedDate: date,
        dayOrder: t.day_order ?? null,
        childOrder: t.child_order ?? null,
        order: t.order ?? null,
        matchStatus: 'matched',
        completed: true,
      });
    }

    tasks.sort((a, b) => a.completedDate.localeCompare(b.completedDate) || todoistTaskOrder(a, b));
    logger.info('todoist:completed tasks', { fetched: completedTasks.length, candidates: tasks.length });
    return { tasks };
  });

  ipcMain.handle('todoist:importProjects', async () => {
    const token = decryptTodoistToken();
    if (!token) return { error: 'no_token' };

    const headers = { Authorization: `Bearer ${token}` };
    const projectsResult = await fetchTodoistProjects(headers);
    if (projectsResult.error) return { error: projectsResult.error, status: projectsResult.status };
    const todoistProjects = projectsResult.projects;

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
  const defaultDbPath = path.join(app.getPath('userData'), 'timebox.db');
  // In dev the app runs as the unsigned node_modules Electron binary, which
  // lacks the installed app's TCC grant for ~/Documents. Use a dev-only DB in
  // userData so dev never touches the TCC-protected (config.dbPath) location.
  const dbPath = isDev
    ? path.join(app.getPath('userData'), 'timebox-dev.db')
    : (config.dbPath || defaultDbPath);
  try {
    openDatabase(dbPath);
  } catch (err) {
    logger.error('openDatabase failed', { message: err.message });
    dialog.showErrorBox(
      'Impossibile aprire il database',
      `Non è stato possibile aprire il file dati:\n${dbPath}\n\n${err.message}\n\nCause possibili: un'altra istanza di Timebox lo tiene aperto, oppure l'app non ha il permesso di accedere alla cartella (es. Documenti o iCloud in macOS → Impostazioni → Privacy).`
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

  const mainWindow = createWindow();
  // macOS auto-update via electron-updater (Squirrel.Mac) requires a valid
  // Apple Developer ID signature; an unsigned/ad-hoc build can never update in
  // place there. Fall back to a notifier that points the user at the download
  // page. Windows (NSIS) and Linux (AppImage) update natively without signing.
  if (process.platform === 'darwin') {
    setupUpdateNotifier({ app, ipcMain, logger, mainWindow });
  } else {
    setupAutoUpdater({ app, ipcMain, logger, mainWindow });
  }

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
