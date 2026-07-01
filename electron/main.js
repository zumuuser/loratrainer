const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Ensure user data directory exists
const userDataPath = path.join(app.getPath('userData'), 'loratrainer');
if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });

const appUpdatePath = path.join(userDataPath, 'app');

// Allow OTA updates to resolve native dependencies from the original packaged app asar
const Module = require('module');
if (Module.globalPaths) {
  const appNodeModules = path.join(app.getAppPath(), 'node_modules');
  if (!Module.globalPaths.includes(appNodeModules)) {
    Module.globalPaths.push(appNodeModules);
  }
}

let bootPath = __dirname;
let htmlPath = path.join(__dirname, '..', 'src', 'index.html');
let preloadPath = path.join(__dirname, 'preload.js');

if (fs.existsSync(path.join(appUpdatePath, 'src', 'index.html'))) {
  console.log('Booting from user-data update directory:', appUpdatePath);
  bootPath = path.join(appUpdatePath, 'electron');
  htmlPath = path.join(appUpdatePath, 'src', 'index.html');
  preloadPath = path.join(appUpdatePath, 'electron', 'preload.js');
}

// Register IPC handlers
const registerIPC = () => {
  const trainingPath = path.join(bootPath, 'ipc', 'training');
  const training = require(trainingPath);
  training.patchIpcMain(ipcMain);

  require(path.join(bootPath, 'ipc', 'database')).register(ipcMain, userDataPath);
  require(path.join(bootPath, 'ipc', 'storage')).register(ipcMain, userDataPath);
  require(path.join(bootPath, 'ipc', 'openrouter')).register(ipcMain);
  require(path.join(bootPath, 'ipc', 'gpu-provider')).register(ipcMain);
  require(path.join(bootPath, 'ipc', 'updater')).register(ipcMain, userDataPath, appUpdatePath);
  training.register(ipcMain, userDataPath);
};

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'LoRA Trainer',
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(htmlPath);

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  registerIPC();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
