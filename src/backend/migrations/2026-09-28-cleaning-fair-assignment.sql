-- Cleaners Portal MVP fixes: fair assignment, inspection integrity, photo proof.
--
-- Builds on 2026-09-23-cleaning-workflow.sql (the status sequence) and
-- 2026-09-24-cleaning-round-robin.sql (assignment_method + rotation pointer).
-- Four additions:
--   1. booking_cleaning learns WHEN the cleaning is due (checkout), WHEN the
--      confirmation was processed, and WHY a task is still unassigned.
--   2. cleaning_opportunities — the fairness ledger. Distribution is measured
--      by opportunities retained or completed, so an assignment taken away
--      before the work was done has to stop counting, and one that WAS
--      performed has to keep counting. A status column cannot express that;
--      a per-assignment row can.
--   3. cleaning_checklist_photos gains a real FK to the checklist task it
--      proves, instead of storing the task's text in a column called
--      `category`.
--   4. Backfill, so existing assignments already have ledger rows and existing
--      photos are linked to their tasks.

-- ── 1. booking_cleaning ──────────────────────────────────────────────────────

-- The table shipped without one, so "when did this task appear" was
-- unanswerable and ordering fell back to whatever the planner returned.
ALTER TABLE booking_cleaning ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- When the cleaning is due. Set from the booking's checkout at confirmation
-- time, and enforced by tasks/[id]/start — an assignment issued days in advance
-- must not let cleaning begin while the guest is still in the room.
ALTER TABLE booking_cleaning ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

-- Set the first time a booking confirmation was processed into a cleaning task.
-- Distinct from checkout_processed_at (2026-09-23), which marks the checkout
-- trigger. Having both means "already handled" is answerable without guessing.
ALTER TABLE booking_cleaning ADD COLUMN IF NOT EXISTS confirmed_processed_at TIMESTAMPTZ;

-- Why automatic assignment could not place this task — 'no cleaner accounts',
-- 'all inactive', 'all booked'. NULL once a cleaner is assigned. Owner/CSR see
-- this on the task instead of an unexplained blank.
ALTER TABLE booking_cleaning ADD COLUMN IF NOT EXISTS unassigned_reason TEXT;

-- Backfill scheduled_for for tasks that already exist, from their booking's
-- checkout. Booking dates/times are Manila wall-clock, so the naive date+time
-- is anchored AT TIME ZONE 'Asia/Manila' — otherwise a TIMESTAMPTZ takes the
-- session zone (UTC on Supabase) and 12:00 lands at 20:00 Manila. '00:00'
-- checkout means midnight at the END of the checkout date.
-- (Mirrors checkoutAtSql() in cleanersController.ts.)
UPDATE booking_cleaning bc
SET scheduled_for = (CASE
      WHEN b.check_out_time = '00:00' THEN (b.check_out_date::DATE + INTERVAL '1 day')
      ELSE (b.check_out_date::DATE + COALESCE(b.check_out_time::TIME, '23:59'::TIME))
    END) AT TIME ZONE 'Asia/Manila'
FROM booking b
WHERE b.id = bc.booking_id AND bc.scheduled_for IS NULL;

