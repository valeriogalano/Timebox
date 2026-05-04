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
  deleteRecurring:    (id)         => ipcRenderer.invoke('db:deleteRecurring', id),

  getEntries:         (from, to)   => ipcRenderer.invoke('db:getEntries', from, to),
  saveEntry:          (e)          => ipcRenderer.invoke('db:saveEntry', e),
  deleteEntry:        (id)         => ipcRenderer.invoke('db:deleteEntry', id),

  getWeekOverrides:   (wk)         => ipcRenderer.invoke('db:getWeekOverrides', wk),
  saveWeekOverride:   (o)          => ipcRenderer.invoke('db:saveWeekOverride', o),
  deleteWeekOverride: (wk, di, sl) => ipcRenderer.invoke('db:deleteWeekOverride', wk, di, sl),

  resetAllData:       ()           => ipcRenderer.invoke('db:resetAllData'),
  seedDemoData:       ()           => ipcRenderer.invoke('db:seedDemoData'),

  getDbPath:          ()           => ipcRenderer.invoke('app:getDbPath'),
  selectDbFile:       ()           => ipcRenderer.invoke('app:selectDbFile'),
  createNewDb:        ()           => ipcRenderer.invoke('app:createNewDb'),
  saveDbCopy:         ()           => ipcRenderer.invoke('app:saveDbCopy'),
});
