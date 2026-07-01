const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const AdmZip = require('adm-zip');

function register(ipcMain, userDataPath, appUpdatePath) {
  
  // Helper to fetch latest commit SHA
  async function getLatestCommit(token) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: '/repos/zumuuser/loratrainer/commits/main',
        method: 'GET',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'loratrainer-updater'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const json = JSON.parse(data);
              resolve(json.sha);
            } catch (e) {
              reject(new Error('Invalid JSON response from GitHub'));
            }
          } else {
            reject(new Error(`GitHub returned status ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  // Get current SHA
  function getCurrentSHA() {
    // 1. Check database setting
    try {
      const db = ipcMain._db;
      if (db) {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('current_commit_sha');
        if (row) return JSON.parse(row.value);
      }
    } catch (e) {
      console.error('Error fetching commit SHA from database:', e);
    }

    // 2. Check local version.json file
    const versionPath = path.join(__dirname, '..', '..', 'src', 'version.json');
    if (fs.existsSync(versionPath)) {
      try {
        const fileContent = fs.readFileSync(versionPath, 'utf8');
        const json = JSON.parse(fileContent);
        return json.sha;
      } catch (e) {
        console.error('Error reading version.json:', e);
      }
    }

    return 'unknown';
  }

  ipcMain.handle('updater:check', async () => {
    try {
      // Fetch token from db settings or use default
      let token = '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';
      const db = ipcMain._db;
      if (db) {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('github_token');
        if (row) token = JSON.parse(row.value);
      }

      const latestSha = await getLatestCommit(token);
      const currentSha = getCurrentSHA();
      return {
        latestSha,
        currentSha,
        updateAvailable: latestSha !== currentSha
      };
    } catch (err) {
      console.error('Update check failed:', err);
      return { error: err.message };
    }
  });

  ipcMain.handle('updater:perform', async (_, latestSha) => {
    try {
      let token = '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';
      const db = ipcMain._db;
      if (db) {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('github_token');
        if (row) token = JSON.parse(row.value);
      }

      const zipPath = path.join(userDataPath, 'update.zip');
      console.log('Downloading repository zipball...');
      
      // Download zip ball
      await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(zipPath);
        const options = {
          hostname: 'api.github.com',
          path: '/repos/zumuuser/loratrainer/zipball/main',
          method: 'GET',
          headers: {
            'Authorization': `token ${token}`,
            'User-Agent': 'loratrainer-updater'
          }
        };

        function get(urlOptions) {
          https.get(urlOptions, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
              // Handle redirect
              const redirectOptions = new URL(res.headers.location);
              get(redirectOptions);
            } else if (res.statusCode === 200) {
              res.pipe(file);
              file.on('finish', () => {
                file.close();
                resolve();
              });
            } else {
              reject(new Error(`Failed to download zip: status ${res.statusCode}`));
            }
          }).on('error', (err) => {
            fs.unlinkSync(zipPath);
            reject(err);
          });
        }

        get(options);
      });

      console.log('Extracting update zip...');
      const zip = new AdmZip(zipPath);
      const zipEntries = zip.getEntries();
      
      let rootDir = '';
      for (const entry of zipEntries) {
        if (entry.isDirectory && entry.entryName.split('/').length === 2 && entry.entryName.endsWith('/')) {
          rootDir = entry.entryName;
          break;
        }
      }
      if (!rootDir && zipEntries.length > 0) {
        const parts = zipEntries[0].entryName.split('/');
        rootDir = parts[0] + '/';
      }

      if (!rootDir) {
        throw new Error('Could not find root directory in repository zip');
      }

      // Extract entries removing rootDir prefix
      if (!fs.existsSync(appUpdatePath)) {
        fs.mkdirSync(appUpdatePath, { recursive: true });
      }

      for (const entry of zipEntries) {
        if (entry.entryName.startsWith(rootDir) && entry.entryName !== rootDir) {
          const relativePath = entry.entryName.substring(rootDir.length);
          const targetPath = path.join(appUpdatePath, relativePath);
          
          if (entry.isDirectory) {
            fs.mkdirSync(targetPath, { recursive: true });
          } else {
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            fs.writeFileSync(targetPath, entry.getData());
          }
        }
      }

      // Update commit SHA in database
      if (db) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('current_commit_sha', JSON.stringify(latestSha));
      }

      // Cleanup zip file
      try {
        fs.unlinkSync(zipPath);
      } catch (e) {
        console.error('Failed to cleanup update.zip:', e);
      }

      console.log('Update complete, relaunching...');
      app.relaunch();
      app.exit(0);
      return true;
    } catch (err) {
      console.error('Update failed:', err);
      return { error: err.message };
    }
  });
}

module.exports = { register };
