// The profile window's only bridge: load what's saved, save what you typed, close. Nothing else.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('profile', {
  load: () => ipcRenderer.invoke('profile:load'),
  save: (data) => ipcRenderer.invoke('profile:save', data),
  close: () => ipcRenderer.send('profile:close'),
});
