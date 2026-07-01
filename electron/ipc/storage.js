const path = require('path');
const fs = require('fs');
const { dialog, shell } = require('electron');

function register(ipcMain, userDataPath) {
  const imgDir = path.join(userDataPath, 'datasets');
  const modelDir = path.join(userDataPath, 'models');
  [imgDir, modelDir].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

  ipcMain.handle('storage:saveImages', async (_, filePaths) => {
    const saved = [];
    for (const fp of filePaths) {
      const fname = `${Date.now()}_${path.basename(fp)}`;
      const dest = path.join(imgDir, fname);
      fs.copyFileSync(fp, dest);
      saved.push({ original: fp, saved: dest, filename: fname });
    }
    return saved;
  });

  ipcMain.handle('storage:getImagePath', (_, filename) => path.join(imgDir, filename));
  ipcMain.handle('storage:getModelPath', (_, filename) => path.join(modelDir, filename));

  ipcMain.handle('storage:openFileDialog', async (_, options) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      ...options,
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('storage:openFolder', (_, folderPath) => {
    shell.openPath(folderPath);
  });
}

module.exports = { register };