CREATE INDEX IF NOT EXISTS idx_booking_cleaning_scheduled_for
  ON booking_cleaning(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_booking_cleaning_assigned_to
  ON booking_cleaning(assigned_to);

-- ── 2. cleaning_opportunities — the fairness ledger ─────────────────────────
--
-- One row per assignment ever made, automatic or manual.
--   retained  — the cleaner holds it and the work is still to do
--   completed — the cleaner performed the cleaning; counts toward them forever
--   released  — taken away before the work was done (booking cancelled, or the
--               task reassigned). Stops counting, and leaves a replacement
--               credit until the cleaner's next automatic assignment consumes it.
--
-- Share of work = COUNT(retained) + COUNT(completed).
-- Replacement credits = COUNT(released WHERE NOT credit_consumed).
CREATE TABLE IF NOT EXISTS cleaning_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_cleaning_id UUID NOT NULL
    REFERENCES booking_cleaning(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  assignment_method VARCHAR(10) NOT NULL
    CHECK (assignment_method IN ('automatic', 'manual')),
  -- NULL for automatic; the Owner/CSR who made a manual assignment otherwise.
  assigned_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  state VARCHAR(10) NOT NULL DEFAULT 'retained'
    CHECK (state IN ('retained', 'completed', 'released')),
  release_reason VARCHAR(20)
    CHECK (release_reason IN ('cancelled', 'reassigned', 'unassigned')),
  -- Only meaningful on released rows: whether the replacement credit has been
  -- spent on a later automatic assignment.
  credit_consumed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,

  CONSTRAINT cleaning_opportunities_release_shape CHECK (
    (state = 'released' AND released_at IS NOT NULL AND release_reason IS NOT NULL)
    OR (state <> 'released' AND released_at IS NULL AND release_reason IS NULL)
  ),
  CONSTRAINT cleaning_opportunities_completed_shape CHECK (
    state <> 'completed' OR completed_at IS NOT NULL
  )
);

-- At most ONE live holder per cleaning task. This is what makes re-processing a
-- confirmation, a cancellation or a reassignment idempotent: the second run
-- finds no retained row to release and no room to insert another, so it can't
-- restore an opportunity twice or consume a second turn.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_retained_opportunity_per_task
  ON cleaning_opportunities(booking_cleaning_id)
  WHERE state = 'retained';

CREATE INDEX IF NOT EXISTS idx_cleaning_opportunities_employee_state
  ON cleaning_opportunities(employee_id, state);
CREATE INDEX IF NOT EXISTS idx_cleaning_opportunities_task
  ON cleaning_opportunities(booking_cleaning_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_opportunities_credits
  ON cleaning_opportunities(employee_id)
  WHERE state = 'released' AND credit_consumed = false;

-- ── 3. Photo proof keyed to the checklist task it proves ─────────────────────
--
-- `category` has in practice held the TASK TEXT (both portals upload with
-- category = item.task), which breaks the moment admin edits a task's wording
-- and silently collides when two categories share a task name. Add the real
-- reference; `category` stays for the legacy rows.
ALTER TABLE cleaning_checklist_photos ADD COLUMN IF NOT EXISTS task_id UUID
  REFERENCES cleaning_tasks(id) ON DELETE CASCADE;

-- One photo per task per checklist (an upsert replaces it).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ccphotos_checklist_task
  ON cleaning_checklist_photos(checklist_id, task_id)
  WHERE task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ccphotos_task_id
  ON cleaning_checklist_photos(task_id);

-- Backfill: match each existing photo to the task on the SAME checklist whose
-- description equals the stored `category` value. Rows that match nothing (a
-- genuinely category-keyed legacy photo) are left with task_id NULL and simply
-- don't count as proof for any task.
UPDATE cleaning_checklist_photos p
SET task_id = t.id
FROM cleaning_tasks t
WHERE p.task_id IS NULL
  AND t.checklist_id = p.checklist_id
  AND t.task_description = p.category;

-- ── 4. Backfill the ledger from assignments that already exist ───────────────
--
-- Every currently assigned task gets one row, already in the right state, so
-- fairness maths starts from the real history rather than from zero. Performed
-- work lands as 'completed'; outstanding work as 'retained'. Bookings that were
-- cancelled or rejected are released with reason 'cancelled', which is exactly
-- what the live cancellation path would have recorded.
INSERT INTO cleaning_opportunities (
  booking_cleaning_id, employee_id, assignment_method, assigned_by,
  state, release_reason, created_at, completed_at, released_at
)
SELECT
  bc.id,
  bc.assigned_to,
  COALESCE(bc.assignment_method, 'manual'),
  bc.assigned_by,
  CASE
    WHEN b.status IN ('cancelled', 'rejected')
         AND bc.cleaning_status NOT IN ('awaiting-inspection', 'ready', 'cleaned', 'inspected')
      THEN 'released'
    WHEN bc.cleaning_status IN ('awaiting-inspection', 'ready', 'cleaned', 'inspected')
      THEN 'completed'
    ELSE 'retained'
  END,
  CASE
    WHEN b.status IN ('cancelled', 'rejected')
         AND bc.cleaning_status NOT IN ('awaiting-inspection', 'ready', 'cleaned', 'inspected')
      THEN 'cancelled'
    ELSE NULL
  END,
  COALESCE(bc.assigned_at, bc.created_at),
  CASE
    WHEN bc.cleaning_status IN ('awaiting-inspection', 'ready', 'cleaned', 'inspected')
      THEN COALESCE(bc.cleaned_at, bc.inspected_at, NOW())
    ELSE NULL
  END,
  CASE
    WHEN b.status IN ('cancelled', 'rejected')
         AND bc.cleaning_status NOT IN ('awaiting-inspection', 'ready', 'cleaned', 'inspected')
      THEN NOW()
    ELSE NULL
  END
FROM booking_cleaning bc
JOIN booking b ON b.id = bc.booking_id
WHERE bc.assigned_to IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM cleaning_opportunities o WHERE o.booking_cleaning_id = bc.id
  );
