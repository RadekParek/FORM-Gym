const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('gymStore', {
  read: () => ipcRenderer.invoke('store:read'),
  write: (value) => ipcRenderer.invoke('store:write', value),
});
contextBridge.exposeInMainWorld('gymAppearance', {
  set: (appearance) => ipcRenderer.invoke('theme:appearance', appearance),
});
contextBridge.exposeInMainWorld('gymGroups', {
  host: () => ipcRenderer.invoke('groups:host'),
});
