// The only bridge between the UI and the main process. No keys cross it, only results.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dixi', {
  config: () => ipcRenderer.invoke('config:get'),
  llm: (req) => ipcRenderer.invoke('llm:chat', req),
  llmAbort: (id) => ipcRenderer.send('llm:abort', id),
  spend: () => ipcRenderer.invoke('spend:get'),
  resolve: (q) => ipcRenderer.invoke('resolve:site', q),
  registry: {
    names: () => ipcRenderer.invoke('registry:names'),
    all: () => ipcRenderer.invoke('registry:all'),
    lookup: (name) => ipcRenderer.invoke('registry:lookup', name),
    outcome: (host, ok) => ipcRenderer.invoke('registry:outcome', host, ok),
    confirm: (said, hit) => ipcRenderer.invoke('registry:confirm', said, hit),
    template: (host, tpl) => ipcRenderer.invoke('registry:template', host, tpl),
    clear: () => ipcRenderer.invoke('registry:clear'),
  },
  tabExec: (id, code, timeoutMs) => ipcRenderer.invoke('tab:exec', id, code, timeoutMs),
  openSearchTemplate: (url) => ipcRenderer.invoke('tab:opensearch', url),
  preconnect: (url) => ipcRenderer.send('net:preconnect', url),
  catalog: () => ipcRenderer.invoke('catalog:get'),
  trace: (line) => ipcRenderer.send('trace:write', line),
  deepgram: {
    open: (params) => ipcRenderer.invoke('deepgram:open', params),
    sendAudio: (chunk) => ipcRenderer.send('deepgram:audio', chunk),
    control: (message) => ipcRenderer.send('deepgram:control', message),
    close: () => ipcRenderer.invoke('deepgram:close'),
    onMessage: (fn) => ipcRenderer.on('deepgram:message', (_e, text) => fn(text)),
    onClosed: (fn) => ipcRenderer.on('deepgram:closed', (_e, code) => fn(code)),
  },
  screenshot: (webContentsId) => ipcRenderer.invoke('tab:screenshot', webContentsId),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  onOpenURL: (fn) => ipcRenderer.on('app:open-url', (_e, url) => fn(url)),
  onPopup: (fn) => ipcRenderer.on('tab:popup', (_e, url) => fn(url)),
});
