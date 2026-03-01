CREATE TABLE IF NOT EXISTS export_template (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  file_data   BLOB NOT NULL,
  file_name   TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now'))
);
