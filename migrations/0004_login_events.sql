CREATE TABLE login_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  librarian_id INTEGER REFERENCES librarians(id) ON DELETE SET NULL,
  username TEXT NOT NULL,
  succeeded INTEGER NOT NULL CHECK (succeeded IN (0,1)),
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX login_events_occurred_at ON login_events(occurred_at DESC);
