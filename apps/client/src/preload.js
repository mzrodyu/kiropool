const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kiropool', {
  getState: () => ipcRenderer.invoke('state:get'),
  setState: (patch) => ipcRenderer.invoke('state:set', patch),
  login: (payload) => ipcRenderer.invoke('lease:login', payload),
  startLease: (payload) => ipcRenderer.invoke('lease:start', payload),
  heartbeat: () => ipcRenderer.invoke('lease:heartbeat'),
  stopLease: () => ipcRenderer.invoke('lease:stop'),
  importCredential: (payload) => ipcRenderer.invoke('credential:import', payload),
  pickKiroExe: () => ipcRenderer.invoke('kiro:pickExe')
});
