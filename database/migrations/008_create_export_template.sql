CREATE TABLE IF NOT EXISTS export_template (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  file_data   BLOB NOT NULL,
  file_name   TEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
