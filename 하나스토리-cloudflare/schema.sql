CREATE TABLE IF NOT EXISTS hanastory_content (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
