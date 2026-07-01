const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Ensure user data directory exists
const userDataPath = path.join(app.getPath('userData'), 'loratrainer');
if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });

// Register IPC handlers
const registerIPC = () => {
  const training = require('./ipc/training');
  training.patchIpcMain(ipcMain);

  require('./ipc/database').register(ipcMain, userDataPath);
  require('./ipc/storage').register(ipcMain, userDataPath);
  require('./ipc/openrouter').register(ipcMain);
  require('./ipc/gpu-provider').register(ipcMain);
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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

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
