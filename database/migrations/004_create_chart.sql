CREATE TABLE IF NOT EXISTS chart (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL UNIQUE,
  chart_type     TEXT NOT NULL DEFAULT 'line',
  sql            TEXT NOT NULL,
  x_column       TEXT NOT NULL,
  series_columns TEXT NOT NULL DEFAULT '[]',
  title          TEXT,
  y_formatter    TEXT,
  stack          INTEGER NOT NULL DEFAULT 0,
  enabled        INTEGER NOT NULL DEFAULT 1,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  description    TEXT,
  created_at     TEXT DEFAULT (datetime('now'))
);
