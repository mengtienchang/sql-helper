CREATE TABLE IF NOT EXISTS metric (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  sql TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
