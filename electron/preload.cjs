const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wpBridge', {
  getFolder: () => ipcRenderer.invoke('project:getFolder'),
  pickFolder: () => ipcRenderer.invoke('project:pickFolder'),
  pickFile: () => ipcRenderer.invoke('project:pickFile'),
  pickBib: () => ipcRenderer.invoke('project:pickBib'),
  readFile: (filePath) => ipcRenderer.invoke('project:readFile', filePath),
  readFolder: (folder) => ipcRenderer.invoke('project:readFolder', folder),
  writeContent: (payload) => ipcRenderer.invoke('project:writeContent', payload),
  writeStyles: (payload) => ipcRenderer.invoke('project:writeStyles', payload),
  writeFolder: (payload) => ipcRenderer.invoke('project:writeFolder', payload),
  saveBuiltHtml: (payload) => ipcRenderer.invoke('project:saveBuiltHtml', payload),
  readBuiltHtml: (folder) => ipcRenderer.invoke('project:readBuiltHtml', folder),
  openBuiltHtml: (folder) => ipcRenderer.invoke('project:openBuiltHtml', folder),
  onProjectChanged: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('project:changed', handler);
    return () => ipcRenderer.removeListener('project:changed', handler);
  },
});
