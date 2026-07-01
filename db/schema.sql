CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  base_model    TEXT NOT NULL CHECK(base_model IN ('krea2', 'ideogram4', 'both')),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','uploading','training','generating_samples','completed','failed','stopped')),
  config        TEXT,          -- JSON training config
  dataset_path  TEXT,
  spend_limit   REAL DEFAULT 5.0,
  cost_spent    REAL DEFAULT 0.0,
  gpu_provider  TEXT CHECK(gpu_provider IN ('vastai', 'runpod')),
  gpu_type      TEXT,
  gpu_instance  TEXT,          -- provider instance ID
  progress      REAL DEFAULT 0,
  eta_seconds   INTEGER,
  error_msg     TEXT,
  started_at    TEXT,
  finished_at   TEXT,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS models (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id        INTEGER REFERENCES jobs(id),
  name          TEXT NOT NULL,
  base_model    TEXT NOT NULL,
  file_path     TEXT NOT NULL,
  file_size     INTEGER,
  thumbnail     TEXT,          -- path to sample image
  sample_images TEXT,          -- JSON array of paths
  training_cost REAL DEFAULT 0,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dataset_images (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id    INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  caption   TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
