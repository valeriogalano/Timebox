const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getClients:         ()           => ipcRenderer.invoke('db:getClients'),
  saveClient:         (c)          => ipcRenderer.invoke('db:saveClient', c),
  deleteClient:       (id)         => ipcRenderer.invoke('db:deleteClient', id),

  getProjects:        ()           => ipcRenderer.invoke('db:getProjects'),
  saveProject:        (p)          => ipcRenderer.invoke('db:saveProject', p),
  deleteProject:      (id)         => ipcRenderer.invoke('db:deleteProject', id),

  getRecurring:       ()           => ipcRenderer.invoke('db:getRecurring'),
  saveRecurring:      (r)          => ipcRenderer.invoke('db:saveRecurring', r),
  deleteRecurring:          (id)   => ipcRenderer.invoke('db:deleteRecurring', id),
  deleteRecurringByClient:  (cid)  => ipcRenderer.invoke('db:deleteRecurringByClient', cid),

  getEntries:         (from, to)   => ipcRenderer.invoke('db:getEntries', from, to),
  getProjectTotals:   ()           => ipcRenderer.invoke('db:getProjectTotals'),
  saveEntry:          (e)          => ipcRenderer.invoke('db:saveEntry', e),
  deleteEntry:        (id)         => ipcRenderer.invoke('db:deleteEntry', id),

  getWeekOverrides:      (wk)         => ipcRenderer.invoke('db:getWeekOverrides', wk),
  getWeekOverridesRange: (f, t)       => ipcRenderer.invoke('db:getWeekOverridesRange', f, t),
  saveWeekOverride:   (o)          => ipcRenderer.invoke('db:saveWeekOverride', o),
  deleteWeekOverride: (wk, di, sl) => ipcRenderer.invoke('db:deleteWeekOverride', wk, di, sl),
  freezeWeeksBeforeRecurringChange: (r) => ipcRenderer.invoke('db:freezeWeeksBeforeRecurringChange', r),

  resetAllData:       ()           => ipcRenderer.invoke('db:resetAllData'),
  seedDemoData:       ()           => ipcRenderer.invoke('db:seedDemoData'),

  getDbPath:          ()           => ipcRenderer.invoke('app:getDbPath'),
  selectDbFile:       ()           => ipcRenderer.invoke('app:selectDbFile'),
  createNewDb:        ()           => ipcRenderer.invoke('app:createNewDb'),
  saveDbCopy:         ()           => ipcRenderer.invoke('app:saveDbCopy'),

  getTodoistToken:    ()                          => ipcRenderer.invoke('settings:getTodoistToken'),
  setTodoistToken:    (token)                     => ipcRenderer.invoke('settings:setTodoistToken', token),
  getTodoistCache:    (dates)                     => ipcRenderer.invoke('db:getTodoistCache', dates),
  getAllTodoistCache: ()                           => ipcRenderer.invoke('db:getAllTodoistCache'),
  setTodoistCache:    (dateStr, tasks, syncedAt)  => ipcRenderer.invoke('db:setTodoistCache', dateStr, tasks, syncedAt),
  syncTodoist:        (projects, dates, debug)      => ipcRenderer.invoke('todoist:sync', projects, dates, debug),
  importTodoistProjects: ()                         => ipcRenderer.invoke('todoist:importProjects'),

  getHttpPort:            ()  => ipcRenderer.invoke('app:getHttpPort'),
  checkCliInstalled:      ()  => ipcRenderer.invoke('app:checkCliInstalled'),
  installCli:             ()  => ipcRenderer.invoke('app:installCli'),
  checkMcpServerInstalled: () => ipcRenderer.invoke('app:checkMcpServerInstalled'),
  installMcpServer:       ()  => ipcRenderer.invoke('app:installMcpServer'),
  checkMcpCodexInstalled: () => ipcRenderer.invoke('app:checkMcpCodexInstalled'),
  installMcpCodex:        ()  => ipcRenderer.invoke('app:installMcpCodex'),
  checkMcpDesktopInstalled: () => ipcRenderer.invoke('app:checkMcpDesktopInstalled'),
  installMcpDesktop:      ()  => ipcRenderer.invoke('app:installMcpDesktop'),
  checkMcpClaudeCodeInstalled: () => ipcRenderer.invoke('app:checkMcpClaudeCodeInstalled'),
  installMcpClaudeCode:   ()  => ipcRenderer.invoke('app:installMcpClaudeCode'),
  getUpdateStatus:        ()  => ipcRenderer.invoke('app:getUpdateStatus'),
  checkForUpdates:        ()  => ipcRenderer.invoke('app:checkForUpdates'),
  installUpdate:          ()  => ipcRenderer.invoke('app:installUpdate'),

  onDbChanged: (cb) => {
    const handler = (_, type) => cb(type);
    ipcRenderer.on('db:changed', handler);
    return () => ipcRenderer.removeListener('db:changed', handler);
  },
});
