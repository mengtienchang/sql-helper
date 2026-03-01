CREATE TABLE IF NOT EXISTS dashboard (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dashboard_item (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  dashboard_id INTEGER NOT NULL REFERENCES dashboard(id) ON DELETE CASCADE,
  item_type    TEXT NOT NULL,
  item_id      INTEGER NOT NULL,
  col_span     INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0
);
