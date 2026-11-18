const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scenaNative', {
  list: () => ipcRenderer.invoke('lib:list'),
  load: (id) => ipcRenderer.invoke('lib:load', id),
  save: (doc) => ipcRenderer.invoke('lib:save', doc),
  saveSync: (doc) => ipcRenderer.sendSync('lib:saveSync', doc),
  remove: (id) => ipcRenderer.invoke('lib:remove', id),
  openFolder: () => ipcRenderer.invoke('lib:openFolder'),
  saveFile: (opts) => ipcRenderer.invoke('file:save', opts),
  printPDF: (opts) => ipcRenderer.invoke('file:pdf', opts),
  version: () => ipcRenderer.invoke('app:version'),
  checkUpdate: () => ipcRenderer.invoke('app:check'),
  restart: () => ipcRenderer.invoke('app:restart'),
  onUpdate: (cb) => ipcRenderer.on('update-ready', (e, info) => cb(info)),
  onAddNote: (cb) => ipcRenderer.on('ctx-add-note', () => cb()),
  onTag: (cb) => ipcRenderer.on('ctx-tag', (e, k) => cb(k)),
  setTagMenu: (list) => ipcRenderer.send('ctx-cats', list)
});
