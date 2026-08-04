-- Stay-type scope for promotions.
--
-- The guest-facing offer card answers "does this offer work on MY stay?" with a
-- row of chips (Daycation / Nightcation / Full stay). Nothing on `promotions`
-- carried that, so the chips had no data behind them.
--
-- Values mirror the stay types the storefront already speaks in:
--   'day'       → Daycation (10h, ten_hour_rate)
--   'night'     → Nightcation (10h, ten_hour_rate)
--   'overnight' → Full stay (21h, weekday_rate/weekend_rate)
--
-- NULL / empty means "no scope set" — the card renders no chip block at all,
-- which is exactly how every promotion created before this migration behaves.
-- That keeps existing rows valid without a backfill.
ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS applies_to TEXT[];

-- Reject anything outside the three known stay types. `<@` (is-contained-by)
-- keeps this a plain expression — CHECK constraints cannot contain subqueries,
-- so an EXISTS/unnest formulation would be rejected outright. NULL passes via
-- the explicit IS NULL arm; '{}' passes because the empty array is contained by
-- every array.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'promotions'::regclass AND conname = 'promotions_applies_to_valid'
  ) THEN
    ALTER TABLE promotions
      ADD CONSTRAINT promotions_applies_to_valid CHECK (
        applies_to IS NULL
        OR applies_to <@ ARRAY['day', 'night', 'overnight']::TEXT[]
      );
  END IF;
END $$;
