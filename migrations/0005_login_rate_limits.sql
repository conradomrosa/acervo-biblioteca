CREATE TABLE login_rate_limits (
  scope TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0 CHECK (failures >= 0),
  window_started_at INTEGER NOT NULL,
  blocked_until INTEGER,
  last_attempt_at INTEGER NOT NULL
);
CREATE INDEX login_rate_limits_last_attempt_at ON login_rate_limits(last_attempt_at);
