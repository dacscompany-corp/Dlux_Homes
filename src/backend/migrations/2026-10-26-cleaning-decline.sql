-- Migration: 2026-10-26-cleaning-decline
-- A cleaner can say they're not available for a room assigned to them
-- (owner, 2026-10-26). The room goes back to the office to reassign by hand:
-- declined_by / declined_at mark it so automatic assignment (the 15-minute
-- sweep and the checkout safety net) leaves it alone — otherwise the rotation
-- could hand it straight back to the same cleaner. Cleared when the office
-- assigns someone. Idempotent.
ALTER TABLE booking_cleaning ADD COLUMN IF NOT EXISTS declined_by UUID;
ALTER TABLE booking_cleaning ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ;
