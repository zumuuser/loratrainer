const { app } = require('electron');
app.whenReady().then(() => {
  try {
    const Database = require('better-sqlite3');
    const db = new Database('/home/zackmayer/.config/loratrainer/loratrainer/loratrainer.db');
    console.log("JOBS_DATA:" + JSON.stringify(db.prepare('SELECT * FROM jobs').all()));
  } catch (e) {
    console.error(e);
  }
  app.quit();
});
