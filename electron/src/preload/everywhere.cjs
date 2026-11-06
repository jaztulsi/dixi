// The overlay's only bridge: it receives what to draw and sends back a click on the approval card.
const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = new Set(['ew:state', 'ew:marks', 'ew:cursor', 'ew:card', 'ew:speaking', 'ew:prefs', 'ew:notch', 'ew:level']);
contextBridge.exposeInMainWorld('ew', {
  on: (channel, fn) => { if (CHANNELS.has(channel)) ipcRenderer.on(channel, (_e, data) => fn(data)); },
  approve: (id, ok) => ipcRenderer.send('ew:approve', id, ok),
  stop: () => ipcRenderer.send('ew:stop'),   // ponytail: unused by the island; kept
  undo: () => ipcRenderer.send('ew:undo'),
  mouse: (inside) => ipcRenderer.send('ew:mouse', inside),
});
