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
      const ext = path.extname(fp).toLowerCase();
      if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
        continue; // skip text/json files themselves, they are read as companions
      }

      const fname = `${Date.now()}_${path.basename(fp)}`;
      const dest = path.join(imgDir, fname);
      fs.copyFileSync(fp, dest);

      // Check for matching caption file in the same directory
      let caption = '';
      const baseNoExt = fp.slice(0, -ext.length);
      const txtPath = baseNoExt + '.txt';
      const jsonPath = baseNoExt + '.json';

      if (fs.existsSync(txtPath)) {
        try {
          caption = fs.readFileSync(txtPath, 'utf8').trim();
        } catch {}
      } else if (fs.existsSync(jsonPath)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
          if (typeof parsed === 'string') {
            caption = parsed;
          } else if (parsed && typeof parsed === 'object') {
            caption = parsed.caption || parsed.tags || parsed.description || parsed.text || '';
            if (Array.isArray(caption)) caption = caption.join(', ');
          }
        } catch {}
      }

      saved.push({ original: fp, saved: dest, filename: fname, caption });
    }
    return saved;
  });

  ipcMain.handle('storage:getImagePath', (_, filename) => path.join(imgDir, filename));
  ipcMain.handle('storage:getModelPath', (_, filename) => path.join(modelDir, filename));

  ipcMain.handle('storage:openFileDialog', async (_, options) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images & Captions', extensions: ['jpg', 'jpeg', 'png', 'webp', 'txt', 'json'] }
      ],
      ...options,
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('storage:openFolder', (_, filePath) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle('storage:downloadFile', async (event, { url, destPath }) => {
    const httpLib = url.startsWith('https') ? require('https') : require('http');
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath);
      httpLib.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: status ${response.statusCode}`));
          return;
        }
        const totalSize = parseInt(response.headers['content-length'], 10) || 0;
        let downloaded = 0;

        response.on('data', (chunk) => {
          downloaded += chunk.length;
          file.write(chunk);
          if (totalSize > 0) {
            event.sender.send('storage:downloadProgress', {
              url,
              progress: (downloaded / totalSize) * 100
            });
          }
        });

        response.on('end', () => {
          file.end();
          resolve(true);
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });
  });
}

module.exports = { register };
