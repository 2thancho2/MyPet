const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  onSettings: (cb) => ipcRenderer.on('settings:changed', (_e, s) => cb(s)),
  ignoreMouse: (v) => ipcRenderer.send('ignore-mouse', v),
  sendNote: (petId, text) => ipcRenderer.send('note:send', petId, text),
  onNote: (cb) => ipcRenderer.on('note', (_e, id, t) => cb(id, t)),
  openSettings: () => ipcRenderer.send('open-settings'),
  quit: () => ipcRenderer.send('quit'),
  getInfo: () => ipcRenderer.invoke('info:get'),
  convertImage: (buf, name) => ipcRenderer.invoke('image:convert', buf, name),
});
