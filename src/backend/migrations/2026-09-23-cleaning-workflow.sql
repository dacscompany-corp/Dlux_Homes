-- Cleaning workflow: Needs Cleaning -> Assigned -> In Progress ->
-- Awaiting Inspection -> Ready (or back to In Progress on a failed
-- inspection). Extends booking_cleaning rather than replacing it — existing
-- 'cleaned'/'inspected' rows are left as-is, new code only ever writes the
-- new statuses going forward.

-- 1. Allow the two new terminal-adjacent statuses alongside the existing five.
ALTER TABLE booking_cleaning DROP CONSTRAINT IF EXISTS booking_cleaning_cleaning_status_check;
ALTER TABLE booking_cleaning ADD CONSTRAINT booking_cleaning_cleaning_status_check
  CHECK (cleaning_status IN (
    'pending',
    'assigned',
    'in-progress',
    'cleaned',
    'inspected',
    'awaiting-inspection',
    'ready'
  ));

-- 2. Inspection note (set when Admin sends a task back to In Progress) and a
-- marker for when checkout auto-processing created/touched this row, so the
-- checkout trigger can tell "already processed" apart from "brand new".
ALTER TABLE booking_cleaning ADD COLUMN IF NOT EXISTS inspection_note TEXT;
ALTER TABLE booking_cleaning ADD COLUMN IF NOT EXISTS checkout_processed_at TIMESTAMPTZ;

-- 3. One cleaning record per booking — the checkout trigger and the two
-- legacy auto-create paths (getAllCleaningTasks, tasks/by-booking/[id]) all
-- INSERT ... ON CONFLICT (booking_id) DO NOTHING against this from here on,
-- so reprocessing a checkout can never create a duplicate task.
ALTER TABLE booking_cleaning ADD CONSTRAINT booking_cleaning_booking_id_key UNIQUE (booking_id);

-- 4. assigned_to had no DB-level FK before (app-level joins only) — add one
-- now that assignment is done by code instead of only by hand.
ALTER TABLE booking_cleaning ADD CONSTRAINT fk_booking_cleaning_assigned_to
  FOREIGN KEY (assigned_to) REFERENCES employees(id) ON DELETE SET NULL;

-- 5. Status history, so the admin detail view can show a full audit trail
-- (who changed what, when, and any inspection note) instead of just the
-- current status.
CREATE TABLE IF NOT EXISTS booking_cleaning_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_cleaning_id UUID NOT NULL
    REFERENCES booking_cleaning(id) ON DELETE CASCADE,
  from_status VARCHAR(20),
  to_status VARCHAR(20) NOT NULL,
  note TEXT,
  changed_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_cleaning_history_task
  ON booking_cleaning_history(booking_cleaning_id, changed_at);

-- 6. Let an issue report stay linked to the specific cleaning assignment it
-- was raised from, not just the haven, so admin can see it on that task.
ALTER TABLE report_issue ADD COLUMN IF NOT EXISTS booking_cleaning_id UUID
  REFERENCES booking_cleaning(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_report_issue_booking_cleaning_id
  ON report_issue(booking_cleaning_id);
