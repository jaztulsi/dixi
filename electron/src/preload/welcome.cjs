// The first-run window's only bridge: which permissions are on, open one, say a line, finish.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('welcome', {
  status: () => ipcRenderer.invoke('welcome:status'),
  open: (pane) => ipcRenderer.invoke('welcome:open', pane),
  say: (text) => ipcRenderer.send('welcome:say', text),
  done: () => ipcRenderer.send('welcome:done'),
});
