// The only bridge between the UI and the main process. No keys cross it, only results.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dixi', {
  config: () => ipcRenderer.invoke('config:get'),
  groqChat: (body) => ipcRenderer.invoke('groq:chat', body),
  deepgram: {
    open: () => ipcRenderer.invoke('deepgram:open'),
    sendAudio: (chunk) => ipcRenderer.send('deepgram:audio', chunk),
    control: (message) => ipcRenderer.send('deepgram:control', message),
    close: () => ipcRenderer.invoke('deepgram:close'),
    onMessage: (fn) => ipcRenderer.on('deepgram:message', (_e, text) => fn(text)),
    onClosed: (fn) => ipcRenderer.on('deepgram:closed', (_e, code) => fn(code)),
  },
  screenshot: (webContentsId) => ipcRenderer.invoke('tab:screenshot', webContentsId),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  onOpenURL: (fn) => ipcRenderer.on('app:open-url', (_e, url) => fn(url)),
});
