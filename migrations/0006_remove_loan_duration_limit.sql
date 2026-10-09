PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS one_active_loan_per_copy;
DROP INDEX IF EXISTS loans_due;

ALTER TABLE loans RENAME TO loans_with_duration_limit;

CREATE TABLE loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  copy_id INTEGER NOT NULL REFERENCES copies(id),
  borrower_name TEXT NOT NULL,
  loan_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  returned_at TEXT,
  CHECK (due_date >= loan_date)
);

INSERT INTO loans (id, copy_id, borrower_name, loan_date, due_date, returned_at)
SELECT id, copy_id, borrower_name, loan_date, due_date, returned_at
FROM loans_with_duration_limit;

DROP TABLE loans_with_duration_limit;

CREATE UNIQUE INDEX one_active_loan_per_copy ON loans(copy_id) WHERE returned_at IS NULL;
CREATE INDEX loans_due ON loans(due_date) WHERE returned_at IS NULL;

PRAGMA foreign_keys = ON;
