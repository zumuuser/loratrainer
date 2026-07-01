const { contextBridge, ipcRenderer } = require('electron');

// Expose safe API to renderer process
contextBridge.exposeInMainWorld('api', {
  // Database
  db: {
    getSetting: (key) => ipcRenderer.invoke('db:getSetting', key),
    setSetting: (key, value) => ipcRenderer.invoke('db:setSetting', key, value),
    getJobs: () => ipcRenderer.invoke('db:getJobs'),
    getJob: (id) => ipcRenderer.invoke('db:getJob', id),
    createJob: (data) => ipcRenderer.invoke('db:createJob', data),
    updateJob: (id, data) => ipcRenderer.invoke('db:updateJob', id, data),
    deleteJob: (id) => ipcRenderer.invoke('db:deleteJob', id),
    getModels: () => ipcRenderer.invoke('db:getModels'),
    getModel: (id) => ipcRenderer.invoke('db:getModel', id),
    deleteModel: (id) => ipcRenderer.invoke('db:deleteModel', id),
    isOnboarded: () => ipcRenderer.invoke('db:isOnboarded'),
  },

  // Storage
  storage: {
    saveImages: (filePaths) => ipcRenderer.invoke('storage:saveImages', filePaths),
    getImagePath: (filename) => ipcRenderer.invoke('storage:getImagePath', filename),
    getModelPath: (filename) => ipcRenderer.invoke('storage:getModelPath', filename),
    openFileDialog: (options) => ipcRenderer.invoke('storage:openFileDialog', options),
    openFolder: (folderPath) => ipcRenderer.invoke('storage:openFolder', folderPath),
  },

  // OpenRouter
  openrouter: {
    caption: (imagePaths, apiKey) => ipcRenderer.invoke('openrouter:caption', imagePaths, apiKey),
    chat: (messages, apiKey) => ipcRenderer.invoke('openrouter:chat', messages, apiKey),
    validateKey: (apiKey) => ipcRenderer.invoke('openrouter:validateKey', apiKey),
  },

  // GPU Provider
  gpu: {
    listGPUs: (provider, apiKey) => ipcRenderer.invoke('gpu:listGPUs', provider, apiKey),
    validateKey: (provider, apiKey) => ipcRenderer.invoke('gpu:validateKey', provider, apiKey),
    suggest: (baseModel) => ipcRenderer.invoke('gpu:suggest', baseModel),
  },

  // Training
  training: {
    start: (jobId) => ipcRenderer.invoke('training:start', jobId),
    stop: (jobId) => ipcRenderer.invoke('training:stop', jobId),
    status: (jobId) => ipcRenderer.invoke('training:status', jobId),
    onProgress: (callback) => ipcRenderer.on('training:progress', (_, data) => callback(data)),
    onComplete: (callback) => ipcRenderer.on('training:complete', (_, data) => callback(data)),
    onError: (callback) => ipcRenderer.on('training:error', (_, data) => callback(data)),
  },
});
