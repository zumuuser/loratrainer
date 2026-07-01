const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db;

function init(userDataPath) {
  const dbPath = path.join(userDataPath, 'loratrainer.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run schema
  const schema = fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf8');
  db.exec(schema);
  return db;
}

function register(ipcMain, userDataPath) {
  init(userDataPath);
  ipcMain._db = db;

  ipcMain.handle('db:getSetting', (_, key) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : null;
  });

  ipcMain.handle('db:setSetting', (_, key, value) => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value));
    return true;
  });

  ipcMain.handle('db:isOnboarded', () => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('onboarded');
    return row ? JSON.parse(row.value) : false;
  });

  ipcMain.handle('db:getJobs', () => {
    return db.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all();
  });

  ipcMain.handle('db:getJob', (_, id) => {
    return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  });

  ipcMain.handle('db:createJob', (_, data) => {
    const stmt = db.prepare(`INSERT INTO jobs (name, base_model, status, config, dataset_path, spend_limit, gpu_provider, gpu_type)
      VALUES (@name, @base_model, 'pending', @config, @dataset_path, @spend_limit, @gpu_provider, @gpu_type)`);
    const result = stmt.run(data);
    return result.lastInsertRowid;
  });

  ipcMain.handle('db:updateJob', (_, id, data) => {
    const sets = Object.keys(data).map(k => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE jobs SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`).run({ ...data, id });
    return true;
  });

  ipcMain.handle('db:deleteJob', (_, id) => {
    db.prepare('DELETE FROM dataset_images WHERE job_id = ?').run(id);
    db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
    return true;
  });

  ipcMain.handle('db:getModels', () => {
    return db.prepare('SELECT * FROM models ORDER BY created_at DESC').all();
  });

  ipcMain.handle('db:getModel', (_, id) => {
    return db.prepare('SELECT * FROM models WHERE id = ?').get(id);
  });

  ipcMain.handle('db:deleteModel', (_, id) => {
    db.prepare('DELETE FROM models WHERE id = ?').run(id);
    return true;
  });

  // Dataset images
  ipcMain.handle('db:saveDatasetImages', (_, jobId, images) => {
    const stmt = db.prepare('INSERT INTO dataset_images (job_id, file_path, caption) VALUES (?, ?, ?)');
    const tx = db.transaction((imgs) => {
      for (const img of imgs) stmt.run(jobId, img.path, img.caption || '');
    });
    tx(images);
    return true;
  });

  ipcMain.handle('db:getDatasetImages', (_, jobId) => {
    return db.prepare('SELECT * FROM dataset_images WHERE job_id = ? ORDER BY id').all(jobId);
  });

  ipcMain.handle('db:updateCaption', (_, imageId, caption) => {
    db.prepare('UPDATE dataset_images SET caption = ? WHERE id = ?').run(caption, imageId);
    return true;
  });

  ipcMain.handle('db:deleteDatasetImage', (_, imageId) => {
    db.prepare('DELETE FROM dataset_images WHERE id = ?').run(imageId);
    return true;
  });
}

module.exports = { register };
