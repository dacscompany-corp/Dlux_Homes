-- Round-robin automatic cleaner assignment, on top of the existing manual
-- assign path. Two additions:
--   1. booking_cleaning gets an assignment_method/assigned_by/assigned_at
--      trail, so the UI can show "Automatic" vs "Manual" and who/when for
--      manual changes.
--   2. A single-row rotation-state table tracks the last cleaner an
--      automatic assignment picked, so the pointer survives server restarts
--      and advances only on a successful automatic assignment.

-- 1. Formalize employees.status (currently untracked schema drift — free
-- text, always 'active' on insert per employeeController.ts, no CHECK). Add
-- the constraint now that it's actually load-bearing (round-robin
-- eligibility reads it), backfilling any legacy NULL/blank to 'active' first
-- so the constraint doesn't reject existing rows.
UPDATE employees SET status = 'active' WHERE status IS NULL OR status = '';
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_status_check;
ALTER TABLE employees ADD CONSTRAINT employees_status_check
  CHECK (status IN ('active', 'inactive'));

-- 2. Assignment method + who/when for manual changes.
ALTER TABLE booking_cleaning ADD COLUMN IF NOT EXISTS assignment_method VARCHAR(10)
  CHECK (assignment_method IN ('automatic', 'manual'));
ALTER TABLE booking_cleaning ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE booking_cleaning ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

-- 3. Rotation pointer — a single row (enforced by the CHECK on id) holding
-- the last cleaner an automatic assignment picked. SELECT ... FOR UPDATE on
-- this row is how simultaneous checkouts serialize so each gets the correct
-- next cleaner instead of racing onto the same one.
CREATE TABLE IF NOT EXISTS cleaning_rotation_state (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_assigned_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO cleaning_rotation_state (id, last_assigned_employee_id)
  VALUES (1, NULL)
  ON CONFLICT (id) DO NOTHING;
