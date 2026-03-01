CREATE TABLE IF NOT EXISTS factory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  location TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

ALTER TABLE financial_report ADD COLUMN factory_id INTEGER REFERENCES factory(id);
