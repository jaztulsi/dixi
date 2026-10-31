// The dashboard window's only bridge: read the state, save your commands, try one, change a setting.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('dash', {
  get: () => ipcRenderer.invoke('dash:get'),
  saveCommands: (list) => ipcRenderer.invoke('dash:save', list),
  testCommand: (cmd) => ipcRenderer.invoke('dash:test', cmd),
  apps: () => ipcRenderer.invoke('dash:apps'),
  deleteSkill: (name) => ipcRenderer.invoke('dash:skill:delete', name),
  set: (key, value) => ipcRenderer.invoke('dash:set', key, value),
  open: (what) => ipcRenderer.send('dash:open', what),
  onChange: (fn) => ipcRenderer.on('dash:changed', (_e, state) => fn(state)),
});
